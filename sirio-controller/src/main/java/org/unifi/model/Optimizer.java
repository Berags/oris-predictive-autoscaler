package org.unifi.model;

import java.math.BigDecimal;

public class Optimizer {

    public static int minReplicaExponential(ArrivalProcess a, Queue q, ServiceProcess s, BigDecimal target) {
        int replicas = 0;
        Model model;
        do {
            replicas++;
            s.setPoolSize(replicas);
            model = new Model(a, q, s, true);

            if (replicas > 100) {
                System.out.println("Warning: Exceeded 100 replicas during optimization.");
                break;
            }

            System.out.println("Evaluating model with " + replicas + " replicas...");
            System.out.println(" Actual rejection rate: " + model.evaluateRejectionRate());
        } while (model.evaluateRejectionRate().compareTo(target) == 1);
        return replicas;
    }
}
