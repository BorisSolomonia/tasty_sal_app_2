#!/bin/bash
# Debug script for VM deployment issues
# Run this on your VM: ssh into 34.141.45.73 and run: chmod +x debug-vm.sh && ./debug-vm.sh

echo "🔍 VM DEPLOYMENT DEBUGGING"
echo "========================="
echo ""

echo "📋 1. CONTAINER STATUS:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
echo ""

echo "🌐 2. TESTING EXTERNAL ACCESS:"
echo "Frontend test:"
curl -I http://localhost:80/ 2>/dev/null | head -3
echo ""
echo "API health test:"
curl -I http://localhost:80/api/health 2>/dev/null | head -3
echo ""

echo "🐳 3. INTERNAL CONTAINER TESTS:"
echo "Backend health inside container:"
docker exec nine-tones-app curl -f http://localhost:3001/health 2>/dev/null && echo "✅ Backend OK" || echo "❌ Backend FAILED"
echo ""
echo "Frontend inside container:"
docker exec nine-tones-app curl -I http://localhost:3000/ 2>/dev/null | head -1 || echo "❌ Frontend FAILED"
echo ""

echo "📋 4. CONTAINER LOGS (Last 20 lines):"
echo "--- nine-tones-app logs ---"
docker logs nine-tones-app --tail=20 2>/dev/null | grep -E "(Error|error|ERROR|Failed|failed|FAILED|started|Started|listening|Listening)"
echo ""

if docker ps | grep -q caddy; then
    echo "--- caddy logs ---"
    docker logs caddy --tail=10 2>/dev/null
else
    echo "⚠️ Caddy container not running!"
fi
echo ""

echo "🌐 5. NETWORK CONFIGURATION:"
echo "Docker networks:"
docker network ls | grep web
echo ""
echo "Containers in 'web' network:"
docker network inspect web 2>/dev/null | grep -A1 -B1 '"Name"' | grep -v '"Name": "web"' || echo "Network not found or empty"
echo ""

echo "📄 6. ENVIRONMENT CHECK:"
echo "Container environment (API_URL):"
docker exec nine-tones-app env 2>/dev/null | grep -E "(REACT_APP_API_URL|NODE_ENV|PORT)" || echo "Could not read environment"
echo ""

echo "🔧 7. CURRENT DEPLOYMENT DIRECTORY:"
ls -la /opt/apps/nine-tones/ 2>/dev/null || echo "Deployment directory not found"
echo ""

echo "✅ Debug completed. Check output above for issues."