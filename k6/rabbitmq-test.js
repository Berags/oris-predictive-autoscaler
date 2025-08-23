import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';
import { sleep } from 'k6';
import probabilityDistributions from './lib/probability-distributions-k6/index.js';

const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE_NAME = 'message-queue';

// Test parameters
const LAMBDA = parseFloat(__ENV.LAMBDA) || 10; // arrival rate per second
const TEST_DURATION = __ENV.TEST_DURATION || '30s';
const DISTRIBUTION = __ENV.DISTRIBUTION || 'constant'; // 'constant' or 'poisson'

const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;
console.log(`RabbitMQ connection: ${AMQP_URL}`);
console.log(`Test distribution: ${DISTRIBUTION}, λ=${LAMBDA} arrivals/sec, duration: ${TEST_DURATION}`);


export const options = {
    scenarios: DISTRIBUTION === 'poisson' ? {
        poisson_arrivals: {
            executor: 'per-vu-iterations',
            vus: 1,
            iterations: 1, 
            maxDuration: TEST_DURATION,
            exec: 'poissonProcess'
        }
    } : {
        constant_arrivals: {
            executor: 'constant-arrival-rate',
            rate: LAMBDA,
            timeUnit: '1s',
            duration: TEST_DURATION,
            preAllocatedVUs: 10,
            maxVUs: 50,
            exec: 'constantSend'
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

// Poisson process function (exponential inter-arrival times)
export function poissonProcess() {
    let messageCount = 0;
    const startTime = Date.now();
    const endTime = Date.now() + TEST_DURATION * 1000;
    
    console.log(`Starting Poisson process with λ=${LAMBDA} for duration: ${TEST_DURATION}`);
    
    // Pre-generate a batch of exponential inter-arrival times for efficiency
    const BATCH_SIZE = 1;
    let interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, LAMBDA);
    let batchIndex = 0;
    
    // Continue until K6 stops the test (based on maxDuration)
    while (true) {
        // If we've used all samples, generate a new batch
        if (batchIndex >= BATCH_SIZE) {
            interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, LAMBDA);
            batchIndex = 0;
        }
        
        // Get the next pre-generated inter-arrival time
        const interArrivalTime = interArrivalTimes[batchIndex];
        batchIndex++;
        
        // Wait before sending the message
        sleep(interArrivalTime);
        
        // Send the message
        const msg = JSON.stringify({ 
            messageId: messageCount + 1,
            timestamp: Date.now(),
            interArrivalTime: interArrivalTime.toFixed(4),
            distribution: 'poisson',
            lambda: LAMBDA
        });

        amqp.publish({
            connectionID: connID,
            queue_name: QUEUE_NAME,
            body: msg,
            content_type: 'application/json',
            persistent: true,
        });
        
        messageCount++;
        
        // Log progress every 100 messages
        if (messageCount % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const actualRate = messageCount / elapsed;
            console.log(`Sent ${messageCount} messages in ${elapsed.toFixed(1)}s, rate: ${actualRate.toFixed(2)} msg/sec (batch: ${Math.floor(messageCount/BATCH_SIZE) + 1})`);
        }
    }
}

// Constant arrival rate function (standard K6 approach)
export function constantSend() {
    const msg = JSON.stringify({ 
        timestamp: Date.now(),
        distribution: 'constant',
        lambda: LAMBDA
    });

    amqp.publish({
        connectionID: connID,
        queue_name: QUEUE_NAME,
        body: msg,
        content_type: 'application/json',
        persistent: true,
    });
}

// Legacy function for compatibility
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
