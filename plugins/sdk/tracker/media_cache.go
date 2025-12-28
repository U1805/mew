package tracker

import "strings"

func GetCachedMedia(cache map[string]string, remoteURL string) (string, bool) {
	if cache == nil {
		return "", false
	}
	key, ok := cache[strings.TrimSpace(remoteURL)]
	return strings.TrimSpace(key), ok
}

// CacheMedia records a remote media URL => S3 key mapping with FIFO eviction.
//
// It returns the (possibly created) cache map and the updated order slice.
func CacheMedia(cache map[string]string, order []string, remoteURL, s3Key string, max int) (map[string]string, []string) {
	remoteURL = strings.TrimSpace(remoteURL)
	s3Key = strings.TrimSpace(s3Key)
	if remoteURL == "" || s3Key == "" {
		return cache, order
	}

	if max <= 0 {
		max = 200
	}

	if cache == nil {
		cache = map[string]string{}
	}
	if _, ok := cache[remoteURL]; ok {
		return cache, order
	}

	cache[remoteURL] = s3Key
	order = append(order, remoteURL)

	if len(order) <= max {
		return cache, order
	}

	overflow := len(order) - max
	for i := 0; i < overflow; i++ {
		delete(cache, order[i])
	}
	order = append([]string(nil), order[overflow:]...)
	return cache, order
}

