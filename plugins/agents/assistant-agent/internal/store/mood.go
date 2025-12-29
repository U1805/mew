package store

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"
)

type Mood struct {
	Valence float64 `json:"valence"`
	Arousal float64 `json:"arousal"`
}

const (
	DefaultBaselineValence = 0.2
	DefaultBaselineArousal = 0.1

	MoodDecayKPerHour = 0.25
)

func DefaultBaselineMood() Mood {
	return Mood{Valence: DefaultBaselineValence, Arousal: DefaultBaselineArousal}
}

func ComputeInitialMood(baseline, lastFinal Mood, delta time.Duration) Mood {
	dHours := delta.Hours()
	if dHours < 0 {
		dHours = 0
	}
	decay := math.Exp(-MoodDecayKPerHour * dHours)

	return Mood{
		Valence: baseline.Valence + (lastFinal.Valence-baseline.Valence)*decay,
		Arousal: baseline.Arousal + (lastFinal.Arousal-baseline.Arousal)*decay,
	}
}

var finalMoodRE = regexp.MustCompile(`(?is)\bfinal_mood\s*:\s*(\{[^}]*\})`)

func ExtractAndStripFinalMood(content string) (clean string, mood Mood, ok bool) {
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
