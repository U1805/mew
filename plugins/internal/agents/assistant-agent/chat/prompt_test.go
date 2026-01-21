package chat

import (
	"strings"
	"testing"
	"time"

	"mew/plugins/internal/agents/assistant-agent/memory"
)

func TestSpeakerMetaLine_ConvertsTimezone(t *testing.T) {
	loc := time.FixedZone("UTC+08:00", 8*60*60)
	sentAtUTC := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	meta := SpeakerMetaLine(loc, "alice", "u1", sentAtUTC)
	if !strings.Contains(meta, `time="08:00"`) {
		t.Fatalf("expected local time in meta, got: %q", meta)
	}
}

func TestWrapUserTextWithSpeakerMeta_ConvertsTimezone(t *testing.T) {
	loc := time.FixedZone("UTC-07:00", -7*60*60)
	sentAtUTC := time.Date(2025, 1, 1, 12, 34, 0, 0, time.UTC)

	out := WrapUserTextWithSpeakerMeta(loc, "bob", "u2", sentAtUTC, "hello")
	if !strings.Contains(out, `time="05:34"`) {
		t.Fatalf("expected local time in wrapped message, got: %q", out)
	}
	if !strings.Contains(out, "\nhello") {
		t.Fatalf("expected message text to be included, got: %q", out)
	}
}

func TestSpeakerMetaFuncInLocation_ConvertsTimezone(t *testing.T) {
	loc := time.FixedZone("UTC+01:00", 1*60*60)
	sentAtUTC := time.Date(2025, 1, 1, 23, 0, 0, 0, time.UTC)

	fn := SpeakerMetaFuncInLocation(loc)
	meta := fn("carol", "u3", sentAtUTC)
	if !strings.Contains(meta, `time="00:00"`) {
		t.Fatalf("expected local time in meta func output, got: %q", meta)
	}
}

func TestBuildL1L4UserPrompt_SessionStartDatetime_UsesLocalTimeAndWeekday(t *testing.T) {
	loc := time.FixedZone("UTC+08:00", 8*60*60)
	meta := memory.Metadata{
		StartAt: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	out := BuildL1L4UserPrompt("dev", meta, memory.FactsFile{}, memory.SummariesFile{}, loc)
	if !strings.Contains(out, "session_start_datetime: 2025-01-01 Wed 08:00") {
		t.Fatalf("expected session_start_datetime to include local time + weekday, got: %q", out)
	}
}

func TestBuildL1L4UserPrompt_SessionStartDatetime_FallsBackToStoredString(t *testing.T) {
	meta := memory.Metadata{
		SessionStartDatetime: " 2025-01-01 15:04 \n",
	}

	out := BuildL1L4UserPrompt("dev", meta, memory.FactsFile{}, memory.SummariesFile{}, nil)
	if !strings.Contains(out, "session_start_datetime: 2025-01-01 15:04") {
		t.Fatalf("expected session_start_datetime to fall back to stored string, got: %q", out)
	}
}

func TestStripAssistantControlDirectives_RemovesControlsAndMood(t *testing.T) {
	in := strings.Join([]string{
		"hi",
		"<STICKER>{\"name\":\"Wave\"}",
		"final_mood: {\"valence\": 0.1, \"arousal\": 0.2}",
		"<WANT_MORE>",
		"<PROACTIVE>{\"delay_seconds\":1,\"reason\":\"x\"}",
		"ok",
	}, "\n")
	out := stripAssistantControlDirectives(in)
	if out != "hi\nok" {
		t.Fatalf("unexpected output: %q", out)
	}
}
