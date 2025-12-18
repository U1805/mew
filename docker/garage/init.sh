#!/bin/sh
set -eu

CONFIG_PATH="${GARAGE_CONFIG:-/etc/garage.toml}"
SECRETS_DIR="${GARAGE_SECRETS_DIR:-/var/lib/garage/secrets}"
CREDS_FILE="${S3_CREDENTIALS_FILE:-$SECRETS_DIR/s3-credentials.json}"

BUCKET_NAME="${S3_BUCKET_NAME:-mew-bucket}"
KEY_NAME="${S3_KEY_NAME:-mew-app-key}"

echo "[garage-init] using config: $CONFIG_PATH"
echo "[garage-init] bucket: $BUCKET_NAME, key: $KEY_NAME"
echo "[garage-init] credentials file: $CREDS_FILE"

mkdir -p "$SECRETS_DIR"

wait_ready() {
  i=0
  while [ $i -lt 60 ]; do
    if garage status --config "$CONFIG_PATH" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i+1))
    sleep 1
  done
  return 1
}

if ! wait_ready; then
  echo "[garage-init] garage is not ready after 60s" >&2
  exit 1
fi

STATUS="$(garage status --config "$CONFIG_PATH")"

# If any node has NO ROLE ASSIGNED, assign+apply a single-node layout.
if echo "$STATUS" | grep -q "NO ROLE"; then
  NODE_ID="$(echo "$STATUS" | awk '
    /HEALTHY NODES/ {in_table=1; next}
    in_table && $1 == "ID" {next}
    in_table && $0 ~ /NO ROLE/ {print $1; exit}
  ')"

  if [ -z "${NODE_ID:-}" ]; then
    echo "[garage-init] failed to parse NODE_ID from status output" >&2
    echo "$STATUS" >&2
    exit 1
  fi

  echo "[garage-init] assigning layout for node: $NODE_ID"
  garage layout assign --config "$CONFIG_PATH" -z dc1 -c 1G "$NODE_ID"
  garage layout apply --config "$CONFIG_PATH" --version 1
else
  echo "[garage-init] layout already assigned; skipping layout apply"
fi

# Bucket create is idempotent (will fail if exists); ignore errors.
garage bucket create --config "$CONFIG_PATH" "$BUCKET_NAME" >/dev/null 2>&1 || true

# Ensure website/public read is enabled (idempotent-ish; ignore errors).
garage bucket website --config "$CONFIG_PATH" --allow "$BUCKET_NAME" >/dev/null 2>&1 || true

if [ -f "$CREDS_FILE" ]; then
  echo "[garage-init] credentials file already exists; skipping key creation"
  exit 0
fi

echo "[garage-init] creating key: $KEY_NAME"
OUT="$(garage key create --config "$CONFIG_PATH" "$KEY_NAME" 2>&1 || true)"

ACCESS_KEY_ID="$(echo "$OUT" | awk -F':' '/Key ID/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')"
SECRET_ACCESS_KEY="$(echo "$OUT" | awk -F':' '/Secret key/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')"

if [ -z "${ACCESS_KEY_ID:-}" ] || [ -z "${SECRET_ACCESS_KEY:-}" ]; then
  echo "[garage-init] failed to create/parse key output; cannot write credentials file" >&2
  echo "$OUT" >&2
  exit 1
fi

echo "[garage-init] allowing key access to bucket"
garage bucket allow --config "$CONFIG_PATH" --read --write --owner "$BUCKET_NAME" --key "$KEY_NAME" >/dev/null 2>&1 || true

cat >"$CREDS_FILE" <<EOF
{"accessKeyId":"$ACCESS_KEY_ID","secretAccessKey":"$SECRET_ACCESS_KEY"}
EOF

chmod 600 "$CREDS_FILE" || true

echo "[garage-init] wrote credentials: $CREDS_FILE"

