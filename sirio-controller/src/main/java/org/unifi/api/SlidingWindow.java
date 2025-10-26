package org.unifi.api;

import java.io.IOException;
import java.util.LinkedList;

import io.kubernetes.client.openapi.ApiException;

public class SlidingWindow extends AbstractUpdater {

    private LinkedList<Integer> replicaHistory;
    private int scalingDecisionWindow;

    public SlidingWindow(int length) throws IOException {
        super();
        createQueue(length);
    }

    public SlidingWindow(int length, int min, int max) throws IOException {
        super(min, max);
        createQueue(length);
    }

    private void createQueue(int length) {
        if (length < 1) {
            length = 1;
        }
        replicaHistory = new LinkedList<>();
        this.scalingDecisionWindow = length;
    }

    @Override
    public int applyLogic(int newReplicas) {
        final int currentReplicas = getCurrentReplicas();

        if (newReplicas > currentReplicas) {
            // Scale up immediately
            replicaHistory.clear(); // Clear history after scaling
            return newReplicas;
        } else if (newReplicas < currentReplicas) {
            // Scale down lazily
            replicaHistory.add(newReplicas);
            if (replicaHistory.size() > scalingDecisionWindow) {
                replicaHistory.removeFirst();
            }
            System.out.println("\tReplica recommendation history for scale-down: " + replicaHistory);

            if (replicaHistory.size() >= scalingDecisionWindow
                    && replicaHistory.stream().allMatch(r -> r <= currentReplicas)) {
                System.out.println("\tScaling down condition met. Required replicas " + newReplicas
                        + " has been consistent for the last " + scalingDecisionWindow + " iterations.");
                int maxInHistory = replicaHistory.stream().max(Integer::compareTo).orElse(newReplicas);
                replicaHistory.clear(); // Clear history after scaling
                return maxInHistory;
            } else {
                System.out.println(
                        "\tWaiting for stable replica recommendations before scaling down. Current window size: "
                                + replicaHistory.size() + "/" + scalingDecisionWindow);
            }
        } else {
            replicaHistory.add(newReplicas);
            System.out.println("\tNo scaling needed.");
        }
        return currentReplicas;
    }

    private int getCurrentReplicas() {
        try {
            return scaler.getReplicas();
        } catch (ApiException ex) {
            if (!replicaHistory.isEmpty()) {
                return replicaHistory.getLast();
            }
            return 1;
        }
    }
}
