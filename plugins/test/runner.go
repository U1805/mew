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
	botID       string
	botName     string
	accessToken string
	apiBase     string
	serviceType string
	tasks       []TestTaskConfig
}

func NewTestBotRunner(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (*TestBotRunner, error) {
	tasks, err := parseTasks(rawConfig)
	if err != nil {
		return nil, err
	}

	return &TestBotRunner{
		botID:       botID,
		botName:     botName,
		accessToken: accessToken,
		apiBase:     cfg.APIBase,
		serviceType: cfg.ServiceType,
		tasks:       tasks,
	}, nil
}

func (r *TestBotRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			runTestTask(ctx, webhookHTTPClient, r.apiBase, r.botID, r.botName, taskIndex, taskCopy)
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
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

	sdk.RunInterval(ctx, interval, true, func(ctx context.Context) { post() })
}
