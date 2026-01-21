package chat

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestParseReplyControls_StickerInMiddle(t *testing.T) {
	in := "hello\n<STICKER>{\"name\":\"Wave\"}\nworld"
	clean, controls := ParseReplyControls(in)
	if clean != "hello\nworld" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if controls.Sticker == nil || controls.Sticker.Name != "Wave" {
		t.Fatalf("expected sticker Wave, got: %#v", controls.Sticker)
	}
	if len(controls.Parts) != 3 || controls.Parts[0].Kind != ReplyPartText || controls.Parts[1].Kind != ReplyPartSticker || controls.Parts[2].Kind != ReplyPartText {
		t.Fatalf("unexpected parts: %#v", controls.Parts)
	}
}

func TestParseReplyControls_WantMoreTokenTruncates(t *testing.T) {
	in := "line1\n<WANT_MORE>\nline2\n<STICKER>{\"name\":\"Wave\"}"
	clean, controls := ParseReplyControls(in)
	if clean != "line1" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if !controls.WantMore {
		t.Fatalf("expected WantMore=true")
	}
	if controls.Sticker != nil {
		t.Fatalf("expected sticker to be ignored after truncation, got: %#v", controls.Sticker)
	}
	if len(controls.Parts) != 1 || controls.Parts[0].Kind != ReplyPartText {
		t.Fatalf("unexpected parts: %#v", controls.Parts)
	}
}

func TestParseReplyControls_ProactiveInMiddleOfChinese(t *testing.T) {
	in := "我觉得<PROACTIVE>{\"delay_seconds\":180,\"reason\":\"test\"}明天会更好"
	clean, controls := ParseReplyControls(in)
	if clean != "我觉得明天会更好" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if controls.Proactive == nil || controls.Proactive.DelaySeconds != 180 || controls.Proactive.Reason != "test" {
		t.Fatalf("unexpected proactive: %#v", controls.Proactive)
	}
}

func TestParseReplyControls_ToolTokenTruncates(t *testing.T) {
	in := "line1\n<TOOL>{\"name\":\"HistorySearch\",\"args\":{\"keyword\":\"x\"}}\nline2\n<STICKER>{\"name\":\"Wave\"}"
	clean, controls := ParseReplyControls(in)
	if clean != "line1" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if controls.WantMore {
		t.Fatalf("expected WantMore=false")
	}
	if controls.Sticker != nil {
		t.Fatalf("expected sticker to be ignored after tool truncation, got: %#v", controls.Sticker)
	}
}

func TestParseReplyControls_FinalMoodTruncates(t *testing.T) {
	in := "line1\nfinal_mood: {\"valence\": 0.1, \"arousal\": 0.2}\nline2\n<STICKER>{\"name\":\"Wave\"}"
	clean, controls := ParseReplyControls(in)
	if clean != "line1" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if controls.WantMore {
		t.Fatalf("expected WantMore=false")
	}
	if controls.Sticker != nil {
		t.Fatalf("expected sticker to be ignored after mood truncation, got: %#v", controls.Sticker)
	}
}

func TestParseReplyControls_SilenceAtTailSuppressesSend(t *testing.T) {
	in := "hello\n<SILENCE>"
	clean, controls := ParseReplyControls(in)
	if clean != "" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if !controls.Silence {
		t.Fatalf("expected Silence=true")
	}
	if len(controls.Parts) != 0 || controls.Sticker != nil || controls.Voice != nil {
		t.Fatalf("expected no parts/controls, got: %#v", controls)
	}
}

func TestSendReply_StickerSentInBetweenTextLines(t *testing.T) {
	clean, controls := ParseReplyControls("a\n<STICKER>{\"name\":\"Wave\"}\nb")
	if clean != "a\nb" {
		t.Fatalf("unexpected clean: %q", clean)
	}

	var events []string
	p1 := 1.0
	err := SendReply(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			m, _ := payload.(map[string]any)
			if m == nil {
				events = append(events, "unknown")
				return nil
			}
			if typ, _ := m["type"].(string); typ == "message/sticker" {
				events = append(events, "sticker")
				return nil
			}
			if content, _ := m["content"].(string); content != "" {
				events = append(events, "text:"+content)
				return nil
			}
			events = append(events, "unknown")
			return nil
		},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
		TypingWPM: 1_000_000_000,
		ResolveStickerIDByName: func(ctx context.Context, name string) (string, error) {
			return "sid", nil
		},
		StickerSendProbability: &p1,
		StickerSendRandom:      func() float64 { return 0 },
	}, clean, controls)
	if err != nil {
		t.Fatalf("SendReply err: %v", err)
	}
	if len(events) != 3 || events[0] != "text:a" || events[1] != "sticker" || events[2] != "text:b" {
		t.Fatalf("unexpected events: %#v", events)
	}
}

func TestSendReply_SilenceSkipsAllOutputs(t *testing.T) {
	clean, controls := ParseReplyControls("a\n<STICKER>{\"name\":\"Wave\"}\n<SILENCE>")
	if clean != "" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if !controls.Silence {
		t.Fatalf("expected Silence=true")
	}

	var events []string
	err := SendReply(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			events = append(events, event)
			return nil
		},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
	}, clean, controls)
	if err != nil {
		t.Fatalf("SendReply err: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected no events, got: %#v", events)
	}
}

func TestSendReply_VoiceSentInBetweenTextLines(t *testing.T) {
	clean, controls := ParseReplyControls("a\n<VOICE>{\"text\":\"hello-tts\"}\nb")
	if clean != "a\nb" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if len(controls.Parts) != 3 || controls.Parts[0].Kind != ReplyPartText || controls.Parts[1].Kind != ReplyPartVoice || controls.Parts[2].Kind != ReplyPartText {
		t.Fatalf("unexpected parts: %#v", controls.Parts)
	}

	var events []string
	err := SendReply(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			m, _ := payload.(map[string]any)
			if content, _ := m["content"].(string); content != "" {
				events = append(events, "text:"+content)
			}
			return nil
		},
		SendVoiceHTTP: func(ctx context.Context, channelID, text string) error {
			events = append(events, "voice:"+text)
			return nil
		},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
		TypingWPM: 1_000_000_000,
	}, clean, controls)
	if err != nil {
		t.Fatalf("SendReply err: %v", err)
	}
	if len(events) != 3 || events[0] != "text:a" || events[1] != "voice:hello-tts" || events[2] != "text:b" {
		t.Fatalf("unexpected events: %#v", events)
	}
}

func TestSendReply_VoiceOnlyDirectiveSendsVoice(t *testing.T) {
	clean, controls := ParseReplyControls("<VOICE>{\"text\":\"hello-tts\"}")
	if clean != "" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	if len(controls.Parts) != 1 || controls.Parts[0].Kind != ReplyPartVoice {
		t.Fatalf("unexpected parts: %#v", controls.Parts)
	}

	var events []string
	var sleeps []time.Duration
	err := SendReply(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			events = append(events, event)
			return nil
		},
		SendVoiceHTTP: func(ctx context.Context, channelID, text string) error {
			events = append(events, "voice:"+text)
			return nil
		},
		Sleep: func(ctx context.Context, d time.Duration) {
			sleeps = append(sleeps, d)
		},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
		TypingWPM: 60,
	}, clean, controls)
	if err != nil {
		t.Fatalf("SendReply err: %v", err)
	}
	if len(events) != 1 || events[0] != "voice:hello-tts" {
		t.Fatalf("unexpected events: %#v", events)
	}
	if len(sleeps) != 0 {
		t.Fatalf("expected no sleeps, got: %#v", sleeps)
	}
}

func TestSendReply_SkipsTypingDelayBeforeVoice(t *testing.T) {
	line := strings.Repeat("a", 120)
	clean, controls := ParseReplyControls(line + "\n<VOICE>{\"text\":\"hello-tts\"}\nbye")
	if clean == "" {
		t.Fatalf("expected non-empty clean")
	}

	var sleeps []time.Duration
	err := SendReply(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			return nil
		},
		SendVoiceHTTP: func(ctx context.Context, channelID, text string) error {
			return nil
		},
		Sleep: func(ctx context.Context, d time.Duration) {
			sleeps = append(sleeps, d)
		},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
		TypingWPM: 60,
	}, clean, controls)
	if err != nil {
		t.Fatalf("SendReply err: %v", err)
	}
	if len(sleeps) < 2 {
		t.Fatalf("expected at least 2 sleep calls, got: %#v", sleeps)
	}
	if sleeps[0] != 0 {
		t.Fatalf("expected zero typing delay before voice, got: %v", sleeps[0])
	}
	if sleeps[1] <= 0 {
		t.Fatalf("expected positive typing delay for trailing text, got: %v", sleeps[1])
	}
}

func TestParseReplyControls_MultipleVoicesOnlyFirstKept(t *testing.T) {
	in := "a\n<VOICE>{\"text\":\"v1\"}\nb\n<VOICE>{\"text\":\"v2\"}\nc"
	clean, controls := ParseReplyControls(in)
	if clean != "a\nb\nc" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	voiceParts := 0
	for _, p := range controls.Parts {
		if p.Kind == ReplyPartVoice {
			voiceParts++
			if p.VoiceText != "v1" {
				t.Fatalf("unexpected voice text: %q", p.VoiceText)
			}
		}
	}
	if voiceParts != 1 {
		t.Fatalf("expected 1 voice part, got: %d (%#v)", voiceParts, controls.Parts)
	}
}

func TestParseReplyControls_MultipleStickersOnlyFirstKept(t *testing.T) {
	in := "a\n<STICKER>{\"name\":\"Wave\"}\nb\n<STICKER>{\"name\":\"Hello\"}\nc"
	clean, controls := ParseReplyControls(in)
	if clean != "a\nb\nc" {
		t.Fatalf("unexpected clean: %q", clean)
	}
	stickerParts := 0
	for _, p := range controls.Parts {
		if p.Kind == ReplyPartSticker {
			stickerParts++
			if p.StickerName != "Wave" {
				t.Fatalf("unexpected sticker name: %q", p.StickerName)
			}
		}
	}
	if stickerParts != 1 {
		t.Fatalf("expected 1 sticker part, got: %d (%#v)", stickerParts, controls.Parts)
	}
}

func TestSendEvents_VoiceFutureUsesPreparedUpload(t *testing.T) {
	fut := NewVoiceFuture()
	go func() {
		time.Sleep(10 * time.Millisecond)
		fut.Resolve(&PreparedVoice{TempPath: "x", Filename: "f.wav", ContentType: "audio/wav", PlainText: "hello"}, nil)
	}()

	var out []string
	err := SendEvents(context.Background(), TransportContext{
		Emit: func(event string, payload any) error {
			m, _ := payload.(map[string]any)
			if content, _ := m["content"].(string); content != "" {
				out = append(out, "text:"+content)
			}
			return nil
		},
		SendVoiceHTTP: func(ctx context.Context, channelID, text string) error {
			t.Fatalf("SendVoiceHTTP should not be called when SendVoicePreparedHTTP is available")
			return nil
		},
		SendVoicePreparedHTTP: func(ctx context.Context, channelID string, v PreparedVoice) error {
			out = append(out, "voice-prepared:"+v.PlainText)
			return nil
		},
		Sleep:     func(ctx context.Context, d time.Duration) {},
		ChannelID: "c1",
		UserID:    "u1",
		LogPrefix: "[test]",
		TypingWPM: 1_000_000_000,
	}, []SendEvent{
		{Kind: ReplyPartText, Text: "a"},
		{Kind: ReplyPartVoice, VoiceText: "hello", VoiceFuture: fut},
		{Kind: ReplyPartText, Text: "b"},
	})
	if err != nil {
		t.Fatalf("SendEvents err: %v", err)
	}
	if len(out) != 3 || out[0] != "text:a" || out[1] != "voice-prepared:hello" || out[2] != "text:b" {
		t.Fatalf("unexpected out: %#v", out)
	}
}
