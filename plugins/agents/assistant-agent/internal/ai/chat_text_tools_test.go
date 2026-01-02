package ai

import "testing"

func TestExtractTrailingToolCalls_Single(t *testing.T) {
	in := "hello\n<TOOL>{\"name\":\"HistorySearch\",\"args\":{\"keyword\":\"cats\"}}\n"
	clean, calls := extractTrailingToolCalls(in, "<TOOL>")
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if len(calls) != 1 {
		t.Fatalf("calls=%d", len(calls))
	}
	if calls[0].Name != "HistorySearch" {
		t.Fatalf("name=%q", calls[0].Name)
	}
	if calls[0].Args["keyword"] != "cats" {
		t.Fatalf("args=%v", calls[0].Args)
	}
}

func TestExtractTrailingToolCalls_MultiplePreserveOrder(t *testing.T) {
	in := "hello\n<TOOL>{\"name\":\"HistorySearch\",\"args\":{\"keyword\":\"cats\"}}\n<TOOL>{\"name\":\"RecordSearch\",\"args\":{\"record_id\":\"r1\"}}\n"
	clean, calls := extractTrailingToolCalls(in, "<TOOL>")
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if len(calls) != 2 {
		t.Fatalf("calls=%d", len(calls))
	}
	if calls[0].Name != "HistorySearch" || calls[1].Name != "RecordSearch" {
		t.Fatalf("order=%v", []string{calls[0].Name, calls[1].Name})
	}
}

func TestExtractTrailingToolCalls_ShorthandArgs(t *testing.T) {
	in := "hello\n<TOOL>{\"name\":\"HistorySearch\",\"keyword\":\"cats\"}\n"
	clean, calls := extractTrailingToolCalls(in, "<TOOL>")
	if clean != "hello" {
		t.Fatalf("clean=%q", clean)
	}
	if len(calls) != 1 {
		t.Fatalf("calls=%d", len(calls))
	}
	if calls[0].Args["keyword"] != "cats" {
		t.Fatalf("args=%v", calls[0].Args)
	}
}

func TestStripTrailingControlLines_RemovesKnownTokens(t *testing.T) {
	in := "hello\n<STICKER>{\"name\":\"Wave\"}\n<WANT_MORE>\n"
	got := stripTrailingControlLines(in, stripTrailingControlLinesOpts{
		WantMoreToken:      "<WANT_MORE>",
		StickerTokenPrefix: "<STICKER>",
	})
	if got != "hello" {
		t.Fatalf("got=%q", got)
	}
}
