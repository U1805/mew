package httpx

import (
	"net/http"
	"testing"
)

func TestProxyFuncFromString(t *testing.T) {
	if fn, err := ProxyFuncFromString(""); err != nil || fn != nil {
		t.Fatalf("empty => nil, got fn=%T err=%v", fn, err)
	}

	if fn, err := ProxyFuncFromString("direct"); err != nil || fn != nil {
		t.Fatalf("direct => nil, got fn=%T err=%v", fn, err)
	}

	fn, err := ProxyFuncFromString("env")
	if err != nil || fn == nil {
		t.Fatalf("env => ProxyFromEnvironment, got fn=%T err=%v", fn, err)
	}

	fn, err = ProxyFuncFromString("127.0.0.1:7890")
	if err != nil || fn == nil {
		t.Fatalf("host:port => proxy func, got fn=%T err=%v", fn, err)
	}
	req, _ := http.NewRequest(http.MethodGet, "http://example.com", nil)
	u, err := fn(req)
	if err != nil || u == nil || u.String() != "http://127.0.0.1:7890" {
		t.Fatalf("unexpected proxy url: u=%v err=%v", u, err)
	}
}

func TestParseProxyURL(t *testing.T) {
	if _, err := ParseProxyURL(""); err == nil {
		t.Fatalf("expected error for empty")
	}
	if _, err := ParseProxyURL("socks5://127.0.0.1:1"); err == nil {
		t.Fatalf("expected error for unsupported scheme")
	}
	if _, err := ParseProxyURL("http://"); err == nil {
		t.Fatalf("expected error for missing host")
	}
}
