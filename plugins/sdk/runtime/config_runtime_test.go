package runtime

import (
	"os"
	"testing"
	"time"
)

func unsetEnv(t *testing.T, key string) {
	t.Helper()
	old, ok := os.LookupEnv(key)
	_ = os.Unsetenv(key)
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv(key, old)
		} else {
			_ = os.Unsetenv(key)
		}
	})
}

func TestLoadRuntimeConfig_RequiresAdminSecret(t *testing.T) {
	unsetEnv(t, "MEW_ADMIN_SECRET")
	_, err := LoadRuntimeConfig("svc")
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestLoadRuntimeConfig_ValidatesServiceType(t *testing.T) {
	t.Setenv("MEW_ADMIN_SECRET", "secret")

	_, err := LoadRuntimeConfig("")
	if err == nil {
		t.Fatalf("expected error for empty serviceType")
	}

	_, err = LoadRuntimeConfig("sdk")
	if err == nil {
		t.Fatalf("expected error for reserved serviceType")
	}
}

func TestLoadRuntimeConfig_APIBasePrecedenceAndTrimming(t *testing.T) {
	t.Setenv("MEW_ADMIN_SECRET", "secret")

	unsetEnv(t, "MEW_API_BASE")
	unsetEnv(t, "MEW_URL")

	cfg, err := LoadRuntimeConfig("svc")
	if err != nil {
		t.Fatalf("LoadRuntimeConfig error: %v", err)
	}
	if cfg.APIBase != "http://localhost:3000/api" {
		t.Fatalf("unexpected default APIBase: %q", cfg.APIBase)
	}

	t.Setenv("MEW_URL", "http://example.com/")
	cfg, err = LoadRuntimeConfig("svc")
	if err != nil {
		t.Fatalf("LoadRuntimeConfig error: %v", err)
	}
	if cfg.APIBase != "http://example.com/api" {
		t.Fatalf("unexpected derived APIBase: %q", cfg.APIBase)
	}

	t.Setenv("MEW_API_BASE", "http://api.example.com/api/")
	cfg, err = LoadRuntimeConfig("svc")
	if err != nil {
		t.Fatalf("LoadRuntimeConfig error: %v", err)
	}
	if cfg.APIBase != "http://api.example.com/api" {
		t.Fatalf("unexpected MEW_API_BASE trimming: %q", cfg.APIBase)
	}
}

func TestLoadRuntimeConfig_SyncInterval(t *testing.T) {
	t.Setenv("MEW_ADMIN_SECRET", "secret")
	unsetEnv(t, "MEW_CONFIG_SYNC_INTERVAL_SECONDS")

	cfg, err := LoadRuntimeConfig("svc")
	if err != nil {
		t.Fatalf("LoadRuntimeConfig error: %v", err)
	}
	if cfg.SyncInterval != 60*time.Second {
		t.Fatalf("expected default 60s, got %s", cfg.SyncInterval)
	}

	t.Setenv("MEW_CONFIG_SYNC_INTERVAL_SECONDS", "2")
	cfg, err = LoadRuntimeConfig("svc")
	if err != nil {
		t.Fatalf("LoadRuntimeConfig error: %v", err)
	}
	if cfg.SyncInterval != 2*time.Second {
		t.Fatalf("expected 2s, got %s", cfg.SyncInterval)
	}

	t.Setenv("MEW_CONFIG_SYNC_INTERVAL_SECONDS", "0")
	_, err = LoadRuntimeConfig("svc")
	if err == nil {
		t.Fatalf("expected error for non-positive interval")
	}
}
