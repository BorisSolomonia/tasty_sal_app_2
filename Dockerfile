# 🚀 Multi-stage Dockerfile for 9-tones-app
# Frontend: React app + Backend: Node.js/TypeScript API

# ==========================
# Frontend Build Stage  
# ==========================
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy frontend package files first (better caching)
COPY package*.json ./
RUN npm ci

# Copy frontend source code and config files
COPY src/ ./src/
COPY public/ ./public/
COPY tailwind.config.js postcss.config.js ./

# Set production build environment
ENV CI=false
ENV NODE_ENV=production

# Build the React frontend
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
RUN cat > start.sh << 'EOF'
#!/bin/sh
set -e

echo "🚀 Starting 9-tones-app services..."

# Start backend API server
echo "📡 Starting backend API on port 3001..."
cd backend && node dist/index.js &
BACKEND_PID=$!

# Start frontend static server  
echo "🌐 Starting frontend on port 3000..."
cd .. && npx serve -s frontend/build -p 3000 &
FRONTEND_PID=$!

# Function to handle shutdown
shutdown() {
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

# Handle shutdown signals
trap shutdown SIGTERM SIGINT

echo "✅ Both services started successfully"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:3001"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
EOF

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