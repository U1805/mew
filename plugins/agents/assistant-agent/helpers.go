package main

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"mew/plugins/sdk"
)

func computeInitialMood(baseline, lastFinal Mood, delta time.Duration) Mood {
	dHours := delta.Hours()
	if dHours < 0 {
		dHours = 0
	}
	decay := math.Exp(-assistantMoodDecayKPerHour * dHours)

	return Mood{
		Valence: baseline.Valence + (lastFinal.Valence-baseline.Valence)*decay,
		Arousal: baseline.Arousal + (lastFinal.Arousal-baseline.Arousal)*decay,
	}
}

type userStatePaths struct {
	UserDir       string
	FactsPath     string
	SummariesPath string
	MetadataPath  string
}

func assistantUserStatePaths(serviceType, botID, userID string) userStatePaths {
	base := sdk.BotStateDir(serviceType, botID)
	userDir := filepath.Join(base, assistantUsersDirName, userID)
	return userStatePaths{
		UserDir:       userDir,
		FactsPath:     filepath.Join(userDir, assistantFactsFilename),
		SummariesPath: filepath.Join(userDir, assistantSummariesFilename),
		MetadataPath:  filepath.Join(userDir, assistantMetadataFilename),
	}
}

func loadFacts(path string) (FactsFile, error) {
	v, err := sdk.LoadJSONFile[FactsFile](path)
	if err != nil {
		return FactsFile{}, err
	}
	if v.Facts == nil {
		v.Facts = []Fact{}
	}
	return v, nil
}

func saveFacts(path string, v FactsFile) error {
	if v.Facts == nil {
		v.Facts = []Fact{}
	}
	return sdk.SaveJSONFileIndented(path, v)
}

func loadSummaries(path string) (SummariesFile, error) {
	v, err := sdk.LoadJSONFile[SummariesFile](path)
	if err != nil {
		return SummariesFile{}, err
	}
	if v.Summaries == nil {
		v.Summaries = []Summary{}
	}
	return v, nil
}

func saveSummaries(path string, v SummariesFile) error {
	if v.Summaries == nil {
		v.Summaries = []Summary{}
	}
	return sdk.SaveJSONFileIndented(path, v)
}

func loadMetadata(path string) (Metadata, error) {
	v, err := sdk.LoadJSONFile[Metadata](path)
	if err != nil {
		return Metadata{}, err
	}
	if v.BaselineMood == (Mood{}) {
		v.BaselineMood = Mood{Valence: assistantDefaultBaselineValence, Arousal: assistantDefaultBaselineArousal}
	}
	return v, nil
}

func saveMetadata(path string, v Metadata) error {
	if v.BaselineMood == (Mood{}) {
		v.BaselineMood = Mood{Valence: assistantDefaultBaselineValence, Arousal: assistantDefaultBaselineArousal}
	}
	return sdk.SaveJSONFileIndented(path, v)
}

func nextFactID(facts []Fact) string {
	maxN := 0
	for _, f := range facts {
		id := strings.TrimSpace(f.FactID)
		if len(id) != 3 || (id[0] != 'F' && id[0] != 'f') {
			continue
		}
		n := int(id[1]-'0')*10 + int(id[2]-'0')
		if n > maxN {
			maxN = n
		}
	}
	n := maxN + 1
	if n > 99 {
		n = 99
	}
	return "F" + twoDigits(n)
}

func nextSummaryID(summaries []Summary) string {
	maxN := 0
	for _, s := range summaries {
		id := strings.TrimSpace(s.SummaryID)
		if len(id) != 3 || (id[0] != 'S' && id[0] != 's') {
			continue
		}
		n := int(id[1]-'0')*10 + int(id[2]-'0')
		if n > maxN {
			maxN = n
		}
	}
	n := maxN + 1
	if n > 99 {
		n = 99
	}
	return "S" + twoDigits(n)
}

func twoDigits(n int) string {
	if n < 0 {
		n = 0
	}
	if n > 99 {
		n = 99
	}
	return string([]byte{'0' + byte(n/10), '0' + byte(n%10)})
}

func applyFactLRUCap(facts []Fact, cap int) []Fact {
	if cap <= 0 || len(facts) <= cap {
		return facts
	}
	sort.SliceStable(facts, func(i, j int) bool {
		ai := facts[i].LastAccessedAt
		aj := facts[j].LastAccessedAt
		if ai.IsZero() && aj.IsZero() {
			return facts[i].CreatedAt.Before(facts[j].CreatedAt)
		}
		if ai.IsZero() {
			return true
		}
		if aj.IsZero() {
			return false
		}
		return ai.Before(aj)
	})
	return append([]Fact(nil), facts[len(facts)-cap:]...)
}

func touchFactsUsedByContent(facts []Fact, content string, now time.Time) []Fact {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return facts
	}
	for i := range facts {
		needle := strings.TrimSpace(facts[i].Content)
		if needle == "" {
			continue
		}
		if strings.Contains(trimmed, needle) {
			facts[i].LastAccessedAt = now
		}
	}
	return facts
}

func touchFactsByIDs(facts []Fact, ids []string, now time.Time) []Fact {
	if len(facts) == 0 || len(ids) == 0 {
		return facts
	}
	want := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		t := strings.TrimSpace(id)
		if t == "" {
			continue
		}
		want[strings.ToUpper(t)] = struct{}{}
	}
	if len(want) == 0 {
		return facts
	}
	for i := range facts {
		id := strings.ToUpper(strings.TrimSpace(facts[i].FactID))
		if id == "" {
			continue
		}
		if _, ok := want[id]; ok {
			facts[i].LastAccessedAt = now
		}
	}
	return facts
}

type toolCall struct {
	Tool string         `json:"tool"`
	Args map[string]any `json:"args"`
}

func parseToolCallLine(s string) (toolCall, bool) {
	line := strings.TrimSpace(s)
	const prefix = "TOOL_CALL:"
	if !strings.HasPrefix(line, prefix) {
		return toolCall{}, false
	}
	raw := strings.TrimSpace(strings.TrimPrefix(line, prefix))
	if raw == "" {
		return toolCall{}, false
	}
	var tc toolCall
	if err := json.Unmarshal([]byte(raw), &tc); err != nil {
		return toolCall{}, false
	}
	tc.Tool = strings.TrimSpace(tc.Tool)
	if tc.Tool == "" {
		return toolCall{}, false
	}
	if tc.Args == nil {
		tc.Args = map[string]any{}
	}
	return tc, true
}

var finalMoodRE = regexp.MustCompile(`(?is)\bfinal_mood\s*:\s*(\{[^}]*\})`)

func extractAndStripFinalMood(content string) (clean string, mood Mood, ok bool) {
	s := strings.TrimSpace(content)
	matches := finalMoodRE.FindStringSubmatchIndex(s)
	if len(matches) < 4 {
		return s, Mood{}, false
	}
	jsonPart := s[matches[2]:matches[3]]
	var parsed Mood
	if err := json.Unmarshal([]byte(jsonPart), &parsed); err != nil {
		return s, Mood{}, false
	}

	clean = strings.TrimSpace(s[:matches[0]] + s[matches[1]:])
	clean = strings.TrimSpace(clean)
	return clean, parsed, true
}

var assistantDeveloperInstructionsOnce sync.Once
var assistantDeveloperInstructionsCached string

func assistantDeveloperInstructionsText() string {
	assistantDeveloperInstructionsOnce.Do(func() {
		paths := sdk.CandidateDataFilePaths(assistantDeveloperInstructionsFilename)
		for _, path := range paths {
			b, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			s := strings.TrimSpace(string(b))
			if s == "" {
				continue
			}
			s = strings.ReplaceAll(s, "{{SILENCE_TOKEN}}", assistantSilenceToken)
			assistantDeveloperInstructionsCached = s
			return
		}
		assistantDeveloperInstructionsCached = ""
	})
	return assistantDeveloperInstructionsCached
}
