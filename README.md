# ORIS Predictive Autoscaler

## Project Structure

```
.
├── inter-arrival-collector # Service that extarct CDF from inter arrival times
│   ├── collect_inter_arrivals.py
│   ├── Dockerfile
│   └── requirements.txt
├── k6 # Implementation of the test workload
│   ├── build-and-run.sh
│   ├── Dockerfile
│   ├── lib
│   │   ├── index.js
│   │   ├── LICENSE.txt
│   │   ├── package.json
│   │   ├── probability-distributions-k6
│   │   ├── README.md
│   │   └── test
│   │       └── index.js
│   └── rabbitmq-test.js
├── k8s # Various configuration for used services
│   ├── grafana.yaml
│   ├── inter-arrival-collector.yaml
│   ├── kafdrop.yaml
│   ├── kafka.yaml
│   ├── kube-state-metrics-rbac.yaml
│   ├── kube-state-metrics.yaml
│   ├── namespace.yaml
│   ├── prometheus.yaml
│   ├── rabbitmq-config.yaml
│   ├── rabbitmq.yaml
│   ├── service.yaml
│   ├── sirio-controller-rbac.yaml
│   └── sirio-controller.yaml
├── service # Consumer Service
│   ├── Dockerfile
│   ├── requirements.txt
│   └── service.py
├── sirio-controller # Implementation of a Horizontal Scaler using Sirio projection of Rejection Rate
│   ├── Dockerfile
│   ├── pom.xml
│   └── src
│       ├── main
│       └── test
└── start.sh
```

## Quick Start

### 0. Get all the Code
The command for coping the repository.
```bash
git clone https://github.com/Berags/oris-predictive-autoscaler.git
```
### 1. Cluster Deployment
First you should deploy the sistem using the following script.
```bash
# make the script executable
chmod +x deploy.sh

# start the cluster
./start.sh
```
At the end it will be exposed some Web GUI to monitor the system.

### 2. Run k6 tests
After the system deployment it spossible to subject it with some workload with the following code:
```bash
# make the script executable
chmod +x k6/build-and-run.sh

# start the cluster
./k6/build-and-run.sh
```
This is instrumented to show some information about the workload.

### 3. Exposed Services

- **RabbitMQ Management**: http://localhost:15672
  - Username: `admin`
  - Password: `password`
- **Grafana Dashboard**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
- **Prometheus Web GUI**: http://localhost:9090
- **Kafka Web GUI**: http://localhost:9000

## Configuration

### Python Service

The Python service can be configured using environment variables:
- `RABBITMQ_HOST`: RabbitMQ Host (default: rabbitmq-service)
- `RABBITMQ_PORT`: RabbitMQ Port (default: 5672)
- `RABBITMQ_USER`: RabbitMQ Username (default: admin)
- `RABBITMQ_PASS`: RabbitMQ Password (default: password)

### RabbitMQ

RabbitMQ is configured with:
- Management interface enabled
- Porta AMQP: 5672
- Porta Management: 15672
- Default Credentials: admin/password

