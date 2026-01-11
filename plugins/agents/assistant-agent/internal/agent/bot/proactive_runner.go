package bot

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"mew/plugins/assistant-agent/internal/agent/ai"
	"mew/plugins/assistant-agent/internal/agent/store"
	"mew/plugins/assistant-agent/internal/config"
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
			hasDue := false
			for _, req := range q.Requests {
				if !req.RequestAt.After(now) {
					hasDue = true
					break
				}
			}

			var summaries store.SummariesFile
			if hasDue {
				if s, err := store.LoadSummaries(paths.SummariesPath); err == nil {
					summaries = s
				}
			}

			var currentSessionStartAt time.Time
			var currentChannelID, currentRecordID, currentRecordText string
			if hasDue && strings.TrimSpace(meta.ChannelID) != "" {
				if msgs, rid, startAt, err := r.fetcher.FetchSessionMessages(ctx, meta.ChannelID); err == nil && len(msgs) > 0 {
					currentChannelID = meta.ChannelID
					currentRecordID = rid
					currentSessionStartAt = startAt
					currentRecordText = ai.FormatSessionRecordForContext(msgs)
				}
			}

			kept := make([]store.ProactiveRequest, 0, len(q.Requests))
			for _, req := range q.Requests {
				if req.RequestAt.After(now) {
					kept = append(kept, req)
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

				intermediate := formatSummariesBetween(summaries, req.AddedAt, currentSessionStartAt, now, 12)
				out, err := r.proactiveDecideAndCompose(ctx, req, recordText, currentChannelID, currentRecordID, currentRecordText, intermediate, logPrefix)
				if err != nil {
					log.Printf("%s proactive llm failed: user=%s channel=%s record=%s err=%v", logPrefix, userID, req.ChannelID, req.RecordID, err)
					kept = append(kept, req)
					continue
				}

				outClean, _ := parseReplyControls(out)
				outClean = strings.TrimSpace(outClean)
				if outClean == "" || strings.TrimSpace(outClean) == config.AssistantSilenceToken || strings.Contains(outClean, config.AssistantSilenceToken) {
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
					sdk.PreviewString(req.Reason, config.AssistantLogContentPreviewLen),
					sdk.PreviewString(outClean, config.AssistantLogContentPreviewLen),
				)
			}

			q.Requests = kept
			if err := store.SaveProactiveQueue(paths.ProactivePath, q); err != nil {
				log.Printf("%s save proactive queue failed: user=%s err=%v", logPrefix, userID, err)
			}
		}()
	}
}

func formatSummariesBetween(s store.SummariesFile, start time.Time, end time.Time, fallbackEnd time.Time, max int) string {
	if len(s.Summaries) == 0 {
		return ""
	}
	if end.IsZero() {
		end = fallbackEnd
	}
	if end.IsZero() {
		return ""
	}
	if max <= 0 {
		max = 12
	}

	items := make([]store.Summary, 0, len(s.Summaries))
	for _, it := range s.Summaries {
		if it.CreatedAt.IsZero() {
			continue
		}
		if !start.IsZero() && it.CreatedAt.Before(start) {
			continue
		}
		if it.CreatedAt.After(end) {
			continue
		}
		if strings.TrimSpace(it.Summary) == "" {
			continue
		}
		items = append(items, it)
	}
	if len(items) == 0 {
		return ""
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt.Before(items[j].CreatedAt) })
	if len(items) > max {
		items = items[len(items)-max:]
	}

	var b strings.Builder
	for _, it := range items {
		id := strings.TrimSpace(it.SummaryID)
		if id == "" {
			id = "S??"
		}
		rid := strings.TrimSpace(it.RecordID)
		if rid == "" {
			rid = "unknown"
		}
		b.WriteString(fmt.Sprintf("%s [%s] (RecordID=%s): %s\n",
			id,
			it.CreatedAt.Format(time.RFC3339),
			rid,
			strings.TrimSpace(it.Summary),
		))
	}
	return strings.TrimSpace(b.String())
}

func sendReplyHTTP(ctx context.Context, channelID string, reply string, postLine func(line string) error) error {
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return nil
	}
	if strings.TrimSpace(channelID) == "" {
		return nil
	}

	lines := make([]string, 0, config.AssistantMaxReplyLines)
	for _, line := range strings.Split(reply, "\n") {
		if len(lines) >= config.AssistantMaxReplyLines {
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
