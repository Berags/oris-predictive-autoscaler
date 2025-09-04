package org.unifi;

import org.unifi.model.*;

import java.math.BigDecimal;

import org.unifi.comunication.*;

public class App {
    public static void main(String[] args) {
        Queue queue = new Queue(100);
        ExponentialServiceProcess serviceProcess = new ExponentialServiceProcess("1");

        Controller kafkaConsumer = new Controller();
        

        kafkaConsumer.autoConfig(queue,serviceProcess,new BigDecimal("0.05"));
        kafkaConsumer.startConsuming();
    }
}
