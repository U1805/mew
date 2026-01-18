package state

// Store is a minimal persistence interface used by SDK tracker helpers.
//
// It intentionally matches sdk.TaskStateStore[T] without importing the root sdk
// package (to avoid import cycles).
type Store[T any] interface {
	Load() (T, error)
	Save(T) error
}
