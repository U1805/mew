package auth

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type Session interface {
	Token(ctx context.Context) (string, error)
	Reauth(ctx context.Context) error
}

type authTransport struct {
	base    http.RoundTripper
	session Session
}

func (t *authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	if t.session == nil {
		return base.RoundTrip(req)
	}

	// Avoid recursion and unnecessary auth on auth endpoints.
	path := ""
	if req.URL != nil {
		path = req.URL.Path
	}
	skipAuth := strings.Contains(path, "/auth/")

	req2 := req.Clone(req.Context())
	if req2.Header == nil {
		req2.Header = make(http.Header)
	}

	if !skipAuth && strings.TrimSpace(req2.Header.Get("Authorization")) == "" {
		token, err := t.session.Token(req2.Context())
		if err != nil {
			return nil, err
		}
		req2.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := base.RoundTrip(req2)
	if err != nil {
		return resp, err
	}

	if skipAuth || resp == nil || resp.StatusCode != 401 {
		return resp, nil
	}

	// Only retry if we can safely replay the body.
	canRetry := req2.Method == http.MethodGet || req2.Method == http.MethodHead || req2.Method == http.MethodOptions
	if !canRetry && req2.GetBody == nil {
		return resp, nil
	}

	_ = drainAndClose(resp.Body)

	if err := t.session.Reauth(req2.Context()); err != nil {
		return resp, nil
	}

	req3 := req.Clone(req.Context())
	if req3.Header == nil {
		req3.Header = make(http.Header)
	}

	if !canRetry {
		rc, err := req2.GetBody()
		if err != nil {
			return resp, nil
		}
		req3.Body = rc
	}

	token, err := t.session.Token(req3.Context())
	if err != nil {
		return resp, nil
	}
	req3.Header.Set("Authorization", "Bearer "+token)
	return base.RoundTrip(req3)
}

func NewAuthTransport(base http.RoundTripper, session Session) http.RoundTripper {
	return &authTransport{base: base, session: session}
}

func drainAndClose(rc io.ReadCloser) error {
	if rc == nil {
		return nil
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(rc, 64*1024))
	return rc.Close()
}
