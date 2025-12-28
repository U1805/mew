package engine

import (
	sdktracker "mew/plugins/sdk/tracker"
	"mew/plugins/sdk"
)

type State struct {
	Seen []string `json:"seen,omitempty"`
}

type Manager = sdktracker.SeenStore[State]

func Load(serviceType, botID string, taskIdx int, identity string) (*Manager, error) {
	store := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)
	return sdktracker.LoadSeenStore(
		store,
		1000,
		func(s State) []string { return s.Seen },
		func(s *State, seen []string) { s.Seen = seen },
	)
}
