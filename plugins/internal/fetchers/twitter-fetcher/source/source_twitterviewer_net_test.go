package source

import "testing"

func TestParseTwitterViewerTRPCResponse_UsesHandleKey(t *testing.T) {
	t.Parallel()

	body := []byte(`[
		{
			"result": {
				"data": {
					"user": {
						"restId": "1622948883382013955",
						"handle": "hanamiya_nina",
						"name": "花宮初奈",
						"profileImageUrl": "https://pbs.twimg.com/profile_images/a_normal.jpg"
					},
					"users": {
						"1622948883382013955": {
							"restId": "1622948883382013955",
							"handle": "hanamiya_nina",
							"name": "花宮初奈",
							"profileImageUrl": "https://pbs.twimg.com/profile_images/a_normal.jpg"
						}
					},
					"timeline": {
						"items": [
							{
								"type": "tweet",
								"tweet": {
									"restId": "2020150357003784355",
									"userId": "1622948883382013955",
									"fullText": "hello"
								}
							}
						]
					}
				}
			}
		}
	]`)

	tl, err := parseTwitterViewerTRPCResponse(body)
	if err != nil {
		t.Fatalf("parseTwitterViewerTRPCResponse returned error: %v", err)
	}

	if len(tl.Items) != 1 {
		t.Fatalf("items len = %d", len(tl.Items))
	}
	if tl.Items[0].Tweet.UserID != "hanamiya_nina" {
		t.Fatalf("tweet userId = %q", tl.Items[0].Tweet.UserID)
	}
	usr, ok := tl.Users[tl.Items[0].Tweet.UserID]
	if !ok {
		t.Fatalf("user map missing key %q", tl.Items[0].Tweet.UserID)
	}
	if usr.Handle != "hanamiya_nina" {
		t.Fatalf("user handle = %q", usr.Handle)
	}
}
