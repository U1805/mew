package store

import "sync"

type SeenSet struct {
	mu    sync.Mutex
	max   int
	order []string
	set   map[string]struct{}
}

func NewSeenSet(max int) *SeenSet {
	if max <= 0 {
		max = 200
	}
	return &SeenSet{
		max: max,
		set: make(map[string]struct{}, max),
	}
}

func (s *SeenSet) Has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.set[id]
	return ok
}

func (s *SeenSet) Add(id string) {
	if id == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.set[id]; ok {
		return
	}

	s.set[id] = struct{}{}
	s.order = append(s.order, id)

	if len(s.order) <= s.max {
		return
	}

	overflow := len(s.order) - s.max
	for i := 0; i < overflow; i++ {
		old := s.order[i]
		delete(s.set, old)
	}
	s.order = append([]string(nil), s.order[overflow:]...)
}

func (s *SeenSet) Snapshot() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.order...)
}
