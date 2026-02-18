package source

// $env:INSTAGRAM_FETCHER_INTEGRATION="1"
// $env:INSTAGRAM_FETCHER_TEST_USERNAME="nirei_nozomi_official"   # 可选
// go test -tags=integration ./internal/fetchers/instagram-fetcher/source -run TestInstagramSourcesIntegration -v

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"testing"
	"time"
)

func TestInstagramSourcesIntegration(t *testing.T) {
	if os.Getenv("INSTAGRAM_FETCHER_INTEGRATION") != "1" {
		t.Skip("set INSTAGRAM_FETCHER_INTEGRATION=1 to run real network integration tests")
	}

	username := strings.TrimSpace(os.Getenv("INSTAGRAM_FETCHER_TEST_USERNAME"))
	if username == "" {
		username = "nirei_nozomi_official"
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("create cookie jar failed: %v", err)
	}

	httpClient := &http.Client{Timeout: 35 * time.Second, Jar: jar}
	client := &Client{}

	type sourceCase struct {
		name  string
		fetch func(context.Context, *http.Client, string, string) ([]StoryItem, *UserProfile, error)
	}

	sources := []sourceCase{
		{name: "picuki-posts", fetch: client.fetchPicukiPosts},
		{name: "insta-stories-viewer-com", fetch: client.fetchInstaStoriesViewerSocketIO},
	}

	for _, tc := range sources {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			defer cancel()

			stories, user, err := tc.fetch(ctx, httpClient, "Mozilla/5.0", username)
			if err != nil {
				t.Fatalf("source fetch failed: %v", err)
			}
			if user == nil || strings.TrimSpace(user.Username) == "" {
				t.Fatalf("source returned empty user profile")
			}
			if len(stories) == 0 {
				t.Fatalf("source returned empty stories")
			}
			if strings.TrimSpace(stories[0].ID) == "" {
				t.Fatalf("first story missing id")
			}
		})
	}
}

