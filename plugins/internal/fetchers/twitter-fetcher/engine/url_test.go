package engine

import "testing"

func TestNormalizeMediaURL(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"   ", ""},
		{"https://video.twimg.com/a/b/c.mp4", "https://video.twimg.com/a/b/c.mp4"},
		{"//video.twimg.com/a/b/c.mp4", "https://video.twimg.com/a/b/c.mp4"},
		{"/api/proxy/video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4", "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4"},
		{"api/proxy/video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4", "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4"},
		{"https://twitterviewer.net/api/proxy/video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4", "https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/x.mp4"},
		{"/api/proxy/video.twimg.com", "/api/proxy/video.twimg.com"},
	}

	for _, tc := range cases {
		got := NormalizeMediaURL(tc.in)
		if got != tc.want {
			t.Fatalf("NormalizeMediaURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
