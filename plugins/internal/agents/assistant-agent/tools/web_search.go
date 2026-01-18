package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"mew/plugins/internal/agents/assistant-agent/infra"
)

type exaSearchResponse struct {
	Context string `json:"context"`
	Results []struct {
		ID            string `json:"id"`
		Title         string `json:"title"`
		URL           string `json:"url"`
		PublishedDate string `json:"publishedDate"`
		Text          string `json:"text"`
	} `json:"results"`
}

func RunWebSearch(c infra.LLMCallContext, query string) (any, error) {
	ctx := infra.ContextOrBackground(c.Ctx)

	query = strings.TrimSpace(query)
	if query == "" {
		return map[string]any{"results": []any{}}, nil
	}
	if strings.TrimSpace(c.Config.Tool.ExaAPIKey) == "" {
		return nil, fmt.Errorf("assistant-agent config incomplete: tool.exa_api_key is required for WebSearch")
	}

	reqBody := map[string]any{
		"query":      query,
		"numResults": 3,
		"type":       "deep",
		"contents": map[string]any{
			"text": true,
		},
	}
	b, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, infra.ExaSearchEndpoint, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", strings.TrimSpace(c.Config.Tool.ExaAPIKey))
	if c.HTTPClient == nil {
		c.HTTPClient = http.DefaultClient
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("exa search failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed exaSearchResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(parsed.Results))
	for _, it := range parsed.Results {
		out = append(out, map[string]any{
			"id":            strings.TrimSpace(it.ID),
			"title":         strings.TrimSpace(it.Title),
			"url":           strings.TrimSpace(it.URL),
			"publishedDate": strings.TrimSpace(it.PublishedDate),
			"text":          strings.TrimSpace(it.Text),
		})
		if len(out) >= 3 {
			break
		}
	}

	return map[string]any{"summary": strings.TrimSpace(parsed.Context), "results": out}, nil
}
