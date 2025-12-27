package config

import "testing"

func TestValidateHTTPURL(t *testing.T) {
	cases := []struct {
		raw     string
		wantErr bool
	}{
		{"https://example.com", false},
		{"http://example.com/path", false},
		{" ftp://example.com ", true},
		{"http:///path", true},
		{"", true},
		{"   ", true},
	}
	for _, tc := range cases {
		err := ValidateHTTPURL(tc.raw)
		if tc.wantErr && err == nil {
			t.Fatalf("ValidateHTTPURL(%q): expected error", tc.raw)
		}
		if !tc.wantErr && err != nil {
			t.Fatalf("ValidateHTTPURL(%q): unexpected error: %v", tc.raw, err)
		}
	}
}
