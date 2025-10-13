package org.unifi;

import java.math.BigDecimal;

import org.unifi.comunication.Controller;
import org.unifi.model.ExponentialServiceProcess;
import org.unifi.model.Queue;

public class App {

    public static void main(String[] args) {
        Queue queue = new Queue(100);
        ExponentialServiceProcess serviceProcess = new ExponentialServiceProcess("1");

        Controller kafkaConsumer = new Controller();

        kafkaConsumer.autoConfig(queue, serviceProcess, new BigDecimal("0.05"));
        kafkaConsumer.setTimeout(5000);
        kafkaConsumer.startConsuming();
    }
}
