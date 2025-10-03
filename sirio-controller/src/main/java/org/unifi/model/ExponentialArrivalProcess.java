package org.unifi.model;

import java.math.BigDecimal;

import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.petrinet.Marking;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Transition;

public class ExponentialArrivalProcess implements ArrivalProcess {

    private final BigDecimal rate;

    public ExponentialArrivalProcess(String rate) {
        this.rate = new BigDecimal(rate);
    }

    public ExponentialArrivalProcess(BigDecimal rate) {
        this.rate = rate;
    }

    @Override
    public Transition generateModel(PetriNet pn, Marking m) {
        Transition arrival = pn.addTransition("arrival");
        arrival.addFeature(StochasticTransitionFeature.newExponentialInstance(rate));
        return arrival;
    }
}
