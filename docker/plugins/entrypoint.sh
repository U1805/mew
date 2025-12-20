#!/bin/sh
set -eu

log() {
  echo "[bot] $*" 1>&2
}

list_installed_bots() {
  find /usr/local/bin -maxdepth 1 -type f -name 'mew-*-bot' -exec basename {} \; \
    | sed 's/^mew-//; s/-bot$//' \
    | sort
}

trim() {
  # trim leading/trailing whitespace
  # shellcheck disable=SC2001
  echo "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

normalize_list() {
  # Convert common separators to newlines: comma, semicolon, whitespace.
  echo "$1" \
    | tr ',; \t' '\n' \
    | sed '/^[[:space:]]*$/d' \
    | sort -u
}

MEW_PLUGINS="${MEW_PLUGINS:-}"

if [ -z "$(trim "$MEW_PLUGINS")" ]; then
  bots="$(list_installed_bots)"
  if [ -z "$bots" ]; then
    log "no bots found under /usr/local/bin (expected mew-*-bot)"
    exit 1
  fi
  log "MEW_PLUGINS is empty; starting all bots:"
else
  bots="$(normalize_list "$MEW_PLUGINS")"
  log "starting selected bots from MEW_PLUGINS:"
fi

log "$(echo "$bots" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

pids=""

stop_all() {
  if [ -n "$pids" ]; then
    log "stopping all bots..."
    for pid in $pids; do
      kill "$pid" 2>/dev/null || true
    done
  fi
}

trap 'stop_all; exit 0' INT TERM

for bot in $bots; do
  bin="/usr/local/bin/mew-${bot}-bot"
  if [ ! -x "$bin" ]; then
    log "unknown bot: $bot (missing $bin)"
    log "available: $(list_installed_bots | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
    exit 1
  fi

  log "launching $bot: $bin"
  "$bin" &
  pids="$pids $!"
done

# If any bot exits, stop the rest and exit with its status.
while :; do
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    wait "$pid" || status=$?
    status="${status:-0}"
    log "bot pid $pid exited (status=$status); shutting down others"
    stop_all
    exit "$status"
  done
  sleep 1
done

