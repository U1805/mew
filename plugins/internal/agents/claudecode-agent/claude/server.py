#!/usr/bin/env python3
import base64
import json
import logging
import mimetypes
import os
import re
import selectors
import subprocess
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = os.getenv("CLAUDE_PROXY_HOST", "0.0.0.0")
PORT = int(os.getenv("CLAUDE_PROXY_PORT", "3457"))
BASE_DIR = os.getenv("CLAUDE_PROXY_WORKDIR", "/home/node/workspace/projects")
DEFAULT_TIMEOUT = int(os.getenv("CLAUDE_PROXY_TIMEOUT_SECONDS", "600"))
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


def safe_session_dir(session_id: str) -> str:
    if not session_id:
        session_id = "default"
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", session_id)
    if not safe:
        safe = "default"
    path = os.path.join(BASE_DIR, safe)
    os.makedirs(path, exist_ok=True)
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


def save_uploaded_file(session_id: str, filename: str, content: bytes):
    session_dir = safe_session_dir(session_id)
    files_dir = os.path.join(session_dir, ".files")
    os.makedirs(files_dir, exist_ok=True)
    safe_name = safe_filename(filename)
    abs_path = unique_file_path(files_dir, safe_name)
    with open(abs_path, "wb") as f:
        f.write(content)
    return os.path.basename(abs_path), abs_path


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
    session_id: str,
    timeout_sec: int,
    request_id: str = "-",
):
    workdir = safe_session_dir(session_id)
    cmd = build_claude_cmd(prompt, use_continue)
    mode = "-c -p" if use_continue else "-p"
    start = time.monotonic()
    LOGGER.info(
        "claude.exec.start request_id=%s session_id=%s mode=%s timeout_sec=%d prompt_len=%d prompt_preview=%r",
        request_id,
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
            "claude.exec.timeout request_id=%s session_id=%s mode=%s timeout_sec=%d duration_ms=%d",
            request_id,
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
            "claude.exec.fail request_id=%s session_id=%s mode=%s returncode=%d duration_ms=%d stderr_preview=%r",
            request_id,
            session_id,
            mode,
            returncode,
            duration_ms,
            preview_text(stderr_text),
        )
        raise RuntimeError(msg)

    LOGGER.info(
        "claude.exec.ok request_id=%s session_id=%s mode=%s duration_ms=%d lines=%d",
        request_id,
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
            for line in stream_claude_output(prompt, use_continue, session_id, timeout_sec, request_id):
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
                "claude.exec.exception request_id=%s session_id=%s",
                request_id,
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
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
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
            self._write_json(
                400,
                {"ok": False, "error": f"invalid JSON: {exc}"},
                request_id,
                start,
            )
            return

        session_id = str(req.get("session_id", "default")).strip()
        filename = str(req.get("filename", "")).strip()
        content_b64 = str(req.get("content_base64", "")).strip()

        if not filename:
            self._write_json(400, {"ok": False, "error": "filename is required"}, request_id, start)
            return
        if not content_b64:
            self._write_json(400, {"ok": False, "error": "content_base64 is required"}, request_id, start)
            return

        try:
            content = base64.b64decode(content_b64, validate=True)
        except Exception as exc:
            self._write_json(400, {"ok": False, "error": f"invalid base64 content: {exc}"}, request_id, start)
            return

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

        saved_name, saved_path = save_uploaded_file(session_id, filename, content)
        LOGGER.info(
            "file.uploaded request_id=%s session_id=%s name=%r bytes=%d path=%s",
            request_id,
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
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
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
            self._write_json(
                400,
                {"ok": False, "error": f"invalid JSON: {exc}"},
                request_id,
                start,
            )
            return

        session_id = str(req.get("session_id", "default")).strip()
        file_path = str(req.get("file_path", "")).strip()
        if not file_path:
            self._write_json(400, {"ok": False, "error": "file_path is required"}, request_id, start)
            return

        session_dir = safe_session_dir(session_id)
        session_root = os.path.realpath(session_dir)
        if os.path.isabs(file_path):
            abs_path = os.path.realpath(file_path)
        else:
            abs_path = os.path.realpath(os.path.join(session_dir, file_path))

        allow_prefix = session_root + os.sep
        if abs_path != session_root and not abs_path.startswith(allow_prefix):
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
            "file.downloaded request_id=%s session_id=%s name=%r bytes=%d path=%s content_type=%s",
            request_id,
            session_id,
            filename,
            len(data),
            abs_path,
            content_type or "application/octet-stream",
        )
        self._write_json(
            200,
            {
                "ok": True,
                "filename": filename,
                "content_base64": base64.b64encode(data).decode("ascii"),
            },
            request_id,
            start,
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
