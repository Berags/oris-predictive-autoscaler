package org.unifi;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.unifi.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Arrays;
import java.util.ArrayList;
import java.math.BigDecimal;

public class OptimizerTest{

    @Test
    public void testingOptimizerMM1(){
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue(10);
        ServiceProcess s = new ExponentialServiceProcess("1");

        assertEquals(3, Optimizer.minReplicaExponential(a, q, s, BigDecimal.valueOf(0.0001)), "Wrong min replicas founded when arrival is exponential");
    }
    
    @Test
    public void testingOptimizer(){
        List<BigDecimal> list = Arrays.asList(new BigDecimal[] {BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.1)});
        ArrivalProcess a = new APHArrivalProcess(list);
        Queue q = new Queue(18);
        ServiceProcess s = new ExponentialServiceProcess("0.25");

        assertEquals(6, Optimizer.minReplicaExponential(a, q, s, BigDecimal.valueOf(0.0001)), "Wrong min replicas founded when arrival is a phase type");
    }
}
