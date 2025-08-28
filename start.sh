#!/usr/bin/env bash
set -euo pipefail

NAMESPACE=oris-predictive-autoscaler

echo "==> 💣 Resetting containers environment"
kubectl delete deployments -n $NAMESPACE inter-arrival-collector --ignore-not-found=true

echo "==> 👽 Creating/updating namespace"
kubectl apply -f k8s/namespace.yaml

echo "==> 🐍 Building Python services image (consumer, cdf-service)"
docker build -t oris-python-service:latest ./service/
echo "==> 📊 Building inter-arrival collector image"
docker build -t inter-arrival-collector:latest ./inter-arrival-collector/
echo "==> 🐳 Loading images into Minikube"
minikube image load oris-python-service:latest
minikube image load inter-arrival-collector:latest

echo "==> 🚀 Applying core manifests"
kubectl apply -n $NAMESPACE -f k8s/rabbitmq-config.yaml
kubectl apply -n $NAMESPACE -f k8s/rabbitmq.yaml
kubectl apply -n $NAMESPACE -f k8s/service.yaml
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
