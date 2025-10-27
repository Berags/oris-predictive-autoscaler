#!/bin/bash

# ORIS Predictive Autoscaler - Deployment Script
# This script deploys the entire application stack to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check if kustomize is available (kubectl 1.14+ has it built-in)
if ! kubectl kustomize --help &> /dev/null; then
    print_error "kustomize is not available. Please install kustomize or upgrade kubectl."
    exit 1
fi

# Change to the k8s directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_info "Starting deployment of ORIS Predictive Autoscaler..."

# Function to deploy a component
deploy_component() {
    local component=$1
    local path=$2
    
    print_info "Deploying $component..."
    if kubectl apply -k "$path"; then
        print_info "$component deployed successfully"
        return 0
    else
        print_error "Failed to deploy $component"
        return 1
    fi
}

# Deploy in order (respecting dependencies)
print_info "========================================"
print_info "Step 1: Deploying base (namespace)"
print_info "========================================"
deploy_component "Namespace" "base" || exit 1

sleep 2

print_info "========================================"
print_info "Step 2: Deploying components (metrics-server)"
print_info "========================================"
deploy_component "Metrics Server" "components" || print_warning "Metrics server deployment failed (may already exist)"

sleep 2

print_info "========================================"
print_info "Step 3: Deploying messaging infrastructure"
print_info "========================================"
deploy_component "Messaging (RabbitMQ, Kafka, Kafdrop)" "messaging" || exit 1

sleep 5

print_info "========================================"
print_info "Step 4: Deploying observability stack"
print_info "========================================"
deploy_component "Observability (Prometheus, Grafana, kube-state-metrics)" "observability" || exit 1

sleep 5

print_info "========================================"
print_info "Step 5: Deploying autoscaling components"
print_info "========================================"
deploy_component "Autoscaling (Prometheus Adapter, HPA)" "autoscaling" || exit 1

sleep 5

print_info "========================================"
print_info "Step 6: Deploying application services"
print_info "========================================"
deploy_component "Application Services" "services" || exit 1

print_info "========================================"
print_info "Deployment completed successfully!"
print_info "========================================"

# Wait for pods to be ready
print_info "Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod --all -n oris-predictive-autoscaler --timeout=300s || print_warning "Some pods are not ready yet"

# Display deployment status
print_info ""
print_info "Deployment status:"
kubectl get all -n oris-predictive-autoscaler

./port-forward.sh