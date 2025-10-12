package org.unifi.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.oristool.models.stpn.MarkingExpr;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.petrinet.Marking;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;

public class APHArrivalProcess implements ArrivalProcess {

    private final List<BigDecimal> arrivalWeights;
    private final int length;
    private String prefix = "a";

    public APHArrivalProcess(List<BigDecimal> arrivalWeights) {
        this.arrivalWeights = new ArrayList<>(arrivalWeights);
        length = this.arrivalWeights.size();
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    @Override
    public Transition generateModel(PetriNet pn, Marking m) {
        Place ready = pn.addPlace(prefix + "ready");
        Transition previousTransition = null;
        for (int i = 1; i <= length; i++) {

            Place placeIter = pn.addPlace(prefix + "place" + i);
            Transition exponentialIter = pn.addTransition(prefix + i);

            pn.addPrecondition(placeIter, exponentialIter);
            exponentialIter.addFeature(StochasticTransitionFeature.newExponentialInstance(BigDecimal.valueOf(i)));

            Transition immediateIter = pn.addTransition(prefix + "imm" + i);
            pn.addPrecondition(ready, immediateIter);
            pn.addPostcondition(immediateIter, placeIter);
            immediateIter.addFeature(StochasticTransitionFeature.newDeterministicInstance(BigDecimal.ZERO, MarkingExpr.of(arrivalWeights.get(i - 1).doubleValue())));

            if (previousTransition != null) {
                pn.addPostcondition(previousTransition, placeIter);
            }
            previousTransition = exponentialIter;
        }

        pn.addPostcondition(previousTransition, ready);
        m.addTokens(ready, 1);
        return previousTransition;
    }
}
