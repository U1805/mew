package bot

import (
	"log"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
)

func (r *Runner) maybeEnqueueProactive(
	now time.Time,
	paths store.UserStatePaths,
	channelID string,
	recordID string,
	d *proactiveDirective,
	logPrefix string,
) {
	if d == nil {
		return
	}
	if strings.TrimSpace(channelID) == "" || strings.TrimSpace(recordID) == "" {
		return
	}

	delay := time.Duration(d.DelaySeconds)*time.Second + time.Duration(d.DelayMinutes)*time.Minute
	if delay <= 0 {
		delay = 3 * time.Minute
	}
	if delay < 30*time.Second {
		delay = 30 * time.Second
	}
	if delay > 24*time.Hour {
		delay = 24 * time.Hour
	}

	req := store.ProactiveRequest{
		AddedAt:   now,
		RequestAt: now.Add(delay),
		Reason:    strings.TrimSpace(d.Reason),
		ChannelID: strings.TrimSpace(channelID),
		RecordID:  strings.TrimSpace(recordID),
	}

	q, err := store.LoadProactiveQueue(paths.ProactivePath)
	if err != nil {
		log.Printf("%s load proactive queue failed: path=%s err=%v", logPrefix, paths.ProactivePath, err)
		return
	}
	q = store.AppendProactiveRequest(now, q, req, assistantMaxProactiveQueue)
	if err := store.SaveProactiveQueue(paths.ProactivePath, q); err != nil {
		log.Printf("%s save proactive queue failed: path=%s err=%v", logPrefix, paths.ProactivePath, err)
		return
	}

	log.Printf("%s proactive queued: channel=%s record=%s at=%s reason=%q",
		logPrefix,
		req.ChannelID,
		req.RecordID,
		req.RequestAt.Format(time.RFC3339),
		sdk.PreviewString(req.Reason, assistantLogContentPreviewLen),
	)
}
