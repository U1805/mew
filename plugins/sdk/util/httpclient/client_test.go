package httpclient

import (
	"net/http"
	"testing"
)

func TestNewClient_DefaultNoProxy_EvenIfEnvProxySet(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:7890")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:7890")
	t.Setenv("MEW_API_PROXY", "")

	c, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", c.Transport)
	}
	if tr.Proxy != nil {
		t.Fatalf("expected nil proxy func (direct), got %T", tr.Proxy)
	}
}

func TestNewClient_UseMEWProxy_FallsBackToEnvProxyWhenUnset(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:7890")
	t.Setenv("MEW_API_PROXY", "")

	c, err := NewClient(ClientOptions{UseMEWProxy: true})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr := c.Transport.(*http.Transport)
	if tr.Proxy == nil {
		t.Fatalf("expected non-nil proxy func")
	}

	req, _ := http.NewRequest(http.MethodGet, "http://example.com", nil)
	u, err := tr.Proxy(req)
	if err != nil {
		t.Fatalf("proxy func returned error: %v", err)
	}
	if u == nil || u.String() != "http://127.0.0.1:7890" {
		t.Fatalf("unexpected proxy url: %v", u)
	}
}

func TestNewClient_UseMEWProxy_DirectOverridesEnvProxy(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:7890")
	t.Setenv("MEW_API_PROXY", "direct")

	c, err := NewClient(ClientOptions{UseMEWProxy: true})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr := c.Transport.(*http.Transport)
	if tr.Proxy != nil {
		t.Fatalf("expected nil proxy func (direct), got %T", tr.Proxy)
	}
}

func TestNewClient_ExplicitProxyOverridesEverything(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:7890")
	t.Setenv("MEW_API_PROXY", "direct")

	c, err := NewClient(ClientOptions{
		UseMEWProxy: true,
		Proxy:       "127.0.0.1:7891",
	})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr := c.Transport.(*http.Transport)
	if tr.Proxy == nil {
		t.Fatalf("expected non-nil proxy func")
	}

	req, _ := http.NewRequest(http.MethodGet, "http://example.com", nil)
	u, err := tr.Proxy(req)
	if err != nil {
		t.Fatalf("proxy func returned error: %v", err)
	}
	if u == nil || u.String() != "http://127.0.0.1:7891" {
		t.Fatalf("unexpected proxy url: %v", u)
	}
}
