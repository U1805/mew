package llm

import (
	"context"
	"math/rand"
	"time"
)

func SleepWithContext(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return true
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func ExpBackoff(attempt int, initial, max time.Duration) time.Duration {
	if attempt <= 0 {
		return initial
	}
	d := initial << attempt
	if d <= 0 {
		return max
	}
	if max > 0 && d > max {
		return max
	}
	return d
}

func WithJitter(d time.Duration) time.Duration {
	if d <= 0 {
		return 0
	}
	// +/-20% jitter.
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	j := 0.8 + r.Float64()*0.4
	return time.Duration(float64(d) * j)
}
