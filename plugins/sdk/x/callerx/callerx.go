package callerx

import (
	"runtime"
	"strings"
)

// NonSDKCallerSkip returns the first stack frame (>= startSkip) whose file path
// does not belong to the plugins/sdk tree. This is used to locate the plugin's
// entrypoint (for serviceType derivation and .env discovery) even when calls go
// through facade wrappers.
func NonSDKCallerSkip(startSkip int) int {
	const maxSkip = 25
	firstNonSDK := -1
	for skip := startSkip; skip <= maxSkip; skip++ {
		_, file, _, ok := runtime.Caller(skip)
		if !ok {
			break
		}
		normalized := strings.ReplaceAll(file, "\\", "/")
		if strings.Contains(normalized, "/plugins/sdk/") {
			continue
		}
		if firstNonSDK < 0 {
			firstNonSDK = skip
		}
		// Prefer the plugin's entrypoint (cmd/<serviceType>/main.go), otherwise
		// internal package files (e.g. internal/app) would derive "app".
		if strings.Contains(normalized, "/cmd/") {
			return skip
		}
	}
	if firstNonSDK >= 0 {
		return firstNonSDK
	}
	return startSkip
}
