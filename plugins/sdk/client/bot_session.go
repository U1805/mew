package client

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type BotSession struct {
	apiBase     string
	accessToken string
	baseClient  *http.Client
	authedClient *http.Client

	mu    sync.RWMutex
	me    User
	token string
}

func NewBotSession(apiBase, accessToken string, httpClient *http.Client) *BotSession {
	s := &BotSession{
		apiBase:     strings.TrimRight(apiBase, "/"),
		accessToken: strings.TrimSpace(accessToken),
		baseClient:  httpClient,
	}

	if httpClient != nil {
		baseTransport := httpClient.Transport
		if baseTransport == nil {
			baseTransport = http.DefaultTransport
		}
		s.authedClient = &http.Client{
			Transport: &authTransport{base: baseTransport, session: s},
			Jar:       httpClient.Jar,
			Timeout:   httpClient.Timeout,
		}
	}

	return s
}

func (s *BotSession) Me() User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.me
}

func (s *BotSession) User(ctx context.Context) (User, error) {
	if _, err := s.Token(ctx); err != nil {
		return User{}, err
	}
	return s.Me(), nil
}

func (s *BotSession) CurrentToken() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.token
}

func (s *BotSession) HTTPClient() *http.Client {
	return s.authedClient
}

func (s *BotSession) ensureLoggedIn(ctx context.Context) error {
	s.mu.RLock()
	token := s.token
	s.mu.RUnlock()
	if strings.TrimSpace(token) != "" {
		return nil
	}

	me, tok, err := LoginBot(ctx, s.baseClient, s.apiBase, s.accessToken)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.me = me
	s.token = tok
	s.mu.Unlock()
	return nil
}

func (s *BotSession) Refresh(ctx context.Context) error {
	me, tok, err := Refresh(ctx, s.baseClient, s.apiBase)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.me = me
	s.token = tok
	s.mu.Unlock()
	return nil
}

func (s *BotSession) Reauth(ctx context.Context) error {
	if err := s.Refresh(ctx); err == nil {
		return nil
	}
	return s.Login(ctx)
}

func (s *BotSession) Login(ctx context.Context) error {
	me, tok, err := LoginBot(ctx, s.baseClient, s.apiBase, s.accessToken)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.me = me
	s.token = tok
	s.mu.Unlock()
	return nil
}

func jwtExpSeconds(jwt string) (int64, bool) {
	parts := strings.Split(jwt, ".")
	if len(parts) < 2 {
		return 0, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0, false
	}
	var parsed struct {
		Exp any `json:"exp"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return 0, false
	}
	switch v := parsed.Exp.(type) {
	case float64:
		return int64(v), true
	case int64:
		return v, true
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func (s *BotSession) Token(ctx context.Context) (string, error) {
	if s.baseClient == nil {
		return "", fmt.Errorf("httpClient is required")
	}
	if strings.TrimSpace(s.apiBase) == "" {
		return "", fmt.Errorf("apiBase is required")
	}
	if strings.TrimSpace(s.accessToken) == "" {
		return "", fmt.Errorf("accessToken is required")
	}

	if err := s.ensureLoggedIn(ctx); err != nil {
		return "", err
	}

	// Refresh a bit before expiry to avoid in-flight failures.
	s.mu.RLock()
	token := s.token
	s.mu.RUnlock()

	if exp, ok := jwtExpSeconds(token); ok {
		// refresh if exp <= now + 2 minutes
		if time.Unix(exp, 0).Before(time.Now().Add(2 * time.Minute)) {
			if err := s.Refresh(ctx); err != nil {
				// If refresh fails (cookie missing/expired), fall back to /auth/bot.
				if err2 := s.Login(ctx); err2 != nil {
					return "", err
				}
			}
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.token, nil
}
