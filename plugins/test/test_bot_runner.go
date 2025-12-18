package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type TestTaskConfig struct {
	Interval int    `json:"interval"`
	Webhook  string `json:"webhook"`
	Content  string `json:"content"`
}

type TestBotRunner struct {
	botID   string
	botName string
	tasks   []TestTaskConfig
}

func NewTestBotRunner(botID, botName, rawConfig string) (*TestBotRunner, error) {
	tasks, err := parseTasks(rawConfig)
	if err != nil {
		return nil, err
	}

	return &TestBotRunner{
		botID:   botID,
		botName: botName,
		tasks:   tasks,
	}, nil
}

func (r *TestBotRunner) Start() (stop func()) {
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	httpClient := &http.Client{Timeout: 15 * time.Second}

	for i, task := range r.tasks {
		taskIndex := i
		taskCopy := task
		wg.Add(1)
		go func() {
			defer wg.Done()
			runTestTask(ctx, httpClient, r.botID, r.botName, taskIndex, taskCopy)
		}()
	}

	return func() {
		cancel()
		wg.Wait()
	}
}

func parseTasks(rawConfig string) ([]TestTaskConfig, error) {
	rawConfig = strings.TrimSpace(rawConfig)
	if rawConfig == "" || rawConfig == "null" || rawConfig == "{}" {
		return nil, nil
	}

	var tasks []TestTaskConfig
	if err := json.Unmarshal([]byte(rawConfig), &tasks); err != nil {
		return nil, fmt.Errorf("config must be a JSON array: %w", err)
	}

	validated := make([]TestTaskConfig, 0, len(tasks))
	for i, t := range tasks {
		if t.Interval <= 0 {
			return nil, fmt.Errorf("tasks[%d].interval must be > 0", i)
		}
		if strings.TrimSpace(t.Webhook) == "" {
			return nil, fmt.Errorf("tasks[%d].webhook is required", i)
		}
		u, err := url.Parse(t.Webhook)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return nil, fmt.Errorf("tasks[%d].webhook must be a valid URL", i)
		}
		if u.Scheme != "http" && u.Scheme != "https" {
			return nil, fmt.Errorf("tasks[%d].webhook must be http/https", i)
		}
		validated = append(validated, t)
	}

	return validated, nil
}

func runTestTask(ctx context.Context, httpClient *http.Client, botID, botName string, idx int, task TestTaskConfig) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[test-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	// Fire once immediately, then on every tick.
	postOnce(ctx, httpClient, logPrefix, task.Webhook, task.Content)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			postOnce(ctx, httpClient, logPrefix, task.Webhook, task.Content)
		}
	}
}

func postOnce(ctx context.Context, httpClient *http.Client, logPrefix, webhookURL, content string) {
	payload, _ := json.Marshal(map[string]any{"content": content})
	err := postJSONWithRetry(ctx, httpClient, webhookURL, payload, 3)
	if err != nil {
		log.Printf("%s post failed: %v", logPrefix, err)
	}
}

func postJSONWithRetry(ctx context.Context, httpClient *http.Client, webhookURL string, body []byte, attempts int) error {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := postJSON(ctx, httpClient, webhookURL, body); err != nil {
			lastErr = err
			backoff := time.Duration(1<<uint(attempt-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				continue
			}
		}
		return nil
	}
	return lastErr
}

func postJSON(ctx context.Context, httpClient *http.Client, webhookURL string, body []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(respBody))
		if msg == "" {
			msg = http.StatusText(resp.StatusCode)
		}
		return errors.New(msg)
	}
	return nil
}
