package org.unifi.comunication;

// Required imports for Kafka
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;

// Jackson imports for JSON parsing
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;

import org.unifi.model.*;
import java.time.Duration;
import java.util.Collections;
import java.util.Properties;
import java.util.List;
import java.util.ArrayList;

//with all the methods static, we can call them without creating an instance. In this case
//it's ok because we only have one consumer for the kafka queue
public class InterArrivalKafkaConsumer {

    private static volatile boolean running = true; //can be modified through different threads
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static KafkaConsumer<String, String> consumer;
    private static GenericSpline spline;
    private static APHArrivalProcess aphArrivalProcess;
    private static Queue queue;
    private static ServiceProcess serviceProcess;
    private static BigDecimal rejectionTarget;

    
    public static void autoConfig(Queue q, ServiceProcess service, BigDecimal rejection) {

        queue = q;
        serviceProcess = service;
        rejectionTarget = rejection;

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
        properties.setProperty(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        
        // === ADDITIONAL CONFIGURATIONS ===
        properties.setProperty(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
        properties.setProperty(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, "1000");
        properties.setProperty(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "1");  // ONE AT A TIME!
        properties.setProperty(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "30000");
        properties.setProperty(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, "10000");
        properties.setProperty(ConsumerConfig.REQUEST_TIMEOUT_MS_CONFIG, "40000");

        // === CONSUMER CREATION ===
        consumer = new KafkaConsumer<>(properties);
        consumer.subscribe(Collections.singletonList(topic));
        
        System.out.println("Inter-Arrival CDF Consumer started with configuration:");
        System.out.println("  Bootstrap servers: " + bootstrapServers);
        System.out.println("  Group ID: " + groupId);
        System.out.println("  Topic: " + topic);
        System.out.println("  Waiting for CDF messages...");

    }

    public static void start_consuming(){

        // Add shutdown hook for graceful termination
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n Shutdown signal received...");
            running = false;
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
                    
                    // Process the CDF message
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
            e.printStackTrace();
        } finally {
            System.out.println("\n Closing consumer...");
            consumer.close();
        }

    }
    
    

    // Method to process the CDF message from Kafka queue
    private static void processCDFMessageAndOptimizerPassing(String messageValue, Queue queue, ServiceProcess serviceProcess, BigDecimal Rejectiontarget) {
        try {
            System.out.println("Processing CDF message...");
            System.out.println("Raw JSON: " + messageValue);
            
            KafkaMessage message = objectMapper.readValue(messageValue, KafkaMessage.class);
            
            // === EXTRACT ALL FIELDS ===

            long timestamp = message.timestamp;
            String queueName = message.queue_name;
            int totalSamples = message.total_samples;
            int cdfPoints = message.cdf_points;
            List<Double> cdfX = message.cdf_x;
            List<Double> cdfY = message.cdf_y;
            float mean = message.mean;


            //passing of consumed data
        
                
            spline = GenericSpline.builder().CDF(cdfX, cdfY).mean(mean).build();

            aphArrivalProcess = ArrivalProcessFactory.generateBPH(spline, 5);
            Optimizer.minReplicaExponential(aphArrivalProcess, queue, serviceProcess, Rejectiontarget);

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
            
        } catch (Exception e) {
            System.err.println(" Error processing CDF message: " + e.getMessage());
            e.printStackTrace();
            System.err.println("Raw message was: " + messageValue);
        }
    } 
}
