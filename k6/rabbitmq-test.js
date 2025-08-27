import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import probabilityDistributions from './lib/index.js';

const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE_NAME = 'message-queue';

// Test parameters. They are rewritten in the .sh
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

// Poisson process function with precise rate compensation
export function poissonProcess() {
    let messageCount = 0;
    const startTime = Date.now();
    const intervals = [];
    const publishTimestamps = []; // Track actual publish times for rate calculation
    
    console.log(`Starting COMPENSATED Poisson process with TARGET OUTPUT RATE λ=${LAMBDA} for duration: ${TEST_DURATION}`);
    
    // Pre-generate large batch to minimize overhead
    const BATCH_SIZE = 50000; // Larger batch for better efficiency
    let interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, LAMBDA);
    let batchIndex = 0;
    
    // Timing compensation variables
    let nextScheduledTime = Date.now(); // Absolute time when next message should be sent
    let publishOverhead = 0; // Running average of publish overhead
    let overheadSamples = 0;
    const MAX_OVERHEAD_SAMPLES = 200; // Limit overhead calculation to recent samples
    
    // Pre-allocate arrays for efficiency
    const recentOverheads = new Array(100);
    let overheadIndex = 0;
    
    // Pre-build message template to reduce JSON overhead
    const baseMsg = {
        distribution: 'poisson',
        lambda: LAMBDA
    };
    
    while (true) {
        // Batch regeneration with minimal overhead
        if (batchIndex >= BATCH_SIZE) {
            interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, LAMBDA);
            batchIndex = 0;
        }
        
        const interArrivalTime = interArrivalTimes[batchIndex++];
        
        // Calculate precise scheduled time for this message
        nextScheduledTime += interArrivalTime * 1000; // Convert to milliseconds
        
        // Compensated waiting: account for publish overhead
        const now = Date.now();
        const rawWaitTime = nextScheduledTime - now;
        const compensatedWaitTime = Math.max(0, rawWaitTime - publishOverhead * 1000);
        
        // Efficient sleep with sub-millisecond precision
        if (compensatedWaitTime > 0) {
            sleep(compensatedWaitTime / 1000);
        }
        
        // Record pre-publish time for overhead calculation
        const prePublishTime = Date.now();
        
        // Optimized message creation - reuse object structure
        baseMsg.messageId = messageCount + 1;
        baseMsg.timestamp = prePublishTime;
        baseMsg.scheduledTime = nextScheduledTime;
        baseMsg.interArrivalTime = interArrivalTime;
        
        // Publish message
        amqp.publish({
            connectionID: connID,
            queue_name: QUEUE_NAME,
            body: JSON.stringify(baseMsg),
            content_type: 'application/json',
            persistent: true,
        });
        
        // Record actual publish completion time
        const postPublishTime = Date.now();
        publishTimestamps.push(postPublishTime);
        
        // Update overhead estimation with moving average (more recent samples weighted more)
        if (overheadSamples < MAX_OVERHEAD_SAMPLES) {
            const actualOverhead = (postPublishTime - prePublishTime) / 1000;
            recentOverheads[overheadIndex] = actualOverhead;
            overheadIndex = (overheadIndex + 1) % 100;
            
            // Exponential moving average for recent responsiveness
            const alpha = 0.1; // Smoothing factor
            if (overheadSamples === 0) {
                publishOverhead = actualOverhead;
            } else {
                publishOverhead = alpha * actualOverhead + (1 - alpha) * publishOverhead;
            }
            overheadSamples++;
        }
        
        // Efficient array management - only store what we need
        intervals.push(interArrivalTime);
        if (intervals.length > 1000) {
            intervals.splice(0, 500); // Remove old data, keep recent 500
        }
        
        // Trim publish timestamps to prevent memory bloat
        if (publishTimestamps.length > 1000) {
            publishTimestamps.splice(0, 500);
        }
        
        // Add to metrics (every message for accuracy)
        intervalTrend.add(interArrivalTime);
        lambdaVerificationCounter.add(1);
        
        messageCount++;
        
        // Calculate multiple rate metrics for accuracy comparison
        const elapsed = (Date.now() - startTime) / 1000;
        
        // 1. True effective output rate (based on actual publish timestamps)
        let effectiveOutputRate;
        if (publishTimestamps.length >= 2) {
            const timeSpan = (publishTimestamps[publishTimestamps.length - 1] - publishTimestamps[0]) / 1000;
            effectiveOutputRate = (publishTimestamps.length - 1) / timeSpan;
        } else {
            effectiveOutputRate = messageCount / elapsed;
        }
        
        // 2. Recent effective rate (last 100 messages for responsiveness)
        let recentEffectiveRate = effectiveOutputRate;
        const RECENT_COUNT = Math.min(100, publishTimestamps.length);
        if (publishTimestamps.length >= RECENT_COUNT) {
            const recentTimestamps = publishTimestamps.slice(-RECENT_COUNT);
            const recentTimeSpan = (recentTimestamps[recentTimestamps.length - 1] - recentTimestamps[0]) / 1000;
            recentEffectiveRate = (recentTimestamps.length - 1) / recentTimeSpan;
        }
        
        // 3. Theoretical rate from intervals (for Poisson validation)
        let theoreticalRate = LAMBDA;
        if (intervals.length >= 50) {
            const recentIntervals = intervals.slice(-50);
            const avgInterval = recentIntervals.reduce((sum, i) => sum + i, 0) / recentIntervals.length;
            theoreticalRate = 1 / avgInterval;
        }
        
        // Update metrics with most accurate rate
        actualRateTrend.add(recentEffectiveRate);
        
        // Comprehensive verification every 500 messages
        if (messageCount % 500 === 0) {
            const verification = verifyLambda(intervals.slice(-500), LAMBDA); // Use recent 500 samples
            if (verification) {
                console.log(`=== PRECISE RATE VERIFICATION (${messageCount} msgs) ===`);
                console.log(`  TARGET OUTPUT RATE: ${LAMBDA} msg/sec`);
                console.log(`  Effective output rate: ${recentEffectiveRate.toFixed(4)} msg/sec (${((recentEffectiveRate/LAMBDA)*100).toFixed(2)}% of target)`);
                console.log(`  Cumulative output rate: ${(messageCount/elapsed).toFixed(4)} msg/sec`);
                console.log(`  Theoretical λ from intervals: ${theoreticalRate.toFixed(4)} (${verification.isValid ? 'VALID' : 'INVALID'} Poisson)`);
                console.log(`  Mean interval error: ${(verification.meanError * 100).toFixed(2)}%`);
                console.log(`  Variance error: ${(verification.varianceError * 100).toFixed(2)}%`);
                console.log(`  Estimated publish overhead: ${(publishOverhead * 1000).toFixed(2)}ms per message`);
                console.log(`  Scheduling accuracy: ${((nextScheduledTime - Date.now())/1000).toFixed(3)}s ahead`);
                
                // Rate control feedback
                const rateError = ((recentEffectiveRate - LAMBDA) / LAMBDA) * 100;
                if (Math.abs(rateError) > 2) {
                    console.log(`  ⚠️  Rate deviation: ${rateError.toFixed(2)}% from target`);
                } else {
                    console.log(`  ✅ Rate accuracy: within ±2% of target`);
                }
            }
        }
        
        // Lightweight progress logging every 100 messages
        if (messageCount % 100 === 0 && messageCount % 500 !== 0) {
            const accuracyPercent = ((recentEffectiveRate / LAMBDA) * 100).toFixed(1);
            console.log(`[${messageCount}] Effective rate: ${recentEffectiveRate.toFixed(3)} msg/sec (${accuracyPercent}% of target λ=${LAMBDA})`);
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
