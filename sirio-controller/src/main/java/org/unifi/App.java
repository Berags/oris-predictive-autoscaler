package org.unifi;

import java.io.IOException;

import org.unifi.api.K8sScaler;
import org.unifi.comunication.InterArrivalKafkaConsumer;

public class App {
    public static void main(String[] args) {
            try {
                
                K8sScaler scaler = K8sScaler.getInstance();
                System.out.println("Starting scaler: namespace=" + scaler.getNamespace());
                
                try {
                    scaler.listPods();
                } catch (Exception e) {
                    System.err.println("Unable to list all Pods: " + e.getMessage());
                }
                
                InterArrivalKafkaConsumer.autoConfig();
                InterArrivalKafkaConsumer.start_consuming();
            } catch (IOException ex) {
            }
    }
}
