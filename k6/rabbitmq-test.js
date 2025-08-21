// K6 script to send 100 messages per second to the RabbitMQ "message-queue" queue.
// Requires a custom k6 build with the xk6-amqp extension:
//   docker run --rm -v "$(pwd)":/work -w /work golang:1.22 bash -c "go install go.k6.io/xk6/cmd/xk6@latest && xk6 build --output k6-amqp --with github.com/grafana/xk6-amqp@latest"
// Execution (once you have the k6-amqp binary):
//   ./k6-amqp run k6/rabbitmq-test.js \
//     -e RABBITMQ_HOST=rabbitmq-service -e RABBITMQ_USER=admin -e RABBITMQ_PASSWORD=password
// Alternatively, create a custom Docker image (see suggested README).

import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';

// RabbitMQ parameters via environment variables (fallback to Python service defaults)
const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE = 'message-queue';

// URL AMQP
const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;
console.log('Connecting to RabbitMQ at:', AMQP_URL);
// k6 options: 100 messages per second constant rate.
export const options = {
    scenarios: {
        send_messages: {
            executor: 'constant-arrival-rate',
            rate: 100,           // 100 sends per second
            timeUnit: '1s',
            duration: __ENV.TEST_DURATION || '60s', // modifiable via env
            preAllocatedVUs: 10, // initial VUs
            maxVUs: 50,          // maximum limit if scaling is needed
            exec: 'send'
        }
    }
};

// Connection and channel created once per VU (init context replicated for each VU).
const connID = amqp.start({ connection_url: AMQP_URL });
const queueId = queue.declare({
    connectionID: connID,
    name: QUEUE,
    durable: true,
    args: {
        'x-max-length': 100,
    }
});
console.log(queueId)

// Function executed at each arrival (100 times per second globally, distributed among VUs)
export function send() {
    // Simple payload with timestamp; add fields if necessary.
    const payload = JSON.stringify({ ts: Date.now() });
    amqp.publish({ // Use channel.publish instead of amqp.publish
        queueName: QUEUE,
        body: payload,
        contentType: 'application/json',
    });
}

// Orderly shutdown (k6 calls this once at the end of the test for each VU)
export function teardown() {
    try { channel.close(); } catch (_) { }
    try { amqp.close(connID); } catch (_) { } // Use amqp.close with connection ID
}