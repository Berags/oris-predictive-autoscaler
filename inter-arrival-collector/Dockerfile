FROM python:3.11-slim

# Install dependencies
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy collection script
COPY collect_inter_arrivals.py .

# Create non-root user for security
RUN useradd -m -u 1000 collector && chown -R collector:collector /app
USER collector

# Default command
CMD ["python3", "collect_inter_arrivals.py"]
