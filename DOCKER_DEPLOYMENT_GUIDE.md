# 🐳 Docker Deployment Guide for 9-tones-app

## 📋 Overview
This guide covers deploying the 9-tones-app using the new optimized Dockerfile that serves both frontend (React) and backend (Node.js/TypeScript) in a single container.

## 🏗️ Architecture
- **Frontend**: React app served as static files on port 3000
- **Backend**: Express.js API server on port 3001  
- **Container**: Multi-stage build with optimized layers
- **Health Checks**: Built-in health monitoring for both services

## 🚀 Quick Start

### Option 1: Using Docker Compose (Recommended)
```bash
# 1. Copy the new Dockerfile
cp Dockerfile.new Dockerfile

# 2. Set up environment variables (create .env file)
cp .env.example .env
# Edit .env with your Firebase and RS.ge credentials

# 3. Build and run with docker-compose
cp docker-compose.new.yml docker-compose.yml
docker-compose up --build

# Access the app:
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
```

### Option 2: Direct Docker Commands
```bash
# 1. Build the image
docker build -f Dockerfile.new -t 9-tones-app:latest .

# 2. Run the container
docker run -d \
  --name 9-tones-app \
  -p 3000:3000 \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e REACT_APP_FIREBASE_API_KEY=your_key \
  -e REACT_APP_FIREBASE_PROJECT_ID=your_project \
  9-tones-app:latest
```

## 📝 Required Environment Variables

### Frontend (.env or container environment)
```bash
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com  
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_API_URL=http://localhost:3001
```

### Backend (container environment)
```bash
SOAP_ENDPOINT=https://rs.ge/api/endpoint
SOAP_SU=username:user_id_format
SOAP_SP=your_rs_ge_password
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=production
```

## 🔧 Build Optimizations

### Multi-stage Build Benefits
1. **Smaller final image** - Only production dependencies
2. **Better caching** - Separate build stages for frontend/backend
3. **Security** - Non-root user, minimal attack surface
4. **Performance** - Optimized layer ordering

### Build Arguments (Optional)
```bash
docker build \
  --build-arg NODE_VERSION=20 \
  --build-arg BUILD_ENV=production \
  -f Dockerfile.new \
  -t 9-tones-app:latest .
```

## 🏥 Health Checks
The container includes automatic health monitoring:
- **Frontend Check**: `curl -f http://localhost:3000`
- **Backend Check**: `curl -f http://localhost:3001/health`
- **Interval**: Every 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3 attempts

## 🚢 Production Deployment

### VM Deployment
```bash
# 1. Transfer files to your VM
scp -r . user@your-vm:/opt/9-tones-app/

# 2. SSH into VM and build
ssh user@your-vm
cd /opt/9-tones-app
sudo docker build -f Dockerfile.new -t 9-tones-app:latest .

# 3. Run with restart policy
sudo docker run -d \
  --name 9-tones-app \
  --restart unless-stopped \
  -p 80:3000 \
  -p 3001:3001 \
  --env-file .env.production \
  9-tones-app:latest
```

### Using Docker Compose on VM
```bash
# 1. Set up production environment
cp docker-compose.new.yml docker-compose.yml
cp .env.example .env.production

# 2. Edit production environment variables
nano .env.production

# 3. Deploy
sudo docker-compose up -d --build
```

## 🔍 Monitoring & Troubleshooting

### View Logs
```bash
# All logs
docker logs 9-tones-app

# Follow logs
docker logs -f 9-tones-app

# Backend specific logs
docker exec 9-tones-app tail -f /app/backend/logs/app.log
```

### Check Health Status
```bash
# Container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Manual health check
curl http://localhost:3000
curl http://localhost:3001/health
```

### Container Shell Access
```bash
# Access container shell for debugging
docker exec -it 9-tones-app sh
```

## 🔒 Security Considerations

1. **Non-root User**: Container runs as `nodejs` user (UID 1001)
2. **Minimal Base**: Uses Alpine Linux for smaller attack surface  
3. **Environment Variables**: Never bake secrets into image
4. **Health Checks**: Automatic failure detection and restart
5. **Resource Limits**: Consider adding memory/CPU limits in production

### Production Security Example
```yaml
# docker-compose.yml security additions
services:
  nine-tones-app:
    # ... other config
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    user: "1001:1001"
```

## 📊 Performance Tuning

### Container Optimization
```bash
# Production build with optimizations
docker build \
  --build-arg NODE_OPTIONS="--max_old_space_size=512" \
  -f Dockerfile.new \
  -t 9-tones-app:optimized .
```

### Resource Monitoring
```bash
# Monitor container resource usage
docker stats 9-tones-app

# Container processes
docker exec 9-tones-app ps aux
```

## 🆘 Common Issues

### Port Conflicts
```bash
# Find what's using ports
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :3001

# Use different ports
docker run -p 8080:3000 -p 8081:3001 9-tones-app:latest
```

### Environment Variable Issues
```bash
# Debug environment inside container
docker exec 9-tones-app env | grep REACT_APP
docker exec 9-tones-app env | grep SOAP
```

### Build Failures
```bash
# Clean build (no cache)
docker build --no-cache -f Dockerfile.new -t 9-tones-app:latest .

# Check build logs
docker build --progress=plain -f Dockerfile.new -t 9-tones-app:latest .
```

## 🔄 Updates & Maintenance

### Updating the Application
```bash
# 1. Pull latest code
git pull origin master

# 2. Rebuild image
docker build -f Dockerfile.new -t 9-tones-app:latest .

# 3. Recreate container
docker-compose up --build --force-recreate
```

### Cleanup
```bash
# Remove unused images/containers
docker system prune -a

# Remove specific image
docker rmi 9-tones-app:latest
```

---

## 🎯 Ready to Deploy!

Your 9-tones-app is now containerized and ready for deployment. The new Dockerfile provides:

- ✅ **Optimized multi-stage build**
- ✅ **Production-ready configuration**  
- ✅ **Built-in health monitoring**
- ✅ **Security best practices**
- ✅ **Easy maintenance and updates**

Choose your deployment method and follow the guide above! 🚀