package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"mew/plugins/sdk"
)

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
	g := sdk.NewGroup(context.Background())

	webhookHTTPClient := &http.Client{Timeout: 15 * time.Second}

	for i, task := range r.tasks {
		if !isTaskEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runTestTask(ctx, webhookHTTPClient, r.apiBase, r.botID, r.botName, taskIndex, taskCopy)
		})
	}

	return g.Stop
}

func isTaskEnabled(v *bool) bool {
	if v == nil {
		return true
	}
	return *v
}

func runTestTask(ctx context.Context, webhookHTTPClient *http.Client, apiBase, botID, botName string, idx int, task TestTaskConfig) {
	interval := time.Duration(task.Interval) * time.Second
	logPrefix := fmt.Sprintf("[test-bot] bot=%s name=%q task=%d interval=%s", botID, botName, idx, interval)

	post := func() {
		payload := sdk.WebhookPayload{Content: task.Content}
		if err := sdk.PostWebhook(ctx, webhookHTTPClient, apiBase, task.Webhook, payload, 3); err != nil {
			log.Printf("%s post failed: %v", logPrefix, err)
		}
	}

	// Fire once immediately, then on every tick.
	post()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			post()
		}
	}
}
