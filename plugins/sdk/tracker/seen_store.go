package tracker

import (
	"strings"

	"mew/plugins/sdk/collections"
)

type SeenStore[T any] struct {
	store   Store[T]
	state   T
	seen    *collections.SeenSet
	fresh   bool
	getSeen func(T) []string
	setSeen func(*T, []string)
}

func LoadSeenStore[T any](
	store Store[T],
	capacity int,
	getSeen func(T) []string,
	setSeen func(*T, []string),
) (*SeenStore[T], error) {
	loaded, err := store.Load()

	fresh := true
	if err == nil {
		fresh = len(getSeen(loaded)) == 0
	} else {
		var zero T
		loaded = zero
	}

	seen := collections.NewSeenSet(capacity)
	for _, id := range getSeen(loaded) {
		seen.Add(strings.TrimSpace(id))
	}

	return &SeenStore[T]{
		store:   store,
		state:   loaded,
		seen:    seen,
		fresh:   fresh,
		getSeen: getSeen,
		setSeen: setSeen,
	}, err
}

func (m *SeenStore[T]) State() *T {
	if m == nil {
		return nil
	}
	return &m.state
}

func (m *SeenStore[T]) Fresh() bool {
	if m == nil {
		return true
	}
	return m.fresh
}

func (m *SeenStore[T]) IsNew(id string) bool {
	if m == nil {
		return false
	}
	return !m.seen.Has(strings.TrimSpace(id))
}

func (m *SeenStore[T]) MarkSeen(id string) {
	if m == nil {
		return
	}
	m.seen.Add(strings.TrimSpace(id))
}

func (m *SeenStore[T]) Save() error {
	if m == nil {
		return nil
	}
	m.setSeen(&m.state, m.seen.Snapshot())
	return m.store.Save(m.state)
}

