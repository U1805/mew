package config

import (
	"testing"
	"time"
)

func TestResolveTimezoneLocation_Default(t *testing.T) {
	loc, err := ResolveTimezoneLocation("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, offset := zoneOffsetAt2025Jan1(loc)
	if offset != 8*60*60 {
		t.Fatalf("expected +08:00, got offset=%d", offset)
	}
}

func TestResolveTimezoneLocation_FixedOffsets(t *testing.T) {
	cases := []struct {
		in     string
		offset int
	}{
		{in: "+08:00", offset: 8 * 60 * 60},
		{in: "+0800", offset: 8 * 60 * 60},
		{in: "UTC+8", offset: 8 * 60 * 60},
		{in: "GMT+08:00", offset: 8 * 60 * 60},
		{in: "-07:00", offset: -(7 * 60 * 60)},
	}
	for _, tc := range cases {
		loc, err := ResolveTimezoneLocation(tc.in)
		if err != nil {
			t.Fatalf("in=%q unexpected error: %v", tc.in, err)
		}
		_, offset := zoneOffsetAt2025Jan1(loc)
		if offset != tc.offset {
			t.Fatalf("in=%q expected offset=%d, got offset=%d", tc.in, tc.offset, offset)
		}
	}
}

func TestResolveTimezoneLocation_IANA(t *testing.T) {
	loc, err := ResolveTimezoneLocation("Asia/Shanghai")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, offset := zoneOffsetAt2025Jan1(loc)
	if offset != 8*60*60 {
		t.Fatalf("expected +08:00, got offset=%d", offset)
	}
}

func TestResolveTimezoneLocation_Invalid(t *testing.T) {
	_, err := ResolveTimezoneLocation("UTC+99:00")
	if err == nil {
		t.Fatalf("expected error")
	}
}

func zoneOffsetAt2025Jan1(loc *time.Location) (string, int) {
	tt := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC).In(loc)
	return tt.Zone()
}
