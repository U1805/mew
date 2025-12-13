---
description: "gitmoji"
---

Generate commit messages following Gitmoji conventions based on code changes.

## Format
```
:emoji_code: <message>

<detailed description>
```

## Common Emoji Code Selection Table

**Bug Fixes:**
- `:bug:` Fix bugs
- `:ambulance:` Critical hotfix
- `:lock:` Fix security issues

**New Features:**
- `:sparkles:` New features
- `:zap:` Performance improvements
- `:lipstick:` UI/style updates

**Documentation & Configuration:**
- `:memo:` Update documentation
- `:wrench:` Configuration files
- `:hammer:` Development scripts

**Others:**
- `:microscope:` Testing related
- `:construction:` Work in progress
- `:fire:` Remove content
- `:rocket:` Deploy/release

## Writing Requirements

1. **Message**: Start with a verb, within 50 characters (e.g., \"Fix user login bug\")
2. **Detailed description**: Explain the reason and impact of changes
3. **Choose appropriate emoji code**: Select based on the main type of change

## Example
```
:sparkles: Add Google OAuth login functionality

Implement OAuth2 flow to allow users to log in with their Google accounts. This reduces registration steps and provides a more secure authentication method.

Includes token validation, user information mapping, and session management features.
```

---
**Usage Instructions**: Please tell me about your code changes, and I will generate the corresponding commit message.



总结一下更新帮我写一个 git commit message (english), 在根目录新建一个md文件写入其中。

如果要求提交则需要在 commit 时记得排除这个临时文件