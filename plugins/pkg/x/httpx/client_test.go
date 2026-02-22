package httpx

import (
	"net/http"
	"testing"
)

func TestNewClient_DefaultMode_FromMEWAPIProxyDirect(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "direct")

	c, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", c.Transport)
	}
	if tr.Proxy != nil {
		t.Fatalf("expected nil proxy func for direct mode, got %T", tr.Proxy)
	}
}

func TestNewClient_DefaultMode_FromMEWAPIProxyEnv(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "env")

	c, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", c.Transport)
	}
	if tr.Proxy == nil {
		t.Fatalf("expected non-nil proxy func for env mode")
	}
}

func TestNewClient_DefaultMode_FromMEWAPIProxyProxy_NoEnvProxy(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "proxy")
	t.Setenv("HTTP_PROXY", "")
	t.Setenv("HTTPS_PROXY", "")

	c, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	rt, ok := c.Transport.(*fallbackRoundTripper)
	if !ok {
		t.Fatalf("expected *fallbackRoundTripper, got %T", c.Transport)
	}
	if rt.primary == nil {
		t.Fatalf("expected non-nil primary")
	}
	if rt.fallback != nil {
		t.Fatalf("expected nil env fallback when HTTP_PROXY/HTTPS_PROXY are empty")
	}
	if !rt.tryDirect {
		t.Fatalf("expected tryDirect=true in proxy mode")
	}
}

func TestNewClient_DefaultMode_FromMEWAPIProxyProxy_WithEnvProxy(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "proxy")
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:7890")

	c, err := NewClient(ClientOptions{})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	rt, ok := c.Transport.(*fallbackRoundTripper)
	if !ok {
		t.Fatalf("expected *fallbackRoundTripper, got %T", c.Transport)
	}
	if rt.fallback == nil {
		t.Fatalf("expected env fallback when HTTP_PROXY/HTTPS_PROXY are configured")
	}
}

func TestNewClient_DefaultMode_InvalidMEWAPIProxyRejected(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "http://127.0.0.1:7890")

	_, err := NewClient(ClientOptions{})
	if err == nil {
		t.Fatalf("expected invalid MEW_API_PROXY error, got nil")
	}
}

func TestNewClient_ExplicitModeDirect_OverridesEnv(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "env")

	c, err := NewClient(ClientOptions{Mode: ModeDirect})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	tr, ok := c.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", c.Transport)
	}
	if tr.Proxy != nil {
		t.Fatalf("expected nil proxy func in explicit direct mode")
	}
}

func TestNewClient_ModeProxy_ExplicitProxyOverride(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "direct")

	c, err := NewClient(ClientOptions{Mode: ModeProxy, Proxy: "127.0.0.1:7891"})
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}

	rt, ok := c.Transport.(*fallbackRoundTripper)
	if !ok {
		t.Fatalf("expected *fallbackRoundTripper, got %T", c.Transport)
	}
	if rt.fallback == nil {
		t.Fatalf("expected fallback to be configured for explicit proxy override")
	}
}
