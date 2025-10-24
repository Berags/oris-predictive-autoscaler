package org.unifi.api;

import java.io.IOException;

import io.kubernetes.client.openapi.ApiException;

public abstract class AbstractUpdater {

    protected int min = 1;
    protected int max;
    protected boolean unlimited = true;
    protected final K8sScaler scaler;

    public AbstractUpdater() throws IOException {
        this.scaler = K8sScaler.getInstance();
    }

    public AbstractUpdater(int min, int max) throws IOException {
        this.scaler = K8sScaler.getInstance();
        if (min < 0) {
            min = 1;
        }
        if (min > max) {
            max = min;
        }
        this.min = min;
        this.max = max;
        unlimited = false;
    }

    public int scaleWorkload(int replicas) throws ApiException {
        int value = respectLimits(applyLogic(replicas));
        scaler.scaleWorkload(value);
        return value;
    }

    protected abstract int applyLogic(int replicas);

    private int respectLimits(int replicas) {
        if (replicas < min) {
            replicas = min;
        }
        if (!unlimited && replicas > max) {
            replicas = max;
        }
        return replicas;
    }
}
