package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"mew/plugins/pkg/state"
)

const (
	schedulerDueCheckInterval  = 1 * time.Second
	schedulerReconcileInterval = 60 * time.Second
	schedulerReloadDebounce    = 300 * time.Millisecond
)

type schedulerDailyClock struct {
	Hour   int
	Minute int
	Second int
}

type schedulerTimerSpec struct {
	Interval           time.Duration
	DailyClock         *schedulerDailyClock
	RandomizedDelaySec int
}

type schedulerJob struct {
	Key         string
	Name        string
	BotID       string
	SessionID   string
	Prompt      string
	ServicePath string
	TimerPath   string
	Spec        schedulerTimerSpec

	Running   bool
	NextRunAt time.Time
}

type schedulerJobState struct {
	JobKey        string    `json:"job_key"`
	BotID         string    `json:"bot_id"`
	SessionID     string    `json:"session_id"`
	JobName       string    `json:"job_name"`
	LastRunAt     time.Time `json:"last_run_at"`
	LastSuccessAt time.Time `json:"last_success_at"`
	LastError     string    `json:"last_error"`
	NextRunAt     time.Time `json:"next_run_at"`
	Running       bool      `json:"running"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type claudeScheduler struct {
	runner   *ClaudeCodeRunner
	rootDir  string
	botDir   string
	stateDir string

	watcher *fsnotify.Watcher

	mu   sync.Mutex
	jobs map[string]*schedulerJob

	rngMu sync.Mutex
	rng   *rand.Rand
}

func newClaudeScheduler(r *ClaudeCodeRunner) *claudeScheduler {
	root := resolveSchedulerRootDir()
	stateDir := defaultSchedulerStateDir(r.botID)

	safeBotDir := sanitizeSchedulerPathPart(r.botID, "default")
	return &claudeScheduler{
		runner:   r,
		rootDir:  filepath.Clean(root),
		botDir:   filepath.Join(filepath.Clean(root), safeBotDir),
		stateDir: filepath.Clean(stateDir),
		jobs:     make(map[string]*schedulerJob),
		rng:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func defaultSchedulerRootDir() string {
	return filepath.Join(state.BaseDir(), "plugins", "claudecode-agent", "workspace", "projects")
}

func defaultSchedulerStateDir(botID string) string {
	safeBotID := sanitizeSchedulerPathPart(botID, "default")
	return filepath.Join(state.BaseDir(), "plugins", "claudecode-agent", safeBotID, "scheduler", "state")
}

func resolveSchedulerRootDir() string {
	// Prefer existing directory to avoid host/runtime path mismatches.
	candidates := []string{defaultSchedulerRootDir()}
	for _, candidate := range candidates {
		clean := filepath.Clean(candidate)
		if isDir(clean) {
			return clean
		}
	}
	return filepath.Clean(defaultSchedulerRootDir())
}

func (s *claudeScheduler) Run(ctx context.Context) error {
	if s == nil {
		return nil
	}

	if err := os.MkdirAll(s.stateDir, 0o755); err != nil {
		return fmt.Errorf("scheduler state dir: %w", err)
	}
	log.Printf("%s scheduler init: root_dir=%q root_exists=%t bot_dir=%q bot_exists=%t state_dir=%q",
		s.runner.logPrefix, s.rootDir, isDir(s.rootDir), s.botDir, isDir(s.botDir), s.stateDir)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("scheduler watcher: %w", err)
	}
	defer watcher.Close()
	s.watcher = watcher

	if err := s.addWatchRecursive(s.rootDir); err != nil {
		log.Printf("%s scheduler watch setup failed (root_dir=%q): %v", s.runner.logPrefix, s.rootDir, err)
	}
	if err := s.addWatchRecursive(s.botDir); err != nil {
		log.Printf("%s scheduler watch setup failed (bot_dir=%q): %v", s.runner.logPrefix, s.botDir, err)
	}
	s.reloadJobs(time.Now())

	dueTicker := time.NewTicker(schedulerDueCheckInterval)
	defer dueTicker.Stop()

	reconcileTicker := time.NewTicker(schedulerReconcileInterval)
	defer reconcileTicker.Stop()

	var (
		reloadTimer *time.Timer
		reloadCh    <-chan time.Time
	)
	resetReload := func() {
		if reloadTimer == nil {
			reloadTimer = time.NewTimer(schedulerReloadDebounce)
		} else {
			if !reloadTimer.Stop() {
				select {
				case <-reloadTimer.C:
				default:
				}
			}
			reloadTimer.Reset(schedulerReloadDebounce)
		}
		reloadCh = reloadTimer.C
	}
	stopReloadTimer := func() {
		if reloadTimer == nil {
			return
		}
		if !reloadTimer.Stop() {
			select {
			case <-reloadTimer.C:
			default:
			}
		}
		reloadCh = nil
	}
	defer stopReloadTimer()

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if ev.Op&(fsnotify.Create|fsnotify.Rename) != 0 {
				if isDir(ev.Name) {
					if err := s.addWatchRecursive(ev.Name); err != nil {
						log.Printf("%s scheduler add watch failed: %v", s.runner.logPrefix, err)
					}
				}
			}
			if s.isRelevantEvent(ev.Name) {
				resetReload()
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			log.Printf("%s scheduler watcher error: %v", s.runner.logPrefix, err)
		case <-reloadCh:
			stopReloadTimer()
			s.reloadJobs(time.Now())
		case <-reconcileTicker.C:
			s.reloadJobs(time.Now())
		case <-dueTicker.C:
			s.runDueJobs(ctx, time.Now())
		}
	}
}

func (s *claudeScheduler) isRelevantEvent(path string) bool {
	path = filepath.ToSlash(path)
	if strings.Contains(path, "/.scheduler/") {
		ext := strings.ToLower(filepath.Ext(path))
		return ext == ".service" || ext == ".timer" || ext == ".json" || ext == ""
	}
	return strings.HasSuffix(path, "/.scheduler")
}

func (s *claudeScheduler) addWatchRecursive(root string) error {
	info, err := os.Stat(root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return nil
	}
	return filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if err := s.watcher.Add(path); err != nil {
			// Ignore duplicate or transient paths.
			log.Printf("%s scheduler watch skip path=%q err=%v", s.runner.logPrefix, path, err)
		}
		return nil
	})
}

func (s *claudeScheduler) reloadJobs(now time.Time) {
	scanned, err := s.scanJobs(now)
	if err != nil {
		log.Printf("%s scheduler reload failed: %v", s.runner.logPrefix, err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	prevJobs := s.jobs
	diff := schedulerReloadDiff(prevJobs, scanned)

	// Keep in-memory runtime fields during reload to avoid schedule drift
	// between reconciliations when job definitions are unchanged.
	for key, old := range prevJobs {
		if cur, ok := scanned[key]; ok {
			if old.Running {
				cur.Running = true
			}
			if old.NextRunAt.After(now) && schedulerJobDefinitionEqual(old, cur) {
				cur.NextRunAt = old.NextRunAt
			}
		}
	}

	s.jobs = scanned
	if diff.added == 0 && diff.removed == 0 && diff.updated == 0 {
		return
	}
	log.Printf("%s scheduler reloaded: bot=%s jobs=%d added=%d removed=%d updated=%d bot_dir=%q",
		s.runner.logPrefix,
		s.runner.botID,
		len(s.jobs),
		diff.added,
		diff.removed,
		diff.updated,
		s.botDir,
	)
}

func schedulerJobDefinitionEqual(a, b *schedulerJob) bool {
	if a == nil || b == nil {
		return false
	}
	if a.Key != b.Key || a.Name != b.Name || a.BotID != b.BotID || a.SessionID != b.SessionID {
		return false
	}
	if a.Prompt != b.Prompt || a.ServicePath != b.ServicePath || a.TimerPath != b.TimerPath {
		return false
	}
	return schedulerTimerSpecEqual(a.Spec, b.Spec)
}

func schedulerTimerSpecEqual(a, b schedulerTimerSpec) bool {
	if a.Interval != b.Interval || a.RandomizedDelaySec != b.RandomizedDelaySec {
		return false
	}
	return schedulerDailyClockEqual(a.DailyClock, b.DailyClock)
}

func schedulerDailyClockEqual(a, b *schedulerDailyClock) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Hour == b.Hour && a.Minute == b.Minute && a.Second == b.Second
}

type schedulerReloadDelta struct {
	added   int
	removed int
	updated int
}

func schedulerReloadDiff(prev, next map[string]*schedulerJob) schedulerReloadDelta {
	var out schedulerReloadDelta
	for key, cur := range next {
		old, ok := prev[key]
		if !ok {
			out.added++
			continue
		}
		if !schedulerJobDefinitionEqual(old, cur) {
			out.updated++
		}
	}
	for key := range prev {
		if _, ok := next[key]; !ok {
			out.removed++
		}
	}
	return out
}

func (s *claudeScheduler) scanJobs(now time.Time) (map[string]*schedulerJob, error) {
	out := make(map[string]*schedulerJob)
	if !isDir(s.botDir) {
		return out, nil
	}

	err := filepath.WalkDir(s.botDir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !d.IsDir() || d.Name() != ".scheduler" {
			return nil
		}
		s.scanSchedulerDir(path, now, out)
		return filepath.SkipDir
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (s *claudeScheduler) scanSchedulerDir(dir string, now time.Time, out map[string]*schedulerJob) {
	sessionID := filepath.Base(filepath.Dir(dir))
	if strings.TrimSpace(sessionID) == "" {
		return
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		log.Printf("%s scheduler read dir failed: %v", s.runner.logPrefix, err)
		return
	}

	serviceFiles := make(map[string]string)
	timerFiles := make(map[string]string)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		base := strings.TrimSuffix(name, ext)
		switch ext {
		case ".service":
			serviceFiles[base] = filepath.Join(dir, name)
		case ".timer":
			timerFiles[base] = filepath.Join(dir, name)
		}
	}

	for base, servicePath := range serviceFiles {
		timerPath, ok := timerFiles[base]
		if !ok {
			continue
		}
		prompt, err := parseSchedulerServiceDescription(servicePath)
		if err != nil {
			log.Printf("%s scheduler parse service failed: file=%q err=%v", s.runner.logPrefix, servicePath, err)
			continue
		}
		spec, err := parseSchedulerTimerSpec(timerPath)
		if err != nil {
			log.Printf("%s scheduler parse timer failed: file=%q err=%v", s.runner.logPrefix, timerPath, err)
			continue
		}
		if spec.Interval <= 0 && spec.DailyClock == nil {
			log.Printf("%s scheduler skip timer without schedule: file=%q", s.runner.logPrefix, timerPath)
			continue
		}

		// Include botID in state key to avoid cross-bot collisions on shared state dir.
		key := s.runner.botID + "/" + sessionID + "/" + base
		state := s.loadState(key)
		nextRun := s.computeNextRun(spec, state, now)
		if !state.NextRunAt.IsZero() && state.NextRunAt.After(now) {
			nextRun = state.NextRunAt
		}

		out[key] = &schedulerJob{
			Key:         key,
			Name:        base,
			BotID:       s.runner.botID,
			SessionID:   sessionID,
			Prompt:      prompt,
			ServicePath: servicePath,
			TimerPath:   timerPath,
			Spec:        spec,
			NextRunAt:   nextRun,
		}
	}
}

func (s *claudeScheduler) runDueJobs(ctx context.Context, now time.Time) {
	dueKeys := make([]string, 0, 8)

	s.mu.Lock()
	for key, job := range s.jobs {
		if job == nil || job.Running || job.NextRunAt.IsZero() {
			continue
		}
		if now.Before(job.NextRunAt) {
			continue
		}
		job.Running = true
		dueKeys = append(dueKeys, key)
	}
	s.mu.Unlock()

	for _, key := range dueKeys {
		go s.executeJob(ctx, key)
	}
}

func (s *claudeScheduler) executeJob(ctx context.Context, key string) {
	s.mu.Lock()
	job, ok := s.jobs[key]
	if !ok || job == nil {
		s.mu.Unlock()
		return
	}
	jobCopy := *job
	s.mu.Unlock()

	now := time.Now()
	state := s.loadState(key)
	state.JobKey = key
	state.BotID = jobCopy.BotID
	state.SessionID = jobCopy.SessionID
	state.JobName = jobCopy.Name
	state.LastRunAt = now
	state.UpdatedAt = now
	state.Running = true

	runCtx, cancel := context.WithTimeout(ctx, time.Duration(s.runner.proxyTimeout)*time.Second+10*time.Second)
	defer cancel()

	err := s.runner.runScheduledPrompt(runCtx, jobCopy.SessionID, jobCopy.Prompt)
	if err != nil {
		state.LastError = strings.TrimSpace(err.Error())
	} else {
		state.LastSuccessAt = now
		state.LastError = ""
	}

	state.Running = false
	state.NextRunAt = s.computeNextRun(jobCopy.Spec, state, now)
	state.UpdatedAt = time.Now()
	s.saveState(key, state)

	s.mu.Lock()
	if current, ok := s.jobs[key]; ok && current != nil {
		current.Running = false
		current.NextRunAt = state.NextRunAt
	}
	s.mu.Unlock()
}

func (s *claudeScheduler) computeNextRun(spec schedulerTimerSpec, state schedulerJobState, now time.Time) time.Time {
	var candidates []time.Time

	if spec.Interval > 0 {
		base := state.LastRunAt
		if base.IsZero() {
			base = now
		}
		next := base.Add(spec.Interval)
		for !next.After(now) {
			next = next.Add(spec.Interval)
		}
		next = s.applyRandomDelay(next, spec.RandomizedDelaySec)
		candidates = append(candidates, next)
	}

	if spec.DailyClock != nil {
		c := spec.DailyClock
		next := time.Date(now.Year(), now.Month(), now.Day(), c.Hour, c.Minute, c.Second, 0, now.Location())
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		next = s.applyRandomDelay(next, spec.RandomizedDelaySec)
		candidates = append(candidates, next)
	}

	if len(candidates) == 0 {
		return time.Time{}
	}
	out := candidates[0]
	for _, t := range candidates[1:] {
		if t.Before(out) {
			out = t
		}
	}
	return out
}

func (s *claudeScheduler) applyRandomDelay(base time.Time, maxDelaySec int) time.Time {
	if maxDelaySec <= 0 {
		return base
	}
	s.rngMu.Lock()
	delay := s.rng.Intn(maxDelaySec + 1)
	s.rngMu.Unlock()
	return base.Add(time.Duration(delay) * time.Second)
}

func (s *claudeScheduler) statePath(jobKey string) string {
	safe := strings.ReplaceAll(jobKey, "/", "__")
	safe = strings.ReplaceAll(safe, ":", "__")
	safe = sanitizeSchedulerPathPart(safe, "job")
	return filepath.Join(s.stateDir, safe+".json")
}

func (s *claudeScheduler) loadState(jobKey string) schedulerJobState {
	path := s.statePath(jobKey)
	raw, err := os.ReadFile(path)
	if err != nil {
		return schedulerJobState{}
	}
	var out schedulerJobState
	if err := json.Unmarshal(raw, &out); err != nil {
		log.Printf("%s scheduler state decode failed: path=%q err=%v", s.runner.logPrefix, path, err)
		return schedulerJobState{}
	}
	return out
}

func (s *claudeScheduler) saveState(jobKey string, state schedulerJobState) {
	path := s.statePath(jobKey)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Printf("%s scheduler state mkdir failed: path=%q err=%v", s.runner.logPrefix, path, err)
		return
	}
	body, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		log.Printf("%s scheduler state encode failed: path=%q err=%v", s.runner.logPrefix, path, err)
		return
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		log.Printf("%s scheduler state write failed: path=%q err=%v", s.runner.logPrefix, path, err)
	}
}

func parseSchedulerServiceDescription(path string) (string, error) {
	iniMap, err := parseSimpleINI(path)
	if err != nil {
		return "", err
	}
	prompt := strings.TrimSpace(iniMap["unit"]["description"])
	if prompt == "" {
		return "", fmt.Errorf("missing [Unit].Description")
	}
	return prompt, nil
}

func parseSchedulerTimerSpec(path string) (schedulerTimerSpec, error) {
	iniMap, err := parseSimpleINI(path)
	if err != nil {
		return schedulerTimerSpec{}, err
	}
	sec := iniMap["timer"]
	if sec == nil {
		return schedulerTimerSpec{}, fmt.Errorf("missing [Timer] section")
	}

	var out schedulerTimerSpec
	if v := strings.TrimSpace(sec["onunitactivesec"]); v != "" {
		d, err := parseSchedulerDuration(v)
		if err != nil {
			return schedulerTimerSpec{}, fmt.Errorf("OnUnitActiveSec: %w", err)
		}
		out.Interval = d
	}
	if v := strings.TrimSpace(sec["oncalendar"]); v != "" {
		clock, err := parseDailyClock(v)
		if err != nil {
			return schedulerTimerSpec{}, fmt.Errorf("OnCalendar: %w", err)
		}
		out.DailyClock = clock
	}
	if v := strings.TrimSpace(sec["randomizeddelaysec"]); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			return schedulerTimerSpec{}, fmt.Errorf("RandomizedDelaySec: invalid value %q", v)
		}
		out.RandomizedDelaySec = n
	}
	return out, nil
}

func parseSimpleINI(path string) (map[string]map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	out := make(map[string]map[string]string)
	section := ""
	sc := bufio.NewScanner(f)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			if section == "" {
				return nil, fmt.Errorf("line %d: empty section", lineNo)
			}
			if out[section] == nil {
				out[section] = make(map[string]string)
			}
			continue
		}
		kv := strings.SplitN(line, "=", 2)
		if len(kv) != 2 {
			continue
		}
		if section == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(kv[0]))
		val := strings.TrimSpace(kv[1])
		if key == "" {
			continue
		}
		out[section][key] = val
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func parseSchedulerDuration(raw string) (time.Duration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, fmt.Errorf("empty")
	}
	if n, err := strconv.Atoi(raw); err == nil {
		if n <= 0 {
			return 0, fmt.Errorf("must be > 0")
		}
		return time.Duration(n) * time.Second, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, err
	}
	if d <= 0 {
		return 0, fmt.Errorf("must be > 0")
	}
	return d, nil
}

func parseDailyClock(raw string) (*schedulerDailyClock, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("empty")
	}
	parts := strings.Fields(raw)
	clockText := raw
	if len(parts) == 2 && strings.Contains(parts[0], "*") {
		clockText = parts[1]
	} else if len(parts) == 1 {
		clockText = parts[0]
	}

	fields := strings.Split(clockText, ":")
	if len(fields) != 2 && len(fields) != 3 {
		return nil, fmt.Errorf("unsupported format %q", raw)
	}

	hour, err := strconv.Atoi(fields[0])
	if err != nil || hour < 0 || hour > 23 {
		return nil, fmt.Errorf("invalid hour %q", fields[0])
	}
	minute, err := strconv.Atoi(fields[1])
	if err != nil || minute < 0 || minute > 59 {
		return nil, fmt.Errorf("invalid minute %q", fields[1])
	}
	second := 0
	if len(fields) == 3 {
		second, err = strconv.Atoi(fields[2])
		if err != nil || second < 0 || second > 59 {
			return nil, fmt.Errorf("invalid second %q", fields[2])
		}
	}

	return &schedulerDailyClock{Hour: hour, Minute: minute, Second: second}, nil
}

func sanitizeSchedulerPathPart(raw, fallback string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return fallback
	}
	return out
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
