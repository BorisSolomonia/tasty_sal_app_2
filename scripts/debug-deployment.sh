#!/bin/bash

# 🔍 Nine Tones App Deployment Debug Script
# Run this on the VM to diagnose deployment issues

set -e

echo "🔍 NINE TONES APP DEBUG ANALYSIS"
echo "================================"
echo "Time: $(date)"
echo "Host: $(hostname)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. ENVIRONMENT CHECK
print_header "ENVIRONMENT CHECK"
echo "Working directory: $(pwd)"
echo "User: $(whoami)"
echo "Docker version: $(docker --version 2>/dev/null || echo 'Docker not installed')"
echo "Docker Compose version: $(docker compose version 2>/dev/null || echo 'Docker Compose not available')"
echo ""

echo "Disk space:"
df -h /
echo ""

echo "Memory usage:"
free -h
echo ""

# 2. DEPLOYMENT DIRECTORY CHECK
print_header "DEPLOYMENT DIRECTORY CHECK"
DEPLOY_DIR="/opt/apps/nine-tones"

if [ -d "$DEPLOY_DIR" ]; then
    print_success "Deploy directory exists: $DEPLOY_DIR"
    echo "Directory contents:"
    ls -la "$DEPLOY_DIR"
    echo ""
    
    cd "$DEPLOY_DIR"
    
    # Check for required files
    if [ -f "docker-compose.yml" ]; then
        print_success "docker-compose.yml found"
        echo "Compose file content:"
        cat docker-compose.yml
    else
        print_error "docker-compose.yml not found"
    fi
    echo ""
    
    if [ -f ".env" ]; then
        print_success ".env file found"
        echo "Environment variables (sanitized):"
        grep -v "SOAP_\|SECRET\|KEY\|PASSWORD" .env 2>/dev/null || echo "Could not read .env"
    else
        print_error ".env file not found"
    fi
    echo ""
    
else
    print_error "Deploy directory does not exist: $DEPLOY_DIR"
    echo "Available directories in /opt/apps/:"
    ls -la /opt/apps/ 2>/dev/null || echo "/opt/apps/ does not exist"
    echo ""
fi

# 3. DOCKER ANALYSIS
print_header "DOCKER ANALYSIS"

echo "All containers:"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null || print_error "Could not list containers"
echo ""

echo "Nine Tones related containers:"
docker ps -a | grep nine-tones || echo "No nine-tones containers found"
echo ""

echo "Available images:"
docker images | grep nine-tones || echo "No nine-tones images found"
echo ""

echo "Docker networks:"
docker network ls | grep web || echo "No 'web' network found"
echo ""

# 4. CONTAINER SPECIFIC ANALYSIS
print_header "CONTAINER ANALYSIS"

if docker ps | grep -q nine-tones-app; then
    print_success "nine-tones-app container is running"
    
    echo "Container details:"
    docker inspect nine-tones-app --format='State: {{.State.Status}}'
    docker inspect nine-tones-app --format='Started: {{.State.StartedAt}}'
    docker inspect nine-tones-app --format='Image: {{.Config.Image}}'
    docker inspect nine-tones-app --format='Restart Count: {{.RestartCount}}'
    echo ""
    
    echo "Container health status:"
    health_status=$(docker inspect nine-tones-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
    echo "Health: $health_status"
    
    if [ "$health_status" != "no-healthcheck" ]; then
        echo "Health check logs:"
        docker inspect nine-tones-app --format='{{range .State.Health.Log}}Output: {{.Output}}ExitCode: {{.ExitCode}}{{end}}' 2>/dev/null || echo "No health logs"
    fi
    echo ""
    
    echo "Container processes:"
    docker exec nine-tones-app ps aux 2>/dev/null || print_warning "Could not check processes inside container"
    echo ""
    
    echo "Container listening ports:"
    docker exec nine-tones-app netstat -tlnp 2>/dev/null || print_warning "Could not check listening ports"
    echo ""
    
    echo "Container file structure:"
    docker exec nine-tones-app ls -la /app/ 2>/dev/null || print_warning "Could not list /app/"
    docker exec nine-tones-app ls -la /app/frontend/build/ 2>/dev/null || print_warning "Could not list frontend build"
    docker exec nine-tones-app ls -la /app/backend/dist/ 2>/dev/null || print_warning "Could not list backend dist"
    echo ""
    
    echo "Container logs (last 50 lines):"
    docker logs --tail 50 nine-tones-app 2>/dev/null || print_warning "Could not get container logs"
    echo ""
    
else
    print_error "nine-tones-app container is not running"
    
    echo "Checking if container exists (stopped):"
    docker ps -a | grep nine-tones-app || echo "No nine-tones-app container found"
    
    if docker ps -a | grep -q nine-tones-app; then
        echo "Container logs (stopped container):"
        docker logs nine-tones-app 2>/dev/null || echo "No logs available"
    fi
    echo ""
fi

# 5. CONNECTIVITY TESTS
print_header "CONNECTIVITY TESTS"

if docker ps | grep -q nine-tones-app; then
    echo "Testing HTTP endpoints from inside container:"
    
    # Test frontend
    if docker exec nine-tones-app curl -f --connect-timeout 5 --max-time 10 http://localhost:3000/ >/dev/null 2>&1; then
        print_success "Frontend (port 3000) responds"
        
        # Get a sample of the response
        echo "Frontend response sample:"
        docker exec nine-tones-app curl -s --connect-timeout 5 --max-time 10 http://localhost:3000/ | head -5
    else
        print_error "Frontend (port 3000) not responding"
    fi
    echo ""
    
    # Test backend health
    if docker exec nine-tones-app curl -f --connect-timeout 5 --max-time 10 http://localhost:3001/health >/dev/null 2>&1; then
        print_success "Backend health endpoint (port 3001) responds"
        
        echo "Backend health response:"
        docker exec nine-tones-app curl -s --connect-timeout 5 --max-time 10 http://localhost:3001/health
    else
        print_error "Backend health endpoint (port 3001) not responding"
    fi
    echo ""
    
    # Test backend API
    if docker exec nine-tones-app curl -f --connect-timeout 5 --max-time 10 http://localhost:3001/api/rs/get_error_codes >/dev/null 2>&1; then
        print_success "Backend API endpoint responds"
    else
        print_warning "Backend API endpoint not responding (may be normal if no SOAP config)"
    fi
    echo ""
fi

# Test external connectivity  
echo "Testing external connectivity to container ports:"
for port in 3000 3001; do
    if curl -f --connect-timeout 5 --max-time 10 "http://localhost:$port/" >/dev/null 2>&1; then
        print_success "External port $port is accessible"
    else
        print_error "External port $port is not accessible"
    fi
done
echo ""

# 6. SYSTEM RESOURCES
print_header "SYSTEM RESOURCES"
echo "CPU usage:"
top -bn1 | head -5

echo ""
echo "Memory usage:"
free -h

echo ""
echo "Disk usage:"
df -h

echo ""
print_header "DEBUG ANALYSIS COMPLETE"
echo "Review the output above to identify issues."
echo ""
echo "Common fixes:"
echo "- If container not running: Check Docker Compose file and run 'docker compose up -d'"
echo "- If ports not responding: Check if services started inside container"
echo "- If health check failing: Check container logs for startup errors"
echo "- If missing files: Rebuild Docker image"
echo ""
echo "For manual intervention, go to: $DEPLOY_DIR"