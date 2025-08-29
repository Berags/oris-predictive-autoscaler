package org.unifi;

import org.unifi.model.*;
import org.unifi.comunication.*;

public class App {
    public static void main(String[] args) {

        InterArrivalKafkaConsumer.autoConfig();
        InterArrivalKafkaConsumer.start_consuming();

    }
}
