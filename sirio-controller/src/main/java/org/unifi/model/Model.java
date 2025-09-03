package org.unifi.model;

import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.models.stpn.steady.RegSteadyState;
import org.oristool.math.function.EXP;
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

    public Model(ArrivalProcess arrival, Queue queue, ServiceProcess service, boolean serviceScale){
        this.arrival = arrival;
        this.queue = queue;
        this.service = service;
        
        pn = new PetriNet();
        m = new Marking();
        
        arrivalTransition = arrival.generateModel(pn, m);
        queuePlace = queue.generateModel(pn, m);
        if(serviceScale){
            service.scaleOn(queuePlace);
        }
        serviceTransition = service.generateModel(pn, m);
        
        pn.addPostcondition(arrivalTransition, queuePlace);
        pn.addPrecondition(queuePlace, serviceTransition);

    }

    public Model(ArrivalProcess arrival, Queue queue, ServiceProcess service){
        this(arrival, queue, service, false);
    }

    public BigDecimal evaluateRejectionRate(){
        BigDecimal rejection = BigDecimal.ZERO;
        Map<Marking, BigDecimal> results = RegSteadyState.builder().build().compute(pn, m).getSteadyState();
        for(Marking tmp: results.keySet()){
            if(tmp.getTokens(queuePlace) == queue.getSize() && pn.isEnabled(arrivalTransition, tmp)){
                rejection = rejection.add(results.get(tmp));
            }
        }
        /*
        BigDecimal arrivalRate = extractLambda(arrivalTransition);
        BigDecimal serviceRate = extractLambda(serviceTransition);
        
        rejection = rejection.multiply(arrivalRate / (arrivalRate + serviceRate));
            */
        rejection = rejection.multiply(extractLambda(arrivalTransition));
        return rejection;
    }

    private BigDecimal extractLambda(Transition t){
        StochasticTransitionFeature st = t.getFeature(StochasticTransitionFeature.class);
        if(!st.isEXP()){
            throw new IllegalArgumentException("Give a Exponential transition feature");
        }
        return ((EXP) st.density()).getLambda();
    }

}

