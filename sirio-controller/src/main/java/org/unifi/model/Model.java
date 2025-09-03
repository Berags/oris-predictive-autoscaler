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
import java.math.RoundingMode;

public class Model{

    private Transition arrivalTransition;
    private Queue queue;
    private Place queuePlace;
    private Transition serviceTransition;
    private PetriNet pn;
    private Marking m;

    public Model(ArrivalProcess arrival, Queue queue, ServiceProcess service, boolean serviceScale){
        this.queue = queue;
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
                BigDecimal currentRejection = results.get(tmp);

                BigDecimal arrivalRate = extractLambda(arrivalTransition, tmp);
                BigDecimal serviceRate = extractLambda(serviceTransition, tmp);

                currentRejection = currentRejection.multiply(arrivalRate.setScale(8).divide(arrivalRate.add(serviceRate), RoundingMode.HALF_DOWN));

                rejection = rejection.add(currentRejection);
            }
        }
        return rejection;
    }

    private BigDecimal extractLambda(Transition t, Marking m){
        StochasticTransitionFeature st = t.getFeature(StochasticTransitionFeature.class);
        if(!st.isEXP()){
            throw new IllegalArgumentException("Give a Exponential transition feature");
        }
        return ((EXP) st.density()).getLambda().multiply(BigDecimal.valueOf(st.clockRate().evaluate(m)));
    }

}

