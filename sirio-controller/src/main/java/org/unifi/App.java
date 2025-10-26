package org.unifi;

import java.io.IOException;
import java.math.BigDecimal;

import org.unifi.api.SlidingWindow;
import org.unifi.comunication.Recommender;
import org.unifi.model.ExponentialServiceProcess;
import org.unifi.model.Queue;

public class App {

    public static void main(String[] args) {
        Queue queue = new Queue(100);
        ExponentialServiceProcess serviceProcess = new ExponentialServiceProcess("1");

        Recommender kafkaConsumer;
        try {
            kafkaConsumer = new Recommender();
            kafkaConsumer.autoConfig(queue, serviceProcess, new BigDecimal("0.05"));
            // Set timeout to 15 seconds
            // k8s default value to recalcuate metrics
            kafkaConsumer.setTimeout(15_000);

            // wait time window of 60s (4 intervals of 15s)
            SlidingWindow updater = new SlidingWindow(4, 1, 25);
            kafkaConsumer.setStrategy(updater);

            kafkaConsumer.startConsuming();
        } catch (IOException e) {
            System.out.println("Error in acquiring or using K8s APIs.");
            e.printStackTrace();
        }

    }
}
