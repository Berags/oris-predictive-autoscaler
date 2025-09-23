########### STAGE 1: Build ###########
FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /build

# Copia solo il pom per sfruttare meglio la cache dei layer
COPY pom.xml .
# Pre-download dependencies (use dummy pom if necessary)
RUN mvn -B -q dependency:resolve dependency:resolve-plugins || true

# Copy source code
COPY src ./src

# Arg to optionally skip tests (default: run tests)
ARG SKIP_TESTS=false

# Compile and create shaded jar
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
ENV JAVA_OPTS="-XX:+UseContainerSupport \
	-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError -Xmx768M\
	-Dcom.sun.management.jmxremote \
	-Dcom.sun.management.jmxremote.port=9010 \
	-Dcom.sun.management.jmxremote.rmi.port=9010 \
	-Dcom.sun.management.jmxremote.local.only=false \
	-Dcom.sun.management.jmxremote.authenticate=false \
	-Dcom.sun.management.jmxremote.ssl=false \
	-Djava.rmi.server.hostname=localhost \
"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["bash", "-c", "jps >/dev/null 2>&1 || exit 1"]

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
