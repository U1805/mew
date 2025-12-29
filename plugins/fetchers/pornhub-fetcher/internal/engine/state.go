package engine

import (
	"mew/plugins/sdk"
	"mew/plugins/sdk/store"
)

type State struct {
	Seen []string `json:"seen,omitempty"`
}

type Manager = store.SeenStore[State]

func Load(serviceType, botID string, taskIdx int, identity string, cap int) (*Manager, error) {
	st := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)
	return store.LoadSeenStore[State](
		st,
		cap,
		func(s State) []string { return s.Seen },
		func(s *State, seen []string) { s.Seen = seen },
	)
}
