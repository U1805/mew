package client

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestChannelMessage_MentionIDs(t *testing.T) {
	payload := []byte(`{
		"_id":"m1",
		"channelId":"c1",
		"content":"hi <@u1>",
		"mentions":["u1", {"_id":"u2"}, null, 123],
		"authorId":{"_id":"a1","username":"alice"},
		"type":"message/default"
	}`)

	msg, ok := ParseChannelMessage(json.RawMessage(payload))
	if !ok {
		t.Fatalf("ParseChannelMessage: ok=false")
	}

	got := msg.MentionIDs()
	want := []string{"u1", "u2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("MentionIDs mismatch: got=%#v want=%#v", got, want)
	}
}

func TestChannelMessage_MentionIDs_Empty(t *testing.T) {
	payload := []byte(`{"_id":"m1","channelId":"c1","content":"hi","authorId":"a1","type":"message/default"}`)
	msg, ok := ParseChannelMessage(json.RawMessage(payload))
	if !ok {
		t.Fatalf("ParseChannelMessage: ok=false")
	}
	if got := msg.MentionIDs(); got != nil {
		t.Fatalf("expected nil, got=%#v", got)
	}
}
