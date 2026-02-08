# ⚠️ DEPRECATED: Docker Support Removed
# 
# This Dockerfile is deprecated and no longer maintained. MAP2 Audio now uses native systemd deployment.
# 
# See: NATIVE_DEPLOYMENT_GUIDE.md for current deployment instructions.
# 
# For historical reference only - do not use.
# ---

# MAP2 Audio Platform - Backend
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    portaudio19-dev \
    libasound2-dev \
    libjack-jackd2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY lcd/ ./lcd/
COPY tui/ ./tui/
COPY scripts/ ./scripts/
COPY *.py ./

# Create database directory
RUN mkdir -p /data

# Set environment variables
ENV PYTHONPATH=/app
ENV MAP2_DB_URL=sqlite+aiosqlite:////data/map2.db
ENV MAP2_LOG_LEVEL=INFO

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 -c "import requests; requests.get('http://localhost:8080/api/health')" || exit 1

# Run application
CMD ["python3", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
