package org.unifi.model;

import java.util.List;
import java.util.ArrayList;

public class GenericSplineBuilder{
    GenericSpline gs = new GenericSpline();

    public GenericSpline CDF(List<Double> x, List<Double> y){
        gs.setCDF(x, y);
        return gs;
    }

    public GenericSpline PDF(List<Double> x, List<Double> y){
        gs.setPDF(x, y);
        return gs;
    }

    public GenericSpline mean(double mean){
        gs.setMean(mean);
        return gs;
    }
}
