package mew

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type Client struct {
	apiBase     string
	adminSecret string
	httpClient  *http.Client
}

// NewClient creates a client for calling MEW server APIs.
//
// Proxy behavior:
// - Default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)
// - Set MEW_API_PROXY to enable:
//   - "env": use Go's ProxyFromEnvironment (HTTP_PROXY/HTTPS_PROXY/NO_PROXY)
//   - URL / host:port: use a fixed proxy URL (http/https)
func NewClient(apiBase, adminSecret string) (*Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil

	if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
		switch strings.ToLower(raw) {
		case "0", "false", "off", "no", "none", "direct":
			transport.Proxy = nil
		case "env":
			transport.Proxy = http.ProxyFromEnvironment
		default:
			proxyURL, err := parseProxyURL(raw)
			if err != nil {
				return nil, fmt.Errorf("invalid MEW_API_PROXY: %w", err)
			}
			transport.Proxy = http.ProxyURL(proxyURL)
		}
	}

	return &Client{
		apiBase:     strings.TrimRight(apiBase, "/"),
		adminSecret: adminSecret,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   15 * time.Second,
		},
	}, nil
}

type BootstrapBot struct {
	ID          string `json:"_id"`
	Name        string `json:"name"`
	Config      string `json:"config"`
	AccessToken string `json:"accessToken"`
	ServiceType string `json:"serviceType"`
	DmEnabled   bool   `json:"dmEnabled"`
}

func (c *Client) BootstrapBots(ctx context.Context, serviceType string) ([]BootstrapBot, error) {
	reqBody, err := json.Marshal(map[string]string{"serviceType": serviceType})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiBase+"/bots/bootstrap", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Mew-Admin-Secret", c.adminSecret)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("bootstrap failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		Bots []BootstrapBot `json:"bots"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("bootstrap decode failed: %w (body=%s)", err, strings.TrimSpace(string(body)))
	}
	return parsed.Bots, nil
}

func (c *Client) RegisterServiceType(ctx context.Context, serviceType string) error {
	reqBody, err := json.Marshal(map[string]string{"serviceType": serviceType})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiBase+"/infra/service-types/register", bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Mew-Admin-Secret", c.adminSecret)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("register serviceType failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func parseProxyURL(raw string) (*url.URL, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, fmt.Errorf("empty proxy url")
	}
	if !strings.Contains(s, "://") {
		s = "http://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("unsupported scheme %q (only http/https)", u.Scheme)
	}
	if u.Host == "" {
		return nil, fmt.Errorf("missing host")
	}
	return u, nil
}
