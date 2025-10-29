kubectl delete deployment sirio-controller -n oris-predictive-autoscaler

docker build -t sirio-controller:latest ./sirio-controller

echo "Loading the image into Minikube ..."
minikube image load sirio-controller:latest

kubectl apply -f k8s/sirio-controller.yaml