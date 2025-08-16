# 🚀 Quick Deploy Reference

## 📋 TL;DR - Deployment Steps

### 1. SSH to VM
```bash
ssh deploy@34.30.242.142
```

### 2. Run VM Setup (One Time)
```bash
curl -fsSL https://raw.githubusercontent.com/BorisSolomonia/tasty_sal_app_2/master/vm-setup.sh | bash
```

### 3. Configure GCP (One Time)
```bash
gcloud auth login
gcloud config set project nine-tones-bots-2025-468320

# Add SOAP secrets
gcloud secrets versions access latest --secret=myapp-env > /tmp/myapp.env
# Edit /tmp/myapp.env and add:
# SOAP_SU=username:userid
# SOAP_SP=your_password
gcloud secrets versions add myapp-env --data-file=/tmp/myapp.env
rm /tmp/myapp.env
```

### 4. Setup GitHub Runner (One Time)
```bash
cd ~/.github-runner
./config.sh --url https://github.com/BorisSolomonia/tasty_sal_app_2 --token YOUR_TOKEN
sudo systemctl enable github-runner
sudo systemctl start github-runner
```

### 5. Add GitHub Secrets (One Time)
Go to: https://github.com/BorisSolomonia/tasty_sal_app_2/settings/secrets/actions

Add these secrets:
- `REACT_APP_FIREBASE_API_KEY`: `AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`: `tastyapp-ff8b2.firebaseapp.com`
- `REACT_APP_FIREBASE_PROJECT_ID`: `tastyapp-ff8b2`
- `REACT_APP_FIREBASE_STORAGE_BUCKET`: `tastyapp-ff8b2.firebasestorage.app`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`: `282950310544`
- `REACT_APP_FIREBASE_APP_ID`: `1:282950310544:web:c2c00922dac72983d71615`

### 6. Deploy
```bash
git push origin master
```

**App URL**: http://34.30.242.142:8087

---

## 🔧 Management Commands

### Check App Status
```bash
./scripts/health-check.sh
```

### Manual Deploy (if GitHub Actions fails)
```bash
./scripts/deploy-manual.sh
```

### View Logs
```bash
docker logs nine-tones-app -f
```

### Restart App
```bash
docker restart nine-tones-app
```

### Check Resources
```bash
docker stats nine-tones-app
```

---

## 🚨 Emergency Commands

### Stop App
```bash
docker stop nine-tones-app
```

### Rollback to Previous Image
```bash
docker images nine-tones-app
docker stop nine-tones-app
docker rm nine-tones-app
docker run -d --name nine-tones-app --restart unless-stopped --publish 8087:3000 \
  --env-file <(gcloud secrets versions access latest --secret=myapp-env) \
  --memory="1g" --cpus="0.5" nine-tones-app:PREVIOUS_TAG
```

### Check GitHub Runner
```bash
sudo systemctl status github-runner
sudo systemctl restart github-runner
```

---

## 📁 Important Files

- `.github/workflows/deploy.yml` - GitHub Actions workflow
- `vm-setup.sh` - VM setup script
- `scripts/deploy-manual.sh` - Manual deployment
- `scripts/health-check.sh` - Health monitoring
- `DEPLOYMENT_GUIDE.md` - Complete guide

---

## 🔍 Monitoring URLs

- **App**: http://34.30.242.142:8087
- **GitHub Actions**: https://github.com/BorisSolomonia/tasty_sal_app_2/actions
- **GitHub Runners**: https://github.com/BorisSolomonia/tasty_sal_app_2/settings/actions/runners

---

## 🆘 Troubleshooting

### Container won't start
```bash
docker logs nine-tones-app
docker inspect nine-tones-app
```

### Port issues
```bash
sudo netstat -tlnp | grep 8087
sudo ufw status
```

### Secrets issues
```bash
gcloud secrets versions access latest --secret=myapp-env
gcloud auth list
```

### GitHub Runner issues
```bash
sudo journalctl -u github-runner -f
```