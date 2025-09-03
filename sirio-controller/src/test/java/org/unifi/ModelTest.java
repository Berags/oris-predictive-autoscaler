package org.unifi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.unifi.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.math.BigDecimal;

public class ModelTest{

    @Test
    public void testRejectionMM1() {
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue (10);
        ServiceProcess s = new ExponentialServiceProcess("2");
        Model model = new Model(a, q, s);

        assertEquals(0.0001628, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 1 and service rate 2");

        ArrivalProcess aFast = new ExponentialArrivalProcess("1.5");
        model = new Model(aFast, q, s);
        assertEquals(0.0062997, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 1.5 and service rate 2");

        ArrivalProcess equal = new ExponentialArrivalProcess("2");
        model = new Model(equal, q, s);
        assertEquals(0.0454545, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 2 and service rate 2");
        
        ArrivalProcess aFastest = new ExponentialArrivalProcess("3");
        model = new Model(aFastest, q, s);
        assertEquals(0.202339, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 3 and service rate 2");
    }


    @Test
    public void testRejectionMM1QueueScaled(){
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue (10);
        ServiceProcess s = new ExponentialServiceProcess("2");
        s.setPoolSize(3);
        Model model = new Model(a, q, s, true);

        assertEquals(0, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 1 and service rate 2 (scale on queue, poolSize 3)");

        ArrivalProcess aFast = new ExponentialArrivalProcess("1.5");
        model = new Model(aFast, q, s);
        assertEquals(0, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 1.5 and service rate 2 (scale on queue, poolSize 3)");

        ArrivalProcess equal = new ExponentialArrivalProcess("2");
        model = new Model(equal, q, s);
        assertEquals(0.0000069, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 2 and service rate 2 (scale on queue, poolSize 3)");
        
        ArrivalProcess aFastest = new ExponentialArrivalProcess("3");
        model = new Model(aFastest, q, s);
        assertEquals(0.00030867, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rejection rate is wrong in the case of arrival rate 3 and service rate 2 (scale on queue, poolSize 3)");
    }

    @Test
    public void testRejectionBernstein(){
        List<BigDecimal> list = List.of(new BigDecimal("0.3"), new BigDecimal("0.3"), new BigDecimal("0.3"), new BigDecimal("0.1"));
        ArrivalProcess a = new APHArrivalProcess(list);
        Queue q = new Queue(18);
        ServiceProcess s = new ExponentialServiceProcess("0.25");
        s.setPoolSize(5);

        Model model = new Model(a, q, s, true);
        assertEquals(0.00008428, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.3, 0.3, 0.3, 0.1), pool size 5)");
        
        s.setPoolSize(8);
        model = new Model(a, q, s, true);
        assertEquals(0.00000016, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.3, 0.3, 0.3, 0.1), pool size 8)");

        List<BigDecimal> listFast = List.of(new BigDecimal("0.1"), new BigDecimal("0.3"), new BigDecimal("0.3"), new BigDecimal("0.3"));
        ArrivalProcess aFast = new APHArrivalProcess(listFast);
        s.setPoolSize(5);

        model = new Model(aFast, q, s, true);
        assertEquals(0.01744314, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.1, 0.3, 0.3, 0.3), pool size 5)");
    }
}
