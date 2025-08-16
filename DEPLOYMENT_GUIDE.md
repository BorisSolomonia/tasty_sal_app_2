# 🚀 Nine Tones App - Complete Deployment Guide

This guide will walk you through deploying the Nine Tones app to a GCP VM using GitHub Actions.

## 📋 Prerequisites

- ✅ Debian 12 VM at 34.30.242.142
- ✅ `deploy` user with sudo access
- ✅ GitHub repository: https://github.com/BorisSolomonia/tasty_sal_app_2
- ✅ GCP project: nine-tones-bots-2025-468320
- ✅ Docker installed on VM
- ✅ GCP Secret Manager secret: `myapp-env`

## 🔧 Step 1: VM Setup

SSH into your VM and run the setup script:

```bash
# SSH into VM (adjust your SSH method as needed)
ssh deploy@34.30.242.142

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/BorisSolomonia/tasty_sal_app_2/master/vm-setup.sh | bash

# OR clone the repo and run locally
git clone https://github.com/BorisSolomonia/tasty_sal_app_2.git
cd tasty_sal_app_2
chmod +x vm-setup.sh
./vm-setup.sh
```

**Important:** Logout and login again after setup to apply Docker group membership.

## 🔐 Step 2: Configure GCP Authentication

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set the project
gcloud config set project nine-tones-bots-2025-468320

# Verify authentication
gcloud auth list
gcloud config list
```

## 🗝️ Step 3: Add Backend Secrets to GCP Secret Manager

```bash
# Get current secrets
gcloud secrets versions access latest --secret=myapp-env > /tmp/myapp.env

# Edit the file to add SOAP credentials
nano /tmp/myapp.env

# Add these lines (replace with your actual values):
# SOAP_SU=username:userid
# SOAP_SP=your_password

# Update the secret
gcloud secrets versions add myapp-env --data-file=/tmp/myapp.env

# Clean up
rm /tmp/myapp.env

# Verify the secret was updated
gcloud secrets versions list myapp-env
```

## 🏃 Step 4: Configure GitHub Actions Self-Hosted Runner

### 4.1 Get Runner Token from GitHub

1. Go to: https://github.com/BorisSolomonia/tasty_sal_app_2/settings/actions/runners
2. Click "New self-hosted runner"
3. Select "Linux" and copy the token

### 4.2 Configure the Runner

```bash
# Navigate to runner directory
cd ~/.github-runner

# Configure the runner (replace YOUR_TOKEN with actual token)
./config.sh --url https://github.com/BorisSolomonia/tasty_sal_app_2 --token YOUR_TOKEN

# When prompted:
# - Name: nine-tones-vm-runner
# - Labels: self-hosted,Linux,X64,production
# - Work folder: _work (default)

# Start and enable the runner service
sudo systemctl enable github-runner
sudo systemctl start github-runner

# Check runner status
sudo systemctl status github-runner
```

### 4.3 Verify Runner Registration

- Go to GitHub repository settings → Actions → Runners
- You should see "nine-tones-vm-runner" with green status

## 🔒 Step 5: Configure GitHub Secrets

Go to your GitHub repository: https://github.com/BorisSolomonia/tasty_sal_app_2/settings/secrets/actions

Add these secrets:

| Secret Name | Value |
|-------------|--------|
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `tastyapp-ff8b2.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `tastyapp-ff8b2` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `tastyapp-ff8b2.firebasestorage.app` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `282950310544` |
| `REACT_APP_FIREBASE_APP_ID` | `1:282950310544:web:c2c00922dac72983d71615` |

## 🌐 Step 6: Configure Firewall

The setup script already configured UFW, but verify:

```bash
# Check firewall status
sudo ufw status

# Should show:
# 22/tcp     ALLOW       Anywhere (SSH)
# 8087/tcp   ALLOW       Anywhere (Nine Tones App)
```

If you need to configure GCP firewall rules:

```bash
# Create firewall rule for the app
gcloud compute firewall-rules create myapp-allow-8087 \
    --allow tcp:8087 \
    --source-ranges 0.0.0.0/0 \
    --description "Allow Nine Tones App on port 8087"
```

## 🚀 Step 7: Deploy the Application

### 7.1 Push to Master Branch

The deployment will automatically trigger when you push to the `master` branch:

```bash
# From your local development machine
git add .
git commit -m "Initial deployment setup"
git push origin master
```

### 7.2 Monitor Deployment

1. Go to: https://github.com/BorisSolomonia/tasty_sal_app_2/actions
2. Watch the "🚀 Deploy to GCP VM" workflow
3. The deployment should complete in 3-5 minutes

### 7.3 Verify Application

Once deployment completes, test the application:

```bash
# Test from VM
curl http://localhost:8087

# Test from external
curl http://34.30.242.142:8087
```

**Access your app at: http://34.30.242.142:8087**

## 📊 Step 8: Monitor and Maintain

### Check Application Status

```bash
# Check container status
docker ps

# View application logs
docker logs nine-tones-app

# Check resource usage
docker stats nine-tones-app

# Check GitHub runner status
sudo systemctl status github-runner
```

### Update Application

Simply push changes to the master branch:

```bash
git add .
git commit -m "Update application"
git push origin master
```

The GitHub Actions workflow will automatically:
1. Build new Docker image
2. Stop old container
3. Start new container
4. Perform health checks
5. Clean up old images

## 🔄 Rollback

If you need to rollback to a previous version:

1. Go to GitHub Actions: https://github.com/BorisSolomonia/tasty_sal_app_2/actions
2. Find a successful previous deployment
3. Click "Re-run jobs" to deploy that version

Or manually on the VM:

```bash
# List available images
docker images nine-tones-app

# Stop current container
docker stop nine-tones-app
docker rm nine-tones-app

# Start previous image (replace TAG with actual tag)
docker run -d \
  --name nine-tones-app \
  --restart unless-stopped \
  --publish 8087:3000 \
  --env-file <(gcloud secrets versions access latest --secret=myapp-env) \
  --memory="1g" \
  --cpus="0.5" \
  nine-tones-app:TAG
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Container Won't Start

```bash
# Check container logs
docker logs nine-tones-app

# Check if port is in use
sudo netstat -tlnp | grep 8087

# Check firewall
sudo ufw status
```

#### 2. GitHub Runner Issues

```bash
# Check runner service
sudo systemctl status github-runner

# View runner logs
sudo journalctl -u github-runner -f

# Restart runner
sudo systemctl restart github-runner
```

#### 3. Secret Manager Access Issues

```bash
# Check gcloud authentication
gcloud auth list

# Test secret access
gcloud secrets versions access latest --secret=myapp-env

# Check IAM permissions
gcloud projects get-iam-policy nine-tones-bots-2025-468320
```

#### 4. Build Failures

Check GitHub Actions logs for:
- Docker build errors
- Environment variable issues
- Network connectivity problems

### Health Checks

```bash
# Application health
curl -f http://localhost:8087/

# Container health
docker inspect nine-tones-app | grep Health

# System resources
free -h
df -h
docker system df
```

### Log Locations

- **Application logs**: `docker logs nine-tones-app`
- **GitHub runner logs**: `sudo journalctl -u github-runner`
- **System logs**: `/var/log/syslog`
- **UFW logs**: `/var/log/ufw.log`

## 🔧 Configuration Files

### Docker Configuration
- **Image**: `nine-tones-app:latest`
- **Container**: `nine-tones-app`
- **Ports**: 8087 (host) → 3000 (container)
- **Resources**: 1GB RAM, 0.5 CPU cores
- **Restart**: unless-stopped

### Environment Variables
- **Build-time**: Firebase config (from GitHub Secrets)
- **Runtime**: SOAP credentials (from GCP Secret Manager)

### Security
- **Firewall**: UFW enabled (ports 22, 8087)
- **fail2ban**: Configured for SSH protection
- **User**: Non-root `deploy` user
- **Secrets**: Stored in GCP Secret Manager

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check VM system logs
4. Verify all secrets and environment variables are set correctly

## 🎉 Success!

Your Nine Tones app should now be successfully deployed and accessible at:
**http://34.30.242.142:8087**

The deployment pipeline will automatically deploy updates when you push to the master branch.