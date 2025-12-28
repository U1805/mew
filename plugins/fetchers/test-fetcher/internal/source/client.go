package source

import (
	"context"
	"strings"
)

type Client struct{}

func NewClient() *Client { return &Client{} }

func (c *Client) Next(ctx context.Context, content string) (string, error) {
	_ = ctx
	return strings.TrimSpace(content), nil
}
