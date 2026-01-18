package source

import (
	"encoding/json"
	"strconv"
	"strings"
)

// FlexString is a tolerant string type that accepts JSON string/number/bool/null.
// Bilibili's API sometimes returns `null` for title-like fields.
type FlexString string

func (s *FlexString) UnmarshalJSON(b []byte) error {
	raw := strings.TrimSpace(string(b))
	if raw == "" || raw == "null" {
		*s = ""
		return nil
	}
	if raw[0] == '"' {
		var v string
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			return err
		}
		*s = FlexString(v)
		return nil
	}
	*s = FlexString(raw)
	return nil
}

// FlexInt64 is a tolerant int64 type that accepts JSON string/number/null.
// Bilibili's API sometimes returns numeric fields (e.g. `pub_ts`) as strings.
type FlexInt64 int64

func (n *FlexInt64) UnmarshalJSON(b []byte) error {
	raw := strings.TrimSpace(string(b))
	if raw == "" || raw == "null" {
		*n = 0
		return nil
	}

	if raw[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		raw = strings.TrimSpace(s)
		if raw == "" {
			*n = 0
			return nil
		}
	}

	// Defensive: accept "123.0" or scientific notation if it ever shows up.
	if strings.ContainsAny(raw, ".eE") {
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return err
		}
		*n = FlexInt64(int64(f))
		return nil
	}

	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return err
	}
	*n = FlexInt64(v)
	return nil
}

type APIResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Items []APIItem `json:"items"`
	} `json:"data"`
}

type APIItem struct {
	IDStr   string `json:"id_str"`
	Type    string `json:"type"`
	Modules struct {
		ModuleAuthor  ModuleAuthor  `json:"module_author"`
		ModuleDynamic ModuleDynamic `json:"module_dynamic"`
	} `json:"modules"`
	Orig *APIItem `json:"orig,omitempty"`
}

type ModuleAuthor struct {
	Type   string    `json:"type"`
	ID     int64     `json:"mid"`
	Name   string    `json:"name"`
	Face   string    `json:"face"`
	PubTS  FlexInt64 `json:"pub_ts"`
	PubLoc string    `json:"pub_loc_text"`
}

type ModuleDynamic struct {
	Desc       *RichText      `json:"desc,omitempty"`
	Major      *Major         `json:"major,omitempty"`
	Additional map[string]any `json:"additional,omitempty"`
}

type Major struct {
	Type      string     `json:"type"`
	Archive   *Archive   `json:"archive,omitempty"`
	Opus      *Opus      `json:"opus,omitempty"`
	Draw      *Draw      `json:"draw,omitempty"`
	LiveRcmd  *LiveRcmd  `json:"live_rcmd,omitempty"`
	Common    *Common    `json:"common,omitempty"`
	PGC       *PGC       `json:"pgc,omitempty"`
	Music     *Music     `json:"music,omitempty"`
	Live      *Live      `json:"live,omitempty"`
	Medialist *Medialist `json:"medialist,omitempty"`
	UGCSeason *UGCSeason `json:"ugc_season,omitempty"`
	Courses   *Courses   `json:"courses,omitempty"`
}

type Archive struct {
	BVID    string     `json:"bvid"`
	Title   FlexString `json:"title"`
	Cover   FlexString `json:"cover"`
	Desc    FlexString `json:"desc"`
	JumpURL FlexString `json:"jump_url"`
}

type Opus struct {
	Title   FlexString `json:"title"`
	Summary RichText   `json:"summary"`
	Pics    []Picture  `json:"pics"`
	JumpURL FlexString `json:"jump_url"`
}

type Draw struct {
	ID          FlexInt64  `json:"id"`
	Title       FlexString `json:"title"`
	JumpURL     FlexString `json:"jump_url"`
	Description FlexString `json:"description"`
	Items       []DrawItem `json:"items"`
	Pictures    []DrawItem `json:"pictures"`
}

type DrawItem struct {
	Src    FlexString `json:"src"`
	URL    FlexString `json:"url"`
	ImgSrc FlexString `json:"img_src"`
	Width  FlexString `json:"width"`
	Height FlexString `json:"height"`
}

type LiveRcmd struct {
	Content string `json:"content"`
}

type LiveContent struct {
	LivePlayInfo struct {
		Title  string `json:"title"`
		Cover  string `json:"cover"`
		RoomID int64  `json:"room_id"`
		Link   string `json:"link"`
	} `json:"live_play_info"`
}

type Common struct {
	Title   FlexString `json:"title"`
	Desc    FlexString `json:"desc"`
	Cover   FlexString `json:"cover"`
	JumpURL FlexString `json:"jump_url"`
}

type PGC struct {
	Title       FlexString `json:"title"`
	Cover       FlexString `json:"cover"`
	Desc        FlexString `json:"desc"`
	JumpURL     FlexString `json:"jump_url"`
	SeasonID    FlexString `json:"season_id"`
	EpisodeID   FlexString `json:"ep_id"`
	SeasonTitle FlexString `json:"season_title"`
	SubTitle    FlexString `json:"sub_title"`
}

type Music struct {
	ID      FlexString `json:"id"`
	Title   FlexString `json:"title"`
	Cover   FlexString `json:"cover"`
	Intro   FlexString `json:"intro"`
	Author  FlexString `json:"author"`
	Schema  FlexString `json:"schema"`
	JumpURL FlexString `json:"jump_url"`
}

type Live struct {
	Title   FlexString `json:"title"`
	Cover   FlexString `json:"cover"`
	Desc    FlexString `json:"desc"`
	JumpURL FlexString `json:"jump_url"`
	RoomID  FlexString `json:"room_id"`
}

type Medialist struct {
	Title   FlexString `json:"title"`
	Cover   FlexString `json:"cover"`
	Desc    FlexString `json:"desc"`
	JumpURL FlexString `json:"jump_url"`
	ID      FlexString `json:"id"`
}

type UGCSeason struct {
	Title    FlexString `json:"title"`
	Cover    FlexString `json:"cover"`
	Desc     FlexString `json:"desc"`
	JumpURL  FlexString `json:"jump_url"`
	SeasonID FlexString `json:"season_id"`
}

type Courses struct {
	Title   FlexString `json:"title"`
	Cover   FlexString `json:"cover"`
	Desc    FlexString `json:"desc"`
	JumpURL FlexString `json:"jump_url"`
	ID      FlexString `json:"id"`
}

type Picture struct {
	URL string `json:"url"`
}

type RichText struct {
	Text          string         `json:"text"`
	RichTextNodes []RichTextNode `json:"rich_text_nodes"`
}

type RichTextNode struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	OrigText string `json:"orig_text,omitempty"`
	Emoji    *struct {
		Text    string `json:"text"`
		IconURL string `json:"icon_url"`
	} `json:"emoji,omitempty"`
}
