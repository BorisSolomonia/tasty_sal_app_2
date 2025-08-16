# 🟢 Quick Node.js Fix for GitHub Runner

## 🚨 **IMMEDIATE FIX** - Run this on your VM:

```bash
# SSH to your VM
ssh deploy@34.30.242.142

# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show npm version

# Test that npm works
npm --version

# Restart GitHub runner to pick up new PATH
sudo systemctl restart github-runner

# Check runner status
sudo systemctl status github-runner
```

## 🔍 **Alternative: Check if Node.js is already installed but not in PATH**

```bash
# Check where Node.js might be installed
which node
whereis node
ls -la /usr/bin/node*
ls -la /usr/local/bin/node*

# If Node.js exists but not in PATH, add it:
export PATH="/usr/bin:/usr/local/bin:$PATH"
echo 'export PATH="/usr/bin:/usr/local/bin:$PATH"' >> ~/.bashrc
```

## 🚀 **After Installing Node.js:**

1. **Restart the GitHub runner:**
```bash
sudo systemctl restart github-runner
```

2. **Push a new commit to trigger deployment:**
```bash
git add .
git commit -m "Fix Node.js availability for GitHub Actions runner"
git push origin master
```

3. **Monitor the deployment:**
   - Go to: https://github.com/BorisSolomonia/tasty_sal_app_2/actions
   - The Node.js step should now pass

## 🧪 **Test Node.js Locally:**

```bash
# Test TypeScript compilation
cd /home/deploy/tasty_sal_app_2
./scripts/test-build.sh
```

This should resolve the "npm: command not found" error!