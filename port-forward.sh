NAMESPACE=oris-predictive-autoscaler

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
kubectl port-forward -n $NAMESPACE svc/sirio-controller-service 9010:9010 \
	& pid_sirio=$!

trap 'echo "\n==>  Stopping port-forward"; kill $pid_rmq_mgmt $pid_rmq_amqp $pid_prom $pid_graf $pid_kafdrop $pid_kafka $pid_sirio 2>/dev/null || true' INT TERM

echo " - RabbitMQ:  http://localhost:15672"
echo " - Prometheus: http://localhost:9090"
echo " - Grafana:    http://localhost:3000"
echo " - Kafdrop:    http://localhost:9000"
echo " (for jconsole localhost:9010)"
wait