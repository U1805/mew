package core

import "testing"

func TestCleanText(t *testing.T) {
	got := CleanText(" \nHello&nbsp;<b>world</b>\r\n\t  ")
	if got != "Hello world" {
		t.Fatalf("expected %q, got %q", "Hello world", got)
	}
}

func TestFirstImageURLFromHTML_DataSrc(t *testing.T) {
	htmlStr := `<p><img data-src="/a.png"></p>`
	got := FirstImageURLFromHTML(htmlStr, "https://example.com/post")
	if got != "https://example.com/a.png" {
		t.Fatalf("expected %q, got %q", "https://example.com/a.png", got)
	}
}

func TestFirstImageURLFromHTML_Srcset(t *testing.T) {
	htmlStr := `<img src="a.png 1x, b.png 2x">`
	got := FirstImageURLFromHTML(htmlStr, "https://example.com/x/")
	if got != "https://example.com/x/a.png" {
		t.Fatalf("expected %q, got %q", "https://example.com/x/a.png", got)
	}
}

func TestNormalizeMaybeURL_ProtocolRelative(t *testing.T) {
	got := NormalizeMaybeURL("//cdn.example.com/a.png", "http://example.com/")
	if got != "http://cdn.example.com/a.png" {
		t.Fatalf("expected %q, got %q", "http://cdn.example.com/a.png", got)
	}
}
