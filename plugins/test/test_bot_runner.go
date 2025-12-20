package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"mew/plugins/sdk"
)

type TestTaskConfig struct {
	Interval int    `json:"interval"`
	Webhook  string `json:"webhook"`
	Content  string `json:"content"`
}

type TestBotRunner struct {
	botID   string
	botName string
	apiBase string
	tasks   []TestTaskConfig
}

func NewTestBotRunner(botID, botName, rawConfig, apiBase string) (*TestBotRunner, error) {
	tasks, err := parseTasks(rawConfig)
	if err != nil {
		return nil, err
	}

	return &TestBotRunner{
		botID:   botID,
		botName: botName,
		apiBase: apiBase,
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
			runTestTask(ctx, httpClient, r.apiBase, r.botID, r.botName, taskIndex, taskCopy)
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

func runTestTask(ctx context.Context, httpClient *http.Client, apiBase, botID, botName string, idx int, task TestTaskConfig) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[test-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	// Fire once immediately, then on every tick.
	postOnce(ctx, httpClient, apiBase, logPrefix, task.Webhook, task.Content)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			postOnce(ctx, httpClient, apiBase, logPrefix, task.Webhook, task.Content)
		}
	}
}

func postOnce(ctx context.Context, httpClient *http.Client, apiBase, logPrefix, webhookURL, content string) {
	payload, _ := json.Marshal(map[string]any{"content": content})
	err := sdk.PostWebhookJSONWithRetry(ctx, httpClient, apiBase, webhookURL, payload, 3)
	if err != nil {
		log.Printf("%s post failed: %v", logPrefix, err)
	}
}
