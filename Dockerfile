# Multi-stage build for React frontend
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/
COPY tailwind.config.js postcss.config.js ./

# Build frontend
RUN npm run build

# Backend build stage
FROM node:18-alpine AS backend-build

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./

# Build backend
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache curl

# Install serve for frontend static files
RUN npm install -g serve

# Copy built frontend
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Copy built backend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/package.json ./backend/

# Create startup script
RUN echo '#!/bin/sh\n\
serve -s frontend/build -p 3000 &\n\
cd backend && node dist/index.js &\n\
wait' > start.sh && chmod +x start.sh

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health && curl -f http://localhost:3000 || exit 1

# Expose ports
EXPOSE 3000 3001

# Start both services
CMD ["./start.sh"]