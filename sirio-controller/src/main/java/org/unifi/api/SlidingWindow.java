package org.unifi.api;

import java.io.IOException;
import java.util.Queue;
import java.util.AbstractCollection;
import java.util.Iterator;

import org.apache.commons.collections4.queue.CircularFifoQueue;

import io.kubernetes.client.openapi.ApiException;

public class SlidingWindow extends AbstractUpdater{

    private Queue<Integer> history;

    public SlidingWindow(int length) throws IOException {
        super();
        createQueue(length);
    }

    public SlidingWindow(int length, int min, int max) throws IOException {
        super(min, max);
        createQueue(length);
    }

    private void createQueue(int length){
        if (length < 1) {
            length = 1;
        }
        history = new CircularFifoQueue<Integer>(length);
    }

    @Override
    public int applyLogic(int replicas) {
        int current = 1;
        history.add(replicas);
        try{
            current = scaler.getReplicas();
        }catch(ApiException ex){
            if (history.size() > 0){
                current = history.peek();
            }
        }
        if(replicas < current){
            System.out.println("Verifying if scale down must occur.");
            boolean goDown = true;
            Iterator<Integer> it = history.iterator();
            while(goDown && it.hasNext()){
                if(it.next() >= current){
                    System.out.println("Scale down aborted, a value in the history is greater than current.");
                    goDown = false;
                }
            }
            if (!goDown) {
                replicas = current;
            }
        }
        return replicas;
    }
    
}
