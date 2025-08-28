#!/usr/bin/env python3

import requests
import json
import base64
import time
import signal
import sys
from collections import deque
import numpy as np
from kafka import KafkaProducer

class InterArrivalCollector:
    def __init__(self, queue_name="message-queue", rabbitmq_host="localhost", 
                 rabbitmq_port="15672", username="admin", password="password"):
        self.queue_name = queue_name
        self.base_url = f"http://{rabbitmq_host}:{rabbitmq_port}"
        self.auth = (username, password)
        self.headers = {'Content-Type': 'application/json'}
        
        # State
        self.running = True
        self.inter_arrivals = np.array([])  # Store inter-arrival times - empty array
        
        # Configuration
        self.sample_size = 100          # Messages to peek each cycle
        self.monitoring_interval = 5   # Seconds between samples
        
        # ✅ Kafka configuration
        kafka_host = "kafka-service.oris-predictive-autoscaler.svc.cluster.local:9092"
        self.kafka_producer = KafkaProducer(
            bootstrap_servers=[kafka_host],
            value_serializer=lambda v: json.dumps(v).encode('utf-8')
        )
        
        # Setup signal handler for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        
    def _signal_handler(self, signum, frame):
        """Handle Ctrl+C gracefully"""
        self.running = False
        
    def get_queue_messages(self, count=50):
        """Peek messages from RabbitMQ queue without consuming"""
        url = f"{self.base_url}/api/queues/%2f/{self.queue_name}/get"
        
        payload = {
            "count": count,
            "ackmode": "ack_requeue_true",  # Peek without consuming
            "encoding": "auto",
            "truncate": 50000
        }
        
        try:
            response = requests.post(url, json=payload, auth=self.auth, 
                                   headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                return response.json()
            else:
                return []
                
        except requests.exceptions.RequestException:
            return []
    
    def extract_timestamps(self, messages):
        """Extract timestamps from K6 message payloads"""
        timestamps = []
        
        for msg in messages:
            try:
                # Check payload encoding
                payload_encoding = msg.get('payload_encoding', 'base64')
                
                if payload_encoding == 'string':
                    # Payload is already decoded JSON string
                    payload_data = msg['payload']
                else:
                    # Payload is base64 encoded - fix padding if needed
                    b64_payload = msg['payload']
                    missing_padding = len(b64_payload) % 4
                    if missing_padding:
                        b64_payload += '=' * (4 - missing_padding)
                    payload_data = base64.b64decode(b64_payload).decode('utf-8')
                
                # Parse JSON and extract timestamp
                msg_data = json.loads(payload_data)
                
                # Extract timestamp from K6 message
                if 'timestamp' in msg_data:
                    timestamps.append(msg_data['timestamp'])
                    
            except Exception:
                # Skip malformed messages
                continue
                
        return sorted(timestamps)
    
    def calculate_inter_arrivals(self, timestamps):
        """Calculate inter-arrival times from timestamps"""
        if len(timestamps) < 2:
            return []
            
        inter_arrivals = []
        for i in range(1, len(timestamps)):
            # Convert milliseconds to seconds
            interval = (timestamps[i] - timestamps[i-1]) / 1000.0
            if interval > 0:  # Sanity check
                inter_arrivals.append(interval)
                
        return inter_arrivals
    
    def collect_inter_arrivals(self):
        """Main collection loop"""
        self.running = True
        
        while self.running:
            try:
                # Get messages from queue
                messages = self.get_queue_messages(self.sample_size)
                
                if messages:
                    # Extract timestamps
                    timestamps = self.extract_timestamps(messages)
                    
                    if len(timestamps) >= 2:
                        # Calculate and store inter-arrivals
                        new_inter_arrivals = np.array(self.calculate_inter_arrivals(timestamps))
                        self.inter_arrivals = new_inter_arrivals

                    CDF = self.get_inter_arrivals_cdf()
                    # ✅ Publish CDF to Kafka con debug
                    print(f"📊 Calculated CDF with {len(CDF) if CDF else 0} points")
                    self.publish_cdf_to_kafka(CDF)

                # Wait for next iteration
                time.sleep(self.monitoring_interval)
                
            except KeyboardInterrupt:
                break
            except Exception:
                time.sleep(self.monitoring_interval)
    
    def get_inter_arrivals(self):
        """Return collected inter-arrival times as list"""
        return list(self.inter_arrivals)
    
    def get_inter_arrivals_count(self):
        """Return number of collected inter-arrival times"""
        return len(self.inter_arrivals)

    def get_inter_arrivals_cdf(self):
        """Return collected inter-arrival times as CDF"""
        if self.inter_arrivals.size == 0:
            print("⚠️ No inter-arrival data available for CDF calculation")
            return []

        print(f"📊 Computing CDF from {len(self.inter_arrivals)} inter-arrival samples")

        # Compute CDF
        cdf = []
        #total = sum(self.inter_arrivals)
        for x in sorted(self.inter_arrivals):
            #cumulative += x
            cdf.append(sum(self.inter_arrivals < x) / len(self.inter_arrivals))
 
        return cdf

    def publish_cdf_to_kafka(self, cdf_data):
        """✅ Publish CDF to Kafka with detailed debugging"""
        print(f"🔍 publish_cdf_to_kafka called with {len(cdf_data) if cdf_data else 0} data points")
        
        if not self.kafka_producer:
            print("❌ Kafka producer not initialized")
            return
            
        if not cdf_data:
            print("⚠️ No CDF data to publish")
            return
            
        message = {
            "timestamp": int(time.time() * 1000),
            "queue_name": self.queue_name,
            "total_samples": len(self.inter_arrivals),
            "cdf_points": len(cdf_data),
            "mean": np.mean(self.inter_arrivals),
            "cdf_x": self.inter_arrivals.tolist(),
            "cdf_y": cdf_data
        }
        
        print(f"📤 Attempting to send message to topic 'inter-arrival-cdf'")
        print(f"📦 Message size: {len(str(message))} chars")
        
        try:
            future = self.kafka_producer.send('inter-arrival-cdf', message)
            print(f"🚀 Message sent, waiting for confirmation...")
            
            # Wait for confirmation with timeout
            record_metadata = future.get(timeout=10)
            print(f"✅ Message confirmed! Topic: {record_metadata.topic}, "
                  f"Partition: {record_metadata.partition}, Offset: {record_metadata.offset}")
                  
        except Exception as e:
            print(f"❌ Kafka publish error: {type(e).__name__}: {e}")
            import traceback
            print(f"📋 Full traceback: {traceback.format_exc()}")

def main():
    # Configuration from environment variables
    import os
    
    config = {
        'queue_name': os.getenv('QUEUE_NAME', 'message-queue'),
        'rabbitmq_host': os.getenv('RABBITMQ_HOST', 'localhost'),
        'rabbitmq_port': os.getenv('RABBITMQ_PORT', '15672'),
        'username': os.getenv('RABBITMQ_USER', 'admin'),
        'password': os.getenv('RABBITMQ_PASSWORD', 'password')
    }
    
    # Create collector
    collector = InterArrivalCollector(**config)
    
    # Set monitoring interval from environment
    if os.getenv('MONITORING_INTERVAL'):
        collector.monitoring_interval = int(os.getenv('MONITORING_INTERVAL'))
    
    # Start collection
    collector.collect_inter_arrivals()

if __name__ == "__main__":
    main()
