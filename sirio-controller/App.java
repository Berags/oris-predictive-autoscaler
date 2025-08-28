package org.unifi;

import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.EnablingFunction;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.models.stpn.steady.RegSteadyState;
import java.util.Map;
import java.math.BigDecimal;

public class App {
    public static void main(String[] args) {

        int queueSize = 10;


        PetriNet pn = new PetriNet();
        Place queue = pn.addPlace("queue");
        Place arrivalPlace = pn.addPlace("arrivalPlace");
        Place ready = pn.addPlace("ready");
        Transition arrival1 = pn.addTransition("arrival1");
        Transition arrival2 = pn.addTransition("arrival2");
        Transition service = pn.addTransition("service");
        Transition rejection = pn.addTransition("rejection");

        pn.addPrecondition(ready, arrival1);
        pn.addPostcondition(arrival1, arrivalPlace);
        pn.addPrecondition(arrivalPlace, arrival2);
        pn.addPostcondition(arrival2, queue);
        pn.addPostcondition(arrival2, ready);
        pn.addPrecondition(queue, service);
        pn.addPrecondition(queue, rejection);

        arrival1.addFeature(StochasticTransitionFeature.newExponentialInstance("2"));
        arrival2.addFeature(StochasticTransitionFeature.newExponentialInstance("2"));
        service.addFeature(StochasticTransitionFeature.newExponentialInstance("2"));
        rejection.addFeature(StochasticTransitionFeature.newDeterministicInstance("0"));

        rejection.addFeature(new EnablingFunction("queue > " + queueSize));

        Marking marking = new Marking();
        marking.addTokens(ready, 1);
        Map<Marking, BigDecimal> dist = RegSteadyState.builder().build().compute(pn, marking).getSteadyState();
        for (Marking m : dist.keySet())
            System.out.printf("%.10f %d - %s, %d - %s %n", dist.get(m), m.getTokens(queue), "queue", m.getTokens(arrivalPlace), "arrivalPlace");

        System.out.println("Hello World!");
    }
}
