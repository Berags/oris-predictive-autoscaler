package org.unifi;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.unifi.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.ArrayList;
import java.math.BigDecimal;

/**
 * Unit test for simple App.
 */
public class AppTest {

    @Test
    public void testRejectionMM1() {
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue (10);
        ServiceProcess s = new ExponentialServiceProcess("2");
        Model model = new Model(a, q, s);

        assertEquals(0.0004885, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 1 and service rate 2");

        ArrivalProcess aFast = new ExponentialArrivalProcess("1.5");
        model = new Model(aFast, q, s);
        assertEquals(0.0220488, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 1.5 and service rate 2");

        ArrivalProcess equal = new ExponentialArrivalProcess("2");
        model = new Model(equal, q, s);
        assertEquals(0.1818182, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 2 and service rate 2");
        
        ArrivalProcess aFastest = new ExponentialArrivalProcess("3");
        model = new Model(aFastest, q, s);
        assertEquals(1.011696, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 3 and service rate 2");
    }


    @Test
    public void testRejectionMM1QueueScaled(){
        ArrivalProcess a = new ExponentialArrivalProcess("1");
        Queue q = new Queue (10);
        ServiceProcess s = new ExponentialServiceProcess("2");
        s.setPoolSize(3);
        Model model = new Model(a, q, s, true);

        assertEquals(0, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 1 and service rate 2 (scale on queue, poolSize 3)");

        ArrivalProcess aFast = new ExponentialArrivalProcess("1.5");
        model = new Model(aFast, q, s);
        assertEquals(0.000003, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 1.5 and service rate 2 (scale on queue, poolSize 3)");

        ArrivalProcess equal = new ExponentialArrivalProcess("2");
        model = new Model(equal, q, s);
        assertEquals(0.0000554, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 2 and service rate 2 (scale on queue, poolSize 3)");
        
        ArrivalProcess aFastest = new ExponentialArrivalProcess("3");
        model = new Model(aFastest, q, s);
        assertEquals(0.002778, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model rjection rate is wrong in the case of arrival rate 3 and service rate 2 (scale on queue, poolSize 3)");
    }

    @Test
    public void testRejctionBerntein(){
        List<BigDecimal> list = new ArrayList();
        list.add(new BigDecimal("0.3"));
        list.add(new BigDecimal("0.3"));
        list.add(new BigDecimal("0.3"));
        list.add(new BigDecimal("0.1"));
        ArrivalProcess a = new APHArrivalProcess(list);
        Queue q = new Queue(10);
        ServiceProcess s = new ExponentialServiceProcess("0.25");
        s.setPoolSize(5);

        Model model = new Model(a, q, s, true);
        assertEquals(0.0120302, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.3, 0.3, 0.3, 0.1), pool size 5)");
        
        s.setPoolSize(8);
        model = new Model(a, q, s, true);
        assertEquals(0.0014415, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.3, 0.3, 0.3, 0.1), pool size 8)");

        List<BigDecimal> listFast = new ArrayList();
        listFast.add(new BigDecimal("0.1"));
        listFast.add(new BigDecimal("0.3"));
        listFast.add(new BigDecimal("0.3"));
        listFast.add(new BigDecimal("0.3"));
        ArrivalProcess aFast = new APHArrivalProcess(listFast);
        s.setPoolSize(5);

        model = new Model(aFast, q, s, true);
        assertEquals(0.163521, model.evaluateRejectionRate().doubleValue(), 0.000001, "The model using a BPH as an arrival process gives a bad result (a=(0.1, 0.3, 0.3, 0.3), pool size 5)");
    }
}
