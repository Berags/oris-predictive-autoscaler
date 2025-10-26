package org.unifi;

import java.io.IOException;
import java.math.BigDecimal;

import org.unifi.api.ImmediateUpdater;
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
            kafkaConsumer.setTimeout(10_000);

            SlidingWindow updater = new SlidingWindow(10, 1, 25);
            //ImmediateUpdater updater = new ImmediateUpdater(1, 25);
            kafkaConsumer.setStrategy(updater);

            kafkaConsumer.startConsuming();
        } catch (IOException e) {
            System.out.println("Error in acquiring or using K8s APIs.");
            e.printStackTrace();
        }

    }
}
