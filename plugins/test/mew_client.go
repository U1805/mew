package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type MewClient struct {
	apiBase     string
	adminSecret string
	httpClient  *http.Client
}

func NewMewClient(apiBase, adminSecret string) *MewClient {
	return &MewClient{
		apiBase:     strings.TrimRight(apiBase, "/"),
		adminSecret: adminSecret,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type BootstrapBot struct {
	ID          string `json:"_id"`
	Name        string `json:"name"`
	Config      string `json:"config"`
	AccessToken string `json:"accessToken"`
	ServiceType string `json:"serviceType"`
	DmEnabled   bool   `json:"dmEnabled"`
}

func (c *MewClient) BootstrapBots(ctx context.Context, serviceType string) ([]BootstrapBot, error) {
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

func (c *MewClient) RegisterServiceType(ctx context.Context, serviceType string) error {
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
