package engine

import (
	"mew/plugins/sdk"
	"mew/plugins/sdk/state"
)

type State struct {
	Seen       []string          `json:"seen,omitempty"`
	MediaCache map[string]string `json:"media_cache,omitempty"`
	MediaOrder []string          `json:"media_order,omitempty"`
}

type Manager struct {
	seen *state.SeenStore[State]
}

func Load(serviceType, botID string, taskIdx int, identity string) (*Manager, error) {
	st := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)

	ss, err := state.LoadSeenStore[State](
		st,
		2000,
		func(s State) []string { return s.Seen },
		func(s *State, seen []string) { s.Seen = seen },
	)
	if st := ss.State(); st != nil && st.MediaCache == nil {
		st.MediaCache = map[string]string{}
	}
	return &Manager{seen: ss}, err
}

func (m *Manager) Fresh() bool {
	if m == nil || m.seen == nil {
		return true
	}
	return m.seen.Fresh()
}

func (m *Manager) IsNew(id string) bool {
	if m == nil || m.seen == nil {
		return false
	}
	return m.seen.IsNew(id)
}

func (m *Manager) MarkSeen(id string) {
	if m == nil || m.seen == nil {
		return
	}
	m.seen.MarkSeen(id)
}

func (m *Manager) GetCachedMedia(url string) (string, bool) {
	if m == nil || m.seen == nil {
		return "", false
	}
	st := m.seen.State()
	if st == nil {
		return "", false
	}
	return state.GetCachedMedia(st.MediaCache, url)
}

func (m *Manager) CacheMedia(url, key string) {
	if m == nil || m.seen == nil {
		return
	}
	st := m.seen.State()
	if st == nil {
		return
	}
	st.MediaCache, st.MediaOrder = state.CacheMedia(st.MediaCache, st.MediaOrder, url, key, 200)
}

func (m *Manager) Save() error {
	if m == nil || m.seen == nil {
		return nil
	}
	return m.seen.Save()
}
