package core

import (
	"runtime"
	"strings"
	"testing"
)

func TestServiceTypeFromCallerSkip_UsesCallerDir(t *testing.T) {
	// skip=0 points to this file, which lives in .../plugins/sdk/core.
	if got := ServiceTypeFromCallerSkip(0); got != "core" {
		t.Fatalf("ServiceTypeFromCallerSkip(0) = %q, want %q", got, "core")
	}
}

func TestNonSDKCallerSkip_SkipsSDKFrames(t *testing.T) {
	skip := nonSDKCallerSkip(0)
	if skip <= 0 {
		t.Fatalf("expected skip > 0, got %d", skip)
	}

	_, file, _, ok := runtime.Caller(skip)
	if !ok {
		t.Fatalf("runtime.Caller(%d) failed", skip)
	}
	normalized := strings.ReplaceAll(file, "\\", "/")
	if strings.Contains(normalized, "/plugins/sdk/") {
		t.Fatalf("expected non-sdk frame, got %q (skip=%d)", normalized, skip)
	}
}
