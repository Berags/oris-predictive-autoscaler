package org.unifi.model;

import java.util.List;
import java.util.ArrayList;

public class GenericSpline implements Distribution{


    private List<Double> xCDF;
    private List<Double> yCDF;
    private List<Double> xPDF;
    private List<Double> yPDF;
    private double mean;
    private double epsilon = 0.000001;
    
    public static GenericSpline buildByCDF(List<Double> x, List<Double> y){
        GenericSpline gs = new GenericSpline();
        gs.setCDF(x, y);
        return gs;
    }

    private void setCDF(List<Double> x, List<Double> y){
        if(x.size() != y.size()){
            throw new IllegalArgumentException("The two lists doesn't have the same size");
        }
        double previous = 0;
        for(double point: y){
            if(point < previous){
                throw new IllegalArgumentException("The given points ar not increasing");
            }
            if(point > 1){
                throw new IllegalArgumentException("A CDF cannot be greather than 1");
            }
            previous = point;
        }

        this.xCDF = new ArrayList(x);
        this.yCDF = new ArrayList(y);
    }

    private void setPDF(List<Double> x, List<Double> y){
        if(x.size() != y.size()){
            throw new IllegalArgumentException("The two lists doesn't have the same size");
        }
        double previous = 0;
        for(double point: y){
            if(point < previous){
                throw new IllegalArgumentException("The given points ar not increasing");
            }
            previous = point;
        }

        this.xPDF = new ArrayList(x);
        this.yPDF = new ArrayList(y);
    }

    private void setMean(double mean){
        this.mean = mean;
    }

    @Override
    public double getCDFValue(double point){
        if(point < xCDF.get(0)){
            return 0;
        }
        for(int i = 1; i < xCDF.size(); i++){
            if(point < xCDF.get(i)){
                return yCDF.get(i - 1) + (yCDF.get(i) - yCDF.get(i - 1)) / (xCDF.get(i) - xCDF.get(i - 1)) * (point - xCDF.get(i - 1));
            }
        }
        return 1;
    }

    @Override
    public double getMean(){
        return mean; 
    }
    
    @Override
    public double getPDFValue(double point){
        if(point < xPDF.get(0)){
            return 0;
        }
        for(int i = 1; i < xPDF.size(); i++){
            if(point < xPDF.get(i)){
                return yPDF.get(i - 1) + (yPDF.get(i) - yPDF.get(i - 1)) / (xPDF.get(i) - xPDF.get(i - 1)) * (point - xPDF.get(i - 1));
            }
        }
        return 0;
    }

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
}
