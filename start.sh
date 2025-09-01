set -euo pipefail

NAMESPACE=oris-predictive-autoscaler

echo "==> Resetting containers environment"
kubectl delete deployment,pods,service,statefulset -n oris-predictive-autoscaler --all --ignore-not-found=true

echo "==> Creating/updating namespace"
kubectl apply -f k8s/namespace.yaml

echo "==> Building Python services image (consumer, cdf-service)"
docker build -t oris-python-service:latest ./service/
echo "==> Building inter-arrival collector image"
docker build -t inter-arrival-collector:latest ./inter-arrival-collector/
echo "==> ☕ Building Java sirio-controller image"
docker build -t sirio-controller:latest --build-arg SKIP_TESTS=true ./sirio-controller/

echo "==> Loading images into Minikube"
minikube image load oris-python-service:latest
minikube image load inter-arrival-collector:latest
minikube image load sirio-controller:latest

echo "==>  Applying core manifests"
kubectl apply -n $NAMESPACE -f k8s/rabbitmq-config.yaml
kubectl apply -n $NAMESPACE -f k8s/rabbitmq.yaml
kubectl wait --for=condition=ready pod -l app=rabbitmq -n $NAMESPACE --timeout=60s

kubectl apply -n $NAMESPACE -f k8s/service.yaml
kubectl apply -n $NAMESPACE -f k8s/kafka.yaml
kubectl wait --for=condition=ready pod -l app=kafka -n $NAMESPACE --timeout=120s


echo "==> Verifying Kafka is fully operational..."
echo "Waiting 30 seconds for Kafka internal initialization..."
sleep 30

echo "==> Creating Kafka topic(s)"
TOPIC_NAME="inter-arrival-cdf"
KAFKA_POD=$(kubectl get pods -n "$NAMESPACE" -l app=kafka -o jsonpath='{.items[0].metadata.name}')
if [ -z "$KAFKA_POD" ]; then
	echo "Could not find Kafka pod (label app=kafka). Skipping topic creation." >&2
else
	echo "Creating topic '$TOPIC_NAME' if missing..."
	kubectl exec -n "$NAMESPACE" "$KAFKA_POD" -- bash -c '
		set -e
		KT=$(command -v kafka-topics.sh || echo /opt/kafka/bin/kafka-topics.sh)
		"$KT" --create --if-not-exists --topic '"$TOPIC_NAME"' --bootstrap-server kafka-service:9092 --partitions 1 --replication-factor 1 || true
		echo "Existing topics:"
		"$KT" --list --bootstrap-server kafka-service:9092
	' || echo "Topic creation/listing encountered a non-fatal error."
fi


kubectl apply -n $NAMESPACE -f k8s/prometheus.yaml
kubectl wait --for=condition=ready pod -l app=prometheus -n $NAMESPACE --timeout=30s

kubectl apply -n $NAMESPACE -f k8s/kube-state-metrics-rbac.yaml
kubectl apply -n $NAMESPACE -f k8s/kube-state-metrics.yaml

kubectl apply -n $NAMESPACE -f k8s/grafana.yaml
kubectl wait --for=condition=ready pod -l app=grafana -n $NAMESPACE --timeout=30s

kubectl apply -n $NAMESPACE -f k8s/kafdrop.yaml
kubectl wait --for=condition=ready pod -l app=kafdrop -n $NAMESPACE --timeout=60s

kubectl apply -n $NAMESPACE -f k8s/inter-arrival-collector.yaml
kubectl wait --for=condition=ready pod -l app=inter-arrival-collector -n $NAMESPACE --timeout=60s

kubectl apply -n $NAMESPACE -f k8s/sirio-controller-rbac.yaml
kubectl apply -n $NAMESPACE -f k8s/sirio-controller.yaml
kubectl wait --for=condition=ready pod -l app=sirio-controller -n $NAMESPACE --timeout=60s

echo "==> Initial pod status"
kubectl get pods -n $NAMESPACE

echo "==> Waiting for main components (rabbitmq, prometheus, grafana, kafka, kafdrop, sirio-controller)" 

echo "==> Starting port-forward (Ctrl+C to close)"
kubectl port-forward -n $NAMESPACE svc/rabbitmq-service 15672:15672 \
	& pid_rmq_mgmt=$!
kubectl port-forward -n $NAMESPACE svc/rabbitmq-service 5672:5672 \
	& pid_rmq_amqp=$!
kubectl port-forward -n $NAMESPACE svc/prometheus 9090:9090 \
	& pid_prom=$!
kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000 \
	& pid_graf=$!
kubectl port-forward -n $NAMESPACE svc/kafdrop 9000:9000 \
	& pid_kafdrop=$!
kubectl port-forward -n $NAMESPACE svc/kafka-service 9092:9092 \
	& pid_kafka=$!
kubectl port-forward -n $NAMESPACE svc/kube-state-metrics 8080:8080 \
	& pid_kube_state=$!

trap 'echo "\n==>  Stopping port-forward"; kill $pid_rmq_mgmt $pid_rmq_amqp $pid_prom $pid_graf $pid_kafdrop $pid_kafka 2>/dev/null || true' INT TERM

echo " - RabbitMQ:  http://localhost:15672"
echo " - Prometheus: http://localhost:9090"
echo " - Grafana:    http://localhost:3000"
echo " - Kafdrop:    http://localhost:9000"
wait
