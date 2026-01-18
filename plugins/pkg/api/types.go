package api

import (
	"encoding/json"
	"strings"
	"time"
)

type User struct {
	ID       string `json:"_id"`
	Username string `json:"username"`
	IsBot    bool   `json:"isBot"`
}

type AttachmentRef struct {
	ChannelID string `json:"-"`

	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	URL         string `json:"url"`
}

type Reaction struct {
	Emoji   string   `json:"emoji"`
	UserIDs []string `json:"userIds"`
}

type ChannelMessage struct {
	ID        string `json:"_id"`
	ChannelID string `json:"channelId"`
	Type      string `json:"type"`
	Content   string `json:"content"`

	// Context is a unified plain-text representation of the message for bots/LLM consumers.
	// It is populated by the backend; for normal messages it usually equals Content.
	Context string `json:"context"`

	// Payload is message type-specific data used by the frontend to render cards/embeds.
	Payload json.RawMessage `json:"payload,omitempty"`

	Attachments []AttachmentRef `json:"attachments"`

	// Mentions is an array of mentioned user IDs. Depending on backend populate behavior, items may be strings or objects.
	MentionsRaw []json.RawMessage `json:"mentions"`

	ReferencedMessageID string     `json:"referencedMessageId,omitempty"`
	Reactions           []Reaction `json:"reactions,omitempty"`
	EditedAt            *time.Time `json:"editedAt,omitempty"`
	RetractedAt         *time.Time `json:"retractedAt,omitempty"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
	AuthorRaw           json.RawMessage `json:"authorId"`
}

func (m ChannelMessage) AuthorID() string { return AuthorID(m.AuthorRaw) }

func (m ChannelMessage) AuthorUsername() string { return AuthorUsername(m.AuthorRaw) }

func (m ChannelMessage) ContextText() string {
	if strings.TrimSpace(m.Context) != "" {
		return strings.TrimSpace(m.Context)
	}
	return strings.TrimSpace(m.Content)
}

