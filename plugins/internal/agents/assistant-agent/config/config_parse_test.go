package config

import "testing"

func TestParseAssistantConfig_Nested(t *testing.T) {
	raw := `{
  "chat_model": {"base_url":"https://x","api_key":"k","model":"m"},
  "user": {"user_interests":"a/b","timezone":"+08:00"},
  "tool": {"exa_api_key":"e"}
}`
	cfg, err := ParseAssistantConfig(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.ChatModel.BaseURL != "https://x" || cfg.ChatModel.APIKey != "k" || cfg.ChatModel.Model != "m" {
		t.Fatalf("chat_model=%+v", cfg.ChatModel)
	}
	if cfg.User.UserInterests != "a/b" || cfg.User.Timezone != "+08:00" {
		t.Fatalf("user=%+v", cfg.User)
	}
	if cfg.Tool.ExaAPIKey != "e" {
		t.Fatalf("tool=%+v", cfg.Tool)
	}
}

func TestParseAssistantConfig_LegacyFlatRejected(t *testing.T) {
	raw := `{
  "base_url":"https://x",
  "api_key":"k",
  "model":"m",
  "user_interests":"a/b",
  "exa_api_key":"e",
  "timezone":"+08:00"
}`
	_, err := ParseAssistantConfig(raw)
	if err == nil {
		t.Fatalf("expected error for legacy flat config")
	}
}
