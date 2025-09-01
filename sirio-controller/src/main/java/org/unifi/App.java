package org.unifi;

import org.unifi.model.*;

import java.math.BigDecimal;

import org.unifi.comunication.*;

public class App {
    public static void main(String[] args) {
        Queue queue = new Queue(1);
        ExponentialServiceProcess serviceProcess = new ExponentialServiceProcess("1");
        

        InterArrivalKafkaConsumer.autoConfig(queue,serviceProcess,new BigDecimal("0.05"));
        InterArrivalKafkaConsumer.start_consuming();
    }
}
