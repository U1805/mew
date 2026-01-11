package runtime

import (
	"context"
	"errors"
	"testing"
)

func TestRunService_RequiresNewRunner(t *testing.T) {
	t.Setenv("MEW_ADMIN_SECRET", "secret")
	t.Setenv("MEW_API_BASE", "http://example.com/api")

	err := RunService(context.Background(), ServiceOptions{
		ServiceType:   "svc",
		DisableDotEnv: true,
		NewRunner:     nil,
	})
	if !errors.Is(err, ErrInvalidRunnerFactory) {
		t.Fatalf("RunService() error=%v, want %v", err, ErrInvalidRunnerFactory)
	}
}
