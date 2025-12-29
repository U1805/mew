package timeutil

import (
	"fmt"
	"time"
)

// HumanizeDuration formats d with coarse units (s/m/h/d).
func HumanizeDuration(d time.Duration) string {
	if d < 0 {
		d = -d
	}
	if d < time.Second {
		return "0s"
	}
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	days := int(d / (24 * time.Hour))
	return fmt.Sprintf("%dd", days)
}
