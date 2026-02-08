package source

// $env:TWITTER_FETCHER_INTEGRATION="1"
// $env:TWITTER_FETCHER_TEST_HANDLE="kurusurindesu"   # 可选，不设默认就是这个
// go test -tags=integration ./internal/fetchers/twitter-fetcher/source -run TestTwitterSourcesIntegration -v

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"testing"
	"time"
)

func TestTwitterSourcesIntegration(t *testing.T) {
	if os.Getenv("TWITTER_FETCHER_INTEGRATION") != "1" {
		t.Skip("set TWITTER_FETCHER_INTEGRATION=1 to run real network integration tests")
	}

	handle := strings.TrimSpace(os.Getenv("TWITTER_FETCHER_TEST_HANDLE"))
	if handle == "" {
		handle = "kurusurindesu"
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar failed: %v", err)
	}
	httpClient := &http.Client{Timeout: 35 * time.Second, Jar: jar}
	client := NewClient(httpClient)

	type sourceCase struct {
		name  string
		fetch func(context.Context, *http.Client, string, string) (Timeline, error)
	}

	sources := []sourceCase{
		{name: "twitterviewer-trpc", fetch: client.fetchTwitterViewerTRPC},
		{name: "twitter-viewer-user-tweets", fetch: client.fetchTwitterViewerUserTweets},
		{name: "twitterwebviewer-user-tweets", fetch: client.fetchTwitterWebViewerUserTweets},
	}

	for _, tc := range sources {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
			defer cancel()

			tl, err := tc.fetch(ctx, httpClient, "Mozilla/5.0", handle)
			if err != nil {
				t.Fatalf("source fetch failed: %v", err)
			}
			if len(tl.Items) == 0 {
				t.Fatalf("source returned empty timeline")
			}
			if strings.TrimSpace(tl.Items[0].Tweet.RestID) == "" {
				t.Fatalf("first tweet missing rest id")
			}
		})
	}
}
