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


class DistributionFactory {
    static #handlers = {
        "exponential": (params) => this.getExponential(params[0]),
        "poisson": (params) => this.getExponential(params[0]),
        "uniform": (params) => this.getUniform(...params[0]),
        "erlang": (params) => this.getErlang(...params[0]),
    };

    static getFromType(type, ...params) {
        const handler = this.#handlers[type.toLowerCase()];
        if (handler) {
            return handler(params);
        }
        throw new Error(`The given distribution type '${type}' is not supported`);
    }

    static getUniform(min, max) {
        console.log(`Uniform distribution between ${min} and ${max}`);
        return () => probabilityDistributions.runif(1, min, max);
    }

    static getDeterministic(time) {
        return () => time;
    }

    static getExponential(lambda) {
        return () => probabilityDistributions.rexp(1, lambda);
    }
    static getErlang(k, lambda) {

        return () => {                           
        let sum = 0;
        for(let i = 0; i < k; i++) {
            sum += probabilityDistributions.rexp(1, lambda)[0]; 
        }
        return sum;
    };
    }
}

const RABBITMQ_HOST = __ENV.RABBITMQ_HOST || 'localhost';
const RABBITMQ_PORT = __ENV.RABBITMQ_PORT || '5672';
const RABBITMQ_USER = __ENV.RABBITMQ_USER || 'admin';
const RABBITMQ_PASSWORD = __ENV.RABBITMQ_PASSWORD || 'password';
const QUEUE_NAME = 'message-queue';


const PARAM_ARRAY_JSON = __ENV.PARAM_ARRAY || '[3]'; // arrival rate per second
const TEST_DURATION = __ENV.TEST_DURATION || '30s';
const DISTRIBUTION = __ENV.DISTRIBUTION || 'poisson'; // 'constant' or 'poisson'
const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;

let PARAM_ARRAY;
try {
    PARAM_ARRAY = JSON.parse(PARAM_ARRAY_JSON);
} catch (e) {
    console.log('Error parsing PARAM_ARRAY, using default [3]');
    PARAM_ARRAY = [3];
}

console.log(`Lambda values to test: [${PARAM_ARRAY.join(', ')}]`);

console.log(`RabbitMQ connection: ${AMQP_URL}`);
console.log(`Test distribution: ${DISTRIBUTION}, λ=${PARAM_ARRAY_JSON} arrivals/sec, duration: ${TEST_DURATION}`);

// Metrics for lambda verification
const intervalTrend = new Trend('poisson_intervals');
const actualRateTrend = new Trend('actual_rate');
const lambdaVerificationCounter = new Counter('lambda_verification_samples');

const connID = amqp.start({ connection_url: AMQP_URL });

// Lambda verification function moved to './utils/verifyLambda.js'

queue.declare({
    connectionID: connID,
    name: QUEUE_NAME,
    durable: true,
    args: { 'x-max-length': 100 },
});

export const genericProcess = () => {

    // const transitionTime = DistributionFactory.getExponential(20);
    const transitionTime = DistributionFactory.getDeterministic(60);
    const stateDistributions = [];
    for (let i = 0; i < PARAM_ARRAY.length; i++) {
        stateDistributions.push(DistributionFactory.getFromType(DISTRIBUTION, PARAM_ARRAY[i]));
    }

    let messageCount = 0;
    let currentState = 0;
    const startTime = Date.now();
    const intervals = [];
    const publishTimestamps = []; // Track actual publish times for rate calculation
    let postPublishTime = 0;

    // Timing compensation variables
    let nextScheduledTime = Date.now(); // Absolute time when next message should be sent
    let publishOverhead = 0; // Running average of publish overhead
    let overheadSamples = 0;
    const MAX_OVERHEAD_SAMPLES = 200; // Limit overhead calculation to recent samples
    
    // Pre-allocate arrays for efficiency
    // Overhead tracking handled via EMA in metrics utils
    
    // Pre-build message template to reduce JSON overhead
    const baseMsg = {
        distribution: 'Message',
        value: "0"
    };

    let nextLoadTime = Date.now() + transitionTime() * 1000;
    while (true) {
        if (Date.now() >= nextLoadTime) {
            currentState = (currentState + 1) % stateDistributions.length;
            nextLoadTime = Date.now() + transitionTime() * 1000;
        }
        
        const interArrivalTime = stateDistributions[currentState]();
        
        // Calculate precise scheduled time for this message
        nextScheduledTime +=  interArrivalTime * 1000; // Convert to milliseconds
        
        // Compensated waiting: account for publish overhead
        const now = Date.now();
        const compensatedWaitTime = computeCompensatedWaitMs(now, nextScheduledTime, publishOverhead);

        // Efficient sleep with sub-millisecond precision
        sleep(compensatedWaitTime / 1000);
        
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
        postPublishTime = Date.now();
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
        baseMsg.value = messageCount;
        
        // Calculate multiple rate metrics for accuracy comparison
        const elapsed = (Date.now() - startTime) / 1000;
        
        // 1. True effective output rate (based on actual publish timestamps)
        const effectiveOutputRate = computeEffectiveRate(publishTimestamps);
            
        // 2. Recent effective rate (last 100 messages for responsiveness)
        const recentEffectiveRate = computeRecentEffectiveRate(publishTimestamps, 100) || (messageCount / elapsed);
            
        // 3. Theoretical rate from intervals (for Poisson validation)
        //const theoreticalRate = computeTheoreticalRateFromIntervals(intervals, 50) || lambda;
        
        // Update metrics with most accurate rate
        actualRateTrend.add(recentEffectiveRate);
        
        // Comprehensive verification every 500 messages
        /*
        if (messageCount % 500 === 0) {
            //const verification = verifyLambda(intervals.slice(-500), lambda); // Use recent 500 samples
            if (verification) {
                console.log(`=== PRECISE RATE VERIFICATION (${messageCount} msgs) ===`);
                //console.log(`  TARGET OUTPUT RATE: ${lambda} msg/sec`);
                //console.log(`  Effective output rate: ${recentEffectiveRate.toFixed(4)} msg/sec (${((recentEffectiveRate/lambda)*100).toFixed(2)}% of target)`);
                console.log(`  Cumulative output rate: ${(messageCount/elapsed).toFixed(4)} msg/sec`);
                //console.log(`  Theoretical λ from intervals: ${theoreticalRate.toFixed(4)} (${verification.isValid ? 'VALID' : 'INVALID'} Poisson)`);
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
        /*
        // Lightweight progress logging every 100 messages
        if (messageCount % 100 === 0 && messageCount % 500 !== 0) {
            //const accuracyPercent = ((recentEffectiveRate / lambda) * 100).toFixed(1);
            //console.log(`[${messageCount}] Effective rate: ${recentEffectiveRate.toFixed(3)} msg/sec (${accuracyPercent}% of target λ=${lambda})`);
        }
        */
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

export const options = {
    scenarios: {
        arrivals: {
            executor: 'per-vu-iterations',
            vus: 1,
            iterations: 1, 
            maxDuration: TEST_DURATION,
            exec: 'genericProcess'
        }
    }
};
//genericProcess(transitionTime, stateDistributions);