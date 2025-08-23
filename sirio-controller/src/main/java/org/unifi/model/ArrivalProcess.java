package org.unifi.model;

import org.oristool.petrinet.Transition;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Marking;

public interface ArrivalProcess{

    public Transition generateModel(PetriNet pn, Marking m);

}
