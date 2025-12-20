package core

import (
	"runtime"
	"strings"
)

// nonSDKCallerSkip returns the first stack frame (>= startSkip) whose file path
// does not belong to the plugins/sdk tree. This is used to locate the plugin's
// entrypoint (for serviceType derivation and .env discovery) even when calls go
// through facade wrappers.
func nonSDKCallerSkip(startSkip int) int {
	const maxSkip = 25
	for skip := startSkip; skip <= maxSkip; skip++ {
		_, file, _, ok := runtime.Caller(skip)
		if !ok {
			break
		}
		normalized := strings.ReplaceAll(file, "\\", "/")
		if strings.Contains(normalized, "/plugins/sdk/") {
			continue
		}
		return skip
	}
	return startSkip
}

