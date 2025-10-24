package org.unifi.comunication;

// Required imports for Kafka
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.unifi.api.AbstractUpdater;
import org.unifi.api.ImmediateUpdater;
import org.unifi.api.K8sScaler;
import org.unifi.model.ArrivalProcess;
import org.unifi.model.ArrivalProcessFactory;
import org.unifi.model.GenericSpline;
import org.unifi.model.Optimizer;
import org.unifi.model.Queue;
import org.unifi.model.ServiceProcess;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.kubernetes.client.openapi.ApiException;

/**
 * It consumer messages from a Kafka topic containing CDF data, processes them
 * to create an arrival process and communicates with the optimizer to compute
 * the optimal number of replicas needed to meet a specified rejection target
 * and with K8sScaler to scale the deployment.
 *
 */
public class Recommender {

    private volatile boolean running = true; //can be modified through different threads
    private final ObjectMapper objectMapper = new ObjectMapper();
    private KafkaConsumer<String, String> consumer;
    private GenericSpline spline;
    private ArrivalProcess arrivalProcess;
    private Queue queue;
    private ServiceProcess serviceProcess;
    private BigDecimal rejectionTarget;
    private KafkaMessage message;
    private AbstractUpdater updater;
    private boolean useBHP = false;
    private int phases;
    private int timeout = 1_000;

    public Recommender() throws IOException {
        updater = new ImmediateUpdater();
    }

    public void autoConfig(Queue q, ServiceProcess service, BigDecimal rejection) {

        this.queue = q;
        this.serviceProcess = service;
        this.rejectionTarget = rejection;

        // === CONFIGURATION ===
        // Kafka broker address - use environment variable for Kubernetes
        String bootstrapServers = System.getenv().getOrDefault("KAFKA_BOOTSTRAP_SERVERS", "kafka-service:9092");

        // Consumer group ID
        String groupId = System.getenv().getOrDefault("KAFKA_GROUP_ID", "sirio-controller-group");

        // Topic name - NOTE: Python publishes to 'inter-arrival-cdf'
        String topic = System.getenv().getOrDefault("KAFKA_TOPIC", "inter-arrival-cdf");

        // Properties object to hold all configurations
        Properties properties = new Properties();

        // === MANDATORY CONFIGURATIONS ===
        properties.setProperty(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        properties.setProperty(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.setProperty(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.setProperty(ConsumerConfig.GROUP_ID_CONFIG, groupId);
        properties.setProperty(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        // === ADDITIONAL CONFIGURATIONS ===
        properties.setProperty(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
        properties.setProperty(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, "1000");
        properties.setProperty(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "1");  // ONE AT A TIME!
        properties.setProperty(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "30000");
        properties.setProperty(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, "10000");
        properties.setProperty(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, "40000");
        // Increase timeout for long-running scaling operations
        properties.setProperty(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, "600000"); // 10 minutes

        // === CONSUMER CREATION ===
        consumer = new KafkaConsumer<>(properties);
        consumer.subscribe(Collections.singletonList(topic));

        System.out.println("Inter-Arrival CDF Consumer started with configuration:");
        System.out.println("  Bootstrap servers: " + bootstrapServers);
        System.out.println("  Group ID: " + groupId);
        System.out.println("  Topic: " + topic);
        System.out.println("  Waiting for CDF messages...");

    }

    public void autoConfigBPH(Queue q, ServiceProcess service, BigDecimal rejection, int phases) {
        useBHP = true;
        this.phases = phases;
        autoConfig(q, service, rejection);
    }

    public void startConsuming() {

        // Add shutdown hook for graceful termination
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n Shutdown signal received...");
            this.running = false;
        }));

        // === CONSUMPTION LOOP ===
        try {
            while (running) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(this.timeout));

                for (ConsumerRecord<String, String> record : records) {
                    System.out.println("\n===  NEW CDF MESSAGE ===");
                    System.out.println("Topic: " + record.topic());
                    System.out.println("Partition: " + record.partition());
                    System.out.println("Offset: " + record.offset());
                    System.out.println("Timestamp: " + record.timestamp());
                    System.out.println("Key: " + record.key());
                    processCDFMessageAndOptimizerPassing(record.value(), queue, serviceProcess, rejectionTarget);
                    System.out.println("========================\n");
                }
                if (records.isEmpty()) {
                    try {
                        updater.scaleWorkload(1);
                    } catch (ApiException e) {
                        System.err.println("Error while trying to scale: " + e.getMessage());
                    }

                    System.out.print(".");
                    System.out.flush();
                }
            }

        } catch (Exception e) {
            System.err.println(" Error in consumer: " + e.getMessage());
        } finally {
            System.out.println("\n Closing consumer...");
            consumer.close();
        }

    }

    public void setStrategy(AbstractUpdater updater) {
        this.updater = updater;
    }

    // Method to process the CDF message from Kafka queue
    private void processCDFMessageAndOptimizerPassing(String messageValue, Queue queue, ServiceProcess serviceProcess, BigDecimal Rejectiontarget) {
        try {
            System.out.println("Processing CDF message...");
            System.out.println("Raw JSON: " + messageValue);

            this.message = objectMapper.readValue(messageValue, KafkaMessage.class);

            // === EXTRACT ALL FIELDS ===
            long timestamp = message.timestamp;
            String queueName = message.queue_name;
            int totalSamples = message.total_samples;
            int cdfPoints = message.cdf_points;
            List<Double> cdfX = message.cdf_x;
            List<Double> cdfY = message.cdf_y;
            float mean = message.mean;

            // CDF data arrays
            List<Double> interArrivalTimes = new ArrayList<>(cdfX);
            List<Double> cdfValues = new ArrayList<>(cdfY);

            // === PRINT EXTRACTED DATA ===
            System.out.println("Extracted CDF Data:");
            System.out.println("  Timestamp: " + timestamp + " (" + new java.util.Date(timestamp) + ")");
            System.out.println("  Queue Name: " + queueName);
            System.out.println("  Total Samples: " + totalSamples);
            System.out.println("  CDF Points: " + cdfPoints);
            System.out.println("  Inter-arrival times count: " + interArrivalTimes.size());
            System.out.println("  CDF values count: " + cdfValues.size());

            System.out.println(" CDF message processed successfully!");

            //passing of consumed data 
            System.out.println(" Starting mathematical computation...");

            System.out.println(" Building GenericSpline...");
            spline
                    = GenericSpline.builder().CDF(cdfX, cdfY).mean(mean).build();
            System.out.println(" GenericSpline built successfully");

            if (useBHP) {
                System.out.printf("Generating BPH arrival process with %d phases\n", phases);
                arrivalProcess = ArrivalProcessFactory.generateBPH(spline, phases);
            } else {
                System.out.printf("Generating Exponential arrival process with %d phases\n", phases);
                arrivalProcess = ArrivalProcessFactory.generateExponential(spline);
            }

            System.out.println("🔍 Computing optimal replicas...");
            int newReplicas = Optimizer.minReplicaExponential(arrivalProcess,
                    queue, serviceProcess, Rejectiontarget);
            System.out.println("Optimal replicas computed: " + newReplicas);

            try {
                K8sScaler scaler = K8sScaler.getInstance();
                System.out.println("Current replicas: " + scaler.getReplicas());
                System.out.println("Model Suggested replicas: " + newReplicas);
                int recommended = updater.scaleWorkload(newReplicas);
                System.out.println("Recommended replicas: " + recommended);
            } catch (ApiException e) {
                System.err.println("Error while reading scale or scaling: " + e.getResponseBody());
            }
        } catch (IOException e) {
            System.err.println(" Error processing CDF message: " + e.getMessage());
            System.err.println("Raw message was: " + messageValue);
        }
    }

    public void setTimeout(int timeout) {
        this.timeout = Math.max(timeout, 0);
    }
}
