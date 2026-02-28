package source

import "time"

type Feed struct {
	Profile Profile
	Videos  []Video
}

type Profile struct {
	Name       string
	Username   string
	Bio        string
	ProfileURL string
	AvatarURL  string
	Hearts     int64
	Followers  int64
}

type Video struct {
	ID           string
	URL          string
	Title        string
	Description  string
	UploadDate   string
	Duration     string
	ThumbnailURL string
	ContentURL   string
	Width        int64
	Height       int64
	Views        int64
	Likes        int64
	Comments     int64
	Shares       int64
	AudioName    string
	AudioAuthor  string
}

func ParseVideoTime(raw string) time.Time {
	s := raw
	if s == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}
	}
	return t
}
