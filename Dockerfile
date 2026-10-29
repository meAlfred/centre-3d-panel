FROM python:3.12-slim-trixie
ARG TARGETARCH
LABEL org.opencontainers.image.title="centre-agent" \
      org.opencontainers.image.description="Host metrics agent for the centre 3D dashboard" \
      org.opencontainers.image.source="https://github.com/meAlfred/centre-3d-panel" \
      org.opencontainers.image.licenses="GPL-3.0-or-later"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# intel-gpu-tools only exists for x86; the iGPU panel is optional anyway.
RUN apt-get update \
    && apt-get install -y --no-install-recommends smartmontools dmidecode \
       $( [ "$TARGETARCH" = "amd64" ] && echo intel-gpu-tools ) \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY agent ./agent
CMD ["python", "-m", "agent"]
