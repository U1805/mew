package webhook

import "testing"

func TestIsLoopbackHost(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"localhost", true},
		{"127.0.0.1", true},
		{"::1", true},
		{"example.com", false},
		{"8.8.8.8", false},
	}
	for _, tc := range cases {
		if got := isLoopbackHost(tc.host); got != tc.want {
			t.Fatalf("isLoopbackHost(%q)=%v, want %v", tc.host, got, tc.want)
		}
	}
}

func TestRewriteLoopbackURL(t *testing.T) {
	out, err := RewriteLoopbackURL("http://localhost/webhook/1?x=1", "https://example.com/api")
	if err != nil {
		t.Fatalf("RewriteLoopbackURL error: %v", err)
	}
	if out != "https://example.com/webhook/1?x=1" {
		t.Fatalf("unexpected rewritten url: %q", out)
	}

	out, err = RewriteLoopbackURL("https://webhook.example.com/a", "https://example.com/api")
	if err != nil {
		t.Fatalf("RewriteLoopbackURL error: %v", err)
	}
	if out != "https://webhook.example.com/a" {
		t.Fatalf("unexpected url: %q", out)
	}
}
