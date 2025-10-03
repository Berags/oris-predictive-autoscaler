package org.unifi.model;

public interface Distribution {

    public double getCDFValue(double x);

    public double getMean();

    public double getPDFValue(double x);

}
