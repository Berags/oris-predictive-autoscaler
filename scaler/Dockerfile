FROM python:3.11-slim

# setting up the working directory on container
WORKDIR /app

# installing package requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# uploading the script
COPY scaler.py .

# starting the service
CMD ["python", "scaler.py"]
