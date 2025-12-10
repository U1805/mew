---
description: "gitmoji"
---

Generate commit messages following Gitmoji conventions based on code changes.\n\n## Format\n```\n:emoji_code: <message>\n\n<detailed description>\n```\n\n## Common Emoji Code Selection Table\n\n**Bug Fixes:**\n- `:bug:` Fix bugs\n- `:ambulance:` Critical hotfix\n- `:lock:` Fix security issues\n\n**New Features:**\n- `:sparkles:` New features\n- `:zap:` Performance improvements\n- `:lipstick:` UI/style updates\n\n**Documentation & Configuration:**\n- `:memo:` Update documentation\n- `:wrench:` Configuration files\n- `:hammer:` Development scripts\n\n**Others:**\n- `:microscope:` Testing related\n- `:construction:` Work in progress\n- `:fire:` Remove content\n- `:rocket:` Deploy/release\n\n## Writing Requirements\n\n1. **Message**: Start with a verb, within 50 characters (e.g., \"Fix user login bug\")\n2. **Detailed description**: Explain the reason and impact of changes\n3. **Choose appropriate emoji code**: Select based on the main type of change\n\n## Example\n```\n:sparkles: Add Google OAuth login functionality\n\nImplement OAuth2 flow to allow users to log in with their Google accounts. This reduces registration steps and provides a more secure authentication method.\n\nIncludes token validation, user information mapping, and session management features.\n```\n\n---\n**Usage Instructions**: Please tell me about your code changes, and I will generate the corresponding commit message.

总结一下更新帮我写一个 git commit message (english), 在根目录新建一个md文件写入其中。

如果要求提交则需要在 commit 时记得排除这个临时文件