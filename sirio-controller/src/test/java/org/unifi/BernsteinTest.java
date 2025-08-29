package org.unifi;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.unifi.model.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Arrays;
import java.util.ArrayList;
import java.math.BigDecimal;

public class BernsteinTest{

    @Test
    public void testBernsteinSamplingiSmall(){
        int n = 5;
        List<Double> x = Arrays.asList(new Double [] {0., 1., 2., 3., 4.});
        List<Double> y = Arrays.asList(new Double [] {0., 0.25, 0.44, 0.75, 1.});
        Distribution f = GenericSpline.builder().CDF(x, y).build();

        List<BigDecimal> sampled = ArrivalProcessFactory.bernsteinValuesCDF(f, n);
        List<BigDecimal> actual = Arrays.asList(new BigDecimal[] {BigDecimal.valueOf(1. - 0.36), BigDecimal.valueOf(0.36 - 0.23), BigDecimal.valueOf(0.23 - 0.13), BigDecimal.valueOf(0.13 - 0.05), BigDecimal.valueOf(0.05 - 0)});
        
        assertEquals(n, sampled.size(), "The number of Bernsteins samples are wrong");

        for(int i = 0; i < n; i++){
            assertEquals(actual.get(i).doubleValue(), sampled.get(i).doubleValue(), 0.01,  "The element at index " + i + " doesn't match");
        }
    }
}
