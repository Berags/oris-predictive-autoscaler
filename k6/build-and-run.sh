#!/bin/bash
set -euo pipefail

###############################################################################
# k6 RabbitMQ Load Test Runner
#
# This script builds a Docker image containing k6 + the AMQP extension and then
# runs the `menu.js`, that executes `rabbitmq-test.js` according to user choices.
#
# Environment variables (all have sensible defaults):
#   RABBITMQ_HOST       Hostname / IP of RabbitMQ (default: localhost)
#   RABBITMQ_USER       Username (default: admin)
#   RABBITMQ_PASSWORD   Password (default: password)
#   RABBITMQ_PORT       Port (default: 5672)
#   TEST_DURATION       k6 test duration (e.g. 30s, 2m, 5m) (default: 600s)
#   LAMBDA              Target arrival rate (messages/second) (default: 3)
#   DISTRIBUTION        Arrival process (constant|poisson) (default: poisson)
#
# Output:
#  - k6 metrics shown in console.
#  - You can mount the current directory (already done) to capture any output files.
#
# Requirements:
#  - Docker installed & accessible by current user.
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="k6-amqp:latest"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"

RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_USER="${RABBITMQ_USER:-admin}"
RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-password}"
RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
TEST_DURATION="${TEST_DURATION:-600s}"
LAMBDA="${LAMBDA:-4}"          # Target arrival rate (messages per second)
DISTRIBUTION="${DISTRIBUTION:-poisson}"  # Arrival distribution


if ! command -v docker >/dev/null 2>&1; then
    echo " Docker not found in PATH" >&2
    exit 1
fi

# Ensure local lib directory exists (holds probability distributions library)
if [ ! -d "$SCRIPT_DIR/lib" ]; then
    mkdir -p "$SCRIPT_DIR/lib"
    echo " Cloning probability-distributions-k6 library..."
    git clone --depth 1 https://github.com/pedromoritz/probability-distributions-k6.git "$SCRIPT_DIR/lib/"
fi

echo "  [1/3] Building image ${IMAGE_NAME}..."
docker build -f "$DOCKERFILE" -t "$IMAGE_NAME" "$SCRIPT_DIR"
echo " Image built: ${IMAGE_NAME}"

echo "  [2/3] Verifying RabbitMQ reachability at ${RABBITMQ_HOST}:${RABBITMQ_PORT}..."

# Fast TCP connectivity check (uses bash's /dev/tcp). Optional retries for transient startup.
MAX_RETRIES=5
SLEEP_BETWEEN=2
attempt=1
while true; do
    if timeout 3 bash -c "</dev/tcp/${RABBITMQ_HOST}/${RABBITMQ_PORT}" 2>/dev/null; then
        echo "   RabbitMQ is reachable."
        break
    fi
    if [ $attempt -ge $MAX_RETRIES ]; then
        echo " Unable to reach RabbitMQ at ${RABBITMQ_HOST}:${RABBITMQ_PORT} after ${MAX_RETRIES} attempts." >&2
        echo "   Hints: ensure container/pod is running, port is exposed, network=host is appropriate." >&2
        exit 2
    fi
    echo " RabbitMQ not reachable yet (attempt ${attempt}/${MAX_RETRIES}); retrying in ${SLEEP_BETWEEN}s..."
    sleep $SLEEP_BETWEEN
    attempt=$((attempt+1))
done

echo " [3/3] Launching interactive menu..."

# Export environment variables for the menu
export RABBITMQ_HOST="$RABBITMQ_HOST"
export RABBITMQ_USER="$RABBITMQ_USER" 
export RABBITMQ_PASSWORD="$RABBITMQ_PASSWORD"
export RABBITMQ_PORT="$RABBITMQ_PORT"
export TEST_DURATION="$TEST_DURATION"
export LAMBDA="$LAMBDA"
export DISTRIBUTION="$DISTRIBUTION"
export K6_IMAGE_NAME="$IMAGE_NAME"
export SCRIPT_DIR="$SCRIPT_DIR"

# Run menu with Node.js locally
node menu.js

echo " Session completed"

