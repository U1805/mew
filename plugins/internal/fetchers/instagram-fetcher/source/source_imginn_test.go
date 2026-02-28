package source

import "testing"

func TestParseImginnUserPageHTML(t *testing.T) {
	html := `
<html><body>
  <div class="userinfo" data-id="6933703215" data-name="ringring_rin" data-verified="true">
    <div class="img"><img src="https://img.example.com/avatar.jpg"></div>
    <div class="name"><h1>来栖りん Rin Kurusu</h1></div>
    <div class="username"><h2>@ringring_rin</h2></div>
    <div class="bio">Official fanclub🐬Cruise</div>
    <div class="counter">
      <div class="counter-item"><div class="num">535</div><span>posts</span></div>
      <div class="counter-item"><div class="num">197.5K</div><span>followers</span></div>
      <div class="counter-item"><div class="num">77</div><span>following</span></div>
    </div>
  </div>
  <div class="items">
    <div class="item">
      <div class="img">
        <a href="/p/DVDrXHCE2Z2/"><img src="https://img.example.com/thumb1.jpg"></a>
      </div>
      <div class="stats">
        <div class="likes"><span>123</span></div>
        <div class="comments"><span>5</span></div>
      </div>
      <div class="action">
        <a class="download" aria-label="download caption one images or videos"
           href="https://cdn.example.com/one.jpg?dl=1"
           data-srcs="https://cdn.example.com/one.jpg,https://cdn.example.com/two.jpg">Download</a>
      </div>
    </div>
    <div class="item">
      <div class="img">
        <a href="/reel/REEL123/"><img src="https://img.example.com/thumb2.jpg"></a>
        <i class="icon icon-video"></i>
      </div>
      <div class="stats">
        <div class="likes"><span>3.5K</span></div>
        <div class="comments"><span>12</span></div>
      </div>
      <div class="action">
        <a class="download" aria-label="download reel caption images or videos"
           href="https://cdn.example.com/video.mp4?dl=1">Download</a>
      </div>
    </div>
  </div>
</body></html>`

	stories, profile, err := parseImginnUserPageHTML(html, "ringring_rin")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	if profile == nil {
		t.Fatalf("profile is nil")
	}
	if profile.Username != "ringring_rin" {
		t.Fatalf("unexpected username: %q", profile.Username)
	}
	if profile.ID != "6933703215" {
		t.Fatalf("unexpected profile id: %q", profile.ID)
	}
	if profile.FullName != "来栖りん Rin Kurusu" {
		t.Fatalf("unexpected full name: %q", profile.FullName)
	}
	if profile.EdgeFollowedBy != 197500 {
		t.Fatalf("unexpected followers: %d", profile.EdgeFollowedBy)
	}
	if profile.EdgeFollow != 77 {
		t.Fatalf("unexpected following: %d", profile.EdgeFollow)
	}
	if profile.EdgesCount != 535 {
		t.Fatalf("unexpected posts count: %d", profile.EdgesCount)
	}

	if len(stories) != 3 {
		t.Fatalf("unexpected story count: %d", len(stories))
	}

	if stories[0].ID != "DVDrXHCE2Z2_0" || stories[1].ID != "DVDrXHCE2Z2_1" {
		t.Fatalf("unexpected carousel ids: %q %q", stories[0].ID, stories[1].ID)
	}
	if stories[0].Content != "caption one" || stories[1].Content != "caption one" {
		t.Fatalf("unexpected caption: %q / %q", stories[0].Content, stories[1].Content)
	}
	if stories[0].LikeCount != 123 || stories[0].CommentCount != 5 {
		t.Fatalf("unexpected stats: likes=%d comments=%d", stories[0].LikeCount, stories[0].CommentCount)
	}

	if stories[2].ID != "REEL123_0" {
		t.Fatalf("unexpected reel id: %q", stories[2].ID)
	}
	if stories[2].IsVideo == nil || !*stories[2].IsVideo {
		t.Fatalf("expected video story")
	}
	if stories[2].VideoURL == "" {
		t.Fatalf("expected video url")
	}
	if stories[2].LikeCount != 3500 {
		t.Fatalf("unexpected reel likes: %d", stories[2].LikeCount)
	}
}

func TestExtractCaptionFromImgAlt(t *testing.T) {
	got := extractCaptionFromImgAlt("half moon by @ringring_rin at June 1st", "ringring_rin")
	if got != "half moon" {
		t.Fatalf("unexpected caption from alt: %q", got)
	}
}
