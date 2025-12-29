package bot

import "testing"

func TestParseReplyControls_WantMore(t *testing.T) {
	clean, c := parseReplyControls("hello\n\n" + assistantWantMoreToken + "\n")
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if !c.wantMore {
		t.Fatalf("wantMore=false")
	}
}

func TestParseReplyControls_Proactive(t *testing.T) {
	in := "hello\n" + assistantProactiveTokenPrefix + `{"delay_seconds":180,"reason":"follow up"}` + "\n"
	clean, c := parseReplyControls(in)
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if c.proactive == nil {
		t.Fatalf("proactive=nil")
	}
	if c.proactive.DelaySeconds != 180 || c.proactive.DelayMinutes != 0 || c.proactive.Reason != "follow up" {
		t.Fatalf("proactive=%+v", *c.proactive)
	}
}

func TestParseReplyControls_Both(t *testing.T) {
	in := "hello\n" + assistantProactiveTokenPrefix + `{"delay_minutes":3,"reason":"song"}` + "\n" + assistantWantMoreToken
	clean, c := parseReplyControls(in)
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if !c.wantMore {
		t.Fatalf("wantMore=false")
	}
	if c.proactive == nil || c.proactive.DelayMinutes != 3 || c.proactive.Reason != "song" {
		t.Fatalf("proactive=%+v", c.proactive)
	}
}

func TestParseReplyControls_NotAtEnd(t *testing.T) {
	in := assistantWantMoreToken + "\nhello"
	clean, c := parseReplyControls(in)
	if clean != in {
		t.Fatalf("clean=%q", clean)
	}
	if c.wantMore || c.proactive != nil {
		t.Fatalf("controls should be empty: %+v", c)
	}
}
