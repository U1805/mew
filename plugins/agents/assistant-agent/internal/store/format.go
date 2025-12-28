package store

import (
	"fmt"
	"strings"
)

func FormatFactsForContext(f FactsFile) string {
	if len(f.Facts) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for _, fact := range f.Facts {
		id := strings.TrimSpace(fact.FactID)
		content := strings.TrimSpace(fact.Content)
		if id == "" || content == "" {
			continue
		}
		b.WriteString(id)
		b.WriteString(": ")
		b.WriteString(content)
		b.WriteString("\n")
	}
	s := strings.TrimSpace(b.String())
	if s == "" {
		return "(none)"
	}
	return s
}

func FormatSummariesForContext(s SummariesFile) string {
	if len(s.Summaries) == 0 {
		return "(none)"
	}
	var b strings.Builder
	for _, item := range s.Summaries {
		id := strings.TrimSpace(item.SummaryID)
		sum := strings.TrimSpace(item.Summary)
		if id == "" || sum == "" {
			continue
		}
		b.WriteString(id)
		b.WriteString(": ")
		b.WriteString(sum)
		if rid := strings.TrimSpace(item.RecordID); rid != "" {
			b.WriteString(" (RecordID=")
			b.WriteString(rid)
			b.WriteString(")")
		}
		b.WriteString("\n")
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		return "(none)"
	}
	return out
}

func FormatUserActivityFrequency(activeDays, windowDays int) string {
	if windowDays <= 0 {
		windowDays = 7
	}
	if activeDays < 0 {
		activeDays = 0
	}
	dayWord := "days"
	if activeDays == 1 {
		dayWord = "day"
	}
	return fmt.Sprintf("Active %d %s in the last %d", activeDays, dayWord, windowDays)
}
