package org.unifi.comunication;

// Required imports for Kafka
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
import org.unifi.api.K8sScaler;
import org.unifi.model.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.kubernetes.client.openapi.ApiException;
import io.kubernetes.client.openapi.models.V1Scale;



/**
 * It consumer messages from a Kafka topic containing CDF data, processes them to create an arrival process and communicates
 * with the optimizer to compute the optimal number of replicas needed to meet a specified rejection target and with K8sScaler to scale the deployment.
 * 
 */
public class Controller {

    private  volatile boolean running = true; //can be modified through different threads
    private  final ObjectMapper objectMapper = new ObjectMapper();
    private  KafkaConsumer<String, String> consumer;
    private  GenericSpline spline;
   /** private  APHArrivalProcess aphArrivalProcess;
    private  ExponentialArrivalProcess expArrivalProcess; */ 
    private ArrivalProcess arrivalProcess;
    private  Queue queue;
    private  ServiceProcess serviceProcess;
    private  BigDecimal rejectionTarget;
    private  KafkaMessage message;
    private  K8sScaler scaler;

    public  void autoConfig(Queue q, ServiceProcess service, BigDecimal rejection) {

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

    public  void startConsuming() {

        // Add shutdown hook for graceful termination
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n Shutdown signal received...");
            this.running = false;
        }));

        // === CONSUMPTION LOOP ===
        try {
            while (running) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));

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

    // Method to process the CDF message from Kafka queue
    private  void processCDFMessageAndOptimizerPassing(String messageValue, Queue queue, ServiceProcess serviceProcess, BigDecimal Rejectiontarget) {
        try {
            System.out.println("Processing CDF message...");
            System.out.println("Raw JSON: " + messageValue);

            this.message = objectMapper.readValue(messageValue, KafkaMessage.class);

            // === EXTRACT ALL FIELDS ===
            long timestamp = message.timeStamp;
            String queueName = message.queueName;
            int totalSamples = message.totalSamples;
            int cdfPoints = message.cdfPoints;
            List<Double> cdfX = message.cdfX;
            List<Double> cdfY = message.cdfY;
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
             
            System.out.println(" Building GenericSpline..."); spline =
            GenericSpline.builder().CDF(cdfX, cdfY).mean(mean).build();
            System.out.println(" GenericSpline built successfully");

            System.out.println("Generating BPH arrival process...");

            //aphArrivalProcess = ArrivalProcessFactory.generateBPH(spline, 5);
            arrivalProcess = ArrivalProcessFactory.generateExponential(spline);

            System.out.println("BPH arrival process generated successfully");

            System.out.println("🔍 Computing optimal replicas..."); 

            /**int replicas = Optimizer.minReplicaExponential(aphArrivalProcess,
            queue, serviceProcess, Rejectiontarget); System.out.println("Optimal replicas computed: " + replicas);
            */

            int replicas = Optimizer.minReplicaExponential(arrivalProcess,
            queue, serviceProcess, Rejectiontarget); System.out.println("Optimal replicas computed: " + replicas);
            



            scaler = K8sScaler.getInstance();

            if (scaler.getScaleName() != null && !scaler.getScaleName().isEmpty()) {
                try {
                    scaler.scaleWorkload(replicas);
                    System.out.println("\nRequired scaling: " + scaler.getKind() + " '" + scaler.getScaleName() + "' -> replicas = " + scaler.getReplicas());

                    boolean ok = scaler.waitForReplicas(60, 2);
                    if (ok) {
                        System.out.println("Replica target achieved.");
                    } else {
                        try {
                            V1Scale scale = scaler.readScale();
                            System.out.println("Timeout: current replicas = " + scale.getStatus().getReplicas() + ", target = " + scaler.getReplicas());
                        } catch (ApiException e) {
                            System.err.println("Failed to read scale after timeout: " + e.getResponseBody());
                        }
                    }

                } catch (Exception e) {
                    System.err.println("Error while trying to scale: " + e.getMessage());
                }
            }

        } catch (Exception e) {
            System.err.println(" Error processing CDF message: " + e.getMessage());
            System.err.println("Raw message was: " + messageValue);
        }
    }
}
