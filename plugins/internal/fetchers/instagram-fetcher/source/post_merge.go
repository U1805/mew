package source

import (
	"sort"
	"strconv"
	"strings"
)

func mergeStoriesByPost(stories []StoryItem) []StoryItem {
	if len(stories) == 0 {
		return nil
	}

	out := make([]StoryItem, 0, len(stories))
	byPost := make(map[string]int, len(stories))
	for _, s := range stories {
		postID := splitStoryPostID(s.ID, s.TakenAt)
		if postID == "" {
			continue
		}
		if idx, ok := byPost[postID]; ok {
			out[idx].Items = append(out[idx].Items, s)
			continue
		}
		byPost[postID] = len(out)
		out = append(out, StoryItem{
			ID:    postID,
			Items: []StoryItem{s},
		})
	}

	for i := range out {
		items := out[i].Items
		if len(items) == 0 {
			continue
		}
		sort.SliceStable(items, func(a, b int) bool {
			return storyIndex(items[a].ID) < storyIndex(items[b].ID)
		})
		merged := mergePostItems(out[i].ID, items)
		out[i] = merged
	}
	return out
}

func mergePostItems(postID string, items []StoryItem) StoryItem {
	out := StoryItem{
		ID:    strings.TrimSpace(postID),
		Items: append([]StoryItem(nil), items...),
	}
	for _, s := range items {
		if out.TakenAt == 0 && s.TakenAt > 0 {
			out.TakenAt = s.TakenAt
		}
		if s.LikeCount > out.LikeCount {
			out.LikeCount = s.LikeCount
		}
		if s.CommentCount > out.CommentCount {
			out.CommentCount = s.CommentCount
		}
		if strings.TrimSpace(out.Content) == "" {
			out.Content = strings.TrimSpace(firstNonEmpty(s.Content, s.Title))
		}
		if strings.TrimSpace(out.Title) == "" {
			out.Title = strings.TrimSpace(firstNonEmpty(s.Title, s.Content))
		}
		if strings.TrimSpace(out.DisplayURL) == "" {
			out.DisplayURL = strings.TrimSpace(s.DisplayURL)
		}
		if strings.TrimSpace(out.DisplayURLFilename) == "" {
			out.DisplayURLFilename = strings.TrimSpace(s.DisplayURLFilename)
		}
		if strings.TrimSpace(out.ThumbnailSrc) == "" {
			out.ThumbnailSrc = strings.TrimSpace(s.ThumbnailSrc)
		}
		if strings.TrimSpace(out.VideoURL) == "" {
			out.VideoURL = strings.TrimSpace(s.VideoURL)
		}
		if out.IsVideo == nil && s.IsVideo != nil {
			v := *s.IsVideo
			out.IsVideo = &v
		}
	}
	return out
}

func splitStoryPostID(storyID string, takenAt int64) string {
	id := strings.TrimSpace(storyID)
	if id != "" {
		if idx := strings.Index(id, "_"); idx > 0 {
			return strings.TrimSpace(id[:idx])
		}
		return id
	}
	if takenAt > 0 {
		return strconv.FormatInt(takenAt, 10)
	}
	return ""
}

func storyIndex(storyID string) int {
	id := strings.TrimSpace(storyID)
	if id == "" {
		return 0
	}
	idx := strings.Index(id, "_")
	if idx < 0 || idx+1 >= len(id) {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(id[idx+1:]))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
