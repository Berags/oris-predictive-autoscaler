package org.unifi.comunication;

import java.util.List;

public class KafkaMessage {
    public long timeStamp;
    public String queueName;
    public int totalSamples;
    public int cdfPoints;
    public List<Double> cdfX;
    public List<Double> cdfY;
    public float mean;
}
    
