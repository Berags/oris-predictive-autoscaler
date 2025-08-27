#!/usr/bin/env bash
set -euo pipefail

kubectl delete deployments --all -n oris-predictive-autoscaler
kubectl delete pods --all -n oris-predictive-autoscaler

NAMESPACE=oris-predictive-autoscaler

echo "==> 👽 Creating/updating namespace"
kubectl apply -f k8s/namespace.yaml

echo "==> 🐍 Building service image (Python)"
docker build -t oris-python-service:latest ./service/
echo "==> 🐳 Loading image into Minikube"
minikube image load oris-python-service:latest

echo "==> 📊 Building inter-arrival collector image"
docker build -t inter-arrival-collector:latest ./inter-arrival-collector/
echo "==> 🐳 Loading collector image into Minikube"
minikube image load inter-arrival-collector:latest

echo "==> 🚀 Applying core manifests"
kubectl apply -n $NAMESPACE -f k8s/rabbitmq-config.yaml
kubectl apply -n $NAMESPACE -f k8s/rabbitmq.yaml
kubectl apply -n $NAMESPACE -f k8s/service.yaml
kubectl apply -n $NAMESPACE -f k8s/kafka.yaml || true
kubectl apply -n $NAMESPACE -f k8s/prometheus.yaml
kubectl apply -n $NAMESPACE -f k8s/grafana.yaml

echo "==> 🔎 Initial pod status"
kubectl get pods -n $NAMESPACE

echo "==> ⏳ Waiting for main components (rabbitmq, prometheus, grafana)" 
kubectl wait --for=condition=ready pod -l app=rabbitmq -n $NAMESPACE --timeout=180s

echo "==> 🚀 Deploying inter-arrival collector after RabbitMQ is ready"
kubectl apply -n $NAMESPACE -f k8s/inter-arrival-collector.yaml
echo "==> ⏳ Waiting for collector to be ready"
kubectl wait --for=condition=ready pod -l app=inter-arrival-collector -n $NAMESPACE --timeout=60s

kubectl wait --for=condition=ready pod -l app=prometheus -n $NAMESPACE --timeout=180s
kubectl wait --for=condition=ready pod -l app=grafana -n $NAMESPACE --timeout=180s

echo "==> 🔌 Starting port-forward (Ctrl+C to close)"
kubectl port-forward -n $NAMESPACE svc/rabbitmq-service 15672:15672 5672:5672 \
	& pid_rmq=$!
kubectl port-forward -n $NAMESPACE svc/prometheus 9090:9090 \
	& pid_prom=$!
kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000 \
	& pid_graf=$!
kubectl port-forward -n $NAMESPACE svc/kafka-service 9092:9092 \
	& pid_kafka=$!

trap 'echo "\n==> 🛑 Stopping port-forward"; kill $pid_rmq $pid_prom $pid_graf $pid_kafka 2>/dev/null || true' INT TERM

echo "🐇 RabbitMQ:  http://localhost:15672"
echo "🔥 Prometheus: http://localhost:9090"
echo "📊 Grafana:    http://localhost:3000"
echo "📨 Kafka:      localhost:9092"
wait
