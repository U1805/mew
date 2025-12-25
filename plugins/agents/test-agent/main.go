package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix:   "[test-agent]",
		ServerName:  "Test Agent",
		Description: "一个最小可用的 Agent Bot 示例：监听 MESSAGE_CREATE，并通过 Socket.IO 上行事件发送消息（echo 指令）。",
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewTestAgentRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
