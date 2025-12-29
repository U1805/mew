package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	sdkclient "mew/plugins/sdk/client"
)

type testRunner struct {
	started chan struct{}
	stopped chan struct{}
}

func (r *testRunner) Run(ctx context.Context) error {
	close(r.started)
	<-ctx.Done()
	close(r.stopped)
	return ctx.Err()
}

func TestBotManager_SyncOnce_StartReloadStop(t *testing.T) {
	var (
		mu          sync.Mutex
		bootstrapN  int
		bootstrap   []sdkclient.BootstrapBot
		gotRegister int
	)

	bootstrap = []sdkclient.BootstrapBot{
		{ID: "b1", Name: "bot1", Config: `{"a":1}`, AccessToken: "t1"},
		{ID: "b2", Name: "bot2", Config: `{"a":2}`, AccessToken: "t2"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Mew-Admin-Secret") != "secret" {
			http.Error(w, "missing secret", http.StatusUnauthorized)
			return
		}

		switch r.URL.Path {
		case "/infra/service-types/register":
			mu.Lock()
			gotRegister++
			mu.Unlock()
			w.WriteHeader(http.StatusOK)
		case "/bots/bootstrap":
			mu.Lock()
			bootstrapN++
			n := bootstrapN
			out := bootstrap
			if n == 3 {
				out = []sdkclient.BootstrapBot{
					{ID: "b1", Name: "bot1", Config: `{"a":99}`, AccessToken: "t1"},
				}
			}
			mu.Unlock()

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"bots": out})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	client, err := sdkclient.NewClient(srv.URL, "secret")
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	var (
		fmu     sync.Mutex
		runners = map[string][]*testRunner{}
	)
	factory := func(botID, botName, accessToken, rawConfig string) (Runner, error) {
		r := &testRunner{started: make(chan struct{}), stopped: make(chan struct{})}
		fmu.Lock()
		runners[botID] = append(runners[botID], r)
		fmu.Unlock()
		return r, nil
	}

	mgr := NewBotManager(client, "svc", "[test]", factory)
	ctx := context.Background()

	if err := mgr.SyncOnce(ctx); err != nil {
		t.Fatalf("SyncOnce #1: %v", err)
	}

	waitStarted := func(id string, idx int) {
		t.Helper()
		fmu.Lock()
		rs := runners[id]
		fmu.Unlock()
		if len(rs) <= idx {
			t.Fatalf("runner not created for %s[%d]", id, idx)
		}
		select {
		case <-rs[idx].started:
		case <-time.After(1 * time.Second):
			t.Fatalf("timeout waiting for %s[%d] started", id, idx)
		}
	}
	waitStopped := func(id string, idx int) {
		t.Helper()
		fmu.Lock()
		rs := runners[id]
		fmu.Unlock()
		if len(rs) <= idx {
			t.Fatalf("runner not created for %s[%d]", id, idx)
		}
		select {
		case <-rs[idx].stopped:
		case <-time.After(1 * time.Second):
			t.Fatalf("timeout waiting for %s[%d] stopped", id, idx)
		}
	}

	waitStarted("b1", 0)
	waitStarted("b2", 0)

	// No change => should not create new runners.
	if err := mgr.SyncOnce(ctx); err != nil {
		t.Fatalf("SyncOnce #2: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	fmu.Lock()
	if len(runners["b1"]) != 1 || len(runners["b2"]) != 1 {
		fmu.Unlock()
		t.Fatalf("expected no reload, got runners: %#v", runners)
	}
	fmu.Unlock()

	// Third sync: b1 config changes => reload, b2 removed => stop.
	if err := mgr.SyncOnce(ctx); err != nil {
		t.Fatalf("SyncOnce #3: %v", err)
	}
	waitStopped("b2", 0)
	waitStopped("b1", 0)
	waitStarted("b1", 1)

	mgr.StopAll()
	waitStopped("b1", 1)

	mu.Lock()
	if gotRegister == 0 {
		mu.Unlock()
		t.Fatalf("expected RegisterServiceType to be called")
	}
	mu.Unlock()
}
