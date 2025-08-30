#!/bin/bash

# 🚀 Manual Deployment Script for Nine Tones App
# Use this if GitHub Actions deployment fails
# Run on the VM as the deploy user

set -e

# Configuration
IMAGE_NAME="nine-tones-app"
CONTAINER_NAME="nine-tones-app"
HOST_PORT="8087"
CONTAINER_PORT="3000"
GCP_PROJECT="nine-tones-bots-2025-468320"
SECRET_NAME="myapp-env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if we're on the VM
if [ ! -f "/home/deploy/.github-runner/run.sh" ]; then
    print_error "This script should be run on the production VM"
    exit 1
fi

print_status "🚀 Starting manual deployment..."

# Get latest code
print_status "📥 Fetching latest code..."
if [ ! -d "/home/deploy/tasty_sal_app_2" ]; then
    cd /home/deploy
    git clone https://github.com/BorisSolomonia/tasty_sal_app_2.git
else
    cd /home/deploy/tasty_sal_app_2
    git fetch origin
    git reset --hard origin/master
fi

cd /home/deploy/tasty_sal_app_2

# Stop existing container
print_status "🛑 Stopping existing container..."
docker stop $CONTAINER_NAME 2>/dev/null || echo "Container not running"
docker rm $CONTAINER_NAME 2>/dev/null || echo "Container not found"

# Clean up
print_status "🧹 Cleaning up..."
docker image prune -f --filter "dangling=true"

# Create environment files
print_status "🔧 Creating environment files..."

# Frontend environment (these should be configured as needed)
cat > .env.production.local << EOF
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE
REACT_APP_FIREBASE_AUTH_DOMAIN=tastyapp-ff8b2.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=tastyapp-ff8b2
REACT_APP_FIREBASE_STORAGE_BUCKET=tastyapp-ff8b2.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=282950310544
REACT_APP_FIREBASE_APP_ID=1:282950310544:web:c2c00922dac72983d71615

# API Configuration
REACT_APP_API_URL=http://34.30.242.142:$HOST_PORT

# Build Configuration
CI=false
NODE_ENV=production
EOF

# Backend environment
cat > backend/.env.production.local << EOF
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://34.30.242.142:$HOST_PORT
EOF

# Build Docker image
print_status "🏗️ Building Docker image..."
docker build \
    --build-arg NODE_ENV=production \
    --tag $IMAGE_NAME:latest \
    --tag $IMAGE_NAME:manual-$(date +%Y%m%d-%H%M%S) \
    .

print_success "✅ Docker image built successfully"

# Fetch runtime secrets
print_status "🔐 Fetching runtime secrets..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    print_error "❌ No active gcloud authentication. Run: gcloud auth login"
    exit 1
fi

gcloud secrets versions access latest \
    --secret=$SECRET_NAME \
    --project=$GCP_PROJECT > /tmp/runtime.env

# Deploy container
print_status "🚀 Deploying container..."
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    --publish $HOST_PORT:$CONTAINER_PORT \
    --env-file /tmp/runtime.env \
    --memory="1g" \
    --cpus="0.5" \
    $IMAGE_NAME:latest

# Clean up secrets
rm -f /tmp/runtime.env

print_success "✅ Container deployed successfully"

# Health check
print_status "🔍 Performing health check..."
sleep 15

max_attempts=12
attempt=1

while [ $attempt -le $max_attempts ]; do
    print_status "Health check attempt $attempt/$max_attempts..."
    
    if curl -f --connect-timeout 10 --max-time 30 http://localhost:$HOST_PORT/ >/dev/null 2>&1; then
        print_success "✅ Health check passed!"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        print_error "❌ Health check failed after $max_attempts attempts"
        print_status "Container logs:"
        docker logs --tail 50 $CONTAINER_NAME
        exit 1
    fi
    
    sleep 10
    attempt=$((attempt + 1))
done

# Display summary
print_success "🎉 Deployment completed successfully!"
echo ""
echo "📊 Deployment Summary:"
echo "====================="
echo "🐳 Container: $CONTAINER_NAME"
echo "📦 Image: $IMAGE_NAME:latest"
echo "🌐 URL: http://34.30.242.142:$HOST_PORT"
echo "📅 Time: $(date)"
echo ""
echo "🔍 Container Status:"
docker ps --filter name=$CONTAINER_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" $CONTAINER_NAME

# Clean up old images
print_status "🧹 Cleaning up old images..."
docker images $IMAGE_NAME --format "{{.Tag}} {{.ID}}" | \
grep -v "latest" | \
sort -r | \
tail -n +4 | \
awk '{print $2}' | \
xargs -r docker rmi || echo "No old images to remove"

print_success "🎉 Manual deployment completed!"
print_status "Your app is now available at: http://34.30.242.142:$HOST_PORT"