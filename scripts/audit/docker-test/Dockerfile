FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    flac id3v2 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
