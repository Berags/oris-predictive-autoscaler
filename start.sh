#!/usr/bin/env bash
set -euo pipefail
eval $(minikube docker-env)

NAMESPACE=oris-predictive-autoscaler

echo "==> 👽 Creating/updating namespace"
kubectl apply -f k8s/namespace.yaml

SERVICE_VERSION=latest
SCALER_VERSION=latest
COLLECTOR_VERSION=latest

echo "==> 🔍 Rilevo daemon Docker"
DOCKER_DAEMON_NAME="$(docker info --format '{{.Name}}' 2>/dev/null || echo unknown)"
if [[ "$DOCKER_DAEMON_NAME" == "minikube" ]]; then
	echo "==> 🐳 Costruzione direttamente nel daemon Minikube: skip minikube image load"
	NEED_MINIKUBE_LOAD=0
else
	echo "==> 🐳 Costruzione nel daemon locale: userò minikube image load"
	NEED_MINIKUBE_LOAD=1
fi

echo "==> 🐍 Building Python services image (consumer, cdf-service)"
docker build -t oris-python-service:$SERVICE_VERSION ./service/

echo "==> 🛗 Building Scaler service image"
docker build -t oris-python-scaler:$SCALER_VERSION ./scaler/

echo "==> 📊 Building inter-arrival collector image"
docker build -t inter-arrival-collector:$COLLECTOR_VERSION ./inter-arrival-collector/

if [[ $NEED_MINIKUBE_LOAD -eq 1 ]]; then
	echo "==> 📦 Loading images into Minikube (no push necessario)"
	minikube image load oris-python-service:$SERVICE_VERSION
	minikube image load oris-python-scaler:$SCALER_VERSION
	minikube image load inter-arrival-collector:$COLLECTOR_VERSION
fi

echo "==> 🚀 Applying core manifests"
kubectl apply -n $NAMESPACE -f k8s/role-rbac.yaml
kubectl apply -n $NAMESPACE -f k8s/rabbitmq-config.yaml
kubectl apply -n $NAMESPACE -f k8s/rabbitmq.yaml
kubectl apply -n $NAMESPACE -f k8s/service.yaml
kubectl apply -n $NAMESPACE -f k8s/scaler.yaml
kubectl apply -n $NAMESPACE -f k8s/kafka.yaml
kubectl apply -n $NAMESPACE -f k8s/prometheus.yaml
kubectl apply -n $NAMESPACE -f k8s/grafana.yaml
kubectl apply -n $NAMESPACE -f k8s/kafdrop.yaml
kubectl apply -n $NAMESPACE -f k8s/inter-arrival-collector.yaml

kubectl delete pods --all -n oris-predictive-autoscaler

echo "==> 🔎 Initial pod status"
kubectl get pods -n $NAMESPACE

echo "==> ⏳ Waiting for main components (rabbitmq, prometheus, grafana, kafka, kafdrop)" 
kubectl wait --for=condition=ready pod -l app=rabbitmq -n $NAMESPACE --timeout=10s
kubectl wait --for=condition=ready pod -l app=prometheus -n $NAMESPACE --timeout=10s
kubectl wait --for=condition=ready pod -l app=kafka -n $NAMESPACE --timeout=10s
kubectl wait --for=condition=ready pod -l app=inter-arrival-collector -n $NAMESPACE --timeout=10s
kubectl wait --for=condition=ready pod -l app=grafana -n $NAMESPACE --timeout=10s
kubectl wait --for=condition=ready pod -l app=kafdrop -n $NAMESPACE --timeout=10s

echo "==> 🔌 Starting port-forward (Ctrl+C to close)"
kubectl port-forward -n $NAMESPACE svc/rabbitmq-service 15672:15672 \
	& pid_rmq=$!
kubectl port-forward -n $NAMESPACE svc/rabbitmq-service 5672:5672 \
	& pid_rmq=$!
kubectl port-forward -n $NAMESPACE svc/prometheus 9090:9090 \
	& pid_prom=$!
kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000 \
	& pid_graf=$!
kubectl port-forward -n $NAMESPACE svc/kafdrop 9000:9000 \
	& pid_graf=$!
kubectl port-forward -n $NAMESPACE svc/kafka-service 9092:9092 \
	& pid_kafka=$!

trap 'echo "\n==> 🛑 Stopping port-forward"; kill $pid_rmq $pid_prom $pid_graf $pid_kafka 2>/dev/null || true' INT TERM

echo "🐇 RabbitMQ:  http://localhost:15672"
echo "🔥 Prometheus: http://localhost:9090"
echo "📊 Grafana:    http://localhost:3000"
echo "🪳 Kafdrop:    http://localhost:9000"
wait
