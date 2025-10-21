kubectl delete deployment inter-arrival-collector -n oris-predictive-autoscaler

docker build -t inter-arrival-collector:latest ./inter-arrival-collector/

echo "Loading the image into Minikube ..."
minikube image load inter-arrival-collector:latest

kubectl apply -f k8s/inter-arrival-collector.yaml