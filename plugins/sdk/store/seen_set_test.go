package store

import (
	"strconv"
	"testing"
)

func TestSeenSet_AddAndHas(t *testing.T) {
	s := NewSeenSet(3)

	if s.Has("a") {
		t.Fatalf("expected empty set")
	}

	s.Add("")
	if s.Has("") {
		t.Fatalf("empty id should be ignored")
	}

	s.Add("a")
	s.Add("a") // duplicate should not change order
	s.Add("b")

	if !s.Has("a") || !s.Has("b") {
		t.Fatalf("expected ids to exist")
	}

	got := s.Snapshot()
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("unexpected snapshot: %#v", got)
	}
}

func TestSeenSet_EvictsOldest(t *testing.T) {
	s := NewSeenSet(2)
	s.Add("a")
	s.Add("b")
	s.Add("c")

	if s.Has("a") {
		t.Fatalf("expected oldest to be evicted")
	}
	if !s.Has("b") || !s.Has("c") {
		t.Fatalf("expected newest to remain")
	}

	got := s.Snapshot()
	if len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Fatalf("unexpected snapshot: %#v", got)
	}
}

func TestSeenSet_DefaultMax_WhenNonPositive(t *testing.T) {
	s := NewSeenSet(0)
	for i := 0; i < 201; i++ {
		s.Add("id-" + strconv.Itoa(i))
	}

	snap := s.Snapshot()
	if len(snap) != 200 {
		t.Fatalf("expected default max=200, got %d", len(snap))
	}
	if s.Has("id-0") {
		t.Fatalf("expected first id to be evicted at default max")
	}
	if !s.Has("id-200") {
		t.Fatalf("expected latest id to exist")
	}
}

func TestSeenSet_SnapshotIsCopy(t *testing.T) {
	s := NewSeenSet(3)
	s.Add("a")
	s.Add("b")

	s1 := s.Snapshot()
	s1[0] = "mutated"

	s2 := s.Snapshot()
	if len(s2) != 2 || s2[0] != "a" || s2[1] != "b" {
		t.Fatalf("expected internal order unchanged, got %#v", s2)
	}
}
