# 🚀 Multi-stage Dockerfile for 9-tones-app
# Frontend: React app + Backend: Node.js/TypeScript API

# ==========================
# Frontend Build Stage  
# ==========================
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Accept build arguments for React environment variables
ARG REACT_APP_FIREBASE_API_KEY
ARG REACT_APP_FIREBASE_AUTH_DOMAIN
ARG REACT_APP_FIREBASE_PROJECT_ID
ARG REACT_APP_FIREBASE_STORAGE_BUCKET
ARG REACT_APP_FIREBASE_MESSAGING_SENDER_ID
ARG REACT_APP_FIREBASE_APP_ID
ARG REACT_APP_API_URL

# Copy frontend package files first (better caching)
COPY package*.json ./
RUN npm ci

# Copy frontend source code and config files
COPY src/ ./src/
COPY public/ ./public/
COPY tailwind.config.js postcss.config.js ./

# Set build-time environment variables
ENV CI=false
ENV NODE_ENV=production
ENV REACT_APP_FIREBASE_API_KEY=${REACT_APP_FIREBASE_API_KEY}
ENV REACT_APP_FIREBASE_AUTH_DOMAIN=${REACT_APP_FIREBASE_AUTH_DOMAIN}
ENV REACT_APP_FIREBASE_PROJECT_ID=${REACT_APP_FIREBASE_PROJECT_ID}
ENV REACT_APP_FIREBASE_STORAGE_BUCKET=${REACT_APP_FIREBASE_STORAGE_BUCKET}
ENV REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${REACT_APP_FIREBASE_MESSAGING_SENDER_ID}
ENV REACT_APP_FIREBASE_APP_ID=${REACT_APP_FIREBASE_APP_ID}
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# Build the React frontend with correct environment variables
RUN npm run build

# ==========================
# Backend Build Stage
# ==========================
FROM node:20-alpine AS backend-build

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install ALL dependencies (including dev dependencies for TypeScript compilation)
RUN npm ci

# Fix binary permissions
RUN chmod +x node_modules/.bin/*

# Copy backend source and config
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./

# Build the TypeScript backend
RUN npm run build

# ==========================
# Production Stage
# ==========================
FROM node:20-alpine AS production

WORKDIR /app

# Install system dependencies for health checks
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Copy built frontend files
COPY --from=frontend-build /app/build ./frontend/build

# Set up backend production dependencies
COPY --from=backend-build /app/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production && npm cache clean --force
WORKDIR /app

# Copy built backend files
COPY --from=backend-build /app/dist ./backend/dist

# Create startup script that runs both frontend and backend
RUN printf '#!/bin/sh\n\
set -e\n\
\n\
echo "🚀 Starting 9-tones-app services..."\n\
\n\
# Debug: Show current directory and files\n\
echo "🔍 Current directory: $(pwd)"\n\
echo "🔍 Frontend build files:"\n\
ls -la frontend/build/ || echo "❌ frontend/build directory not found"\n\
\n\
# Start backend API server\n\
echo "📡 Starting backend API on port ${PORT:-3001}..."\n\
cd /app/backend && node dist/index.js &\n\
BACKEND_PID=$!\n\
\n\
# Start frontend static server\n\
echo "🌐 Starting frontend on port ${FRONTEND_PORT:-3000}..."\n\
cd /app && npx serve -s frontend/build -p ${FRONTEND_PORT:-3000} --single &\n\
FRONTEND_PID=$!\n\
\n\
# Function to handle shutdown\n\
shutdown() {\n\
    echo "🛑 Shutting down services..."\n\
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true\n\
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true\n\
    echo "✅ Services stopped"\n\
    exit 0\n\
}\n\
\n\
# Handle shutdown signals\n\
trap shutdown SIGTERM SIGINT\n\
\n\
echo "✅ Both services started successfully"\n\
echo "   Frontend: http://localhost:${FRONTEND_PORT:-3000}"\n\
echo "   Backend API: http://localhost:${PORT:-3001}"\n\
\n\
# Wait for both processes\n\
wait $BACKEND_PID $FRONTEND_PID\n' > start.sh

# Make startup script executable
RUN chmod +x start.sh

# Install serve globally for frontend static files
RUN npm install -g serve

# Health check for both frontend and backend
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000 >/dev/null 2>&1 && \
        curl -f http://localhost:3001/health >/dev/null 2>&1 || exit 1

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose ports
EXPOSE 3000 3001

# Start both services
CMD ["./start.sh"]