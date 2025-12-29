package store

import (
	"errors"
	"testing"
)

type memoryStore[T any] struct {
	v   T
	err error
}

func (m *memoryStore[T]) Load() (T, error) {
	if m.err != nil {
		var zero T
		return zero, m.err
	}
	return m.v, nil
}

func (m *memoryStore[T]) Save(v T) error {
	m.v = v
	return nil
}

type seenState struct {
	Seen []string `json:"seen,omitempty"`
}

func TestSeenStore_LoadAndSave(t *testing.T) {
	store := &memoryStore[seenState]{v: seenState{Seen: []string{" 1 ", "2"}}}

	m, err := LoadSeenStore[seenState](
		store,
		10,
		func(s seenState) []string { return s.Seen },
		func(s *seenState, seen []string) { s.Seen = seen },
	)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}

	if m.Fresh() {
		t.Fatalf("expected fresh=false when seen exists")
	}
	if !m.IsNew("3") {
		t.Fatalf("expected unseen id to be new")
	}
	if m.IsNew("1") {
		t.Fatalf("expected trimmed id to be considered seen")
	}

	m.MarkSeen("3")
	if err := m.Save(); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	if len(store.v.Seen) != 3 {
		t.Fatalf("expected 3 seen items, got %#v", store.v.Seen)
	}
}

func TestSeenStore_LoadErrorStillWorks(t *testing.T) {
	store := &memoryStore[seenState]{err: errors.New("boom")}

	m, err := LoadSeenStore[seenState](
		store,
		10,
		func(s seenState) []string { return s.Seen },
		func(s *seenState, seen []string) { s.Seen = seen },
	)
	if err == nil {
		t.Fatalf("expected err")
	}
	if !m.Fresh() {
		t.Fatalf("expected fresh=true on load error")
	}
}
