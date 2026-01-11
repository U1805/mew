package proactive

import (
	"testing"
	"time"
)

func TestAppendProactiveRequest_AssignsIDAndTrims(t *testing.T) {
	now := time.Unix(1000, 0).UTC()
	q := ProactiveQueueFile{}

	for i := 0; i < 5; i++ {
		q = AppendProactiveRequest(now, q, ProactiveRequest{
			Reason:    "r",
			ChannelID: "c",
			RecordID:  "rec",
			RequestAt: now.Add(time.Duration(i) * time.Second),
		}, 3)
	}

	if len(q.Requests) != 3 {
		t.Fatalf("len=%d", len(q.Requests))
	}
	for _, r := range q.Requests {
		if r.ID == "" {
			t.Fatalf("empty id")
		}
		if r.AddedAt.IsZero() {
			t.Fatalf("zero added_at")
		}
	}
}
