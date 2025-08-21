import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';

const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE_NAME = 'message-queue';

const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;
console.log(`Connessione RabbitMQ: ${AMQP_URL}`);

export const options = {
    scenarios: {
        send_messages: {
            executor: 'constant-arrival-rate',
            rate: 100,
            timeUnit: '1s',
            duration: __ENV.TEST_DURATION || '60s',
            preAllocatedVUs: 10,
            maxVUs: 50,
            exec: 'send'
        }
    }
};

const connID = amqp.start({ connection_url: AMQP_URL });

queue.declare({
    connectionID: connID,
    name: QUEUE_NAME,
    durable: true,
    args: { 'x-max-length': 100 },
});

export function send() {
    const msg = JSON.stringify({ ts: Date.now() });

    amqp.publish({
        connectionID: connID,
        queue_name: QUEUE_NAME,
        body: msg,
        content_type: 'application/json',
        persistent: true,
    });
}

export function teardown() {
    try { amqp.close(connID); } catch (_) { }
}
