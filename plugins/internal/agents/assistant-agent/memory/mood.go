package memory

import (
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
)

type Mood struct {
	Valence float64 `json:"valence"`
	Arousal float64 `json:"arousal"`
}

func DefaultBaselineMood() Mood {
	return Mood{Valence: infra.DefaultBaselineValence, Arousal: infra.DefaultBaselineArousal}
}

func ComputeInitialMood(baseline, lastFinal Mood, delta time.Duration) Mood {
	dHours := delta.Hours()
	if dHours < 0 {
		dHours = 0
	}
	decay := math.Exp(-infra.MoodDecayKPerHour * dHours)

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
