package org.unifi.model;

import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.models.stpn.steady.RegSteadyState;
import java.util.Map;
import java.math.BigDecimal;

public class Model{

    private ArrivalProcess arrival;
    private Transition arrivalTransition;
    private Queue queue;
    private Place queuePlace;
    private ServiceProcess service;
    private Transition serviceTransition;
    private PetriNet pn;
    private Marking m;

    public Model(ArrivalProcess arrival, Queue queue, ServiceProcess service){
        this.arrival = arrival;
        this.queue = queue;
        this.service = service;
        
        pn = new PetriNet();
        m = new Marking();
        
        arrivalTransition = arrival.generateModel(pn, m);
        queuePlace = queue.generateModel(pn, m);
        serviceTransition = service.generateModel(pn, m);
        
        pn.addPostcondition(arrivalTransition, queuePlace);
        pn.addPrecondition(queuePlace, serviceTransition);
    }

    public BigDecimal evaluateRejectionRate(){
        BigDecimal rejection = BigDecimal.ZERO;
        Map<Marking, BigDecimal> results = RegSteadyState.builder().build().compute(pn, m).getSteadyState();
        for(Marking tmp: results.keySet()){
            if(tmp.getTokens(queuePlace) == queue.getSize() && pn.isEnabled(arrivalTransition, tmp)){
                rejection = rejection.add(results.get(tmp));
                rejection = rejection.multiply(BigDecimal.valueOf(arrivalTransition.getFeature(StochasticTransitionFeature.class).clockRate().evaluate(tmp)));
            }
        }
        return rejection;
    }
}

