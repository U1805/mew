---
sidebar_label: 'Agent Bot'
---

## 💬 构建 Agent Bot

**目标**: 一个简单的 AI 聊天机器人。它监听 WebSocket，当有人 `@` 它时，调用 LLM 生成回复。

为了适应现代 AI 开发，我们将使用 `asyncio` 和 `socketio` 异步库。

### 1. 环境准备
```bash
pip install "python-socketio[asyncio_client]" aiohttp requests
```

### 2. 异步 Bot 核心
```python
# main.py
import socketio
import asyncio
import os
import aiohttp

# 环境变量
MEW_URL = os.getenv("MEW_URL", "http://localhost:3000")
BOT_TOKEN = os.getenv("BOT_TOKEN")

# 初始化异步 Socket.IO 客户端
sio = socketio.AsyncClient()

@sio.event
async def connect():
    print("✅ Connected to Mew Gateway!")

@sio.event
async def message_create(data):
    """
    监听 'message_create' 事件
    data: Message Object
    """
    # 1. 忽略自己的消息
    if data.get("author", {}).get("is_bot"):
        return

    content = data.get("content", "")
    channel_id = data.get("channel_id")

    # 2. 简单的触发词判断
    if "@MewBot" in content:
        print(f"📩 Received mention in {channel_id}")

        # 模拟 AI 思考时间
        await asyncio.sleep(1)
        reply = "喵？人类，你是在召唤我吗？🤖"

        # 3. 调用 REST API 回复
        await send_reply(channel_id, reply)

async def send_reply(channel_id, text):
    async with aiohttp.ClientSession() as session:
        url = f"{MEW_API_BASE}/channels/{channel_id}/messages"
        headers = {"Authorization": f"Bearer {BOT_TOKEN}"}
        payload = {"content": text}

        async with session.post(url, json=payload, headers=headers) as resp:
            if resp.status == 201:
                print("📤 Reply sent successfully")
            else:
                print(f"❌ Failed to send reply: {await resp.text()}")

async def main():
    # 连接并保持运行
    await sio.connect(MEW_URL, auth={"token": BOT_TOKEN})
    await sio.wait()

if __name__ == "__main__":
    asyncio.run(main())
```
