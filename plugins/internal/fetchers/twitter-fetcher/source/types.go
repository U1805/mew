package source

type ViewerResponseItem struct {
	Result struct {
		Data struct {
			User struct {
				RestID           string `json:"restId"`
				Handle           string `json:"handle"`
				Name             string `json:"name"`
				ProfileImageURL  string `json:"profileImageUrl"`
				ProfileBannerURL string `json:"profileBannerUrl"`
			} `json:"user"`
			Users    map[string]User `json:"users"`
			Timeline struct {
				Items []TimelineItem `json:"items"`
			} `json:"timeline"`
		} `json:"data"`
	} `json:"result"`
}

type User struct {
	RestID          string `json:"restId"`
	Handle          string `json:"handle"`
	Name            string `json:"name"`
	ProfileImageURL string `json:"profileImageUrl"`
}

type TimelineItem struct {
	Type  string `json:"type"`
	Tweet Tweet  `json:"tweet"`
}

type Tweet struct {
	RestID      string   `json:"restId"`
	UserID      string   `json:"userId"`
	FullText    string   `json:"fullText"`
	DisplayText string   `json:"displayText"`
	CreatedAt   string   `json:"createdAt"`
	Images      []string `json:"images"`
	Pinned      bool     `json:"pinned"`

	BookmarkCount     int64  `json:"bookmarkCount"`
	FavoriteCount     int64  `json:"favoriteCount"`
	QuoteCount        int64  `json:"quoteCount"`
	ReplyCount        int64  `json:"replyCount"`
	RetweetCount      int64  `json:"retweetCount"`
	ViewCount         *int64 `json:"viewCount"`
	PossiblySensitive bool   `json:"possiblySensitive"`

	Video *Video `json:"video"`

	RetweetedTweet *Tweet `json:"retweetedTweet"`
	QuotedTweet    *Tweet `json:"quotedTweet"`
}

type Video struct {
	AspectRatio    []int64 `json:"aspectRatio"`
	DurationMillis int64   `json:"durationMillis"`
	CoverURL       string  `json:"coverUrl"`
	VideoURL       string  `json:"videoUrl"`
	Variants       []struct {
		Bitrate     *int64 `json:"bitrate"`
		URL         string `json:"url"`
		ContentType string `json:"contentType"`
	} `json:"variants"`
}

type Timeline struct {
	MonitoredUser User
	Users         map[string]User
	Items         []TimelineItem
}
