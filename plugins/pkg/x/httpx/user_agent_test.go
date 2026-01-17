package httpx

import "testing"

func TestRandomBrowserUserAgent_IsFromList(t *testing.T) {
	got := RandomBrowserUserAgent()
	if got == "" {
		t.Fatalf("expected non-empty user-agent")
	}
	allowed := make(map[string]struct{}, len(browserUserAgents))
	for _, ua := range browserUserAgents {
		allowed[ua] = struct{}{}
	}
	if _, ok := allowed[got]; !ok {
		t.Fatalf("unexpected user-agent: %q", got)
	}
}
