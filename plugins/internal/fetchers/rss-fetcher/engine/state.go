package engine

import (
	"strings"

	"mew/plugins/internal/fetchers/rss-fetcher/source"
	"mew/plugins/pkg"
	"mew/plugins/pkg/state"
)

type State struct {
	ETag         string   `json:"etag,omitempty"`
	LastModified string   `json:"last_modified,omitempty"`
	FeedTitle    string   `json:"feed_title,omitempty"`
	FeedImageURL string   `json:"feed_image_url,omitempty"`
	FeedSiteURL  string   `json:"feed_site_url,omitempty"`
	Seen         []string `json:"seen,omitempty"`
}

type Manager struct {
	seen *state.SeenStore[State]
}

func Load(serviceType, botID string, taskIdx int, identity string) (*Manager, error) {
	st := sdk.OpenTaskState[State](serviceType, botID, taskIdx, identity)
	ss, err := state.LoadSeenStore[State](
		st,
		1000,
		func(s State) []string { return s.Seen },
		func(s *State, seen []string) { s.Seen = seen },
	)
	return &Manager{seen: ss}, err
}

func (m *Manager) Fresh() bool {
	if m == nil || m.seen == nil {
		return true
	}
	return m.seen.Fresh()
}

func (m *Manager) Conditional() source.Conditional {
	if m == nil || m.seen == nil {
		return source.Conditional{}
	}
	st := m.seen.State()
	if st == nil {
		return source.Conditional{}
	}
	return source.Conditional{
		ETag:         strings.TrimSpace(st.ETag),
		LastModified: strings.TrimSpace(st.LastModified),
	}
}

func (m *Manager) UpdateFetchMeta(res source.Result) {
	if m == nil || m.seen == nil {
		return
	}
	st := m.seen.State()
	if st == nil {
		return
	}
	if strings.TrimSpace(res.ETag) != "" {
		st.ETag = strings.TrimSpace(res.ETag)
	}
	if strings.TrimSpace(res.LastModified) != "" {
		st.LastModified = strings.TrimSpace(res.LastModified)
	}
	if strings.TrimSpace(res.FeedTitle) != "" {
		st.FeedTitle = strings.TrimSpace(res.FeedTitle)
	}
	if strings.TrimSpace(res.FeedImageURL) != "" {
		st.FeedImageURL = strings.TrimSpace(res.FeedImageURL)
	}
	if strings.TrimSpace(res.FeedSiteURL) != "" {
		st.FeedSiteURL = strings.TrimSpace(res.FeedSiteURL)
	}
}

func (m *Manager) FeedTitle(fallback string) string {
	if m == nil || m.seen == nil {
		return strings.TrimSpace(fallback)
	}
	st := m.seen.State()
	if st == nil {
		return strings.TrimSpace(fallback)
	}
	title := strings.TrimSpace(st.FeedTitle)
	if title == "" {
		title = strings.TrimSpace(fallback)
	}
	return title
}

func (m *Manager) FeedImageURL() string {
	if m == nil || m.seen == nil {
		return ""
	}
	st := m.seen.State()
	if st == nil {
		return ""
	}
	return strings.TrimSpace(st.FeedImageURL)
}

func (m *Manager) FeedSiteURL() string {
	if m == nil || m.seen == nil {
		return ""
	}
	st := m.seen.State()
	if st == nil {
		return ""
	}
	return strings.TrimSpace(st.FeedSiteURL)
}

func (m *Manager) IsNew(id string) bool {
	if m == nil || m.seen == nil {
		return false
	}
	return m.seen.IsNew(id)
}

func (m *Manager) MarkSeen(id string) {
	if m == nil || m.seen == nil {
		return
	}
	m.seen.MarkSeen(id)
}

func (m *Manager) Save() error {
	if m == nil || m.seen == nil {
		return nil
	}
	return m.seen.Save()
}
