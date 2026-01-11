package proactive

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type ProactiveRequest struct {
	ID            string    `json:"id"`
	AddedAt       time.Time `json:"added_at"`
	RequestAt     time.Time `json:"request_at"`
	Reason        string    `json:"reason"`
	ChannelID     string    `json:"channel_id"`
	RecordID      string    `json:"record_id"`
	Attempts      int       `json:"attempts"`
	LastAttemptAt time.Time `json:"last_attempt_at"`
}

type ProactiveQueueFile struct {
	Requests []ProactiveRequest `json:"requests"`
}

func newProactiveID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return ""
	}
	return hex.EncodeToString(b[:])
}

func AppendProactiveRequest(now time.Time, q ProactiveQueueFile, req ProactiveRequest, max int) ProactiveQueueFile {
	if req.ID == "" {
		req.ID = newProactiveID()
	}
	if req.AddedAt.IsZero() {
		req.AddedAt = now
	}
	if q.Requests == nil {
		q.Requests = []ProactiveRequest{}
	}
	q.Requests = append(q.Requests, req)
	if max > 0 && len(q.Requests) > max {
		q.Requests = q.Requests[len(q.Requests)-max:]
	}
	return q
}
