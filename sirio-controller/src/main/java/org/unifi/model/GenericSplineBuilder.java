package org.unifi.model;

import java.util.List;

public class GenericSplineBuilder {

    GenericSpline gs = new GenericSpline();

    public GenericSplineBuilder CDF(List<Double> x, List<Double> y) {
        gs.setCDF(x, y);
        return this;
    }

    public GenericSplineBuilder PDF(List<Double> x, List<Double> y) {
        gs.setPDF(x, y);
        return this;
    }

    public GenericSplineBuilder mean(double mean) {
        gs.setMean(mean);
        return this;
    }

    public GenericSpline build() {
        return gs;
    }
}
