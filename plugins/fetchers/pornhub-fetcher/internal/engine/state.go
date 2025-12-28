package engine

import (
	"mew/plugins/sdk"
	sdktracker "mew/plugins/sdk/tracker"
)

type State struct {
	Seen []string `json:"seen,omitempty"`
}

type Manager = sdktracker.SeenStore[State]

func Load(serviceType, botID string, taskIdx int, identity string, cap int) (*Manager, error) {
	store := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)
	return sdktracker.LoadSeenStore[State](
		store,
		cap,
		func(s State) []string { return s.Seen },
		func(s *State, seen []string) { s.Seen = seen },
	)
}
