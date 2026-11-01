# Single image: builds the PWA, then serves it and the API from FastAPI on one origin.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
RUN mkdir -p /data
ENV OVOT_FRONTEND_DIST=/app/frontend/dist \
    OVOT_DATABASE_URL=sqlite:////data/ovot.db \
    OVOT_PORT=8100
EXPOSE 8100
CMD ["python", "run.py"]
