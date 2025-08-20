# ORIS Predictive Autoscaler

## Project Structure

```
.
├── README.md
├── start.sh                # Start the k8s cluster
├── service/
│   ├── service.py          # Dummy consumer service
│   ├── requirements.txt    # Service libraries requirements
│   └── Dockerfile          # Dockerfile for service container
└── k8s/
    ├── namespace.yaml      # Kubernetes Namespace for cluster
    ├── rabbitmq.yaml       # Deployment for RabbitMQ
    └── python-service.yaml # Deployment for dummy service
```

## Quick Start

### 1. Cluster Deployment

```bash
# make the script executable
chmod +x deploy.sh

# start the cluster
./start.sh
```

### 2. Exposed Services

- **RabbitMQ Management**: http://localhost:30672
  - Username: `admin`
  - Password: `password`


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