#!/bin/bash

# ORIS Predictive Autoscaler - Cleanup Script
# This script removes all resources from Kubernetes

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

# Change to the k8s directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_warning "This will delete all ORIS Predictive Autoscaler resources from Kubernetes!"
read -p "Are you sure you want to continue? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    print_info "Cleanup cancelled."
    exit 0
fi

print_info "Starting cleanup of ORIS Predictive Autoscaler..."

# Function to delete a component
delete_component() {
    local component=$1
    local path=$2
    
    print_info "Deleting $component..."
    if kubectl delete -k "$path" --ignore-not-found=true; then
        print_info "$component deleted successfully"
        return 0
    else
        print_warning "Failed to delete $component (may not exist)"
        return 1
    fi
}

# Delete in reverse order
print_info "========================================"
print_info "Step 1: Deleting application services"
print_info "========================================"
delete_component "Application Services" "services"

print_info "========================================"
print_info "Step 2: Deleting autoscaling components"
print_info "========================================"
delete_component "Autoscaling" "autoscaling"

print_info "========================================"
print_info "Step 3: Deleting observability stack"
print_info "========================================"
delete_component "Observability" "observability"

print_info "========================================"
print_info "Step 4: Deleting messaging infrastructure"
print_info "========================================"
delete_component "Messaging" "messaging"

print_info "========================================"
print_info "Step 5: Deleting components"
print_info "========================================"
delete_component "Components" "components"

print_info "========================================"
print_info "Step 6: Deleting namespace"
print_info "========================================"
delete_component "Namespace" "base"

print_info "========================================"
print_info "Cleanup completed!"
print_info "========================================"

# Display remaining resources
print_info ""
print_info "Checking for remaining resources..."
kubectl get all -n oris-predictive-autoscaler 2>/dev/null || print_info "Namespace cleaned up successfully"
