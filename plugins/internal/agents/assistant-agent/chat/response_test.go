package chat

import (
	"testing"
	"time"

	"mew/plugins/internal/agents/assistant-agent/infra"
)

func TestAssistantTypingDelayForLineMaybeSkipFirst(t *testing.T) {
	t.Parallel()

	line := "hello world"

	t.Run("skips first when default wpm", func(t *testing.T) {
		d := AssistantTypingDelayForLineMaybeSkipFirst(line, infra.AssistantTypingWPMDefault, true)
		if d != 0 {
			t.Fatalf("expected 0, got %v", d)
		}
	})

	t.Run("skips first when wpm unspecified (defaults)", func(t *testing.T) {
		d := AssistantTypingDelayForLineMaybeSkipFirst(line, 0, true)
		if d != 0 {
			t.Fatalf("expected 0, got %v", d)
		}
	})

	t.Run("does not skip first when custom wpm", func(t *testing.T) {
		d := AssistantTypingDelayForLineMaybeSkipFirst(line, 120, true)
		if d <= 0 {
			t.Fatalf("expected >0, got %v", d)
		}
	})

	t.Run("does not skip non-first with default wpm", func(t *testing.T) {
		d := AssistantTypingDelayForLineMaybeSkipFirst(line, infra.AssistantTypingWPMDefault, false)
		if d <= 0 {
			t.Fatalf("expected >0, got %v", d)
		}
	})

	t.Run("empty is always zero", func(t *testing.T) {
		d := AssistantTypingDelayForLineMaybeSkipFirst("", infra.AssistantTypingWPMDefault, true)
		if d != 0 {
			t.Fatalf("expected 0, got %v", d)
		}
	})

	t.Run("matches baseline for non-default wpm", func(t *testing.T) {
		want := AssistantTypingDelayForLine(line, 120)
		got := AssistantTypingDelayForLineMaybeSkipFirst(line, 120, false)
		if got != want {
			t.Fatalf("expected %v, got %v", want, got)
		}
	})

	t.Run("baseline computes expected order of magnitude", func(t *testing.T) {
		d := AssistantTypingDelayForLine(line, infra.AssistantTypingWPMDefault)
		if d <= 0 || d >= time.Minute {
			t.Fatalf("unexpected delay %v", d)
		}
	})
}

