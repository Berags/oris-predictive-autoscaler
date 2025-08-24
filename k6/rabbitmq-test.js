/**
 * k6 load script that publishes messages to a RabbitMQ queue following either:
 *  1. A constant arrival rate using the built‑in k6 'constant-arrival-rate' executor, or
 *  2. A stochastic inter‑arrival process (currently Poisson exponential) implemented manually
 *     inside a per-VU loop ("stochasticProcess") so we can validate properties (mean / variance)
 *     of the generated inter‑arrival times against the theoretical λ parameter.
 *
 * Environment variables (defaults in parentheses):
 *  - RABBITMQ_HOST (localhost)
 *  - RABBITMQ_PORT (5672)
 *  - RABBITMQ_USER (admin)
 *  - RABBITMQ_PASSWORD (password)
 *  - LAMBDA  (10)  -> target arrival rate (messages / second)
 *  - TEST_DURATION (30s) -> duration accepted by k6 executors (e.g. 30s, 2m, 1h)
 *  - DISTRIBUTION (constant|poisson) -> arrival process type
 *
 * Metrics exported:
 *  - poisson_intervals (Trend): raw inter‑arrival samples (seconds)
 *  - actual_rate (Trend): rolling estimate of achieved arrival rate (1 / mean recent interval)
 *  - lambda_verification_samples (Counter): count of intervals sampled (for stochastic mode)
 *
 * Two execution modes (scenarios):
 *  - constant_arrivals  -> automatic pacing handled by k6 executor (accurate global rate)
 *  - stochastic_arrivals -> we explicitly draw inter‑arrival times and sleep(dt) (good for
 *                           validating statistical properties, but rate accuracy depends on
 *                           scheduling & execution latency)
 *
 * Implementation notes:
 *  - Welford's online algorithm is used for a numerically stable running mean/variance.
 *  - A small sliding window estimates instantaneous rate (recent 100 samples by default).
 *  - Additional distributions (normal, uniform) are scaffolded but require MU/SIGMA/etc.
 */
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

// Test parameters (rate λ expressed in messages per second)
const LAMBDA = parseFloat(__ENV.LAMBDA) || 10; // arrival rate per second
const TEST_DURATION = __ENV.TEST_DURATION || '30s';
const DISTRIBUTION = __ENV.DISTRIBUTION || 'constant'; // 'constant' or 'poisson'

const AMQP_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/`;
console.log(`RabbitMQ connection: ${AMQP_URL}`);
console.log(`Test distribution: ${DISTRIBUTION}, λ=${LAMBDA} arrivals/sec, duration: ${TEST_DURATION}`);

// Metrics for λ (lambda) verification & monitoring of stochastic arrivals
const intervalTrend = new Trend('poisson_intervals');
const actualRateTrend = new Trend('actual_rate');
const lambdaVerificationCounter = new Counter('lambda_verification_samples');

// Build k6 scenarios dynamically based on desired distribution.
// constant: rely on constant-arrival-rate executor
// stochastic: single VU that self-paces using sampled inter-arrivals
const createScenarios = () => {
    if (DISTRIBUTION === 'constant') {
        return {
            constant_arrivals: {
                executor: 'constant-arrival-rate',
                rate: LAMBDA,
                timeUnit: '1s',
                duration: TEST_DURATION,
                preAllocatedVUs: 10,
                maxVUs: 50,
                exec: 'constantSend'
            }
        };
    }
    return {
        stochastic_arrivals: {
            executor: 'per-vu-iterations',
            vus: 1,
            iterations: 1,
            maxDuration: TEST_DURATION,
            exec: 'stochasticProcess'
        }
    };
}

export const options = { scenarios: createScenarios() };

const connID = amqp.start({ connection_url: AMQP_URL });

// Collection of inter-arrival time generators (seconds).
// NOTE: Only 'poisson' is currently parameterized via λ; others are placeholders needing
// MU / SIGMA / UNIFORM_{MIN,MAX} definitions if used.
const distributionGenerators = {
    poisson: () => probabilityDistributions.rexp(1, LAMBDA)[0],
    normal: () => {
        while (true) {
            const v = probabilityDistributions.rnorm
                ? probabilityDistributions.rnorm(1, MU, SIGMA)[0]
                : (() => {
                    const u1 = Math.random(), u2 = Math.random();
                    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    return MU + SIGMA * z;
                })();
            if (v > 0) return v;
        }
    },
    uniform: () => {
        const v = UNIFORM_MIN + Math.random() * (UNIFORM_MAX - UNIFORM_MIN);
        return v > 0 ? v : 1 / LAMBDA;
    }
};


// Lambda verification function (unused in current logging loop but retained for potential
// batch evaluation). Given a list of sampled inter-arrival times, compare empirical mean &
// variance against the theoretical exponential distribution (mean=1/λ, var=1/λ²).
const verifyLambda = (intervals, expectedLambda) =>{
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

// Return the next inter-arrival time (seconds) according to selected distribution.
function getInterArrival() {
    return (distributionGenerators[DISTRIBUTION] || distributionGenerators.poisson)();
}

// Online statistics helper using Welford's algorithm for stable mean/variance.
function makeStats() {
    let n = 0, mean = 0, M2 = 0;
    return {
        // incorporate a new sample
        push(x) {
            n++;
            const delta = x - mean;
            mean += delta / n;
            M2 += delta * (x - mean);
        },
        // snapshot of current sample count, mean, variance (population)
        snapshot() {
            if (n === 0) return null;
            const variance = n > 1 ? M2 / n : 0;
            return { n, mean, variance };
        }
    };
}

/**
 * Stochastic arrival process executor.
 * Generates inter-arrival times, sleeps, publishes one message per interval.
 * Continues until k6 terminates the VU (maxDuration). A sliding window of the
 * most recent RECENT samples estimates an instantaneous rate.
 */
export const stochasticProcess = () => {
    const stats = makeStats();
    const RECENT = 100;
    const recent = [];
    let count = 0;
    const start = Date.now();

    console.log(`Start stochastic distribution=${DISTRIBUTION} λ=${LAMBDA}`);

    while(true) { // infinite loop; k6 will stop it per scenario maxDuration
        const dt = getInterArrival();
        stats.push(dt);
        intervalTrend.add(dt);
        lambdaVerificationCounter.add(1);

        // Maintain sliding window for recent average (instantaneous rate estimate)
        recent.push(dt);
        if (recent.length > RECENT) recent.shift();

        sleep(dt);
        const msg = JSON.stringify({ 
            timestamp: Date.now(),
            distribution: DISTRIBUTION,
            lambda: LAMBDA,
            inter_arrival: dt
        });
        amqp.publish({
            connectionID: connID,
            queue_name: QUEUE_NAME,
            body: msg,
            content_type: 'application/json',
            persistent: true,
        });

        count++;
        const elapsed = (Date.now() - start) / 1000;
        const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
        const rate = 1 / avgRecent;
        actualRateTrend.add(rate);

    if (count % 100 === 0) { // periodic lightweight progress log
            console.log(`[${DISTRIBUTION}] msgs=${count} elapsed=${elapsed.toFixed(1)}s rate=${rate.toFixed(2)}`);
        }
    if (count % 500 === 0) { // more detailed statistical check
            const snap = stats.snapshot();
            if (snap) {
                const expectedMean = 1 / LAMBDA;
                const meanErr = Math.abs(snap.mean - expectedMean) / expectedMean;
                console.log(`[${DISTRIBUTION}] verify n=${snap.n} mean=${snap.mean.toFixed(4)} err=${(meanErr*100).toFixed(2)}% est.lambda=${(1/snap.mean).toFixed(3)}`);
            }
        }
    }
};


// Constant arrival rate function (standard K6 approach)
/**
 * Constant arrival rate handler invoked by k6 for each generated arrival
 * (constant-arrival-rate executor pre-paces invocations at target λ).
 */
export const constantSend = () => {
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

// Teardown hook: finalize & close AMQP connection.
export const teardown = () => {
    console.log('\n=== FINAL LAMBDA VERIFICATION SUMMARY ===');
    console.log(`Expected λ: ${LAMBDA} arrivals/sec`);
    console.log(`Total verification samples: ${lambdaVerificationCounter.count || 0}`);
    
    // Final summary will be shown in K6 metrics
    console.log('Check the metrics output for detailed statistics:');
    console.log('- poisson_intervals: distribution of inter-arrival times');
    console.log('- actual_rate: measured arrival rate over time');
    console.log('- lambda_verification_samples: total samples used for verification');
    
    try { amqp.close(connID); } catch (_) { /* ignore */ }
}
