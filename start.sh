kubectl delete deployment/rabbitmq -n oris-predictive-autoscaler
kubectl delete pvc rabbitmq-pvc -n oris-predictive-autoscaler
kubectl delete deployment/python-service -n oris-predictive-autoscaler --ignore-not-found=true
kubectl apply -f k8s/rabbitmq.yaml -n oris-predictive-autoscaler
kubectl rollout status deployment/rabbitmq -n oris-predictive-autoscaler

# Create the namespace
kubectl apply -f k8s/namespace.yaml

# Build the Service Docker Image
docker build --no-cache -t oris-python-service:latest ./service/

# Load the Docker image into Minikube
minikube image load oris-python-service:latest

# Deploy the services
kubectl apply -f k8s/rabbitmq.yaml -n oris-predictive-autoscaler
kubectl apply -f k8s/service.yaml -n oris-predictive-autoscaler

# Verify the deployment
kubectl get pods -n oris-predictive-autoscaler

# Verify the service
# Check if the service is running with no errors
kubectl get services -n oris-predictive-autoscaler

echo "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=rabbitmq -n oris-predictive-autoscaler --timeout=120s

echo "Exposing services..."
echo "RabbitMQ Management UI will be available at: http://localhost:15672"

# Expose services (run in background)
kubectl port-forward service/rabbitmq-service 15672:15672 -n oris-predictive-autoscaler &
kubectl port-forward service/rabbitmq-service 5672:5672 -n oris-predictive-autoscaler &

echo "Port forwarding started. Press Ctrl+C to stop all services."
wait