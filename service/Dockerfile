FROM python:3.11-slim

# setting up the working directory on container
WORKDIR /app

# installing package requirements
COPY requirements.txt .
RUN pip install -r requirements.txt

# uploading the script
COPY service.py .

# starting the service
CMD ["python", "service.py"]
