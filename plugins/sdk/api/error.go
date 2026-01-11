package api

import "fmt"

type HTTPStatusError struct {
	StatusCode int
	Body       string
}

func (e *HTTPStatusError) Error() string {
	if e == nil {
		return "http status error"
	}
	return fmt.Sprintf("status=%d body=%s", e.StatusCode, e.Body)
}
