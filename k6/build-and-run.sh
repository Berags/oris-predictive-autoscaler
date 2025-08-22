#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="k6-amqp:latest"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"

RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_USER="${RABBITMQ_USER:-admin}"
RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-password}"
RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
TEST_DURATION="${TEST_DURATION:-60s}"
LAMBDA="${LAMBDA:-10}"  # Default arrival rate (messages per second)
DISTRIBUTION="${DISTRIBUTION:-poisson}"  # Default distribution


if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found" >&2
    exit 1
fi

echo "[1/2] Building image ${IMAGE_NAME}..."
docker build -f "$DOCKERFILE" -t "$IMAGE_NAME" "$SCRIPT_DIR"
echo "Image built: ${IMAGE_NAME}"

echo "[2/2] Running k6 test (duration: ${TEST_DURATION})..."

docker run --rm \
    --network host \
    -v "$SCRIPT_DIR:/scripts" \
    -v "$PWD:/output" \
    -e RABBITMQ_HOST="$RABBITMQ_HOST" \
    -e RABBITMQ_USER="$RABBITMQ_USER" \
    -e RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD" \
    -e RABBITMQ_PORT="$RABBITMQ_PORT" \
    -e TEST_DURATION="$TEST_DURATION" \
    -e LAMBDA="$LAMBDA" \
    -e DISTRIBUTION="$DISTRIBUTION" \
    "$IMAGE_NAME" run /scripts/rabbitmq-test.js

