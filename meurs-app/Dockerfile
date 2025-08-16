# meurs-app/Dockerfile
FROM python:3.10-slim

# ---- system deps (optional, but nice to have) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl tini && rm -rf /var/lib/apt/lists/*

# ---- app ----
WORKDIR /app

# Copy only requirements first for better build caching
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY backend ./backend

# Create media dir inside container
RUN mkdir -p /app/media

# Uvicorn runs from backend dir; app is a package inside backend/
ENV PYTHONPATH=/app/backend
WORKDIR /app/backend

EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--proxy-headers"]
