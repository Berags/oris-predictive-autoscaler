import pika
import os
import time
import logging

def connect_to_rabbitmq():
    """Establishes a connection to RabbitMQ, retrying on failure."""
    rabbitmq_host = os.getenv('RABBITMQ_HOST', 'rabbitmq-service')
    rabbitmq_port = int(os.getenv('RABBITMQ_PORT', 5672))
    rabbitmq_user = os.getenv('RABBITMQ_USER', 'admin')
    rabbitmq_password = os.getenv('RABBITMQ_PASSWORD', 'password')
    
    credentials = pika.PlainCredentials(rabbitmq_user, rabbitmq_password)
    
    while True:
        try:
            connection = pika.BlockingConnection(
                pika.ConnectionParameters(
                    host=rabbitmq_host, 
                    port=rabbitmq_port, 
                    credentials=credentials,
                    heartbeat=600,  # Keep connection alive
                    blocked_connection_timeout=300
                )
            )
            logging.info("Successfully connected to RabbitMQ")
            return connection
        except pika.exceptions.AMQPConnectionError as e:
            logging.error(f"Failed to connect to RabbitMQ: {e}. Retrying in 5 seconds...")
            time.sleep(5)

def on_message(channel, method, properties, body):
    """Callback function to process received messages."""
    logging.info(f"Received message: {body.decode()}")
    # Acknowledge the message to remove it from the queue
    channel.basic_ack(delivery_tag=method.delivery_tag)

def main():
    """Main function to set up RabbitMQ consumer."""
    logging.basicConfig(level=logging.INFO)
    print("hello")

    connection = connect_to_rabbitmq()
    channel = connection.channel()

    queue_name = 'message-queue'

    # Declare a durable queue directly (no exchange needed)
    channel.queue_declare(queue=queue_name, arguments={
        "x-max-length": 100
    })

    logging.info(f"Waiting for messages on queue '{queue_name}'. To exit press CTRL+C")
    print("Waiting for messages...")

    # Set up the consumer to pre-fetch 1 message at a time
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=queue_name, on_message_callback=on_message)

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logging.info("Shutting down consumer.")
        channel.stop_consuming()
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
    finally:
        if connection.is_open:
            connection.close()
            logging.info("RabbitMQ connection closed.")

if __name__ == '__main__':
    main()