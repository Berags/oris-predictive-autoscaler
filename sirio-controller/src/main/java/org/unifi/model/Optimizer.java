package org.unifi.model;

import java.math.BigDecimal;

public class Optimizer{

    public static int minReplicaExponential(ArrivalProcess a, Queue q, ServiceProcess s, BigDecimal target){
        int replicas = 0;
        Model model;
        do{
            replicas++;
            s.setPoolSize(replicas);
            model = new Model(a, q, s, true);
            System.out.println(model.evaluateRejectionRate());
        }while(model.evaluateRejectionRate().compareTo(target) == 1);
        return replicas;
    }
}
