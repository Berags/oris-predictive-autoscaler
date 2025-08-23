package org.unifi.model;

import java.math.BigDecimal;

public class Optimizer{

    private Optimizer(){};

    public static int minReplicaExponential(ArrivalProcess a, Queue q, ServiceProcess s, BigDecimal target){
        int replicas = 0;
        Model model;
        do{
            replicas++;
            s.setPoolSize(replicas);
            model = new Model(a, q, s, true);
        }while(model.evaluateRejectionRate().compareTo(target) == 1);
        return replicas;
    }
}
