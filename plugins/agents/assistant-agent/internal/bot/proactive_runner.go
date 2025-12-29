package bot

import (
	"context"
	"log"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/ai"
	"mew/plugins/assistant-agent/internal/store"
	"mew/plugins/sdk"
)

func (r *Runner) runProactiveQueue(ctx context.Context, logPrefix string) {
	r.knownUsersMu.RLock()
	users := make([]string, 0, len(r.knownUsers))
	for id := range r.knownUsers {
		users = append(users, id)
	}
	r.knownUsersMu.RUnlock()

	now := time.Now()
	for _, userID := range users {
		lock := r.userMutex(userID)
		lock.Lock()
		func() {
			defer lock.Unlock()

			paths := r.store.Paths(userID)
			q, err := store.LoadProactiveQueue(paths.ProactivePath)
			if err != nil {
				log.Printf("%s load proactive queue failed: user=%s err=%v", logPrefix, userID, err)
				return
			}
			if len(q.Requests) == 0 {
				return
			}

			meta, err := store.LoadMetadata(paths.MetadataPath)
			if err != nil {
				log.Printf("%s load metadata failed (proactive): user=%s err=%v", logPrefix, userID, err)
				return
			}
			if strings.TrimSpace(meta.ChannelID) == "" || strings.TrimSpace(meta.RecordID) == "" {
				return
			}

			kept := make([]store.ProactiveRequest, 0, len(q.Requests))
			for _, req := range q.Requests {
				if req.RequestAt.After(now) {
					kept = append(kept, req)
					continue
				}

				// If the conversation has already moved on to another record/channel, this request is no longer relevant.
				if strings.TrimSpace(req.ChannelID) != strings.TrimSpace(meta.ChannelID) || strings.TrimSpace(req.RecordID) != strings.TrimSpace(meta.RecordID) {
					continue
				}

				if req.Attempts >= 3 {
					continue
				}
				if !req.LastAttemptAt.IsZero() && now.Sub(req.LastAttemptAt) < 60*time.Second {
					kept = append(kept, req)
					continue
				}
				req.Attempts++
				req.LastAttemptAt = now

				msgs, err := r.fetcher.RecordSearch(ctx, req.ChannelID, req.RecordID)
				if err != nil {
					log.Printf("%s proactive record load failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
					kept = append(kept, req)
					continue
				}
				recordText := ai.FormatSessionRecordForContext(msgs)

				out, err := r.proactiveDecideAndCompose(ctx, req, recordText, logPrefix)
				if err != nil {
					log.Printf("%s proactive llm failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
					kept = append(kept, req)
					continue
				}

				outClean, _ := parseReplyControls(out)
				outClean = strings.TrimSpace(outClean)
				if outClean == "" || strings.TrimSpace(outClean) == assistantSilenceToken || strings.Contains(outClean, assistantSilenceToken) {
					continue
				}

				if err := sendReplyHTTP(ctx, req.ChannelID, outClean, func(line string) error {
					return r.postMessageHTTP(ctx, req.ChannelID, line)
				}); err != nil {
					log.Printf("%s proactive send failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
					kept = append(kept, req)
					continue
				}
				log.Printf("%s proactive sent: channel=%s record=%s reason=%q preview=%q",
					logPrefix,
					req.ChannelID,
					req.RecordID,
					sdk.PreviewString(req.Reason, assistantLogContentPreviewLen),
					sdk.PreviewString(outClean, assistantLogContentPreviewLen),
				)
			}

			q.Requests = kept
			if err := store.SaveProactiveQueue(paths.ProactivePath, q); err != nil {
				log.Printf("%s save proactive queue failed: user=%s err=%v", logPrefix, userID, err)
			}
		}()
	}
}

func sendReplyHTTP(ctx context.Context, channelID string, reply string, postLine func(line string) error) error {
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return nil
	}
	if strings.TrimSpace(channelID) == "" {
		return nil
	}

	lines := make([]string, 0, assistantMaxReplyLines)
	for _, line := range strings.Split(reply, "\n") {
		if len(lines) >= assistantMaxReplyLines {
			break
		}
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		lines = append(lines, t)
	}

	for i, t := range lines {
		if err := postLine(t); err != nil {
			return err
		}
		if i < len(lines)-1 {
			sleepWithContext(ctx, assistantReplyDelayForLine(t))
		}
	}
	return nil
}
