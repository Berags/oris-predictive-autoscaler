package org.unifi.model;

import org.oristool.petrinet.Transition;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import java.math.BigDecimal;

public class ExponentialServiceProcess implements ServiceProcess{

    private BigDecimal rate;

    public ExponentialServiceProcess(String rate){
        this.rate = new BigDecimal(rate);
    }

    public ExponentialServiceProcess(BigDecimal rate){
        this.rate = rate;
    }

    @Override
    public Transition generateModel(PetriNet pn, Marking m){
        Transition service = pn.addTransition("service");
        service.addFeature(StochasticTransitionFeature.newExponentialInstance(rate));
        return service;
    }

}


