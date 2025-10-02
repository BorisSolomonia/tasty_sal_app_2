# 🚀 Unified Deployment Architecture

## Overview!

This document describes the **UNIFIED PRODUCTION DEPLOYMENT** system for the Nine Tones application. All previous split deployment methods have been consolidated into a singlee, consistent workflow.

## Architecture Flow!

```
GitHub Push → GitHub Actions → Docker Build → Artifact Registry → VM Deployment
     ↓              ↓               ↓              ↓              ↓
   master      deploy-unified.yml  Container    GCP Registry   Full Stack
   branch         workflow         Image         Storage      (App + Caddy)
```

## Key Components

### 1. **Single Workflow** (`.github/workflows/deploy-unified.yml`)
- ✅ **Builds** Docker image with production configuration
- ✅ **Pushes** to Google Artifact Registry
- ✅ **Uploads** both `compose.yml` and `Caddyfile` to VM
- ✅ **Deploys** full stack (app + Caddy) in one operation
- ✅ **Tests** API routing and health checks

### 2. **Production Compose** (`compose.yml`)
- ✅ **Nine Tones App**: Internal ports only (`expose`)
- ✅ **Caddy Reverse Proxy**: External access on port 80/443
- ✅ **Network Isolation**: Both services in `web` network
- ✅ **Resource Limits**: CPU and memory constraints
- ✅ **Health Checks**: Automated service monitoring

### 3. **Caddy Configuration** (`Caddyfile`)
```
:80 {
  # Frontend: All requests go to React app
  reverse_proxy nine-tones-app:3000
  
  # API: /api/* routes go to backend  
  handle_path /api/* {
    reverse_proxy nine-tones-app:3001
  }
}
```

## Deployment Process

### Automatic Deployment
Every push to `master` branch triggers:

1. **Build Phase**:
   - Create production environment files
   - Build Docker image with Firebase config
   - Push to Artifact Registry

2. **Upload Phase**:
   - Upload `compose.yml` to VM
   - Upload `Caddyfile` to VM
   - Ensure consistency

3. **Deploy Phase**:
   - Pull latest image
   - Create Docker networks/volumes
   - Deploy full stack with `docker compose`
   - Wait for health checks

4. **Verify Phase**:
   - Test API routing through Caddy
   - Test frontend accessibility
   - Comprehensive health checks

### Manual Deployment
```bash
# Trigger manual deployment
gh workflow run deploy-unified.yml
```

## Network Architecture

```
Internet → VM:80 → Caddy → nine-tones-app:3000 (Frontend)
                        → nine-tones-app:3001 (Backend API)
```

### Security
- ✅ **No direct port access** to application containers
- ✅ **All traffic** flows through Caddy reverse proxy
- ✅ **Container isolation** via Docker networks
- ✅ **Resource limits** prevent resource exhaustion

## API Routing

### Frontend API Calls
```javascript
// Frontend makes calls to same origin
fetch(`${REACT_APP_API_URL}/api/rs/get_waybills`, {
  // REACT_APP_API_URL = http://34.141.45.73
  // Results in: http://34.141.45.73/api/rs/get_waybills
})
```

### Caddy Routing
```
http://34.141.45.73/api/rs/get_waybills
                    ↓
            Caddy handles /api/*
                    ↓  
        nine-tones-app:3001/rs/get_waybills
```

## File Structure

### Active Files
- ✅ `compose.yml` - **Production deployment configuration**
- ✅ `Caddyfile` - **Reverse proxy configuration**
- ✅ `.github/workflows/deploy-unified.yml` - **Deployment workflow**

### Deprecated Files
- ❌ `deploy-OLD-BROKEN.yml` - Old split app deployment
- ❌ `deploy-caddy-OLD-SEPARATE.yml` - Old separate Caddy deployment
- ❌ `docker-compose.production.yml` - Removed (redundant)

### Development Files
- 🔧 `docker-compose.yml` - **Local development only** (direct ports)

## Troubleshooting

### Common Issues

1. **API Returns HTML Instead of JSON**
   - **Cause**: Caddyfile not routing `/api/*` correctly
   - **Solution**: Redeploy to update Caddyfile on VM

2. **Containers Not Communicating**
   - **Cause**: Network configuration issues
   - **Solution**: Check `web` network exists and both containers are connected

3. **Health Checks Failing**
   - **Cause**: Services not ready or configuration errors
   - **Solution**: Check container logs and environment variables

### Debugging Commands

```bash
# SSH to VM
ssh user@34.141.45.73

# Check container status
docker ps

# Test API routing
curl -v http://localhost/api/health

# Check logs
docker logs nine-tones-app --tail=30
docker logs caddy --tail=20

# Verify network
docker network inspect web
```

## Migration from Old System

### What Changed
- ❌ **Removed**: Split deployment workflows
- ❌ **Removed**: Direct port mappings in production
- ❌ **Removed**: Manual Caddy deployment steps
- ✅ **Added**: Unified single-command deployment
- ✅ **Added**: Automatic Caddyfile sync
- ✅ **Added**: Comprehensive health checks

### Benefits
- 🎯 **Consistency**: Same behavior every deployment
- 🚀 **Speed**: Single workflow deploys everything
- 🔒 **Security**: No direct container access
- 📊 **Monitoring**: Built-in health checks
- 🐛 **Debugging**: Better error reporting

## Environment Variables

### Build-time (Docker Build)
```
REACT_APP_FIREBASE_* - Firebase configuration
REACT_APP_API_URL - API base URL for frontend
```

### Runtime (Container)
```
NODE_ENV=production
SOAP_ENDPOINT - RS.ge API endpoint
SOAP_SU - RS.ge username
SOAP_SP - RS.ge password
```

## Success Indicators

✅ **Deployment Success**:
- Both containers running (nine-tones-app, caddy)
- API endpoint returns JSON: `curl http://VM_HOST/api/health`
- Frontend accessible: `curl http://VM_HOST/`
- No HTML returned for API calls

✅ **Application Success**:
- Waybills calls work properly
- Downloads function correctly
- No "Unexpected token '<'" errors
- Consistent behavior between local and production