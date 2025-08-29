#!/usr/bin/env python3
import os
import sys
import time
from kubernetes import client, config
from kubernetes.client import ApiException
from kafka import KafkaConsumer
import json

def load_k8s_config(kubeconfig=None, context=None):
    try:
        if os.getenv("KUBERNETES_SERVICE_HOST") or os.path.exists("/var/run/secrets/kubernetes.io/serviceaccount/token"):
            config.load_incluster_config()
            return "in-cluster"
    except Exception as e:
        print(f"Error loading Kubernetes in-cluster configuration: {e}", file=sys.stderr)
        sys.exit(1)


def get_api_token(source):
    # Obtaining token from service account
    sa_token_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    if source == "in-cluster" and os.path.exists(sa_token_path):
        try:
            with open(sa_token_path, "r") as f:
                return f.read().strip()
        except Exception:
            pass
    return None


def list_pods(namespace):
    """
    Returns a list of tuples (name, phase, ip) for each pod in namespace.
    """
    v1 = client.CoreV1Api()
    pods = v1.list_namespaced_pod(namespace=namespace)
    return [(p.metadata.name, p.status.phase, (p.status.pod_ip or "-")) for p in pods.items]


def scale_workload(kind, namespace, name, replicas):
    apps = client.AppsV1Api()
    body = {"spec": {"replicas": int(replicas)}}
    try:
        if kind == "deployment":
            apps.patch_namespaced_deployment_scale(name=name, namespace=namespace, body=body)
        elif kind == "statefulset":
            apps.patch_namespaced_stateful_set_scale(name=name, namespace=namespace, body=body)
        elif kind == "replicaset":
            apps.patch_namespaced_replica_set_scale(name=name, namespace=namespace, body=body)
        else:
            raise ValueError(f"Kind not supported: {kind}")
    except ApiException as e:
        msg = e.reason or str(e)
        if e.body:
            msg += f" | body: {e.body}"
        raise RuntimeError(f"Error while trying to scale: {msg}") from e


def read_scale(kind, namespace, name):
    apps = client.AppsV1Api()
    if kind == "deployment":
        return apps.read_namespaced_deployment_scale(name=name, namespace=namespace)
    if kind == "statefulset":
        return apps.read_namespaced_stateful_set_scale(name=name, namespace=namespace)
    if kind == "replicaset":
        return apps.read_namespaced_replica_set_scale(name=name, namespace=namespace)
    raise ValueError(f"Kind not supported: {kind}")


def wait_for_replicas(kind, namespace, name, target, timeout=60, interval=2):
    """
    waits for scale.status.replicas to respond.
    """
    elapsed = 0
    while elapsed < timeout:
        try:
            scale = read_scale(kind, namespace, name)
            current = getattr(scale.status, "replicas", None)
            if current == target:
                return True, current
        except ApiException:
            pass
        time.sleep(interval)
        elapsed += interval
    try:
        scale = read_scale(kind, namespace, name)
        current = getattr(scale.status, "replicas", None)
    except Exception:
        current = None
    return False, current

def main():
    KAFKA_TOPIC = os.getenv('KAFKA_TOPIC', 'replicas')
    KAFKA_BROKER = os.getenv('KAFKA_BROKER', 'kafka-service.oris-predictive-autoscaler.svc.cluster.local:9092')
    namespace = os.getenv('NAMESPACE', 'oris-predictive-autoscaler')
    replicas = 1
    kind = os.getenv('KIND', 'deployment')  # can also be "statefulset" or "replicaset"
    scale_name = os.getenv('SCALE_NAME', 'python-service')
    wait = True
    timeout = 60
    interval = 2

    print(f"Starting scaler: topic={KAFKA_TOPIC}, broker={KAFKA_BROKER}, namespace={namespace}")
    source = load_k8s_config()
    print(f"K8s config loaded from: {source}")

    consumer = None
    try:
        consumer = KafkaConsumer(
            KAFKA_TOPIC,
            bootstrap_servers=KAFKA_BROKER,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            auto_offset_reset='latest',
            group_id='scaler-consumer'
        )
        for message in consumer:
            print(f"Received message: {message.value}")
            try:
                replicas = message.value.get('replicas', 1)
                scale_name = message.value.get('scale_name', 'python-service')
            except AttributeError:
                print(f"Invalid message format: {message.value}")
                continue

            token = get_api_token(source)
            if token:
                print("API Token retrieved")
            else:
                print("Unable to retrieve the API Token")

            try:
                pods = list_pods(namespace)
                print(f"\nPod in namespace '{namespace}' ({len(pods)}):")
                for name, phase, ip in pods:
                    print(f"- {name:55s} {phase:12s} {ip}")
            except ApiException as e:
                print(f"Unable to list all Pods: {e}", file=sys.stderr)

            if scale_name:
                try:
                    scale_workload(kind, namespace, scale_name, replicas)
                    print(f"\nRequired scaling: {kind} '{scale_name}' -> replicas = {replicas}")
                    if wait:
                        ok, current = wait_for_replicas(
                            kind, namespace, scale_name, replicas,
                            timeout=timeout, interval=interval
                        )
                        if ok:
                            print("Replica target achieved.")
                        else:
                            print(f"Timeout: current replicas = {current}, target = {replicas}")
                except Exception as e:
                    print(str(e), file=sys.stderr)
    except Exception as e:
        print(f"Kafka Consumer error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            if consumer:
                consumer.close()
                print("Kafka Consumer closed.")
        except Exception as e:
            print(f"Error closing consumer: {e}")

if __name__ == "__main__":
    main()
