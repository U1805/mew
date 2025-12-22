package config

import (
	"strings"
	"testing"
)

type testTask struct {
	A int `json:"a"`
}

func TestDecodeTasks_EmptyLike_ReturnsNil(t *testing.T) {
	cases := []string{"", " ", "null", " null ", "{}", " {} "}
	for _, raw := range cases {
		got, err := DecodeTasks[testTask](raw)
		if err != nil {
			t.Fatalf("DecodeTasks(%q) error: %v", raw, err)
		}
		if got != nil {
			t.Fatalf("DecodeTasks(%q) = %#v, want nil", raw, got)
		}
	}
}

func TestDecodeTasks_Array(t *testing.T) {
	got, err := DecodeTasks[testTask](`[{"a":1},{"a":2}]`)
	if err != nil {
		t.Fatalf("DecodeTasks error: %v", err)
	}
	if len(got) != 2 || got[0].A != 1 || got[1].A != 2 {
		t.Fatalf("unexpected result: %#v", got)
	}
}

func TestDecodeTasks_ObjectWithTasksField(t *testing.T) {
	got, err := DecodeTasks[testTask](`{"tasks":[{"a":3}]}`)
	if err != nil {
		t.Fatalf("DecodeTasks error: %v", err)
	}
	if len(got) != 1 || got[0].A != 3 {
		t.Fatalf("unexpected result: %#v", got)
	}
}

func TestDecodeTasks_SingleObject(t *testing.T) {
	got, err := DecodeTasks[testTask](`{"a":4}`)
	if err != nil {
		t.Fatalf("DecodeTasks error: %v", err)
	}
	if len(got) != 1 || got[0].A != 4 {
		t.Fatalf("unexpected result: %#v", got)
	}
}

func TestDecodeTasks_InvalidRootType(t *testing.T) {
	_, err := DecodeTasks[testTask](`123`)
	if err == nil || !strings.Contains(err.Error(), "array or object") {
		t.Fatalf("expected root type error, got: %v", err)
	}
}

func TestDecodeTasks_InvalidJSON(t *testing.T) {
	_, err := DecodeTasks[testTask](`{`)
	if err == nil || !strings.Contains(err.Error(), "config object decode failed") {
		t.Fatalf("expected json decode error, got: %v", err)
	}
}

func TestDecodeTasks_InvalidTasksFieldShape(t *testing.T) {
	_, err := DecodeTasks[testTask](`{"tasks":{}}`)
	if err == nil || !strings.Contains(err.Error(), "config.tasks decode failed") {
		t.Fatalf("expected tasks decode error, got: %v", err)
	}
}

