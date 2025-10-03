package org.unifi;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;
import org.unifi.model.APHArrivalProcess;
import org.unifi.model.ArrivalProcess;
import org.unifi.model.ExponentialArrivalProcess;
import org.unifi.model.ExponentialServiceProcess;
import org.unifi.model.Optimizer;
import org.unifi.model.Queue;
import org.unifi.model.ServiceProcess;

public class OptimizerTest {

    @Test
    public void testingOptimizerMM1() {
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue(10);
        ServiceProcess s = new ExponentialServiceProcess("1");

        assertEquals(3, Optimizer.minReplicaExponential(a, q, s, BigDecimal.valueOf(0.0001)), "Wrong min replicas founded when arrival is exponential");
    }

    @Test
    public void testingOptimizer() {
        List<BigDecimal> list = Arrays.asList(new BigDecimal[]{BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.3), BigDecimal.valueOf(0.1)});
        ArrivalProcess a = new APHArrivalProcess(list);
        Queue q = new Queue(18);
        ServiceProcess s = new ExponentialServiceProcess("0.25");

        assertEquals(5, Optimizer.minReplicaExponential(a, q, s, BigDecimal.valueOf(0.0001)), "Wrong min replicas founded when arrival is a phase type");
    }
}
