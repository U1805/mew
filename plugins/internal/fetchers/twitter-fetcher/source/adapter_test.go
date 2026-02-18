package source

import (
	"strings"
	"testing"
)

func TestParseViewerCompatResponse_MapsRestIDForDedup(t *testing.T) {
	t.Parallel()

	body := []byte(`{
		"success": true,
		"data": {
			"user": {
				"restId": "770531791543279616",
				"handle": "kurusurindesu",
				"displayName": "来栖りん",
				"avatar": "https://pbs.twimg.com/profile_images/a_normal.jpg"
			},
			"tweets": [
				{
					"id": "2020432465932984539",
					"text": "hello",
					"createdAt": "Sun Feb 08 09:40:12 +0000 2026",
					"author": {
						"id": "770531791543279616",
						"handle": "kurusurindesu",
						"displayName": "来栖りん",
						"avatar": "https://pbs.twimg.com/profile_images/a_normal.jpg"
					},
					"stats": {
						"likes": 1,
						"retweets": 2,
						"replies": 3,
						"quotes": 4,
						"views": 5,
						"bookmarks": 6
					},
					"media": [
						{"type":"photo","url":"https://pbs.twimg.com/media/a.jpg"}
					]
				}
			]
		}
	}`)

	tl, err := parseViewerCompatResponse(body, "kurusurindesu")
	if err != nil {
		t.Fatalf("parseViewerCompatResponse returned error: %v", err)
	}

	if tl.MonitoredUser.RestID != "770531791543279616" {
		t.Fatalf("monitored restId = %q", tl.MonitoredUser.RestID)
	}
	if len(tl.Items) != 1 {
		t.Fatalf("items len = %d", len(tl.Items))
	}
	if tl.Items[0].Tweet.RestID != "2020432465932984539" {
		t.Fatalf("tweet restId = %q", tl.Items[0].Tweet.RestID)
	}
	if tl.Items[0].Tweet.UserID != "770531791543279616" {
		t.Fatalf("tweet userId = %q", tl.Items[0].Tweet.UserID)
	}
}

func TestParseViewerCompatResponse_UsesNestedTweetsFallback(t *testing.T) {
	t.Parallel()

	body := []byte(`{
		"data": {
			"timeline": {
				"tweets": [
					{
						"restId": "2019019490126864851",
						"fullText": "x",
						"author": {"restId":"770531791543279616","username":"kurusurindesu"},
						"stats": {"likes": 1}
					}
				]
			}
		}
	}`)

	tl, err := parseViewerCompatResponse(body, "kurusurindesu")
	if err != nil {
		t.Fatalf("parseViewerCompatResponse returned error: %v", err)
	}

	if len(tl.Items) != 1 {
		t.Fatalf("items len = %d", len(tl.Items))
	}
	if tl.Items[0].Tweet.RestID != "2019019490126864851" {
		t.Fatalf("tweet restId = %q", tl.Items[0].Tweet.RestID)
	}
}

func TestParseViewerCompatResponse_TwitterWebViewerShape(t *testing.T) {
	t.Parallel()

	body := []byte(`{
		"success": true,
		"data": {
			"tweets": [
				{
					"id": "2020432465932984539",
					"content": "hello from twitterwebviewer",
					"createdAt": "Sun Feb 08 09:40:12 +0000 2026",
					"author": {
						"id": "770531791543279616",
						"username": "kurusurindesu",
						"displayName": "Rin Kurusu",
						"avatar": "https://pbs.twimg.com/profile_images/a_400x400.jpg"
					},
					"stats": {
						"likes": 1,
						"retweets": 2,
						"replies": 3,
						"quotes": 4,
						"views": 5,
						"bookmarks": 6
					},
					"media": [
						{"type":"image","url":"https://pbs.twimg.com/media/a.jpg"},
						{"type":"video","url":"https://pbs.twimg.com/thumb.jpg","thumbnail":"https://pbs.twimg.com/thumb.jpg","videoUrl":"https://video.twimg.com/a.mp4"}
					]
				}
			],
			"user": {
				"id": "770531791543279616",
				"username": "kurusurindesu",
				"displayName": "Rin Kurusu",
				"avatar": "https://pbs.twimg.com/profile_images/a_400x400.jpg"
			}
		}
	}`)

	tl, err := parseViewerCompatResponse(body, "kurusurindesu")
	if err != nil {
		t.Fatalf("parseViewerCompatResponse returned error: %v", err)
	}

	if len(tl.Items) != 1 {
		t.Fatalf("items len = %d", len(tl.Items))
	}
	tw := tl.Items[0].Tweet
	if tw.RestID != "2020432465932984539" {
		t.Fatalf("tweet restId = %q", tw.RestID)
	}
	if tw.UserID != "770531791543279616" {
		t.Fatalf("tweet userId = %q", tw.UserID)
	}
	if tw.FullText != "hello from twitterwebviewer" {
		t.Fatalf("tweet text = %q", tw.FullText)
	}
	if len(tw.Images) != 1 || tw.Images[0] != "https://pbs.twimg.com/media/a.jpg" {
		t.Fatalf("tweet images = %#v", tw.Images)
	}
	if tw.Video == nil || tw.Video.VideoURL != "https://video.twimg.com/a.mp4" {
		t.Fatalf("tweet video = %#v", tw.Video)
	}
}

func TestParseViewerCompatResponse_PostelShape(t *testing.T) {
	t.Parallel()

	body := []byte(`{
		"success": true,
		"profile": {
			"handle": "kurusurindesu",
			"name": "Rin Kurusu",
			"profilePicture": "https://pbs.twimg.com/profile_images/a_400x400.jpg"
		},
		"tweets": [
			{
				"id": "2020432465932984539",
				"text": "hello from postel",
				"createdAt": "Sun Feb 08 09:40:12 +0000 2026",
				"likeCount": 11,
				"retweetCount": 22,
				"replyCount": 33,
				"viewCount": 44,
				"bookmarkCount": 55,
				"author": {
					"userName": "kurusurindesu",
					"name": "Rin Kurusu",
					"profilePicture": "https://pbs.twimg.com/profile_images/a_400x400.jpg"
				},
				"media": [
					{"type":"photo","url":"https://pbs.twimg.com/media/a.jpg"}
				]
			}
		]
	}`)

	tl, err := parseViewerCompatResponse(body, "kurusurindesu")
	if err != nil {
		t.Fatalf("parseViewerCompatResponse returned error: %v", err)
	}

	if len(tl.Items) != 1 {
		t.Fatalf("items len = %d", len(tl.Items))
	}
	tw := tl.Items[0].Tweet
	if tw.RestID != "2020432465932984539" {
		t.Fatalf("tweet restId = %q", tw.RestID)
	}
	if tw.FullText != "hello from postel" {
		t.Fatalf("tweet text = %q", tw.FullText)
	}
	if tw.FavoriteCount != 11 || tw.RetweetCount != 22 || tw.ReplyCount != 33 || tw.BookmarkCount != 55 {
		t.Fatalf("tweet stats = like=%d rt=%d reply=%d bookmark=%d", tw.FavoriteCount, tw.RetweetCount, tw.ReplyCount, tw.BookmarkCount)
	}
	if tw.ViewCount == nil || *tw.ViewCount != 44 {
		t.Fatalf("tweet viewCount = %#v", tw.ViewCount)
	}
	if len(tw.Images) != 1 || tw.Images[0] != "https://pbs.twimg.com/media/a.jpg" {
		t.Fatalf("tweet images = %#v", tw.Images)
	}
	if strings.TrimSpace(tl.MonitoredUser.Handle) != "kurusurindesu" {
		t.Fatalf("monitored handle = %q", tl.MonitoredUser.Handle)
	}
}
