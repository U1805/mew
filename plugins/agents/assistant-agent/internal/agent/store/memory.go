package store

import (
	"sort"
	"strings"
	"time"
)

type Metadata struct {
	SessionStartDatetime  string `json:"session_start_datetime"`
	TimeSinceLastMessage  string `json:"time_since_last_message"`
	UserActivityFrequency string `json:"user_activity_frequency"`

	InitialMood  Mood `json:"initial_mood"`
	FinalMood    Mood `json:"final_mood"`
	BaselineMood Mood `json:"baseline_mood"`

	RecordID      string    `json:"recordId"`
	StartAt       time.Time `json:"startAt"`
	LastMessageAt time.Time `json:"lastMessageAt"`
	ChannelID     string    `json:"channelId"`

	LastSummarizedRecordID string    `json:"lastSummarizedRecordId"`
	LastFactRecordID       string    `json:"lastFactRecordId"`
	LastFactProcessedAt    time.Time `json:"lastFactProcessedAt"`
}

type Fact struct {
	FactID         string    `json:"factId"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"createdAt"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

type FactsFile struct {
	Facts []Fact `json:"facts"`
}

type Summary struct {
	SummaryID string    `json:"summaryId"`
	RecordID  string    `json:"recordId"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"createdAt"`
}

type SummariesFile struct {
	Summaries []Summary `json:"summaries"`
}

func NextFactID(facts []Fact) string {
	maxN := 0
	for _, fact := range facts {
		id := strings.TrimSpace(fact.FactID)
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

func NextSummaryID(summaries []Summary) string {
	maxN := 0
	for _, summary := range summaries {
		id := strings.TrimSpace(summary.SummaryID)
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

func ApplyFactLRUCap(facts []Fact, cap int) []Fact {
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

func TouchFactsUsedByContent(facts []Fact, content string, now time.Time) []Fact {
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

func TouchFactsByIDs(facts []Fact, ids []string, now time.Time) []Fact {
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

func twoDigits(n int) string {
	if n < 0 {
		n = 0
	}
	if n > 99 {
		n = 99
	}
	return string([]byte{'0' + byte(n/10), '0' + byte(n%10)})
}

func UpsertFacts(now time.Time, facts FactsFile, newFacts []string, maxFacts int) FactsFile {
	if facts.Facts == nil {
		facts.Facts = []Fact{}
	}

	existing := make(map[string]struct{}, len(facts.Facts))
	for _, f := range facts.Facts {
		key := strings.ToLower(strings.TrimSpace(f.Content))
		if key != "" {
			existing[key] = struct{}{}
		}
	}

	for _, nf := range newFacts {
		key := strings.ToLower(strings.TrimSpace(nf))
		if key == "" {
			continue
		}
		if _, ok := existing[key]; ok {
			continue
		}
		existing[key] = struct{}{}
		facts.Facts = append(facts.Facts, Fact{
			FactID:         NextFactID(facts.Facts),
			Content:        strings.TrimSpace(nf),
			CreatedAt:      now,
			LastAccessedAt: now,
		})
	}

	facts.Facts = ApplyFactLRUCap(facts.Facts, maxFacts)
	return facts
}

func AppendSummary(now time.Time, summaries SummariesFile, recordID, summaryText string, maxSummaries int) SummariesFile {
	if summaries.Summaries == nil {
		summaries.Summaries = []Summary{}
	}
	summaryText = strings.TrimSpace(summaryText)
	recordID = strings.TrimSpace(recordID)
	if summaryText == "" || recordID == "" {
		return summaries
	}
	for _, s := range summaries.Summaries {
		if s.RecordID == recordID {
			return summaries
		}
	}
	summaries.Summaries = append(summaries.Summaries, Summary{
		SummaryID: NextSummaryID(summaries.Summaries),
		RecordID:  recordID,
		Summary:   summaryText,
		CreatedAt: now,
	})
	if maxSummaries > 0 && len(summaries.Summaries) > maxSummaries {
		summaries.Summaries = summaries.Summaries[len(summaries.Summaries)-maxSummaries:]
	}
	return summaries
}
