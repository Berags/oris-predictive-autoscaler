package org.unifi.model;

import java.util.List;
import java.util.ArrayList;
import java.math.BigDecimal;
import java.lang.Math;

public class ArrivalProcessFactory{

    public static ExponentialArrivalProcess generateExponential(Distribution f){
        return new ExponentialArrivalProcess(BigDecimal.valueOf(f.getMean()));
    }

    public static APHArrivalProcess generateBPH(Distribution f, int n){
        if(n <= 0){
            throw new IllegalArgumentException("To generate a Phase Type using the Bernstein Exponetial it's needed at least n >= 1");
        }
        ArrayList<BigDecimal> bernsteinValues = new ArrayList<BigDecimal>();
        double previous = 1;
        for(int i = 0; i < n; i++){
            bernsteinValues.add(BigDecimal.valueOf(previous - f.getCDFValue(Math.log(n/ (i + 1)))));
        }
        return new APHArrivalProcess(bernsteinValues);
    }

}
