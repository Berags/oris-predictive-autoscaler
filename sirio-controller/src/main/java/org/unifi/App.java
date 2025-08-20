package org.unifi;

import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.EnablingFunction;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.models.stpn.steady.RegSteadyState;
import org.unifi.model.*;
import java.util.Map;
import java.math.BigDecimal;

public class App {
    public static void main(String[] args) {
        Model model = new Model(new ExponentialArrivalProcess("1"), new Queue(10), new ExponentialServiceProcess("2"));
        System.out.println("Rejection rate of the model: " + model.evaluateRejectionRate());
    }
}
