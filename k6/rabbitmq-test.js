import amqp from 'k6/x/amqp';
import queue from 'k6/x/amqp/queue';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import probabilityDistributions from './lib/index.js';
import verifyLambda from './util/verifyLambda.js';
import {
    emaOverhead,
    computeEffectiveRate,
    computeRecentEffectiveRate,
    computeTheoreticalRateFromIntervals,
    computeCompensatedWaitMs,
} from './util/metrics.js';

const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE_NAME = 'message-queue';


const LAMBDA_ARRAY_JSON = __ENV.LAMBDA_ARRAY || '[3]'; // arrival rate per second
const TEST_DURATION = __ENV.TEST_DURATION || '30s';
const DISTRIBUTION = __ENV.DISTRIBUTION || 'poisson'; // 'constant' or 'poisson'
const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;

let LAMBDA_ARRAY;
try {
    LAMBDA_ARRAY = JSON.parse(LAMBDA_ARRAY_JSON);
} catch (e) {
    console.log('Error parsing LAMBDA_ARRAY, using default [3]');
    LAMBDA_ARRAY = [3];
}

console.log(`Lambda values to test: [${LAMBDA_ARRAY.join(', ')}]`);



console.log(`RabbitMQ connection: ${AMQP_URL}`);
console.log(`Test distribution: ${DISTRIBUTION}, λ=${LAMBDA_ARRAY_JSON} arrivals/sec, duration: ${TEST_DURATION}`);



// Metrics for lambda verification
const intervalTrend = new Trend('poisson_intervals');
const actualRateTrend = new Trend('actual_rate');
const lambdaVerificationCounter = new Counter('lambda_verification_samples');


let i=0;

let lambda = LAMBDA_ARRAY[i];



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
            rate: lambda,
            timeUnit: '1s',
            duration: TEST_DURATION,
            preAllocatedVUs: 10,
            maxVUs: 50,
            exec: 'constantSend'
        }
    }
};

const connID = amqp.start({ connection_url: AMQP_URL });

// Lambda verification function moved to './utils/verifyLambda.js'


queue.declare({
    connectionID: connID,
    name: QUEUE_NAME,
    durable: true,
    args: { 'x-max-length': 100 },
});







export function genericProcess () {

    let messageCount = 0;
    const startTime = Date.now();
    const intervals = [];
    const publishTimestamps = []; // Track actual publish times for rate calculation
    
    console.log(`Starting COMPENSATED Poisson process with TARGET OUTPUT RATE λ=${lambda} for duration: ${TEST_DURATION} ms`);
    
   
    const BATCH_SIZE = 1; // Larger batch for better efficiency
    let interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
    let batchIndex = 0;
    
    // Timing compensation variables
    let nextScheduledTime = Date.now(); // Absolute time when next message should be sent
    let publishOverhead = 0; // Running average of publish overhead
    let overheadSamples = 0;
    const MAX_OVERHEAD_SAMPLES = 200; // Limit overhead calculation to recent samples
    
    // Pre-allocate arrays for efficiency
    // Overhead tracking handled via EMA in metrics utils
    
    // Pre-build message template to reduce JSON overhead
    const baseMsg = {
        distribution: 'poisson',
        lambda: lambda
    };
    
    // exp transition, to define the rate
    //let nextLoadTime = Date.now() + (probabilityDistributions.rexp(1, 0.02) * 1000);
    let nextLoadTime = Date.now() + (50 * 1000); //change after 50 seconds
    while (true) {
        if (Date.now() >= nextLoadTime) {
            i++;
            let oldLambda = lambda;
            lambda = LAMBDA_ARRAY[i % LAMBDA_ARRAY.length];
            console.log(` LOAD TRANSITION: λ changed from ${oldLambda} to ${lambda}`);
            baseMsg.lambda = lambda;
            //interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
            batchIndex = 0;
            // exp transition, to define the rate
            //nextLoadTime = Date.now() + (probabilityDistributions.rexp(1, 0.02) * 1000);
            nextLoadTime = Date.now() + (50 * 1000); //change after 50 seconds
        }
        // Batch regeneration with minimal overhead
        if (batchIndex >= BATCH_SIZE) {
            //interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
            batchIndex = 0;
        }
        
        const interArrivalTime = interArrivalTimes[batchIndex++];
        
        // Calculate precise scheduled time for this message
        nextScheduledTime += interArrivalTime * 1000; // Convert to milliseconds
        
        // Compensated waiting: account for publish overhead
        const now = Date.now();
        const compensatedWaitTime = computeCompensatedWaitMs(now, nextScheduledTime, publishOverhead);
        
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
            const alpha = 0.1; // Smoothing factor
            publishOverhead = emaOverhead(overheadSamples === 0 ? undefined : publishOverhead, actualOverhead, alpha);
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
        const effectiveOutputRate = computeEffectiveRate(publishTimestamps);
            
        // 2. Recent effective rate (last 100 messages for responsiveness)
        const recentEffectiveRate = computeRecentEffectiveRate(publishTimestamps, 100) || (messageCount / elapsed);
            
        // 3. Theoretical rate from intervals (for Poisson validation)
        const theoreticalRate = computeTheoreticalRateFromIntervals(intervals, 50) || lambda;
        
        // Update metrics with most accurate rate
        actualRateTrend.add(recentEffectiveRate);
        
        // Comprehensive verification every 500 messages
        if (messageCount % 500 === 0) {
            const verification = verifyLambda(intervals.slice(-500), lambda); // Use recent 500 samples
            if (verification) {
                console.log(`=== PRECISE RATE VERIFICATION (${messageCount} msgs) ===`);
                console.log(`  TARGET OUTPUT RATE: ${lambda} msg/sec`);
                console.log(`  Effective output rate: ${recentEffectiveRate.toFixed(4)} msg/sec (${((recentEffectiveRate/lambda)*100).toFixed(2)}% of target)`);
                console.log(`  Cumulative output rate: ${(messageCount/elapsed).toFixed(4)} msg/sec`);
                console.log(`  Theoretical λ from intervals: ${theoreticalRate.toFixed(4)} (${verification.isValid ? 'VALID' : 'INVALID'} Poisson)`);
                console.log(`  Mean interval error: ${(verification.meanError * 100).toFixed(2)}%`);
                console.log(`  Variance error: ${(verification.varianceError * 100).toFixed(2)}%`);
                console.log(`  Estimated publish overhead: ${(publishOverhead * 1000).toFixed(2)}ms per message`);
                console.log(`  Scheduling accuracy: ${((nextScheduledTime - Date.now())/1000).toFixed(3)}s ahead`);
                
                // Rate control feedback
                const rateError = ((recentEffectiveRate - lambda) / lambda) * 100;
                if (Math.abs(rateError) > 2) {
                    console.log(` Rate deviation: ${rateError.toFixed(2)}% from target`);
                } else {
                    console.log(` Rate accuracy: within ±2% of target`);
                }
            }
        }
        
        // Lightweight progress logging every 100 messages
        if (messageCount % 100 === 0 && messageCount % 500 !== 0) {
            const accuracyPercent = ((recentEffectiveRate / lambda) * 100).toFixed(1);
            console.log(`[${messageCount}] Effective rate: ${recentEffectiveRate.toFixed(3)} msg/sec (${accuracyPercent}% of target λ=${lambda})`);
        }
    }

 }  

// Poisson process function with precise rate compensation
export function poissonProcess() {
    let messageCount = 0;
    const startTime = Date.now();
    const intervals = [];
    const publishTimestamps = []; // Track actual publish times for rate calculation
    
    console.log(`Starting COMPENSATED Poisson process with TARGET OUTPUT RATE λ=${lambda} for duration: ${TEST_DURATION} ms`);
    
   
    const BATCH_SIZE = 1; // Larger batch for better efficiency
    let interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
    let batchIndex = 0;
    
    // Timing compensation variables
    let nextScheduledTime = Date.now(); // Absolute time when next message should be sent
    let publishOverhead = 0; // Running average of publish overhead
    let overheadSamples = 0;
    const MAX_OVERHEAD_SAMPLES = 200; // Limit overhead calculation to recent samples
    
    // Pre-allocate arrays for efficiency
    // Overhead tracking handled via EMA in metrics utils
    
    // Pre-build message template to reduce JSON overhead
    const baseMsg = {
        distribution: 'poisson',
        lambda: lambda
    };
    
    // exp transition, to define the rate
    //let nextLoadTime = Date.now() + (probabilityDistributions.rexp(1, 0.02) * 1000);
    let nextLoadTime = Date.now() + (50 * 1000); //change after 50 seconds
    while (true) {
        if (Date.now() >= nextLoadTime) {
            i++;
            let oldLambda = lambda;
            lambda = LAMBDA_ARRAY[i % LAMBDA_ARRAY.length];
            console.log(` LOAD TRANSITION: λ changed from ${oldLambda} to ${lambda}`);
            baseMsg.lambda = lambda;
            interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
            batchIndex = 0;
            // exp transition, to define the rate
            //nextLoadTime = Date.now() + (probabilityDistributions.rexp(1, 0.02) * 1000);
            nextLoadTime = Date.now() + (50 * 1000); //change after 50 seconds
        }
        // Batch regeneration with minimal overhead
        if (batchIndex >= BATCH_SIZE) {
            interArrivalTimes = probabilityDistributions.rexp(BATCH_SIZE, lambda);
            batchIndex = 0;
        }
        
        const interArrivalTime = interArrivalTimes[batchIndex++];
        
        // Calculate precise scheduled time for this message
        nextScheduledTime += interArrivalTime * 1000; // Convert to milliseconds
        
        // Compensated waiting: account for publish overhead
        const now = Date.now();
        const compensatedWaitTime = computeCompensatedWaitMs(now, nextScheduledTime, publishOverhead);
        
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
            const alpha = 0.1; // Smoothing factor
            publishOverhead = emaOverhead(overheadSamples === 0 ? undefined : publishOverhead, actualOverhead, alpha);
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
        const effectiveOutputRate = computeEffectiveRate(publishTimestamps);
            
        // 2. Recent effective rate (last 100 messages for responsiveness)
        const recentEffectiveRate = computeRecentEffectiveRate(publishTimestamps, 100) || (messageCount / elapsed);
            
        // 3. Theoretical rate from intervals (for Poisson validation)
        const theoreticalRate = computeTheoreticalRateFromIntervals(intervals, 50) || lambda;
        
        // Update metrics with most accurate rate
        actualRateTrend.add(recentEffectiveRate);
        
        // Comprehensive verification every 500 messages
        if (messageCount % 500 === 0) {
            const verification = verifyLambda(intervals.slice(-500), lambda); // Use recent 500 samples
            if (verification) {
                console.log(`=== PRECISE RATE VERIFICATION (${messageCount} msgs) ===`);
                console.log(`  TARGET OUTPUT RATE: ${lambda} msg/sec`);
                console.log(`  Effective output rate: ${recentEffectiveRate.toFixed(4)} msg/sec (${((recentEffectiveRate/lambda)*100).toFixed(2)}% of target)`);
                console.log(`  Cumulative output rate: ${(messageCount/elapsed).toFixed(4)} msg/sec`);
                console.log(`  Theoretical λ from intervals: ${theoreticalRate.toFixed(4)} (${verification.isValid ? 'VALID' : 'INVALID'} Poisson)`);
                console.log(`  Mean interval error: ${(verification.meanError * 100).toFixed(2)}%`);
                console.log(`  Variance error: ${(verification.varianceError * 100).toFixed(2)}%`);
                console.log(`  Estimated publish overhead: ${(publishOverhead * 1000).toFixed(2)}ms per message`);
                console.log(`  Scheduling accuracy: ${((nextScheduledTime - Date.now())/1000).toFixed(3)}s ahead`);
                
                // Rate control feedback
                const rateError = ((recentEffectiveRate - lambda) / lambda) * 100;
                if (Math.abs(rateError) > 2) {
                    console.log(` Rate deviation: ${rateError.toFixed(2)}% from target`);
                } else {
                    console.log(` Rate accuracy: within ±2% of target`);
                }
            }
        }
        
        // Lightweight progress logging every 100 messages
        if (messageCount % 100 === 0 && messageCount % 500 !== 0) {
            const accuracyPercent = ((recentEffectiveRate / lambda) * 100).toFixed(1);
            console.log(`[${messageCount}] Effective rate: ${recentEffectiveRate.toFixed(3)} msg/sec (${accuracyPercent}% of target λ=${lambda})`);
        }
    }
}

// Constant arrival rate function (standard K6 approach)
export const constantSend = () => {
    const msg = JSON.stringify({ 
        timestamp: Date.now(),
        distribution: 'constant',
        lambda: lambda
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
export const send = () => {
    const msg = JSON.stringify({ ts: Date.now() });

    amqp.publish({
        connectionID: connID,
        queue_name: QUEUE_NAME,
        body: msg,
        content_type: 'application/json',
        persistent: true,
    });
}

export const teardown = () => {
    /*
    console.log('\n=== FINAL LAMBDA VERIFICATION SUMMARY ===');
    console.log(`Expected λ: ${lambda} arrivals/sec`);
    console.log(`Total verification samples: ${lambdaVerificationCounter.count || 0}`);
    
    // Final summary will be shown in K6 metrics
    console.log('Check the metrics output for detailed statistics:');
    console.log('- poisson_intervals: distribution of inter-arrival times');
    console.log('- actual_rate: measured arrival rate over time');
    console.log('- lambda_verification_samples: total samples used for verification');*/
    
    try { amqp.close(connID); } catch (_) { }
}
