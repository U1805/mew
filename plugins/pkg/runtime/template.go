package runtime

import "encoding/json"

// TemplateJSON encodes v into a human-friendly JSON string for UI templates.
func TemplateJSON(v any) (string, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// TaskTemplateJSON returns a template in the shape `[]T`.
func TaskTemplateJSON[T any]() (string, error) {
	var zero T
	return TemplateJSON([]T{zero})
}
