package memory

import "time"

type Metadata struct {
	SessionStartDatetime  string `json:"session_start_datetime"`
	TimeSinceLastMessage  string `json:"time_since_last_message"`
	UserActivityFrequency string `json:"user_activity_frequency"`

	InitialMood  Mood `json:"initial_mood"`
	FinalMood    Mood `json:"final_mood"`
	BaselineMood Mood `json:"baseline_mood"`

	RecordID      string    `json:"recordId"`
	StartAt       time.Time `json:"startAt"`
	LastMessageAt time.Time `json:"lastMessageAt"`
	ChannelID     string    `json:"channelId"`

	LastSummarizedRecordID string    `json:"lastSummarizedRecordId"`
	LastFactRecordID       string    `json:"lastFactRecordId"`
	LastFactProcessedAt    time.Time `json:"lastFactProcessedAt"`
}
