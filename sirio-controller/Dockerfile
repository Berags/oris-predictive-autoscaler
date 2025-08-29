########### STAGE 1: Build ###########
FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /build

# Copia solo il pom per sfruttare meglio la cache dei layer
COPY pom.xml .
# Pre-scarica le dipendenze (usa un pom fittizio se necessario)
RUN mvn -B -q dependency:resolve dependency:resolve-plugins || true

# Copia il codice sorgente
COPY src ./src

# Arg per saltare i test opzionalmente (default: esegui test)
ARG SKIP_TESTS=false

# Compila e crea il jar shaded
RUN if [ "$SKIP_TESTS" = "true" ]; then \
			mvn -B -q clean package -DskipTests; \
		else \
			mvn -B -q clean package; \
		fi

########### STAGE 2: Runtime ###########
FROM eclipse-temurin:21-jre AS runtime

WORKDIR /app

# Variabili ambiente (personalizzabili a runtime)
ENV KAFKA_BOOTSTRAP_SERVERS=kafka-service.oris-predictive-autoscaler.svc.cluster.local:9092 \
		KAFKA_TOPIC_CDF=inter-arrival-cdf

# Copy jar from builder
COPY --from=build /build/target/sirio-controller-1.0-SNAPSHOT.jar app.jar

# Improve startup (Java 21) and footprint size
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["bash", "-c", "jps >/dev/null 2>&1 || exit 1"]

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
