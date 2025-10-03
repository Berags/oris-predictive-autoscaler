package org.unifi.model;

import java.math.BigDecimal;

import org.oristool.models.stpn.MarkingExpr;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.petrinet.Marking;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;

public class ExponentialServiceProcess implements ServiceProcess {

    private final BigDecimal rate;
    private int poolSize = 1;
    private Place queue;

    public ExponentialServiceProcess(String rate) {
        this.rate = new BigDecimal(rate);
    }

    public ExponentialServiceProcess(BigDecimal rate) {
        this.rate = rate;
    }

    @Override
    public void setPoolSize(int poolSize) {
        if (poolSize < 1) {
            throw new IllegalArgumentException("It's needed at least a pool size of 1");
        }
        this.poolSize = poolSize;
    }

    @Override
    public Transition generateModel(PetriNet pn, Marking m) {
        Transition service = pn.addTransition("service");
        if (queue != null) {
            service.addFeature(StochasticTransitionFeature.newExponentialInstance(rate, MarkingExpr.from("min(" + queue.getName() + ", " + poolSize + ")", pn)));
        } else {
            service.addFeature(StochasticTransitionFeature.newExponentialInstance(rate, MarkingExpr.of(poolSize)));
        }
        return service;
    }

    @Override
    public void scaleOn(Place queue) {
        this.queue = queue;
    }

    @Override
    public void disableScaleOn() {
        queue = null;
    }
}
