package org.unifi.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class ArrivalProcessFactory {

    public static ExponentialArrivalProcess generateExponential(Distribution f) {
        return new ExponentialArrivalProcess(BigDecimal.valueOf(1 / f.getMean()));
    }

    public static APHArrivalProcess generateBPH(Distribution f, int n) {
        return new APHArrivalProcess(ArrivalProcessFactory.bernsteinValuesCDF(f, n));
    }

    public static List<BigDecimal> bernsteinValuesCDF(Distribution f, int n) throws IllegalArgumentException {
        if (n <= 0) {
            throw new IllegalArgumentException("To generate a Phase Type using the Bernstein Exponential it's needed at least n >= 1");
        }
        ArrayList<BigDecimal> bernsteinValues = new ArrayList<>();
        double previous = 1;
        for (int i = 0; i < n; i++) {
            double current = f.getCDFValue(Math.log(((double) n) / (i + 1)));
            bernsteinValues.add(BigDecimal.valueOf(previous - current));
            previous = current;
        }
        return bernsteinValues;
    }

}
