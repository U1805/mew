package state

type TaskStore[T any] struct {
	Path string
}

func OpenTask[T any](serviceType, botID string, idx int, identity string) TaskStore[T] {
	return TaskStore[T]{Path: TaskFile(serviceType, botID, idx, identity)}
}

func (s TaskStore[T]) Load() (T, error) { return LoadJSONFile[T](s.Path) }

func (s TaskStore[T]) Save(v T) error { return SaveJSONFile(s.Path, v) }

