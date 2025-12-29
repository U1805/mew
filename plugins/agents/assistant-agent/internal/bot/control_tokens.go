package bot

import (
	"encoding/json"
	"strings"
)

type proactiveDirective struct {
	DelaySeconds int    `json:"delay_seconds"`
	DelayMinutes int    `json:"delay_minutes"`
	Reason       string `json:"reason"`
}

type replyControls struct {
	wantMore  bool
	proactive *proactiveDirective
}

func parseReplyControls(reply string) (clean string, controls replyControls) {
	lines := strings.Split(strings.ReplaceAll(reply, "\r\n", "\n"), "\n")

	for {
		last := -1
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) != "" {
				last = i
				break
			}
		}
		if last < 0 {
			break
		}

		t := strings.TrimSpace(lines[last])
		switch {
		case t == assistantWantMoreToken:
			controls.wantMore = true
			lines = append(lines[:last], lines[last+1:]...)
			continue
		case strings.HasPrefix(t, assistantProactiveTokenPrefix):
			// The model may emit this as a single line:
			//   <PROACTIVE>{"delay_seconds":180,"reason":"..."}
			raw := strings.TrimSpace(strings.TrimPrefix(t, assistantProactiveTokenPrefix))
			if raw != "" && controls.proactive == nil {
				var d proactiveDirective
				if json.Unmarshal([]byte(raw), &d) == nil {
					if d.DelaySeconds < 0 {
						d.DelaySeconds = 0
					}
					if d.DelayMinutes < 0 {
						d.DelayMinutes = 0
					}
					d.Reason = strings.TrimSpace(d.Reason)
					controls.proactive = &d
				}
			}
			lines = append(lines[:last], lines[last+1:]...)
			continue
		default:
			// Stop when the last non-empty line is not a control directive.
		}
		break
	}

	clean = strings.TrimSpace(strings.Join(lines, "\n"))
	return clean, controls
}
