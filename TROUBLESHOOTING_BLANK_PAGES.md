# Troubleshooting Guide: Docker + Caddy + React App Blank Pages

## Problem Summary

**Issue**: React application deployed in Docker container served through Caddy reverse proxy showed completely blank pages despite returning HTTP 200 responses.

**Root Cause**: Docker container hostname DNS resolution failure causing Caddy reverse proxy to fail silently.

---

## The Investigation Process

### 1. Initial Symptoms
- ✅ App works locally (`npm start`)
- ❌ Deployed app shows blank page at `http://VM_IP/erp/`
- ❌ Returns `Content-Length: 0` despite HTTP 200 status
- ✅ Static assets (JS/CSS) appear to load correctly

### 2. Diagnostic Steps Taken

#### Phase 1: App Container Health Check
```bash
# Check if processes are running
docker exec nine-tones-app ps aux
# Result: ✅ Both frontend (port 3004) and backend (port 3005) processes running

# Check if ports are listening
docker exec nine-tones-app ss -tlnp
# Result: ✅ Ports listening on IPv6 (:::3004, :::3005)

# Test internal app connectivity
docker exec nine-tones-app wget -O- http://localhost:3004/
# Result: ✅ Full HTML returned internally
```

**Conclusion**: App container was working perfectly.

#### Phase 2: Direct Container Access Test
```bash
# Test app directly through exposed ports
curl -v http://VM_IP:3004/
# Result: ❌ Connection timeout/refused

# Test through Caddy
curl -v http://VM_IP/
# Result: ❌ Empty response (Content-Length: 0)
```

**Conclusion**: External access to app container failed.

#### Phase 3: Network Communication Test
```bash
# Test with external container on same network
docker run --rm --network web alpine/curl:latest curl -v http://nine-tones-app:3004/
# Result: ✅ Full HTML returned

# Test DNS resolution from Caddy
docker exec caddy-caddy-1 nslookup nine-tones-app
# Result: ❌ DNS resolution failed with NXDOMAIN

# Test ping (IP resolution)
docker exec caddy-caddy-1 ping -c 1 nine-tones-app  
# Result: ✅ IP resolution worked (172.18.0.5)
```

**Root Cause Identified**: DNS resolution failure for container hostnames.

---

## Root Cause Analysis

### The Problem
Caddy configuration used hostname-based reverse proxy:
```caddyfile
handle {
  reverse_proxy http://nine-tones-app:3004  # ❌ DNS resolution failing
}
```

### Why DNS Failed
Docker container DNS resolution can fail due to:
1. **Container startup order** - DNS may not be fully initialized
2. **Network configuration issues** - Docker internal DNS problems
3. **Hostname registration delays** - Container name not yet registered in Docker DNS
4. **Custom network settings** - External networks may have DNS issues

### Silent Failure
- Caddy returned HTTP 200 OK with empty content
- No obvious error messages in basic logs
- Required DEBUG level logging to see proxy failures
- Application appeared "deployed" but non-functional

---

## The Solution

### Immediate Fix
Replace hostname with IP address in Caddy configuration:

**Before (Broken):**
```caddyfile
handle {
  reverse_proxy http://nine-tones-app:3004
}
```

**After (Working):**
```caddyfile
handle {
  reverse_proxy http://172.18.0.5:3004
}
```

### Implementation
1. Updated `caddy/conf.d/app.caddy` with IP addresses
2. Redeployed via GitHub Actions
3. Verified with `curl -v http://VM_IP/`

---

## Prevention Guide

### 1. Diagnostic Commands Arsenal

**Always run these when debugging blank pages:**

```bash
# === CONTAINER HEALTH ===
docker ps                                    # Check running containers
docker logs CONTAINER_NAME --tail 50        # Check container logs
docker exec CONTAINER_NAME ps aux           # Check internal processes
docker exec CONTAINER_NAME ss -tlnp         # Check listening ports

# === NETWORK CONNECTIVITY ===
docker network ls                           # List networks
docker network inspect NETWORK_NAME        # Check network members
docker inspect CONTAINER_NAME | grep -A 10 '"Networks"'  # Check container networks

# === INTERNAL APP TESTS ===
docker exec APP_CONTAINER curl -v http://localhost:3004/     # Test internal app
docker exec APP_CONTAINER curl -v http://localhost:3005/api  # Test internal API

# === PROXY CONNECTIVITY ===
docker run --rm --network web alpine/curl:latest curl -v http://APP_CONTAINER:3004/  # Test container-to-container
docker exec PROXY_CONTAINER ping APP_CONTAINER              # Test IP resolution  
docker exec PROXY_CONTAINER nslookup APP_CONTAINER          # Test DNS resolution

# === EXTERNAL ACCESS ===
curl -v http://VM_IP:3004/                  # Test direct container access
curl -v http://VM_IP/                       # Test through proxy
curl -I http://VM_IP/static/js/main.js      # Test static assets
```

### 2. Caddy Configuration Best Practices

#### Enable Debug Logging
```caddyfile
:80 {
  log {
    output stdout
    format console
    level DEBUG          # ← Critical for debugging
  }
  
  # Your routes...
}
```

#### Use IP Addresses for Critical Services
```caddyfile
# Instead of hostnames that can fail DNS resolution
handle_path /api/* {
  reverse_proxy http://172.18.0.5:3005    # ✅ Reliable IP
}

handle {
  reverse_proxy http://172.18.0.5:3004    # ✅ Reliable IP  
}
```

#### Add Health Checks
```caddyfile
@health path /health
respond @health "OK" 200

@app_health path /app-health
reverse_proxy @app_health http://172.18.0.5:3005/health
```

### 3. Docker Compose Best Practices

#### Explicit Network Configuration
```yaml
services:
  app:
    container_name: my-app    # ← Explicit naming
    networks:
      - web
    healthcheck:              # ← Add health checks
      test: ["CMD", "curl", "-f", "http://localhost:3004/"]
      interval: 30s
      timeout: 10s
      retries: 3

  caddy:
    depends_on:
      app:
        condition: service_healthy  # ← Wait for app to be ready
    networks:
      - web

networks:
  web:
    external: true
```

#### Use Service Discovery Alternatives
```yaml
# Option 1: Use service names with explicit IPs
services:
  app:
    networks:
      web:
        ipv4_address: 172.18.0.5  # ← Fixed IP

# Option 2: Use extra_hosts for DNS
services:
  caddy:
    extra_hosts:
      - "my-app:172.18.0.5"  # ← Manual DNS entry
```

### 4. React App Deployment Checklist

#### Environment Variables Validation
```bash
# Always verify React app has correct env vars
docker exec APP_CONTAINER printenv | grep REACT_APP
```

#### Static Asset Path Verification  
```bash
# Test static assets load correctly
curl -I http://VM_IP/static/js/main.js
curl -I http://VM_IP/static/css/main.css
curl -I http://VM_IP/favicon.ico
```

#### Browser Testing Protocol
1. **Open Developer Tools first** (F12)
2. **Check Console tab** for JavaScript errors
3. **Check Network tab** for failed requests (red entries)
4. **Verify all assets return 200 OK** with proper content-length
5. **Hard refresh** (Ctrl+F5) to bypass cache

### 5. Deployment Pipeline Improvements

#### Add Verification Steps
```yaml
- name: Verify Deployment
  run: |
    sleep 10  # Wait for services to start
    
    # Test health endpoints
    curl -f http://VM_IP/health || exit 1
    curl -f http://VM_IP/api/health || exit 1
    
    # Test main page returns content
    CONTENT_LENGTH=$(curl -sI http://VM_IP/ | grep -i content-length | cut -d' ' -f2 | tr -d '\r')
    if [ "$CONTENT_LENGTH" = "0" ]; then
      echo "❌ Empty response detected"
      exit 1
    fi
    
    # Test static assets
    curl -fI http://VM_IP/static/js/main.js || exit 1
    curl -fI http://VM_IP/static/css/main.css || exit 1
    
    echo "✅ Deployment verification passed"
```

#### Environment-Specific Configurations
```bash
# Use different configs for dev/prod
# dev-compose.yml - use hostnames for easy development  
# prod-compose.yml - use IP addresses for reliability
```

---

## Warning Signs to Watch For

### 🚨 Red Flags
- **HTTP 200 with Content-Length: 0** - Proxy failure
- **Blank page but "view source" shows HTML** - Static asset loading failure
- **Works locally but not deployed** - Environment configuration issue
- **"nslookup" fails but "ping" works** - DNS vs IP resolution mismatch
- **Container healthy but no external access** - Network/proxy issue

### 🔍 Debugging Indicators
- Check Caddy logs for `"status": 0` entries
- Look for `NXDOMAIN` in DNS resolution attempts  
- Monitor for connection timeouts vs connection refused
- Verify container-to-container communication works
- Test direct container port access vs proxied access

---

## Summary

**The blank page issue was caused by Docker DNS resolution failure, not application problems.** The React app was working perfectly - the reverse proxy couldn't reach it due to hostname resolution failure.

**Key lesson**: When debugging blank pages, test container-to-container communication first, then work outward to external access. Don't assume the application is broken when it might be a networking issue.

**Prevention**: Use IP addresses in production reverse proxy configurations, implement comprehensive health checks, and always verify container-to-container communication during debugging.