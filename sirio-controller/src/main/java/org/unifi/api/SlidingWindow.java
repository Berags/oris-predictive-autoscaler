package org.unifi.api;

import java.io.IOException;
import java.util.ArrayList;
import io.kubernetes.client.openapi.ApiException;

public class SlidingWindow extends AbstractUpdater{

    private ArrayList<Integer> replicaHistory;
    private int scalingDecisionWindow;

    public SlidingWindow(int length) throws IOException {
        super();
        createQueue(length);
    }

    public SlidingWindow(int length, int min, int max) throws IOException {
        super(min, max);
        createQueue(length);
    }

    private void createQueue(int length){
        if (length < 1) {
            length = 1;
        }
        replicaHistory = new ArrayList<Integer>();
        this.scalingDecisionWindow = length;
    }

    @Override
    public int applyLogic(int newReplicas) {
        int currentReplicas = 1;
        try{
            currentReplicas = scaler.getReplicas();
        }catch(ApiException ex){
            if (replicaHistory.size() > 0){
                currentReplicas = replicaHistory.getLast();
            }
        }

        if (newReplicas > currentReplicas) {
            // Scale up immediately
            //System.out.println("Scaling up from " + currentReplicas + " to " + newReplicas);
            //System.out.println("\nRequired scaling: " + scaler.getKind() + " '" + scaler.getScaleName() + "' -> replicas = " + scaler.getReplicas());
            replicaHistory.clear(); // Clear history after scaling
            return newReplicas;
        } else if (newReplicas < currentReplicas) {
            // Scale down lazily
            replicaHistory.add(newReplicas);
            if (replicaHistory.size() > scalingDecisionWindow) {
                replicaHistory.remove(0);
            }
            System.out.println("\tReplica recommendation history for scale-down: " + replicaHistory);

            if (replicaHistory.size() == scalingDecisionWindow && replicaHistory.stream().allMatch(r -> r <= newReplicas)) {
                System.out.println("\tScaling down condition met. Required replicas " + newReplicas + " has been consistent for the last " + scalingDecisionWindow + " iterations.");
                //System.out.println("\nRequired scaling: " + scaler.getKind() + " '" + scaler.getScaleName() + "' -> replicas = " + scaler.getReplicas());
                replicaHistory.clear(); // Clear history after scaling
                return newReplicas;
            } else {
                System.out.println("\tWaiting for stable replica recommendations before scaling down. Current window size: " + replicaHistory.size() + "/" + scalingDecisionWindow);
            }
        } else {
            System.out.println("\tNo scaling needed.");
        }
        return currentReplicas;
    }
    
}
