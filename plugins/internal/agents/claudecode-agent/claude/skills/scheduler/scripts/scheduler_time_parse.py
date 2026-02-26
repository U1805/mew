#!/usr/bin/env python3
import re
from datetime import datetime, timedelta
from typing import Optional


DURATION_RE = re.compile(r"^(\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+$")
DURATION_TOKEN_RE = re.compile(r"(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)")
EN_AMPM_CLOCK_RE = re.compile(r"\b(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)\b", re.IGNORECASE)
ABS_DATETIME_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$")
ABS_DATETIME_WITH_WEEKDAY_RE = re.compile(
    r"^(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\s+"
    r"(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$",
    re.IGNORECASE,
)
REL_IN_RE = re.compile(r"^\s*in\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$", re.IGNORECASE)
REL_NOW_PLUS_RE = re.compile(r"^\s*now\s*\+\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$", re.IGNORECASE)
REL_ZH_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(秒|分钟|分|小时|时)\s*后\s*$")
ZH_CLOCK_RE = re.compile(
    r"(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:点|时)(半|(?:(\d{1,2})\s*分?)?)\s*((\d{1,2})\s*秒?)?",
    re.IGNORECASE,
)

DURATION_UNIT_ALIASES = {
    "ns": "ns",
    "us": "us",
    "µs": "µs",
    "ms": "ms",
    "s": "s",
    "sec": "s",
    "secs": "s",
    "second": "s",
    "seconds": "s",
    "m": "m",
    "min": "m",
    "mins": "m",
    "minute": "m",
    "minutes": "m",
    "h": "h",
    "hr": "h",
    "hrs": "h",
    "hour": "h",
    "hours": "h",
}

RELATIVE_SECONDS_FACTORS = {
    "s": 1,
    "sec": 1,
    "secs": 1,
    "second": 1,
    "seconds": 1,
    "m": 60,
    "min": 60,
    "mins": 60,
    "minute": 60,
    "minutes": 60,
    "h": 3600,
    "hr": 3600,
    "hrs": 3600,
    "hour": 3600,
    "hours": 3600,
}


def normalize_on_unit_active_sec(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    if re.fullmatch(r"\d+", value):
        if int(value) <= 0:
            raise ValueError("OnUnitActiveSec must be > 0")
        return value
    if not DURATION_RE.fullmatch(value):
        normalized = normalize_human_duration(value)
        if normalized == "":
            raise ValueError(f"invalid OnUnitActiveSec format: {value!r}")
        if not DURATION_RE.fullmatch(normalized):
            raise ValueError(f"invalid OnUnitActiveSec format: {value!r}")
        return normalized
    return value


def normalize_human_duration(raw: str) -> str:
    text = (raw or "").strip().lower()
    if text == "":
        return ""

    matches = DURATION_TOKEN_RE.findall(text)
    if not matches:
        return ""

    expected = re.sub(r"[\s,]+", "", text)
    consumed = "".join(f"{num}{unit}" for num, unit in matches)
    if consumed != expected:
        return ""

    parts: list[str] = []
    for num, unit in matches:
        mapped = DURATION_UNIT_ALIASES.get(unit)
        if mapped is None:
            return ""
        if float(num) <= 0:
            raise ValueError("OnUnitActiveSec must be > 0")
        parts.append(f"{num}{mapped}")
    return "".join(parts)


def normalize_on_calendar(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""

    parts = value.split()
    if len(parts) == 2 and "*" in parts[0]:
        clock = parts[1]
    elif len(parts) == 1:
        clock = parts[0]
    else:
        return normalize_colloquial_calendar(value)

    try:
        fields = clock.split(":")
        if len(fields) not in {2, 3}:
            raise ValueError(f"invalid OnCalendar clock: {clock!r}")
        hour = int(fields[0])
        minute = int(fields[1])
        second = int(fields[2]) if len(fields) == 3 else 0

        if hour < 0 or hour > 23:
            raise ValueError("OnCalendar hour must be 0-23")
        if minute < 0 or minute > 59:
            raise ValueError("OnCalendar minute must be 0-59")
        if second < 0 or second > 59:
            raise ValueError("OnCalendar second must be 0-59")
        return value
    except ValueError:
        return normalize_colloquial_calendar(value)


def normalize_colloquial_calendar(raw: str) -> str:
    text = (raw or "").strip()
    if text == "":
        return ""

    abs_clock = try_parse_absolute_datetime(text)
    if abs_clock is not None:
        h, m, s = abs_clock
        return f"*-*-* {h:02d}:{m:02d}:{s:02d}"

    rel_clock = try_parse_relative_datetime(text)
    if rel_clock is not None:
        h, m, s = rel_clock
        return f"*-*-* {h:02d}:{m:02d}:{s:02d}"

    lower = text.lower()
    lower = re.sub(r"\bevery\s*day\b", "", lower)
    lower = re.sub(r"\bdaily\b", "", lower)
    lower = re.sub(r"\bat\b", "", lower)
    lower = re.sub(r"\s+", " ", lower).strip()

    clock = try_parse_colloquial_clock(lower)
    if clock is None:
        zh = text
        zh = zh.replace("每天", "")
        zh = zh.replace("每日", "")
        zh = zh.replace("提醒", "")
        zh = zh.replace("执行", "")
        zh = zh.replace("在", "")
        zh = zh.strip()
        clock = try_parse_colloquial_clock(zh)

    if clock is None:
        raise ValueError(f"invalid OnCalendar format: {raw!r}")

    h, m, s = clock
    return f"*-*-* {h:02d}:{m:02d}:{s:02d}"


def try_parse_colloquial_clock(text: str) -> Optional[tuple[int, int, int]]:
    t = (text or "").strip()
    if t == "":
        return None

    m = EN_AMPM_CLOCK_RE.search(t)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or "0")
        second = int(m.group(3) or "0")
        ampm = m.group(4).lower()
        if hour < 1 or hour > 12:
            raise ValueError("OnCalendar hour must be 1-12 for am/pm format")
        if minute < 0 or minute > 59:
            raise ValueError("OnCalendar minute must be 0-59")
        if second < 0 or second > 59:
            raise ValueError("OnCalendar second must be 0-59")
        if ampm == "am":
            hour = 0 if hour == 12 else hour
        else:
            hour = 12 if hour == 12 else hour + 12
        return hour, minute, second

    m = ZH_CLOCK_RE.search(t)
    if m:
        period = (m.group(1) or "").strip()
        hour = int(m.group(2))
        half_or_min = (m.group(3) or "").strip()
        minute_txt = (m.group(4) or "").strip()
        second_txt = (m.group(6) or "").strip()

        minute = 0
        second = 0
        if half_or_min == "半":
            minute = 30
        elif minute_txt != "":
            minute = int(minute_txt)
        if second_txt != "":
            second = int(second_txt)

        if hour < 0 or hour > 23:
            raise ValueError("OnCalendar hour must be 0-23")
        if minute < 0 or minute > 59:
            raise ValueError("OnCalendar minute must be 0-59")
        if second < 0 or second > 59:
            raise ValueError("OnCalendar second must be 0-59")

        if period in {"凌晨", "早上", "上午"}:
            if hour == 12:
                hour = 0
        elif period in {"下午", "晚上"}:
            if 1 <= hour <= 11:
                hour += 12
        elif period == "中午":
            if hour == 0:
                hour = 12
            elif 1 <= hour <= 11:
                hour += 12
        return hour, minute, second

    return None


def try_parse_absolute_datetime(text: str) -> Optional[tuple[int, int, int]]:
    raw = (text or "").strip()

    m = ABS_DATETIME_RE.match(raw)
    if m:
        year, month, day, hour, minute, second = m.groups()
    else:
        m2 = ABS_DATETIME_WITH_WEEKDAY_RE.match(raw)
        if not m2:
            return None
        _, year, month, day, hour, minute, second = m2.groups()

    sec = int(second or "0")
    try:
        dt = datetime(
            year=int(year),
            month=int(month),
            day=int(day),
            hour=int(hour),
            minute=int(minute),
            second=sec,
        )
    except ValueError as exc:
        raise ValueError(f"invalid OnCalendar datetime: {text!r}") from exc
    return dt.hour, dt.minute, dt.second


def try_parse_relative_datetime(text: str) -> Optional[tuple[int, int, int]]:
    t = (text or "").strip()
    if t == "":
        return None

    m = REL_IN_RE.match(t)
    if m:
        amount = float(m.group(1))
        unit = m.group(2).lower()
        factor = RELATIVE_SECONDS_FACTORS.get(unit)
        if factor is None:
            raise ValueError(f"invalid OnCalendar relative unit: {unit!r}")
        return add_seconds_to_now(amount * factor)

    m = REL_NOW_PLUS_RE.match(t)
    if m:
        amount = float(m.group(1))
        unit = m.group(2).lower()
        factor = RELATIVE_SECONDS_FACTORS.get(unit)
        if factor is None:
            raise ValueError(f"invalid OnCalendar relative unit: {unit!r}")
        return add_seconds_to_now(amount * factor)

    m = REL_ZH_RE.match(t)
    if m:
        amount = float(m.group(1))
        unit = m.group(2)
        if unit == "秒":
            factor = 1
        elif unit in {"分钟", "分"}:
            factor = 60
        elif unit in {"小时", "时"}:
            factor = 3600
        else:
            raise ValueError(f"invalid OnCalendar relative unit: {unit!r}")
        return add_seconds_to_now(amount * factor)

    return None


def add_seconds_to_now(seconds: float) -> tuple[int, int, int]:
    if seconds <= 0:
        raise ValueError("OnCalendar relative duration must be > 0")
    dt = datetime.now() + timedelta(seconds=seconds)
    return dt.hour, dt.minute, dt.second
