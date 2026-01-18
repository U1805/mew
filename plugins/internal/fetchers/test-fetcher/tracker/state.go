package tracker

import "mew/plugins/pkg"

type State struct {
	Sent int `json:"sent,omitempty"`
}

type Manager struct {
	store sdk.TaskStateStore[State]
	state State
}

func Load(serviceType, botID string, taskIdx int, identity string) (*Manager, error) {
	store := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)
	st, err := store.Load()
	if err != nil {
		st = State{}
	}
	return &Manager{store: store, state: st}, err
}

func (m *Manager) IncSent() {
	if m == nil {
		return
	}
	m.state.Sent++
}

func (m *Manager) Save() error {
	if m == nil {
		return nil
	}
	return m.store.Save(m.state)
}
