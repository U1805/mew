package engine

import (
	"sort"
	"strconv"
	"strings"

	"mew/plugins/internal/fetchers/instagram-fetcher/source"
)

type postGroup struct {
	PostID  string
	Stories []source.StoryItem
}

func groupStoriesByPost(stories []source.StoryItem) []postGroup {
	if len(stories) == 0 {
		return nil
	}

	out := make([]postGroup, 0, len(stories))
	byPost := make(map[string]int, len(stories))
	for _, s := range stories {
		postID := storyPostID(s)
		if postID == "" {
			continue
		}
		if idx, ok := byPost[postID]; ok {
			out[idx].Stories = append(out[idx].Stories, s)
			continue
		}
		byPost[postID] = len(out)
		out = append(out, postGroup{
			PostID:  postID,
			Stories: []source.StoryItem{s},
		})
	}

	for i := range out {
		sort.SliceStable(out[i].Stories, func(a, b int) bool {
			ai := storyIndex(out[i].Stories[a].ID)
			bi := storyIndex(out[i].Stories[b].ID)
			return ai < bi
		})
	}
	return out
}

func storyPostID(story source.StoryItem) string {
	return splitStoryPostID(story.ID, story.TakenAt)
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
