package org.unifi;

import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Place;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.EnablingFunction;
import org.oristool.petrinet.Marking;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;
import org.oristool.models.stpn.steady.RegSteadyState;
import org.oristool.math.function.EXP;
import org.unifi.model.*;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.math.BigDecimal;

public class App {
    public static void main(String[] args) {
        List<BigDecimal> list = new ArrayList<BigDecimal>();
        list.add(new BigDecimal("0.1"));
        list.add(new BigDecimal("0.3"));
        list.add(new BigDecimal("0.2"));
        list.add(new BigDecimal("0.4"));
        Model model = new Model(new APHArrivalProcess(list), new Queue(10), new ExponentialServiceProcess("2"));
        System.out.println("Rejection rate of the model: " + model.evaluateRejectionRate());
        
        model = new Model(new ExponentialArrivalProcess("1.5"), new Queue(10), new ExponentialServiceProcess("2"));
        System.out.println("Rejection rate of the model: " + model.evaluateRejectionRate());
    }
}
