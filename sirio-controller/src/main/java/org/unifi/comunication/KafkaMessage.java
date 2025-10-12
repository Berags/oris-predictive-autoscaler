package org.unifi.comunication;

import java.util.List;

public class KafkaMessage {

    public long timestamp;
    public String queue_name;
    public int total_samples;
    public int cdf_points;
    public List<Double> cdf_x;
    public List<Double> cdf_y;
    public float mean;
}
