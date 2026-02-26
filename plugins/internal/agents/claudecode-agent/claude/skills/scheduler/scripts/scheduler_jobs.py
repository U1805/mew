#!/usr/bin/env python3
import argparse
import os
import re
import sys
from datetime import datetime, timedelta
from dataclasses import dataclass
from pathlib import Path
from scheduler_time_parse import normalize_on_calendar, normalize_on_unit_active_sec


SESSION_ROOT_RE = re.compile(r"^/home/node/workspace/projects/([^/]+)/([^/]+)$")


@dataclass
class SessionTarget:
    bot_id: str
    session_id: str
    root: Path
    scheduler_dir: Path


def fail(msg: str, code: int = 1) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(code)


def sanitize_job_name(raw: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", (raw or "").strip())
    if name in {"", ".", ".."}:
        fail("invalid job name")
    return name


def parse_session_target(session_root: str | None) -> SessionTarget:
    if session_root:
        root = Path(session_root).resolve()
    else:
        root = Path.cwd().resolve()

    m = SESSION_ROOT_RE.match(root.as_posix().rstrip("/"))
    if not m:
        fail("current directory is not /home/node/workspace/projects/<botid>/<session_id>; use --session-root to specify")

    bot_id, session_id = m.group(1), m.group(2)
    scheduler_dir = root / ".scheduler"
    return SessionTarget(bot_id=bot_id, session_id=session_id, root=root, scheduler_dir=scheduler_dir)


def parse_ini(path: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    section = ""
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].strip().lower()
            out.setdefault(section, {})
            continue
        if "=" not in line or not section:
            continue
        k, v = line.split("=", 1)
        key = k.strip().lower()
        if key:
            out[section][key] = v.strip()
    return out


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def build_service_content(description: str) -> str:
    desc = (description or "").strip()
    if not desc:
        fail("Description cannot be empty")
    return f"[Unit]\nDescription={desc}\n"


def build_timer_content(on_calendar: str | None, on_unit_active_sec: str | None, randomized_delay_sec: int | None) -> str:
    try:
        on_calendar = normalize_on_calendar(on_calendar or "")
        on_unit_active_sec = normalize_on_unit_active_sec(on_unit_active_sec or "")
    except ValueError as exc:
        fail(str(exc))

    lines = ["[Timer]"]
    if on_calendar:
        lines.append(f"OnCalendar={on_calendar}")
    if on_unit_active_sec:
        lines.append(f"OnUnitActiveSec={on_unit_active_sec}")
    if randomized_delay_sec is not None:
        if randomized_delay_sec < 0:
            fail("RandomizedDelaySec must be >= 0")
        lines.append(f"RandomizedDelaySec={randomized_delay_sec}")
    if len(lines) == 1:
        fail("timer must include OnCalendar or OnUnitActiveSec")
    return "\n".join(lines) + "\n"


def parse_duration_seconds(raw: str) -> float:
    value = (raw or "").strip()
    if not value:
        return 0.0
    if re.fullmatch(r"\d+", value):
        return float(int(value))

    token_re = re.compile(r"(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)")
    pos = 0
    total = 0.0
    factors = {
        "ns": 1e-9,
        "us": 1e-6,
        "µs": 1e-6,
        "ms": 1e-3,
        "s": 1.0,
        "m": 60.0,
        "h": 3600.0,
    }
    for m in token_re.finditer(value):
        if m.start() != pos:
            raise ValueError(f"invalid duration: {value!r}")
        pos = m.end()
        num = float(m.group(1))
        unit = m.group(2)
        total += num * factors[unit]
    if pos != len(value) or total <= 0:
        raise ValueError(f"invalid duration: {value!r}")
    return total


def parse_clock_from_oncalendar(raw: str) -> tuple[int, int, int]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("empty OnCalendar")
    parts = text.split()
    clock = parts[-1]
    fields = clock.split(":")
    if len(fields) not in {2, 3}:
        raise ValueError(f"invalid clock: {raw!r}")
    hour = int(fields[0])
    minute = int(fields[1])
    second = int(fields[2]) if len(fields) == 3 else 0
    return hour, minute, second


def compute_next_run_from_timer(timer_ini: dict[str, dict[str, str]], now: datetime) -> tuple[datetime | None, int]:
    sec = timer_ini.get("timer", {})
    on_cal = (sec.get("oncalendar", "") or "").strip()
    on_interval = (sec.get("onunitactivesec", "") or "").strip()
    randomized_delay_sec = int((sec.get("randomizeddelaysec", "") or "0").strip() or "0")

    candidates: list[datetime] = []
    if on_interval:
        interval_seconds = parse_duration_seconds(on_interval)
        candidates.append(now + timedelta(seconds=interval_seconds))
    if on_cal:
        h, m, s = parse_clock_from_oncalendar(on_cal)
        candidate = now.replace(hour=h, minute=m, second=s, microsecond=0)
        if candidate <= now:
            candidate = candidate + timedelta(days=1)
        candidates.append(candidate)
    if not candidates:
        return None, randomized_delay_sec
    return min(candidates), randomized_delay_sec


def format_dt_with_tz(dt: datetime) -> str:
    value = dt
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.astimezone()
    return value.strftime("%Y-%m-%d %H:%M:%S %z (%Z)")


def print_schedule_preview(job: str, timer_path: Path) -> None:
    now = datetime.now().astimezone()
    timer_ini = parse_ini(timer_path)
    next_run, randomized_delay_sec = compute_next_run_from_timer(timer_ini, now)
    now_text = format_dt_with_tz(now)
    if next_run is None:
        print(f"time now: {now_text}")
        print(f"next run: (unknown) job={job}")
        return
    next_text = format_dt_with_tz(next_run)
    print(f"time now: {now_text}")
    if randomized_delay_sec > 0:
        print(f"next run: {next_text} (+ random 0..{randomized_delay_sec}s) job={job}")
    else:
        print(f"next run: {next_text} job={job}")


def collect_job_names(scheduler_dir: Path) -> list[str]:
    names = set()
    if not scheduler_dir.exists():
        return []
    for p in scheduler_dir.iterdir():
        if not p.is_file():
            continue
        if p.suffix in {".service", ".timer"}:
            names.add(p.stem)
    return sorted(names)


def cmd_create(args: argparse.Namespace) -> None:
    target = parse_session_target(args.session_root)
    job = sanitize_job_name(args.name)
    service_path = target.scheduler_dir / f"{job}.service"
    timer_path = target.scheduler_dir / f"{job}.timer"

    if not args.overwrite and (service_path.exists() or timer_path.exists()):
        fail(f"job already exists: {job}; use --overwrite to replace")

    service = build_service_content(args.description)
    timer = build_timer_content(args.on_calendar, args.on_unit_active_sec, args.randomized_delay_sec)
    write_text(service_path, service)
    write_text(timer_path, timer)
    print(f"created {job} at {target.scheduler_dir}")
    print_schedule_preview(job, timer_path)


def cmd_update(args: argparse.Namespace) -> None:
    target = parse_session_target(args.session_root)
    job = sanitize_job_name(args.name)
    service_path = target.scheduler_dir / f"{job}.service"
    timer_path = target.scheduler_dir / f"{job}.timer"
    if not service_path.exists() or not timer_path.exists():
        fail(f"job not found: {job}")

    service_ini = parse_ini(service_path)
    timer_ini = parse_ini(timer_path)

    description = args.description
    if description is None:
        description = service_ini.get("unit", {}).get("description", "")
    on_calendar = args.on_calendar
    if on_calendar is None:
        on_calendar = timer_ini.get("timer", {}).get("oncalendar", "")
    elif on_calendar == "-":
        on_calendar = ""
    on_unit_active_sec = args.on_unit_active_sec
    if on_unit_active_sec is None:
        on_unit_active_sec = timer_ini.get("timer", {}).get("onunitactivesec", "")
    elif on_unit_active_sec == "-":
        on_unit_active_sec = ""

    randomized_delay_sec = args.randomized_delay_sec
    if randomized_delay_sec is None:
        old = timer_ini.get("timer", {}).get("randomizeddelaysec", "").strip()
        if old:
            try:
                randomized_delay_sec = int(old)
            except ValueError:
                fail(f"invalid existing RandomizedDelaySec value: {old!r}")

    service = build_service_content(description)
    timer = build_timer_content(on_calendar, on_unit_active_sec, randomized_delay_sec)
    write_text(service_path, service)
    write_text(timer_path, timer)
    print(f"updated {job}")
    print_schedule_preview(job, timer_path)


def cmd_list(args: argparse.Namespace) -> None:
    target = parse_session_target(args.session_root)
    if not target.scheduler_dir.exists():
        print("(no jobs)")
        return
    names = collect_job_names(target.scheduler_dir)
    if not names:
        print("(no jobs)")
        return

    for name in names:
        service_path = target.scheduler_dir / f"{name}.service"
        timer_path = target.scheduler_dir / f"{name}.timer"
        service_ini = parse_ini(service_path)
        timer_ini = parse_ini(timer_path)
        desc = service_ini.get("unit", {}).get("description", "")
        on_cal = timer_ini.get("timer", {}).get("oncalendar", "")
        on_interval = timer_ini.get("timer", {}).get("onunitactivesec", "")
        rand_delay = timer_ini.get("timer", {}).get("randomizeddelaysec", "")
        print(f"- {name}")
        print(f"  Description: {desc}")
        if on_cal:
            print(f"  OnCalendar: {on_cal}")
        if on_interval:
            print(f"  OnUnitActiveSec: {on_interval}")
        if rand_delay:
            print(f"  RandomizedDelaySec: {rand_delay}")
        print(f"  Files: {service_path.name}, {timer_path.name}")


def cmd_remove(args: argparse.Namespace) -> None:
    target = parse_session_target(args.session_root)
    job = sanitize_job_name(args.name)
    service_path = target.scheduler_dir / f"{job}.service"
    timer_path = target.scheduler_dir / f"{job}.timer"
    if not service_path.exists() and not timer_path.exists():
        fail(f"job not found: {job}")
    if not args.yes:
        fail("remove requires --yes after user confirmation")

    removed = []
    if service_path.exists():
        service_path.unlink()
        removed.append(service_path.name)
    if timer_path.exists():
        timer_path.unlink()
        removed.append(timer_path.name)
    print(f"removed {job}: {', '.join(removed)}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Manage scheduler job files for claudecode-agent")
    p.add_argument(
        "--session-root",
        help="Override current working session root. Must point to /home/node/workspace/projects/<botid>/<session_id>",
    )

    sub = p.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="Create a new scheduled job (.service + .timer)")
    create.add_argument("--name", required=True, help="Job name (used as <name>.service and <name>.timer)")
    create.add_argument(
        "--description",
        required=True,
        help="Execution prompt for future trigger runs (internal instruction text, not user-facing display text)",
    )
    create.add_argument(
        "--on-calendar",
        help="Calendar schedule time, e.g. '*-*-* 21:00:00', '21:00:00', 'every day at 9pm', '每天晚上9点'",
    )
    create.add_argument(
        "--on-unit-active-sec",
        help="Interval as seconds or duration. Supports 300, 5m, 1h30m, 1 hour, 30 min, 45 sec",
    )
    create.add_argument(
        "--randomized-delay-sec",
        type=int,
        default=0,
        help="Random delay upper bound in seconds (must be >= 0)",
    )
    create.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing job files if they already exist",
    )
    create.set_defaults(func=cmd_create)

    update = sub.add_parser("update", help="Update an existing scheduled job")
    update.add_argument("--name", required=True, help="Existing job name to update")
    update.add_argument(
        "--description",
        help="New execution prompt for future trigger runs (internal instruction text)",
    )
    update.add_argument(
        "--on-calendar",
        help="Set value, or '-' to clear. Supports '*-*-* 21:00:00', 'every day at 9pm', '每天晚上9点'",
    )
    update.add_argument(
        "--on-unit-active-sec",
        help="Set value, or '-' to clear. Supports 300, 5m, 1h30m, 1 hour, 30 min, 45 sec",
    )
    update.add_argument(
        "--randomized-delay-sec",
        type=int,
        help="Set random delay upper bound in seconds (must be >= 0)",
    )
    update.set_defaults(func=cmd_update)

    list_cmd = sub.add_parser("list", help="List scheduled jobs in current session")
    list_cmd.set_defaults(func=cmd_list)

    remove = sub.add_parser("remove", help="Remove a scheduled job (.service + .timer)")
    remove.add_argument("--name", required=True, help="Job name to remove")
    remove.add_argument(
        "--yes",
        action="store_true",
        help="Required confirmation flag for deletion",
    )
    remove.set_defaults(func=cmd_remove)

    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command in {"create", "update"}:
        if not args.on_calendar and not args.on_unit_active_sec and args.command == "create":
            fail("create requires --on-calendar or --on-unit-active-sec")
    args.func(args)


if __name__ == "__main__":
    main()
