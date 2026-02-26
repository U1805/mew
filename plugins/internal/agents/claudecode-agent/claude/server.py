#!/usr/bin/env python3
import json
import logging
import mimetypes
import os
import re
import selectors
import subprocess
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = os.getenv("CLAUDE_PROXY_HOST", "0.0.0.0")
PORT = int(os.getenv("CLAUDE_PROXY_PORT", "3457"))
BASE_DIR = os.getenv("CLAUDE_PROXY_WORKDIR", "/home/node/workspace/projects")
DEFAULT_TIMEOUT = int(os.getenv("CLAUDE_PROXY_TIMEOUT_SECONDS", "3600"))
LOG_LEVEL = os.getenv("CLAUDE_PROXY_LOG_LEVEL", "INFO").upper()
PROMPT_PREVIEW_CHARS = int(os.getenv("CLAUDE_PROXY_PROMPT_PREVIEW_CHARS", "120"))
MAX_FILE_BYTES = int(os.getenv("CLAUDE_PROXY_MAX_FILE_BYTES", str(20 * 1024 * 1024)))


def _setup_logger():
    level = getattr(logging, LOG_LEVEL, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [claude-proxy] %(message)s",
    )
    return logging.getLogger("claude-proxy")


LOGGER = _setup_logger()


def default_claude_md_content(session_dir: str) -> str:
    abs_session_dir = os.path.realpath(session_dir)
    return (
        f"Current Working Directory: cwd={abs_session_dir}\n"
        "Current terminal environment is bash in Debian(bookworm)\n"
    )


def ensure_session_layout(session_dir: str):
    files_dir = os.path.join(session_dir, ".files")
    skills_dir = os.path.join(session_dir, ".claude", "skills")
    claude_md = os.path.join(session_dir, "CLAUDE.md")

    os.makedirs(files_dir, exist_ok=True)
    os.makedirs(skills_dir, exist_ok=True)

    if os.path.isdir(claude_md):
        raise RuntimeError(f"CLAUDE.md path is a directory: {claude_md}")
    if not os.path.exists(claude_md):
        with open(claude_md, "w", encoding="utf-8") as f:
            f.write(default_claude_md_content(session_dir))


def safe_id(raw_value: str, fallback: str = "default") -> str:
    value = (raw_value or "").strip()
    if not value:
        value = fallback
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", value)
    if not safe:
        safe = fallback
    return safe


def safe_session_dir(bot_id: str, session_id: str) -> str:
    safe_bot = safe_id(bot_id, "default")
    safe_session = safe_id(session_id, "default")
    path = os.path.join(BASE_DIR, safe_bot, safe_session)
    os.makedirs(path, exist_ok=True)
    ensure_session_layout(path)
    return path


def preview_text(text: str, limit: int = PROMPT_PREVIEW_CHARS) -> str:
    t = (text or "").replace("\r", "\\r").replace("\n", "\\n")
    if len(t) <= limit:
        return t
    return t[:limit] + "..."


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        s = value.strip().lower()
        if s in {"1", "true", "yes", "y", "on"}:
            return True
        if s in {"0", "false", "no", "n", "off", ""}:
            return False
    return bool(value)


def safe_filename(filename: str, fallback: str = "file") -> str:
    raw = os.path.basename((filename or "").strip())
    stem_raw, ext_raw = os.path.splitext(raw)

    stem = re.sub(r"[^\w.-]", "_", stem_raw, flags=re.UNICODE).strip(". ")
    ext = re.sub(r"[^\w.-]", "", ext_raw, flags=re.UNICODE)
    if ext and not ext.startswith("."):
        ext = "." + ext

    if not stem:
        stem = fallback

    name = stem + ext
    if len(name) > 180:
        max_stem = max(1, 180 - len(ext))
        name = stem[:max_stem] + ext
    return name


def unique_file_path(dir_path: str, filename: str) -> str:
    stem, ext = os.path.splitext(filename)
    candidate = os.path.join(dir_path, filename)
    idx = 1
    while os.path.exists(candidate):
        candidate = os.path.join(dir_path, f"{stem}_{idx}{ext}")
        idx += 1
    return candidate


def save_uploaded_file(bot_id: str, session_id: str, filename: str, content: bytes):
    session_dir = safe_session_dir(bot_id, session_id)
    files_dir = os.path.join(session_dir, ".files")
    os.makedirs(files_dir, exist_ok=True)
    safe_name = safe_filename(filename)
    abs_path = unique_file_path(files_dir, safe_name)
    with open(abs_path, "wb") as f:
        f.write(content)
    return os.path.basename(abs_path), abs_path


def normalize_download_path(raw_path: str) -> str:
    """
    Normalize incoming download path value from `X-File-Path`.

    Supported input formats:
    - Absolute local path:
      - /home/node/workspace/projects/<session>/.files/a.png
    - Session-relative path:
      - .files/a.png
      - ./.files/a.png
      - downloads/report.md
    - file URI (local):
      - file:///home/node/workspace/projects/<session>/.files/a.png
      - file://localhost/home/node/workspace/projects/<session>/.files/a.png
    - Malformed-but-common local file URI (accepted for compatibility):
      - file://home/node/workspace/projects/<session>/.files/a.png
      - file://.files/a.png

    Notes:
    - Non-local file URI hosts are not trusted as local paths.
    - Scope enforcement is handled later by `resolve_download_abs_path`.
    """
    value = (raw_path or "").strip()
    if not value:
        return ""

    if value.lower().startswith("file://"):
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme.lower() != "file":
            return value
        host = (parsed.netloc or "").strip().lower()
        if host not in {"", "localhost"}:
            # Tolerate malformed local URIs, e.g.:
            # - file://home/node/workspace/a.txt
            # - file://.files/a.png
            path = urllib.parse.unquote(parsed.path or "")
            merged = "/" + host + path
            return merged
        path = urllib.parse.unquote(parsed.path or "")
        if not path:
            return ""
        return path

    return value


def in_session_scope(abs_path: str, session_root: str) -> bool:
    allow_prefix = session_root + os.sep
    return abs_path == session_root or abs_path.startswith(allow_prefix)


def resolve_download_abs_path(session_dir: str, file_path: str) -> tuple[str, bool]:
    """
    Resolve requested file path to an absolute path under the session root.

    Compatibility behavior:
    - Relative path is resolved as: {session_dir}/{relative}
    - Absolute path is tried directly first.
    - For absolute paths that look like "session-relative with leading slash"
      (for example "/.files/a.png" or "/downloads/a.txt"), it also tries:
      {session_dir}/{path_without_leading_slash}

    Returns:
    - (abs_path, True)  -> accepted and inside current session scope
    - (best_effort_path, False) -> resolved but out of scope
    - ("", False) -> invalid/empty input
    """
    session_root = os.path.realpath(session_dir)
    raw = (file_path or "").strip().strip('"').strip("'")
    if not raw:
        return "", False

    candidates = []
    if os.path.isabs(raw):
        candidates.append(os.path.realpath(raw))
        rel = raw.lstrip("/")
        if rel:
            candidates.append(os.path.realpath(os.path.join(session_dir, rel)))
    else:
        candidates.append(os.path.realpath(os.path.join(session_dir, raw)))

    seen = set()
    uniq = []
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        uniq.append(c)

    for c in uniq:
        if in_session_scope(c, session_root):
            return c, True
    if uniq:
        return uniq[0], False
    return "", False


def build_claude_cmd(prompt: str, use_continue: bool):
    cmd = [
        "claude",
        "--dangerously-skip-permissions",
        "--verbose",
        "--include-partial-messages",
        "--output-format",
        "stream-json",
    ]
    if use_continue:
        cmd.append("-c")
    cmd.extend(["-p", prompt])
    return cmd


def stream_claude_output(
    prompt: str,
    use_continue: bool,
    bot_id: str,
    session_id: str,
    timeout_sec: int,
    request_id: str = "-",
):
    workdir = safe_session_dir(bot_id, session_id)
    cmd = build_claude_cmd(prompt, use_continue)
    mode = "-c -p" if use_continue else "-p"
    start = time.monotonic()
    LOGGER.info(
        "claude.exec.start request_id=%s bot_id=%s session_id=%s mode=%s timeout_sec=%d prompt_len=%d prompt_preview=%r",
        request_id,
        bot_id,
        session_id,
        mode,
        timeout_sec,
        len(prompt),
        preview_text(prompt),
    )

    proc = subprocess.Popen(
        cmd,
        cwd=workdir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    sel = selectors.DefaultSelector()
    if proc.stdout is not None:
        sel.register(proc.stdout, selectors.EVENT_READ, data="stdout")
    if proc.stderr is not None:
        sel.register(proc.stderr, selectors.EVENT_READ, data="stderr")

    deadline = time.monotonic() + timeout_sec
    stderr_lines = []
    line_count = 0

    try:
        while sel.get_map():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(cmd, timeout_sec)

            events = sel.select(timeout=min(0.5, remaining))
            if not events:
                continue

            for key, _ in events:
                stream = key.fileobj
                stream_type = key.data
                line = stream.readline()
                if line == "":
                    try:
                        sel.unregister(stream)
                    except Exception:
                        pass
                    continue

                text = line.rstrip("\r\n")
                if text == "":
                    continue
                if stream_type == "stdout":
                    line_count += 1
                    yield text
                else:
                    stderr_lines.append(text)
    except subprocess.TimeoutExpired:
        if proc.poll() is None:
            proc.kill()
        try:
            proc.wait(timeout=3)
        except Exception:
            pass
        duration_ms = int((time.monotonic() - start) * 1000)
        LOGGER.error(
            "claude.exec.timeout request_id=%s bot_id=%s session_id=%s mode=%s timeout_sec=%d duration_ms=%d",
            request_id,
            bot_id,
            session_id,
            mode,
            timeout_sec,
            duration_ms,
        )
        raise
    finally:
        sel.close()

    returncode = proc.wait()
    duration_ms = int((time.monotonic() - start) * 1000)
    stderr_text = "\n".join(stderr_lines).strip()
    if returncode != 0:
        msg = stderr_text or f"claude exited with code {returncode}"
        LOGGER.error(
            "claude.exec.fail request_id=%s bot_id=%s session_id=%s mode=%s returncode=%d duration_ms=%d stderr_preview=%r",
            request_id,
            bot_id,
            session_id,
            mode,
            returncode,
            duration_ms,
            preview_text(stderr_text),
        )
        raise RuntimeError(msg)

    LOGGER.info(
        "claude.exec.ok request_id=%s bot_id=%s session_id=%s mode=%s duration_ms=%d lines=%d",
        request_id,
        bot_id,
        session_id,
        mode,
        duration_ms,
        line_count,
    )


class Handler(BaseHTTPRequestHandler):
    def _request_id(self) -> str:
        return uuid.uuid4().hex[:8]

    def _client_ip(self) -> str:
        if not self.client_address:
            return "-"
        return str(self.client_address[0])

    def _write_json(self, code: int, payload, request_id: str, start_time: float):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self._log_response(code, request_id, start_time)

    def _write_bytes(
        self,
        code: int,
        payload: bytes,
        content_type: str,
        request_id: str,
        start_time: float,
        extra_headers: dict = None,
    ):
        body = payload or b""
        self.send_response(code)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(str(k), str(v))
        self.end_headers()
        self.wfile.write(body)
        self._log_response(code, request_id, start_time)

    def _log_response(self, code: int, request_id: str, start_time: float):
        duration_ms = int((time.monotonic() - start_time) * 1000)
        LOGGER.info(
            "http.response request_id=%s method=%s path=%s status=%d duration_ms=%d client_ip=%s",
            request_id,
            self.command,
            self.path,
            code,
            duration_ms,
            self._client_ip(),
        )

    def _start_ndjson_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

    def _write_ndjson_line(self, line: str):
        payload = (line + "\n").encode("utf-8")
        self.wfile.write(payload)
        self.wfile.flush()

    def _write_ndjson_obj(self, obj: dict):
        self._write_ndjson_line(json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        request_id = self._request_id()
        start = time.monotonic()
        LOGGER.info(
            "http.request request_id=%s method=%s path=%s client_ip=%s",
            request_id,
            self.command,
            self.path,
            self._client_ip(),
        )
        if self.path == "/healthz":
            self._write_json(200, {"ok": True}, request_id, start)
            return
        self._write_json(404, {"ok": False, "error": "not found"}, request_id, start)

    def do_POST(self):
        request_id = self._request_id()
        start = time.monotonic()
        LOGGER.info(
            "http.request request_id=%s method=%s path=%s client_ip=%s",
            request_id,
            self.command,
            self.path,
            self._client_ip(),
        )
        if self.path == "/files/download":
            self.handle_download_file(request_id, start)
            return

        if self.path == "/files/upload":
            self.handle_upload_file(request_id, start)
            return

        if self.path != "/chat":
            self._write_json(404, {"ok": False, "error": "not found"}, request_id, start)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                LOGGER.warning(
                    "http.bad_request request_id=%s reason=%s",
                    request_id,
                    "empty request body",
                )
                self._write_json(
                    400,
                    {"ok": False, "error": "empty request body"},
                    request_id,
                    start,
                )
                return
            raw = self.rfile.read(length)
            req = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            LOGGER.warning(
                "http.bad_request request_id=%s reason=%r",
                request_id,
                f"invalid JSON: {exc}",
            )
            self._write_json(
                400,
                {"ok": False, "error": f"invalid JSON: {exc}"},
                request_id,
                start,
            )
            return

        prompt = str(req.get("prompt", "")).strip()
        if not prompt:
            LOGGER.warning(
                "http.bad_request request_id=%s reason=%s",
                request_id,
                "prompt is required",
            )
            self._write_json(
                400,
                {"ok": False, "error": "prompt is required"},
                request_id,
                start,
            )
            return
        use_continue = parse_bool(req.get("continue", False))
        bot_id = str(req.get("bot_id", "default"))
        session_id = str(req.get("session_id", "default"))
        try:
            timeout_sec = int(req.get("timeout_seconds", DEFAULT_TIMEOUT))
        except (TypeError, ValueError):
            LOGGER.warning(
                "http.bad_request request_id=%s reason=%s value=%r",
                request_id,
                "invalid timeout_seconds",
                req.get("timeout_seconds"),
            )
            self._write_json(
                400,
                {"ok": False, "error": "invalid timeout_seconds"},
                request_id,
                start,
            )
            return
        if timeout_sec <= 0:
            timeout_sec = DEFAULT_TIMEOUT

        self._start_ndjson_stream()
        line_count = 0
        try:
            for line in stream_claude_output(prompt, use_continue, bot_id, session_id, timeout_sec, request_id):
                line_count += 1
                self._write_ndjson_line(line)
        except subprocess.TimeoutExpired:
            self._write_ndjson_obj(
                {
                    "type": "proxy_error",
                    "request_id": request_id,
                    "error": "claude execution timed out",
                }
            )
        except Exception as exc:
            LOGGER.exception(
                "claude.exec.exception request_id=%s bot_id=%s session_id=%s",
                request_id,
                bot_id,
                session_id,
            )
            self._write_ndjson_obj(
                {
                    "type": "proxy_error",
                    "request_id": request_id,
                    "error": str(exc),
                }
            )
        finally:
            duration_ms = int((time.monotonic() - start) * 1000)
            LOGGER.info(
                "http.response request_id=%s method=%s path=%s status=200 duration_ms=%d client_ip=%s lines=%d",
                request_id,
                self.command,
                self.path,
                duration_ms,
                self._client_ip(),
                line_count,
            )

    def handle_upload_file(self, request_id: str, start: float):
        bot_id = urllib.parse.unquote(str(self.headers.get("X-Bot-Id", "default")).strip())
        session_id = urllib.parse.unquote(str(self.headers.get("X-Session-Id", "default")).strip())
        filename = urllib.parse.unquote(str(self.headers.get("X-Filename", "")).strip())

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            self._write_json(
                400,
                {"ok": False, "error": "empty request body"},
                request_id,
                start,
            )
            return
        if not filename:
            self._write_json(400, {"ok": False, "error": "X-Filename header is required"}, request_id, start)
            return

        content = self.rfile.read(length)

        if len(content) == 0:
            self._write_json(400, {"ok": False, "error": "empty file content"}, request_id, start)
            return
        if len(content) > MAX_FILE_BYTES:
            self._write_json(
                413,
                {"ok": False, "error": f"file too large (> {MAX_FILE_BYTES} bytes)"},
                request_id,
                start,
            )
            return

        saved_name, saved_path = save_uploaded_file(bot_id, session_id, filename, content)
        LOGGER.info(
            "file.uploaded request_id=%s bot_id=%s session_id=%s name=%r bytes=%d path=%s",
            request_id,
            bot_id,
            session_id,
            saved_name,
            len(content),
            saved_path,
        )
        self._write_json(
            200,
            {"ok": True, "filename": saved_name, "file_path": saved_path},
            request_id,
            start,
        )

    def handle_download_file(self, request_id: str, start: float):
        bot_id = urllib.parse.unquote(str(self.headers.get("X-Bot-Id", "default")).strip())
        session_id = urllib.parse.unquote(str(self.headers.get("X-Session-Id", "default")).strip())
        file_path = normalize_download_path(
            urllib.parse.unquote(str(self.headers.get("X-File-Path", "")).strip())
        )
        if not file_path:
            self._write_json(400, {"ok": False, "error": "X-File-Path header is required"}, request_id, start)
            return

        session_dir = safe_session_dir(bot_id, session_id)
        abs_path, in_scope = resolve_download_abs_path(session_dir, file_path)
        if not in_scope:
            self._write_json(403, {"ok": False, "error": "file path out of session scope"}, request_id, start)
            return
        if not os.path.isfile(abs_path):
            self._write_json(404, {"ok": False, "error": "file not found"}, request_id, start)
            return

        size = os.path.getsize(abs_path)
        if size > MAX_FILE_BYTES:
            self._write_json(
                413,
                {"ok": False, "error": f"file too large (> {MAX_FILE_BYTES} bytes)"},
                request_id,
                start,
            )
            return

        with open(abs_path, "rb") as f:
            data = f.read()
        filename = os.path.basename(abs_path)
        content_type, _ = mimetypes.guess_type(filename)
        LOGGER.info(
            "file.downloaded request_id=%s bot_id=%s session_id=%s name=%r bytes=%d path=%s content_type=%s",
            request_id,
            bot_id,
            session_id,
            filename,
            len(data),
            abs_path,
            content_type or "application/octet-stream",
        )
        quoted_name = urllib.parse.quote(filename, safe="")
        self._write_bytes(
            200,
            data,
            content_type or "application/octet-stream",
            request_id,
            start,
            extra_headers={
                "X-Claude-Filename": quoted_name,
                "Content-Disposition": f"attachment; filename*=UTF-8''{quoted_name}",
            },
        )

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    os.makedirs(BASE_DIR, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    LOGGER.info(
        "server.start host=%s port=%d base_dir=%s timeout_default_sec=%d log_level=%s",
        HOST,
        PORT,
        BASE_DIR,
        DEFAULT_TIMEOUT,
        LOG_LEVEL,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("server.stop reason=keyboard_interrupt")
    finally:
        server.server_close()
        LOGGER.info("server.closed")
