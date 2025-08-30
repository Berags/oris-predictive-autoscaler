package org.unifi.api;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import io.kubernetes.client.openapi.ApiClient;
import io.kubernetes.client.openapi.ApiException;
import io.kubernetes.client.openapi.Configuration;
import io.kubernetes.client.openapi.apis.AppsV1Api;
import io.kubernetes.client.openapi.apis.CoreV1Api;
import io.kubernetes.client.openapi.models.V1Pod;
import io.kubernetes.client.openapi.models.V1PodList;
import io.kubernetes.client.openapi.models.V1Scale;
import io.kubernetes.client.util.ClientBuilder;

public class K8sScaler {

    private final AppsV1Api appsApi;
    private final CoreV1Api coreApi;
    private final String namespace;
    private int replicas;
    private final String kind;
    private final String scaleName;
    private static K8sScaler instance;

    private K8sScaler() throws IOException {
        ApiClient client = ClientBuilder.cluster().build();
        Configuration.setDefaultApiClient(client);
        this.appsApi = new AppsV1Api();
        this.coreApi = new CoreV1Api();
        this.namespace = System.getenv().getOrDefault("NAMESPACE", "oris-predictive-autoscaler");
        this.replicas = 5;
        this.kind = System.getenv().getOrDefault("KIND", "deployment");
        this.scaleName = System.getenv().getOrDefault("SCALE_NAME", "python-service");
    }

    public static K8sScaler getInstance() throws IOException {
        if (instance == null) {
            instance = new K8sScaler();
        }
        return instance;
    }

    public String getNamespace() {
        return namespace;
    }

    public int getReplicas() {
        return replicas;
    }

    public void setReplicas(int replicas) {
        this.replicas = replicas;
    }

    public String getKind() {
        return kind;
    }

    public String getScaleName() {
        return scaleName;
    }

    public void listPods() throws ApiException {
        V1PodList list = coreApi.listNamespacedPod(namespace).execute();
        System.out.println("Pods in namespace '" + namespace + "' (" + list.getItems().size() + "):");
        for (V1Pod item : list.getItems()) {
            System.out.println("- " + item.getMetadata().getName() + " " + item.getStatus().getPhase() + " " + item.getStatus().getPodIP());
        }
    }

    public void scaleWorkload() throws ApiException {
        V1Scale scaleBody = new V1Scale();
        scaleBody.getSpec().setReplicas(this.replicas);

        switch (kind.toLowerCase()) {
            case "deployment" -> appsApi.replaceNamespacedDeploymentScale(scaleName, namespace, scaleBody);
            case "statefulset" -> appsApi.replaceNamespacedStatefulSetScale(scaleName, namespace, scaleBody);
            case "replicaset" -> appsApi.replaceNamespacedReplicaSetScale(scaleName, namespace, scaleBody);
            default -> throw new IllegalArgumentException("Kind not supported: " + kind);
        }
    }

    public V1Scale readScale() throws ApiException {
        switch (kind.toLowerCase()) {
            case "deployment" -> {
                return appsApi.readNamespacedDeploymentScale(scaleName, namespace).execute();
            }
            case "statefulset" -> {
                return appsApi.readNamespacedStatefulSetScale(scaleName, namespace).execute();
            }
            case "replicaset" -> {
                return appsApi.readNamespacedReplicaSetScale(scaleName, namespace).execute();
            }
            default -> throw new IllegalArgumentException("Kind not supported: " + kind);
        }
    }

    public boolean waitForReplicas(int timeout, int interval) throws InterruptedException {
        long elapsed = 0;
        while (elapsed < timeout) {
            try {
                V1Scale scale = readScale();
                Integer current = scale.getStatus().getReplicas();
                if (current == this.replicas) {
                    return true;
                }
            }catch(Exception e) {
                // ApiException may occur if the Kubernetes API server is temporarily unavailable,
                // or if there are transient network issues. These are expected during scaling operations,
                // and it is safe to retry in these cases. Permanent errors (e.g., 404 Not Found, 403 Forbidden)
                // may indicate misconfiguration and should be investigated if persistent.
                // For debugging purposes, log the exception at a low level.
                System.err.println("Transient ApiException while polling for replica count: " + e.getMessage());
            }
            TimeUnit.SECONDS.sleep(interval);
            elapsed += interval;
        }
        return false;
    }
}
