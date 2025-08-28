FROM openjdk:26

WORKDIR /app

# Copy the already built JAR with the correct name
COPY target/sirio-controller-1.0-SNAPSHOT.jar sirio-controller-1.0-SNAPSHOT.jar

# Set environment variables for Kafka
ENV KAFKA_BOOTSTRAP_SERVERS=kafka-service.oris-predictive-autoscaler.svc.cluster.local:9092
ENV KAFKA_TOPIC_CDF=inter-arrival-cdf

# Run the application
CMD ["java", "-jar", "sirio-controller-1.0-SNAPSHOT.jar"]
