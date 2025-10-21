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

# Force line-buffered stdout so prints appear immediately in kubectl logs
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True, write_through=True)
except Exception:
    pass

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
        kafka_host = "kafka-service:9092"
        print(f"🔌 Initializing Kafka producer to {kafka_host}")

        self.kafka_producer = None
        while(self.kafka_producer is None):
            try:
                self.kafka_producer = KafkaProducer(
                    bootstrap_servers=[kafka_host],
                    value_serializer=lambda v: json.dumps(v).encode('utf-8')
                )
                print("✅ Kafka producer successfully initialized")
            except Exception as e:
                print(f"❌ Failed to initialize Kafka producer: {str(e)}")
                self.kafka_producer = None
                time.sleep(2)
            

        # Setup signal handler for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        
    def _signal_handler(self, signum, frame):
        """Handle Ctrl+C gracefully"""
        self.running = False
        
    def get_queue_messages(self, count=50):
        """Peek messages from RabbitMQ queue without consuming"""
        url = f"{self.base_url}/api/queues/%2f/{self.queue_name}/get"
        print(f"🌐 Making request to: {url}")
        
        payload = {
            "count": count,
            "ackmode": "ack_requeue_true",  # Peek without consuming
            "encoding": "auto",
            "truncate": 50000
        }
        
        try:
            print(f"📡 Sending POST request to RabbitMQ API...")
            response = requests.post(url, json=payload, auth=self.auth, 
                                   headers=self.headers, timeout=10)
            
            print(f"📡 Response status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"📦 Successfully received {len(data)} messages")
                return data
            else:
                print(f"❌ HTTP error: {response.status_code} - {response.text}")
                return []
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Network error connecting to RabbitMQ: {type(e).__name__}: {e}")
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
        print(f"🔄 Starting collection loop with interval {self.monitoring_interval}s")
        print(f"🐇 Connecting to RabbitMQ at {self.base_url}")
        
        while self.running:
            try:
                print(f"📥 Attempting to fetch {self.sample_size} messages from queue {self.queue_name}")
                # Get messages from queue
                messages = self.get_queue_messages(self.sample_size)
                print(f"📦 Received {len(messages)} messages from RabbitMQ")
                
                if messages:
                    print(f"📊 Processing {len(messages)} messages...")
                    # Extract timestamps
                    timestamps = self.extract_timestamps(messages)
                    print(f"⏰ Extracted {len(timestamps)} timestamps")
                    
                    if len(timestamps) >= 2:
                        # Calculate and store inter-arrivals
                        new_inter_arrivals = np.array(self.calculate_inter_arrivals(timestamps))
                        self.inter_arrivals = new_inter_arrivals
                        print(f"📈 Calculated {len(new_inter_arrivals)} inter-arrival times")

                    CDF = self.get_inter_arrivals_cdf()
                    # ✅ Publish CDF to Kafka con debug
                    print(f"📊 Calculated CDF with {len(CDF) if CDF else 0} points")
                    self.publish_cdf_to_kafka(CDF)
                else:
                    print("⚠️ No messages received from RabbitMQ")

                # Wait for next iteration
                print(f"⏳ Sleeping for {self.monitoring_interval} seconds...")
                time.sleep(self.monitoring_interval)
                
            except KeyboardInterrupt:
                print("🛑 Received keyboard interrupt, stopping...")
                break
            except Exception as e:
                print(f"❌ Error in collection loop: {type(e).__name__}: {e}")
                import traceback
                print(f"📋 Full traceback: {traceback.format_exc()}")
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
    print("🔧 Starting InterArrivalCollector main function")
    print("🔧 Configuring InterArrivalCollector with environment variables")
    config = {
        'queue_name': os.getenv('QUEUE_NAME', 'message-queue'),
        'rabbitmq_host': os.getenv('RABBITMQ_HOST', 'localhost'),
        'rabbitmq_port': os.getenv('RABBITMQ_PORT', '15672'),
        'username': os.getenv('RABBITMQ_USER', 'admin'),
        'password': os.getenv('RABBITMQ_PASSWORD', 'password')
    }
    print(f"🔧 InterArrivalCollector configuration: {config}")
    # Create collector
    print("🔧 Creating InterArrivalCollector instance...")
    collector = InterArrivalCollector(**config)
    print("🔧 InterArrivalCollector created successfully")
    # Set monitoring interval from environment
    if os.getenv('MONITORING_INTERVAL'):
        collector.monitoring_interval = int(os.getenv('MONITORING_INTERVAL'))

    print(f"🔧 InterArrivalCollector monitoring interval set to {collector.monitoring_interval} seconds")
    print("🔧 Starting collection loop...")
    # Start collection
    collector.collect_inter_arrivals()

if __name__ == "__main__":
    main()
