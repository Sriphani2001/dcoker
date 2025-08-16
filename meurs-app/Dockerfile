# Dockerfile at repo root (meurs-app/Dockerfile)
FROM python:3.10-slim

# optional but nice
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install deps first for cache
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# copy app code
COPY backend ./backend

# ensure media dir exists
RUN mkdir -p /app/media

# make backend importable and set working dir
ENV PYTHONPATH=/app/backend
WORKDIR /app/backend

EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["python","-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--proxy-headers"]
