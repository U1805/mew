#!/bin/sh
set -eu

# Configuration
CONFIG_PATH="${GARAGE_CONFIG:-/etc/garage.toml}"
SECRETS_DIR="${GARAGE_SECRETS_DIR:-/var/lib/garage/secrets}"
CREDS_FILE="${S3_CREDENTIALS_FILE:-$SECRETS_DIR/s3-credentials.json}"

BUCKET_NAME="${S3_BUCKET_NAME:-mew-bucket}"
KEY_NAME="${S3_KEY_NAME:-mew-app-key}"

GARAGE_CMD="garage --config $CONFIG_PATH"

# Wait for Garage to be ready
echo "[garage-init] Waiting for Garage to be ready..."
i=0
while [ $i -lt 300 ]; do
  if $GARAGE_CMD status >/dev/null 2>&1; then
    echo "[garage-init] Garage is ready."
    break
  fi
  if [ $((i % 5)) -eq 0 ]; then
    echo "[garage-init] Retrying connection..."
  fi
  i=$((i+1))
  sleep 1
done

# Ensure Node Layout
STATUS="$($GARAGE_CMD status)"
if echo "$STATUS" | grep -q "NO ROLE"; then
  NODE_ID="$(echo "$STATUS" | awk '/NO ROLE/ { print $1; exit }')"
  if [ -n "$NODE_ID" ]; then
    echo "[garage-init] Assigning layout for node: $NODE_ID"
    $GARAGE_CMD layout assign -z dc1 -c 1G "$NODE_ID"
    $GARAGE_CMD layout apply --version 1
  fi
fi

# Ensure Bucket Exists
$GARAGE_CMD bucket create "$BUCKET_NAME" >/dev/null 2>&1 || true

# Enable Website Mode (Public Read)
echo "[garage-init] Setting bucket website mode..."
$GARAGE_CMD bucket website --allow "$BUCKET_NAME"

# Handle Credentials/Keys
NEED_NEW_KEY=1
ACCESS_KEY_ID=""

if [ -f "$CREDS_FILE" ]; then
  # Extract Access Key from existing file
  EXISTING_KEY_ID=$(grep -o '"accessKeyId":"[^"]*' "$CREDS_FILE" | cut -d'"' -f4)
  echo "[garage-init] Found existing credentials file with Key ID: $EXISTING_KEY_ID"

  # Verify if Key exists in Garage
  if $GARAGE_CMD key info "$EXISTING_KEY_ID" >/dev/null 2>&1; then
    echo "[garage-init] Key is valid in Garage."
    NEED_NEW_KEY=0
    ACCESS_KEY_ID="$EXISTING_KEY_ID"
  else
    echo "[garage-init] Warning: Key in file does NOT exist in Garage. Deleting invalid credentials."
    rm "$CREDS_FILE"
  fi
fi

if [ "$NEED_NEW_KEY" -eq 1 ]; then
  echo "[garage-init] Creating new key: $KEY_NAME"

  # Delete old key name to prevent conflicts
  $GARAGE_CMD key delete "$KEY_NAME" >/dev/null 2>&1 || true

  OUT="$($GARAGE_CMD key create "$KEY_NAME" 2>&1)"

  ACCESS_KEY_ID="$(echo "$OUT" | awk -F':' '/Key ID/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')"
  SECRET_ACCESS_KEY="$(echo "$OUT" | awk -F':' '/Secret key/ {gsub(/^[ \t]+/, "", $2); print $2; exit}')"

  if [ -z "${ACCESS_KEY_ID:-}" ]; then
    echo "[garage-init] Failed to create key. Output: $OUT" >&2
    exit 1
  fi

  # Write new credentials
  echo "{\"accessKeyId\":\"$ACCESS_KEY_ID\",\"secretAccessKey\":\"$SECRET_ACCESS_KEY\"}" > "$CREDS_FILE"
  chmod 644 "$CREDS_FILE"
  echo "[garage-init] Wrote new credentials: $CREDS_FILE"
fi

# Ensure Permissions
echo "[garage-init] Updating bucket permissions..."
$GARAGE_CMD bucket allow --read --write --owner "$BUCKET_NAME" --key "$KEY_NAME" >/dev/null 2>&1 || true

echo "[garage-init] Initialization complete."
