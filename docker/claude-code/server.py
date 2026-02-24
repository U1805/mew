#!/usr/bin/env python3
import json
import logging
import os
import re
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


def run_claude(
    prompt: str,
    use_continue: bool,
    session_id: str,
    timeout_sec: int,
    request_id: str = "-",
):
    workdir = safe_session_dir(session_id)
    cmd = ["claude", "--dangerously-skip-permissions"]
    if use_continue:
        cmd.append("-c")
    cmd.extend(["-p", prompt])
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

    proc = subprocess.run(
        cmd,
        cwd=workdir,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    duration_ms = int((time.monotonic() - start) * 1000)
    if proc.returncode != 0:
        msg = stderr or stdout or f"claude exited with code {proc.returncode}"
        LOGGER.error(
            "claude.exec.fail request_id=%s session_id=%s mode=%s returncode=%d duration_ms=%d stderr_preview=%r stdout_preview=%r",
            request_id,
            session_id,
            mode,
            proc.returncode,
            duration_ms,
            preview_text(stderr),
            preview_text(stdout),
        )
        raise RuntimeError(msg)
    LOGGER.info(
        "claude.exec.ok request_id=%s session_id=%s mode=%s duration_ms=%d output_len=%d",
        request_id,
        session_id,
        mode,
        duration_ms,
        len(stdout),
    )
    return stdout


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

        try:
            out = run_claude(prompt, use_continue, session_id, timeout_sec, request_id)
            self._write_json(
                200,
                {"ok": True, "output": out, "mode": "-c -p" if use_continue else "-p"},
                request_id,
                start,
            )
        except subprocess.TimeoutExpired:
            LOGGER.error(
                "claude.exec.timeout request_id=%s session_id=%s timeout_sec=%d",
                request_id,
                session_id,
                timeout_sec,
            )
            self._write_json(
                504,
                {"ok": False, "error": "claude execution timed out"},
                request_id,
                start,
            )
        except Exception as exc:
            LOGGER.exception(
                "claude.exec.exception request_id=%s session_id=%s",
                request_id,
                session_id,
            )
            self._write_json(502, {"ok": False, "error": str(exc)}, request_id, start)

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
