package org.unifi;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.unifi.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Arrays;
import java.util.ArrayList;
import java.math.BigDecimal;

public class DistributionTest{

    @Test
    public void genericSplineLinearCDFTest(){
        List<Double> xLinear = Arrays.asList(new Double[] {0., 1., 2., 3.});
        List<Double> yLinear = Arrays.asList(new Double[] {0., 0.33, 0.66, 1.});
            
        Distribution d = GenericSpline.builder().CDF(xLinear, yLinear);

        assertEquals(0, d.getCDFValue(-1), 0.0001, "CDF on the left of support isn't 0");
        assertEquals(1, d.getCDFValue(4), 0.0001, "CDF on the right of support isn't 1");
        assertEquals(0.66, d.getCDFValue(2), 0.0001, "CDF doesn't return the correct value if it's exactly point of the given");
        assertEquals(0.5, d.getCDFValue(1.5), 0.01, "CDF doesn't return the correct value between to sampled points");
    }

    @Test
    public void generiSplineGenericCDFTest(){
        List<Double> xLinear = Arrays.asList(new Double[] {0., 1., 2., 3., 4., 5.});
        List<Double> yLinear = Arrays.asList(new Double[] {0., 0.15, 0.45, 0.60, 0.80, 1.});
            
        Distribution d = GenericSpline.builder().CDF(xLinear, yLinear);

        assertEquals(0, d.getCDFValue(-1), 0.0001, "CDF on the left of support isn't 0");
        assertEquals(1, d.getCDFValue(6), 0.0001, "CDF on the right of support isn't 1");
        assertEquals(0.45, d.getCDFValue(2), 0.01, "CDF doesn't return the correct value if it's exactly point of the given");
        assertEquals(0.3, d.getCDFValue(1.5), 0.01, "CDF doesn't return the correct value between to sampled points");
        assertEquals(0.95, d.getCDFValue(4.75), 0.01, "CDF doesn't return the correct value between to sampled points");
        assertEquals(0.666, d.getCDFValue(3.33), 0.01, "CDF doesn't return the correct value between to sampled points");
    }
}
