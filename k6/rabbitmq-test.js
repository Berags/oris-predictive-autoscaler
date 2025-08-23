import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
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

// Metrics for lambda verification
const intervalTrend = new Trend('poisson_intervals');
const actualRateTrend = new Trend('actual_rate');
const lambdaVerificationCounter = new Counter('lambda_verification_samples');

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

// Lambda verification function
function verifyLambda(intervals, expectedLambda) {
    if (intervals.length < 100) return null; // Need minimum samples
    
    const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const expectedMean = 1 / expectedLambda;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const expectedVariance = 1 / (expectedLambda * expectedLambda);
    
    const meanError = Math.abs(mean - expectedMean) / expectedMean;
    const varianceError = Math.abs(variance - expectedVariance) / expectedVariance;
    
    return {
        sampleCount: intervals.length,
        actualMean: mean,
        expectedMean: expectedMean,
        meanError: meanError,
        actualVariance: variance,
        expectedVariance: expectedVariance,
        varianceError: varianceError,
        actualLambda: 1 / mean,
        isValid: meanError < 0.1 && varianceError < 0.2 // 10% tolerance for mean, 20% for variance
    };
}


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
    const intervals = []; // Store intervals for lambda verification
    
    console.log(`Starting Poisson process with λ=${LAMBDA} for duration: ${TEST_DURATION}`);
    
    // Pre-generate a batch of exponential inter-arrival times for efficiency
    const BATCH_SIZE = 10000;
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
        
        // Store interval for verification and add to metrics
        intervals.push(interArrivalTime);
        intervalTrend.add(interArrivalTime);
        lambdaVerificationCounter.add(1);
        
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
        
        // Calculate actual rate using recent intervals (Option 2)
        const elapsed = (Date.now() - startTime) / 1000;
        const cumulativeRate = messageCount / elapsed;
        
        // Rate based on last N intervals for more responsive measurement
        const RECENT_INTERVAL_COUNT = 100;
        let actualRate;
        
        if (intervals.length >= RECENT_INTERVAL_COUNT) {
            const recentIntervals = intervals.slice(-RECENT_INTERVAL_COUNT);
            const avgRecentInterval = recentIntervals.reduce((sum, i) => sum + i, 0) / recentIntervals.length;
            actualRate = 1 / avgRecentInterval;
        } else {
            // For early messages, use cumulative rate
            actualRate = cumulativeRate;
        }
        
        actualRateTrend.add(actualRate);
        
        // Verify lambda every 500 messages
        if (messageCount % 500 === 0) {
            const verification = verifyLambda(intervals, LAMBDA);
            if (verification) {
                console.log(`Lambda Verification (${messageCount} msgs):`);
                console.log(`  Expected λ: ${LAMBDA}, Actual λ: ${verification.actualLambda.toFixed(4)}`);
                console.log(`  Mean interval - Expected: ${verification.expectedMean.toFixed(4)}s, Actual: ${verification.actualMean.toFixed(4)}s (Error: ${(verification.meanError * 100).toFixed(2)}%)`);
                console.log(`  Variance - Expected: ${verification.expectedVariance.toFixed(6)}, Actual: ${verification.actualVariance.toFixed(6)} (Error: ${(verification.varianceError * 100).toFixed(2)}%)`);
                console.log(`  Process is ${verification.isValid ? 'VALID' : 'INVALID'} Poisson`);
                console.log(`  Recent rate (last ${RECENT_INTERVAL_COUNT} intervals): ${actualRate.toFixed(2)} msg/sec`);
                console.log(`  Cumulative rate: ${cumulativeRate.toFixed(2)} msg/sec`);
            }
        }
        
        // Log progress every 100 messages
        if (messageCount % 100 === 0 && messageCount % 500 !== 0) {
            const intervalInfo = intervals.length >= RECENT_INTERVAL_COUNT ? 
                `recent rate: ${actualRate.toFixed(2)}` : 
                `cumulative rate: ${actualRate.toFixed(2)}`;
            console.log(`Sent ${messageCount} messages in ${elapsed.toFixed(1)}s, ${intervalInfo} msg/sec (batch: ${Math.floor(messageCount/BATCH_SIZE) + 1})`);
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
    console.log('\n=== FINAL LAMBDA VERIFICATION SUMMARY ===');
    console.log(`Expected λ: ${LAMBDA} arrivals/sec`);
    console.log(`Total verification samples: ${lambdaVerificationCounter.count || 0}`);
    
    // Final summary will be shown in K6 metrics
    console.log('Check the metrics output for detailed statistics:');
    console.log('- poisson_intervals: distribution of inter-arrival times');
    console.log('- actual_rate: measured arrival rate over time');
    console.log('- lambda_verification_samples: total samples used for verification');
    
    try { amqp.close(connID); } catch (_) { }
}
