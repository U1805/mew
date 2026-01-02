package mew

import "time"

const (
	defaultPageSize = 100
	defaultMaxPages = 20

	defaultSessionGap         = 30 * time.Minute
	defaultMaxSessionMessages = 40

	maxUserActivityWindowDays = 30
)

var userActivityWindows = []int{1, 7, 30}
