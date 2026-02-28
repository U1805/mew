package source

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type viewerCompatEnvelope struct {
	Success *bool               `json:"success"`
	Data    viewerCompatData    `json:"data"`
	User    viewerCompatUser    `json:"user"`
	Profile viewerCompatUser    `json:"profile"`
	Tweets  []viewerCompatTweet `json:"tweets"`
	Error   string              `json:"error"`
	Message string              `json:"message"`
}

type viewerCompatData struct {
	User        viewerCompatUser    `json:"user"`
	Tweets      []viewerCompatTweet `json:"tweets"`
	Items       []viewerCompatTweet `json:"items"`
	NextCursor  string              `json:"nextCursor"`
	HasNextPage *bool               `json:"hasNextPage"`
	Timeline    struct {
		Tweets []viewerCompatTweet `json:"tweets"`
		Items  []viewerCompatTweet `json:"items"`
	} `json:"timeline"`
}

type viewerCompatUser struct {
	RestID         string `json:"restId"`
	ID             string `json:"id"`
	Handle         string `json:"handle"`
	Username       string `json:"username"`
	Name           string `json:"name"`
	DisplayName    string `json:"displayName"`
	Bio            string `json:"bio"`
	Avatar         string `json:"avatar"`
	ProfilePicture string `json:"profilePicture"`
	AvatarURL      string `json:"avatarUrl"`
}

type viewerCompatTweet struct {
	ID              string              `json:"id"`
	RestID          string              `json:"restId"`
	Text            string              `json:"text"`
	Content         string              `json:"content"`
	FullText        string              `json:"fullText"`
	DisplayText     string              `json:"displayText"`
	CreatedAt       string              `json:"createdAt"`
	Author          viewerCompatAuthor  `json:"author"`
	Stats           viewerCompatStats   `json:"stats"`
	LikeCount       int64               `json:"likeCount"`
	RetweetCount    int64               `json:"retweetCount"`
	ReplyCount      int64               `json:"replyCount"`
	QuoteCount      int64               `json:"quoteCount"`
	ViewCount       int64               `json:"viewCount"`
	BookmarkCount   int64               `json:"bookmarkCount"`
	Media           []viewerCompatMedia `json:"media"`
	URLs            []string            `json:"urls"`
	QuotedTweet     *viewerCompatTweet  `json:"quotedTweet"`
	RetweetedTweet  *viewerCompatTweet  `json:"retweetedTweet"`
	IsRetweet       bool                `json:"isRetweet"`
	OriginalTweetID string              `json:"originalTweetId"`
}

type viewerCompatAuthor struct {
	ID             string `json:"id"`
	RestID         string `json:"restId"`
	Handle         string `json:"handle"`
	Username       string `json:"username"`
	UserName       string `json:"userName"`
	DisplayName    string `json:"displayName"`
	Name           string `json:"name"`
	Avatar         string `json:"avatar"`
	ProfilePicture string `json:"profilePicture"`
	AvatarURL      string `json:"avatarUrl"`
}

type viewerCompatStats struct {
	Likes     int64 `json:"likes"`
	Retweets  int64 `json:"retweets"`
	Replies   int64 `json:"replies"`
	Quotes    int64 `json:"quotes"`
	Views     int64 `json:"views"`
	Bookmarks int64 `json:"bookmarks"`
}

type viewerCompatMedia struct {
	Type      string `json:"type"`
	URL       string `json:"url"`
	Thumbnail string `json:"thumbnail"`
	VideoURL  string `json:"videoUrl"`
}

func parseViewerCompatResponse(body []byte, expectedHandle string) (Timeline, error) {
	var env viewerCompatEnvelope
	if err := json.Unmarshal(body, &env); err != nil {
		return Timeline{}, fmt.Errorf("decode viewer compat response failed: %w", err)
	}

	if env.Success != nil && !*env.Success {
		errMsg := strings.TrimSpace(env.Error)
		if errMsg == "" {
			errMsg = strings.TrimSpace(env.Message)
		}
		if errMsg == "" {
			errMsg = "success=false"
		}
		return Timeline{}, fmt.Errorf("viewer compat api failed: %s", errMsg)
	}

	monitored := buildMonitoredUser(env, expectedHandle)
	tweets := pickTweets(env)
	if len(tweets) == 0 {
		return Timeline{}, fmt.Errorf("empty viewer compat timeline")
	}

	users := map[string]User{}
	monitoredKey := resolveUserKey(users, monitored.RestID, monitored.Handle)
	if monitoredKey != "" {
		users[monitoredKey] = monitored
	}

	items := make([]TimelineItem, 0, len(tweets))
	for i := range tweets {
		tw := toTimelineTweet(tweets[i], users, 0)
		if strings.TrimSpace(tw.RestID) == "" {
			continue
		}
		if strings.TrimSpace(tw.UserID) == "" && monitoredKey != "" {
			tw.UserID = monitoredKey
		}
		items = append(items, TimelineItem{Type: "tweet", Tweet: tw})
	}

	if len(items) == 0 {
		return Timeline{}, fmt.Errorf("viewer compat timeline has no valid tweet id")
	}
	if strings.TrimSpace(monitored.Name) == "" || strings.TrimSpace(monitored.ProfileImageURL) == "" || monitoredKey == "" {
		monitored = inferMonitoredFromItems(monitored, expectedHandle, items, users)
		monitoredKey = resolveUserKey(users, monitored.RestID, monitored.Handle)
		if monitoredKey != "" {
			users[monitoredKey] = mergeUser(users[monitoredKey], monitored)
		}
	}

	return Timeline{MonitoredUser: monitored, Users: users, Items: items}, nil
}

func pickTweets(env viewerCompatEnvelope) []viewerCompatTweet {
	if len(env.Tweets) > 0 {
		return env.Tweets
	}
	if len(env.Data.Tweets) > 0 {
		return env.Data.Tweets
	}
	if len(env.Data.Items) > 0 {
		return env.Data.Items
	}
	if len(env.Data.Timeline.Tweets) > 0 {
		return env.Data.Timeline.Tweets
	}
	if len(env.Data.Timeline.Items) > 0 {
		return env.Data.Timeline.Items
	}
	return nil
}

func buildMonitoredUser(env viewerCompatEnvelope, expectedHandle string) User {
	u := env.Data.User
	if strings.TrimSpace(u.ID) == "" && strings.TrimSpace(u.RestID) == "" {
		u = env.User
	}
	if strings.TrimSpace(u.ID) == "" && strings.TrimSpace(u.RestID) == "" {
		u = env.Profile
	}

	restID := firstNonEmpty(u.RestID, u.ID)
	handle := strings.TrimSpace(strings.TrimPrefix(firstNonEmpty(u.Handle, u.Username, expectedHandle), "@"))
	name := firstNonEmpty(u.Name, u.DisplayName, handle)
	avatar := firstNonEmpty(u.AvatarURL, u.ProfilePicture, u.Avatar)

	return User{
		RestID:          strings.TrimSpace(restID),
		Handle:          handle,
		Name:            strings.TrimSpace(name),
		ProfileImageURL: strings.TrimSpace(avatar),
	}
}

func toTimelineTweet(src viewerCompatTweet, users map[string]User, depth int) Tweet {
	if depth > 4 {
		return Tweet{}
	}

	restID := strings.TrimSpace(firstNonEmpty(src.RestID, src.ID))
	text := firstNonEmpty(src.FullText, src.Text, src.Content, src.DisplayText)
	authorID := strings.TrimSpace(firstNonEmpty(src.Author.RestID, src.Author.ID))

	authorHandle := strings.TrimSpace(strings.TrimPrefix(firstNonEmpty(src.Author.Handle, src.Author.Username, src.Author.UserName), "@"))
	authorName := strings.TrimSpace(firstNonEmpty(src.Author.Name, src.Author.DisplayName, authorHandle))
	authorAvatar := strings.TrimSpace(firstNonEmpty(src.Author.AvatarURL, src.Author.ProfilePicture, src.Author.Avatar))
	authorKey := resolveUserKey(users, authorID, authorHandle)
	if authorKey != "" {
		existing := users[authorKey]
		users[authorKey] = mergeUser(existing, User{
			RestID:          authorID,
			Handle:          authorHandle,
			Name:            authorName,
			ProfileImageURL: authorAvatar,
		})
	}

	likeCount := src.Stats.Likes
	if src.LikeCount > 0 {
		likeCount = src.LikeCount
	}
	retweetCount := src.Stats.Retweets
	if src.RetweetCount > 0 {
		retweetCount = src.RetweetCount
	}
	replyCount := src.Stats.Replies
	if src.ReplyCount > 0 {
		replyCount = src.ReplyCount
	}
	quoteCount := src.Stats.Quotes
	if src.QuoteCount > 0 {
		quoteCount = src.QuoteCount
	}
	bookmarkCount := src.Stats.Bookmarks
	if src.BookmarkCount > 0 {
		bookmarkCount = src.BookmarkCount
	}

	t := Tweet{
		RestID:         restID,
		UserID:         authorKey,
		FullText:       strings.TrimSpace(text),
		DisplayText:    strings.TrimSpace(firstNonEmpty(src.DisplayText, src.Text, src.Content, src.FullText)),
		CreatedAt:      strings.TrimSpace(src.CreatedAt),
		FavoriteCount:  likeCount,
		RetweetCount:   retweetCount,
		ReplyCount:     replyCount,
		QuoteCount:     quoteCount,
		BookmarkCount:  bookmarkCount,
		Images:         nil,
		RetweetedTweet: nil,
		QuotedTweet:    nil,
	}

	views := src.Stats.Views
	if src.ViewCount > 0 {
		views = src.ViewCount
	}
	if views > 0 {
		vv := views
		t.ViewCount = &vv
	}

	images := make([]string, 0, len(src.Media))
	videoURL := ""
	coverURL := ""
	for _, m := range src.Media {
		u := strings.TrimSpace(m.URL)
		v := strings.TrimSpace(m.VideoURL)
		mediaType := strings.ToLower(strings.TrimSpace(m.Type))
		if (mediaType == "photo" || mediaType == "image") && u != "" {
			images = append(images, u)
			continue
		}
		if strings.TrimSpace(m.Thumbnail) != "" {
			coverURL = strings.TrimSpace(m.Thumbnail)
		}
		if v != "" {
			videoURL = v
		} else if u != "" && (mediaType == "video" || mediaType == "gif") {
			videoURL = u
		}
	}
	t.Images = images
	if videoURL != "" {
		t.Video = &Video{VideoURL: videoURL, CoverURL: coverURL}
	}

	if src.QuotedTweet != nil {
		qt := toTimelineTweet(*src.QuotedTweet, users, depth+1)
		if strings.TrimSpace(qt.RestID) != "" {
			t.QuotedTweet = &qt
		}
	}
	if src.RetweetedTweet != nil {
		rt := toTimelineTweet(*src.RetweetedTweet, users, depth+1)
		if strings.TrimSpace(rt.RestID) != "" {
			t.RetweetedTweet = &rt
		}
	}

	return t
}

func inferMonitoredFromItems(monitored User, expectedHandle string, items []TimelineItem, users map[string]User) User {
	target := strings.TrimSpace(strings.TrimPrefix(expectedHandle, "@"))
	if target != "" {
		for _, u := range users {
			if strings.EqualFold(strings.TrimSpace(u.Handle), target) {
				if strings.TrimSpace(u.Handle) == "" {
					u.Handle = target
				}
				return u
			}
		}
	}

	if len(items) > 0 {
		uid := strings.TrimSpace(items[0].Tweet.UserID)
		if uid != "" {
			if u, ok := users[uid]; ok {
				if strings.TrimSpace(u.Handle) == "" {
					u.Handle = target
				}
				return u
			}
		}
	}

	if strings.TrimSpace(monitored.Handle) == "" {
		monitored.Handle = target
	}
	if strings.TrimSpace(monitored.Name) == "" {
		monitored.Name = monitored.Handle
	}
	if strings.TrimSpace(monitored.RestID) == "" {
		for _, it := range items {
			id := strings.TrimSpace(it.Tweet.UserID)
			if u, ok := users[id]; ok && strings.TrimSpace(u.RestID) != "" {
				monitored.RestID = strings.TrimSpace(u.RestID)
				break
			}
			if _, err := strconv.ParseInt(id, 10, 64); err == nil {
				monitored.RestID = id
				break
			}
		}
	}
	return monitored
}

func mergeUser(base User, incoming User) User {
	if strings.TrimSpace(base.RestID) == "" {
		base.RestID = strings.TrimSpace(incoming.RestID)
	}
	if strings.TrimSpace(base.Handle) == "" {
		base.Handle = strings.TrimSpace(incoming.Handle)
	}
	if inName := strings.TrimSpace(incoming.Name); inName != "" {
		baseName := strings.TrimSpace(base.Name)
		baseHandle := strings.TrimSpace(base.Handle)
		if baseName == "" || (baseHandle != "" && strings.EqualFold(baseName, baseHandle)) {
			base.Name = inName
		}
	}
	if strings.TrimSpace(base.ProfileImageURL) == "" {
		base.ProfileImageURL = strings.TrimSpace(incoming.ProfileImageURL)
	}
	return base
}

func resolveUserKey(users map[string]User, authorID, authorHandle string) string {
	handle := normalizeHandle(authorHandle)
	if handle == "" {
		return ""
	}

	for key, u := range users {
		if normalizeHandle(u.Handle) == handle {
			return strings.TrimSpace(key)
		}
	}

	return handle
}

func normalizeHandle(handle string) string {
	return strings.ToLower(strings.TrimSpace(strings.TrimPrefix(handle, "@")))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
