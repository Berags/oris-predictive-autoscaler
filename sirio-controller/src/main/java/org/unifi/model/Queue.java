package org.unifi.model;

import org.oristool.petrinet.Place;
import org.oristool.petrinet.PetriNet;
import org.oristool.petrinet.Transition;
import org.oristool.petrinet.Marking;
import org.oristool.petrinet.EnablingFunction;
import org.oristool.models.stpn.trees.StochasticTransitionFeature;

public class Queue{

    private int size = 0;

    public Queue(){}

    public Queue(int size){
        if (size < 0){
            throw new IllegalArgumentException("A queue with negative size cannot exist");
        }
        this.size = size;
    }

    public Place generateModel(PetriNet pn, Marking m){
        Place queue = pn.addPlace("queue");
        if(size > 0){
            Transition rejection = pn.addTransition("rejection");
            pn.addPrecondition(queue, rejection);
            rejection.addFeature(StochasticTransitionFeature.newDeterministicInstance("0"));
            rejection.addFeature(new EnablingFunction("queue > " + size));
        }
        return queue;
    }

    public int getSize(){
        return size;
    }
}
