package client

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewClient_AlwaysDirect_IgnoresProxyEnv(t *testing.T) {
	t.Setenv("MEW_API_PROXY", "socks5://127.0.0.1:1")
	_, err := NewClient("http://example.com/api", "secret")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestClient_RegisterServiceType_And_BootstrapBots(t *testing.T) {
	var gotRegister bool
	var gotBootstrap bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Mew-Admin-Secret") != "secret" {
			http.Error(w, "missing secret", http.StatusUnauthorized)
			return
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			http.Error(w, "bad content-type", http.StatusBadRequest)
			return
		}

		switch r.URL.Path {
		case "/infra/service-types/register":
			gotRegister = true
			var body ServiceTypeRegistration
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.ServiceType != "svc" || body.ServerName != "svc" {
				http.Error(w, "bad register body", http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
		case "/bots/bootstrap":
			gotBootstrap = true

			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["serviceType"] != "svc" {
				http.Error(w, "bad serviceType", http.StatusBadRequest)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"bots": []BootstrapBot{{ID: "b1", Name: "bot1", Config: "{}", AccessToken: "t1", ServiceType: "svc"}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	t.Setenv("MEW_API_PROXY", "")

	c, err := NewClient(srv.URL+"/", "secret")
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	if err := c.RegisterServiceType(context.Background(), "svc"); err != nil {
		t.Fatalf("RegisterServiceType: %v", err)
	}
	bots, err := c.BootstrapBots(context.Background(), "svc")
	if err != nil {
		t.Fatalf("BootstrapBots: %v", err)
	}
	if !gotRegister || !gotBootstrap {
		t.Fatalf("expected endpoints to be called (register=%v bootstrap=%v)", gotRegister, gotBootstrap)
	}
	if len(bots) != 1 || bots[0].ID != "b1" || bots[0].ServiceType != "svc" {
		t.Fatalf("unexpected bots: %#v", bots)
	}
}

func TestClient_BootstrapBots_Non2xxIncludesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	c, err := NewClient(srv.URL, "secret")
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	_, err = c.BootstrapBots(context.Background(), "svc")
	if err == nil || !strings.Contains(err.Error(), "status=500") || !strings.Contains(err.Error(), "nope") {
		t.Fatalf("expected status/body in error, got: %v", err)
	}
}

func TestClient_BootstrapBots_InvalidJSONIncludesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{not-json"))
	}))
	t.Cleanup(srv.Close)

	c, err := NewClient(srv.URL, "secret")
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	_, err = c.BootstrapBots(context.Background(), "svc")
	if err == nil || !strings.Contains(err.Error(), "bootstrap decode failed") || !strings.Contains(err.Error(), "{not-json") {
		t.Fatalf("expected decode error with body, got: %v", err)
	}
}
