package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseSchedulerServiceDescription(t *testing.T) {
	dir := t.TempDir()
	servicePath := filepath.Join(dir, "demo.service")
	if err := os.WriteFile(servicePath, []byte("[Unit]\nDescription=run check\n"), 0o644); err != nil {
		t.Fatalf("write service file: %v", err)
	}

	got, err := parseSchedulerServiceDescription(servicePath)
	if err != nil {
		t.Fatalf("parseSchedulerServiceDescription error: %v", err)
	}
	if got != "run check" {
		t.Fatalf("unexpected description: %q", got)
	}
}

func TestParseSchedulerTimerSpec(t *testing.T) {
	dir := t.TempDir()
	timerPath := filepath.Join(dir, "demo.timer")
	content := strings.Join([]string{
		"[Timer]",
		"OnCalendar=*-*-* 21:00:00",
		"OnUnitActiveSec=5m",
		"RandomizedDelaySec=10",
		"",
	}, "\n")
	if err := os.WriteFile(timerPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write timer file: %v", err)
	}

	spec, err := parseSchedulerTimerSpec(timerPath)
	if err != nil {
		t.Fatalf("parseSchedulerTimerSpec error: %v", err)
	}
	if spec.Interval != 5*time.Minute {
		t.Fatalf("unexpected interval: %s", spec.Interval)
	}
	if spec.DailyClock == nil {
		t.Fatalf("daily clock is nil")
	}
	if spec.DailyClock.Hour != 21 || spec.DailyClock.Minute != 0 || spec.DailyClock.Second != 0 {
		t.Fatalf("unexpected daily clock: %+v", spec.DailyClock)
	}
	if spec.RandomizedDelaySec != 10 {
		t.Fatalf("unexpected RandomizedDelaySec: %d", spec.RandomizedDelaySec)
	}
}

func TestSchedulerScanJobsIncludesBotInKey(t *testing.T) {
	root := t.TempDir()
	r := &ClaudeCodeRunner{
		botID:     "bot-A",
		logPrefix: "[test]",
	}
	s := newClaudeScheduler(r)
	s.rootDir = root
	s.botDir = filepath.Join(root, sanitizeSchedulerPathPart(r.botID, "default"))
	s.stateDir = t.TempDir()

	dir := filepath.Join(s.botDir, "channel-1", ".scheduler")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir scheduler dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "daily.service"), []byte("[Unit]\nDescription=do work\n"), 0o644); err != nil {
		t.Fatalf("write service file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "daily.timer"), []byte("[Timer]\nOnUnitActiveSec=60\n"), 0o644); err != nil {
		t.Fatalf("write timer file: %v", err)
	}

	jobs, err := s.scanJobs(time.Now())
	if err != nil {
		t.Fatalf("scanJobs error: %v", err)
	}

	key := "bot-A/channel-1/daily"
	job, ok := jobs[key]
	if !ok {
		t.Fatalf("expected job key %q, got keys=%v", key, mapKeys(jobs))
	}
	if job.SessionID != "channel-1" {
		t.Fatalf("unexpected session id: %q", job.SessionID)
	}
}

func TestSchedulerReloadJobsPreservesFutureNextRunForUnchangedIntervalJob(t *testing.T) {
	root := t.TempDir()
	r := &ClaudeCodeRunner{
		botID:     "bot-A",
		logPrefix: "[test]",
	}
	s := newClaudeScheduler(r)
	s.rootDir = root
	s.botDir = filepath.Join(root, sanitizeSchedulerPathPart(r.botID, "default"))
	s.stateDir = t.TempDir()

	dir := filepath.Join(s.botDir, "channel-1", ".scheduler")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir scheduler dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "every2m.service"), []byte("[Unit]\nDescription=do work\n"), 0o644); err != nil {
		t.Fatalf("write service file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "every2m.timer"), []byte("[Timer]\nOnUnitActiveSec=2m\n"), 0o644); err != nil {
		t.Fatalf("write timer file: %v", err)
	}

	t0 := time.Date(2026, 2, 26, 23, 0, 0, 0, time.Local)
	s.reloadJobs(t0)

	key := "bot-A/channel-1/every2m"
	job, ok := s.jobs[key]
	if !ok {
		t.Fatalf("expected job key %q, got keys=%v", key, mapKeys(s.jobs))
	}
	firstNext := job.NextRunAt
	if firstNext.IsZero() {
		t.Fatalf("first next run is zero")
	}

	// Simulate periodic reconcile before first run is due.
	t1 := t0.Add(61 * time.Second)
	s.reloadJobs(t1)

	job2, ok := s.jobs[key]
	if !ok {
		t.Fatalf("expected job key %q after reload, got keys=%v", key, mapKeys(s.jobs))
	}
	if !job2.NextRunAt.Equal(firstNext) {
		t.Fatalf("next run drifted on reload: before=%s after=%s", firstNext, job2.NextRunAt)
	}
}

func mapKeys(m map[string]*schedulerJob) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
