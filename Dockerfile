# ─────────────────────────────────────────────
# Stage 1 — Build the Vite / React frontend
# ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Install deps first (layer-cache friendly)
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build          # outputs to frontend/dist/


# ─────────────────────────────────────────────
# Stage 2 — Python backend + built assets
# ─────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy Flask app
COPY app.py ./

# Drop the Vite build into the location Flask expects
# (app.py looks for frontend/dist relative to __file__)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Single exposed port
EXPOSE 8080

# Gunicorn: 1 worker + 4 threads suits a lightweight compute-only API
CMD ["gunicorn", \
     "--workers", "1", \
     "--threads", "4", \
     "--bind", "0.0.0.0:8080", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
