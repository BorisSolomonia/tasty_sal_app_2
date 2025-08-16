#!/bin/bash

# 🔍 Health Check Script for Nine Tones App
# Monitor application health and system resources

set -e

# Configuration
CONTAINER_NAME="nine-tones-app"
HOST_PORT="8087"
APP_URL="http://34.30.242.142:$HOST_PORT"

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

echo "🔍 Nine Tones App Health Check"
echo "==============================="
echo "Timestamp: $(date)"
echo ""

# Check if container is running
print_status "Checking container status..."
if docker ps | grep -q $CONTAINER_NAME; then
    print_success "✅ Container is running"
    
    # Get container details
    CONTAINER_ID=$(docker ps | grep $CONTAINER_NAME | awk '{print $1}')
    CONTAINER_STATUS=$(docker ps | grep $CONTAINER_NAME | awk '{print $7}')
    CONTAINER_UPTIME=$(docker ps | grep $CONTAINER_NAME | awk '{print $9" "$10}')
    
    echo "   ID: $CONTAINER_ID"
    echo "   Status: $CONTAINER_STATUS"
    echo "   Uptime: $CONTAINER_UPTIME"
else
    print_error "❌ Container is not running"
    
    # Check if container exists but stopped
    if docker ps -a | grep -q $CONTAINER_NAME; then
        print_warning "Container exists but is stopped"
        docker ps -a | grep $CONTAINER_NAME
        
        echo ""
        print_status "Recent container logs:"
        docker logs --tail 20 $CONTAINER_NAME
    else
        print_error "Container does not exist"
    fi
    exit 1
fi

echo ""

# Check HTTP health
print_status "Checking HTTP health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $APP_URL || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    print_success "✅ HTTP health check passed (200 OK)"
    
    # Check response time
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" $APP_URL)
    echo "   Response time: ${RESPONSE_TIME}s"
    
    # Check if response time is reasonable
    if (( $(echo "$RESPONSE_TIME > 5.0" | bc -l) )); then
        print_warning "⚠️ Response time is slow (>5s)"
    fi
else
    print_error "❌ HTTP health check failed (Status: $HTTP_STATUS)"
    
    # Try to get more details
    print_status "Attempting detailed HTTP check..."
    curl -v $APP_URL || true
fi

echo ""

# Check system resources
print_status "Checking system resources..."

# Memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
echo "Memory usage: ${MEMORY_USAGE}%"

if (( $(echo "$MEMORY_USAGE > 80.0" | bc -l) )); then
    print_warning "⚠️ High memory usage"
fi

# Disk usage
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
echo "Disk usage: ${DISK_USAGE}%"

if [ "$DISK_USAGE" -gt 80 ]; then
    print_warning "⚠️ High disk usage"
fi

# Load average
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}')
echo "Load average:$LOAD_AVG"

echo ""

# Check container resources
print_status "Checking container resources..."
if docker stats --no-stream $CONTAINER_NAME >/dev/null 2>&1; then
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" $CONTAINER_NAME
else
    print_error "❌ Cannot get container stats"
fi

echo ""

# Check recent logs for errors
print_status "Checking recent logs for errors..."
ERROR_COUNT=$(docker logs --since=10m $CONTAINER_NAME 2>&1 | grep -i "error\|exception\|failed" | wc -l)

if [ "$ERROR_COUNT" -gt 0 ]; then
    print_warning "⚠️ Found $ERROR_COUNT error(s) in recent logs"
    echo "Recent errors:"
    docker logs --since=10m $CONTAINER_NAME 2>&1 | grep -i "error\|exception\|failed" | tail -5
else
    print_success "✅ No recent errors found in logs"
fi

echo ""

# Check GitHub runner status
print_status "Checking GitHub Actions runner..."
if systemctl is-active --quiet github-runner; then
    print_success "✅ GitHub Actions runner is active"
    
    RUNNER_STATUS=$(systemctl show -p SubState --value github-runner)
    echo "   Status: $RUNNER_STATUS"
    
    # Check if runner is registered
    if pgrep -f "run.sh" >/dev/null; then
        print_success "✅ Runner process is running"
    else
        print_warning "⚠️ Runner service active but process not found"
    fi
else
    print_error "❌ GitHub Actions runner is not active"
    systemctl status github-runner --no-pager || true
fi

echo ""

# Check network connectivity
print_status "Checking network connectivity..."

# Check DNS
if nslookup google.com >/dev/null 2>&1; then
    print_success "✅ DNS resolution working"
else
    print_error "❌ DNS resolution failed"
fi

# Check internet connectivity
if curl -s --connect-timeout 5 http://google.com >/dev/null; then
    print_success "✅ Internet connectivity working"
else
    print_error "❌ Internet connectivity failed"
fi

# Check GCP connectivity
if gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    print_success "✅ GCP authentication active"
    
    # Test Secret Manager access
    if gcloud secrets versions access latest --secret=myapp-env --project=nine-tones-bots-2025-468320 >/dev/null 2>&1; then
        print_success "✅ GCP Secret Manager access working"
    else
        print_error "❌ GCP Secret Manager access failed"
    fi
else
    print_error "❌ GCP authentication not active"
fi

echo ""

# Check firewall status
print_status "Checking firewall status..."
if sudo ufw status | grep -q "Status: active"; then
    print_success "✅ UFW firewall is active"
    
    # Check if required ports are allowed
    if sudo ufw status | grep -q "8087"; then
        print_success "✅ Port 8087 is allowed"
    else
        print_warning "⚠️ Port 8087 may not be allowed"
    fi
else
    print_warning "⚠️ UFW firewall is not active"
fi

echo ""

# Docker system health
print_status "Checking Docker health..."
DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
echo "Docker version: $DOCKER_VERSION"

# Check Docker daemon
if docker info >/dev/null 2>&1; then
    print_success "✅ Docker daemon is healthy"
else
    print_error "❌ Docker daemon issues detected"
fi

# Check Docker disk usage
DOCKER_DISK=$(docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}")
echo ""
echo "Docker disk usage:"
echo "$DOCKER_DISK"

echo ""
echo "🏁 Health check completed at $(date)"

# Return appropriate exit code
if [ "$HTTP_STATUS" = "200" ] && docker ps | grep -q $CONTAINER_NAME; then
    print_success "🎉 Overall health: HEALTHY"
    exit 0
else
    print_error "💥 Overall health: UNHEALTHY"
    exit 1
fi