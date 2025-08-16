#!/bin/bash

# 🔧 VM Setup Script for Nine Tones App Deployment
# This script prepares a Debian 12 VM for GitHub Actions self-hosted runner
# Run as deploy user with sudo privileges

set -e

echo "🚀 Starting Nine Tones App VM Setup..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as deploy user
if [ "$USER" != "deploy" ]; then
    print_error "This script should be run as the 'deploy' user"
    exit 1
fi

# Check sudo access
if ! sudo -n true 2>/dev/null; then
    print_error "Deploy user needs sudo access without password prompt"
    print_warning "Add this to /etc/sudoers: deploy ALL=(ALL) NOPASSWD:ALL"
    exit 1
fi

print_status "✅ User and permissions check passed"

# Update system
print_status "📦 Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# Install required packages
print_status "📦 Installing required packages..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    unzip \
    jq \
    htop \
    ufw \
    fail2ban \
    ca-certificates \
    gnupg \
    lsb-release

# Install Node.js 20.x LTS
if ! command -v node &> /dev/null; then
    print_status "📦 Installing Node.js 20.x LTS..."
    
    # Add NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    
    # Install Node.js
    sudo apt-get install -y nodejs
    
    print_success "✅ Node.js $(node --version) installed"
    print_success "✅ npm $(npm --version) installed"
else
    print_success "✅ Node.js already installed: $(node --version)"
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    print_status "🐳 Installing Docker..."
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up repository
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
        $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt-get update -qq
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add deploy user to docker group
    sudo usermod -aG docker deploy
    
    print_success "✅ Docker installed successfully"
else
    print_success "✅ Docker already installed"
fi

# Install Google Cloud SDK if not present
if ! command -v gcloud &> /dev/null; then
    print_status "☁️ Installing Google Cloud SDK..."
    
    # Add the Cloud SDK distribution URI as a package source
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
    
    # Import the Google Cloud Platform public key
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
    
    # Update and install the Cloud SDK
    sudo apt-get update -qq
    sudo apt-get install -y google-cloud-sdk
    
    print_success "✅ Google Cloud SDK installed"
else
    print_success "✅ Google Cloud SDK already installed"
fi

# Configure firewall
print_status "🔥 Configuring firewall..."

# Reset UFW to default
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (port 22) from anywhere
sudo ufw allow ssh

# Allow our application port (8087)
sudo ufw allow 8087/tcp comment "Nine Tones App"

# Enable firewall
sudo ufw --force enable

print_success "✅ Firewall configured (SSH:22, App:8087)"

# Create application directories
print_status "📁 Creating application directories..."
mkdir -p ~/app-deployments
mkdir -p ~/logs
mkdir -p ~/.github-runner

# Set up log rotation for Docker
print_status "📝 Configuring Docker log rotation..."
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
EOF

# Restart Docker to apply configuration
sudo systemctl restart docker

# Configure fail2ban for additional security
print_status "🛡️ Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

sudo systemctl restart fail2ban
sudo systemctl enable fail2ban

# Set up GitHub Actions runner download directory
print_status "🏃 Preparing GitHub Actions runner setup..."

RUNNER_VERSION="2.311.0"
RUNNER_ARCH="x64"

cd ~/.github-runner

if [ ! -f "actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" ]; then
    print_status "📥 Downloading GitHub Actions runner..."
    curl -o actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz \
         -L https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz
    
    # Verify hash (optional but recommended)
    echo "29fc8cf2dab4c195bb147384e7e2c94cfd4d4022c793b346a6175435265aa278  actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" | sha256sum -c
    
    # Extract the installer
    tar xzf actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz
    
    print_success "✅ GitHub Actions runner downloaded and extracted"
fi

# Create systemd service for the runner (template)
print_status "⚙️ Creating GitHub Actions runner service template..."
sudo tee /etc/systemd/system/github-runner.service > /dev/null <<EOF
[Unit]
Description=GitHub Actions Runner for Nine Tones App
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/.github-runner
ExecStart=/home/deploy/.github-runner/run.sh
Restart=always
RestartSec=5
Environment=HOME=/home/deploy

[Install]
WantedBy=multi-user.target
EOF

# Set proper permissions
sudo chown deploy:deploy -R /home/deploy
chmod +x ~/.github-runner/run.sh 2>/dev/null || true

# Display system information
print_status "📊 System Information:"
echo "======================"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Docker: $(docker --version)"
echo "gcloud: $(gcloud version --format='value(Google Cloud SDK)' 2>/dev/null || echo 'Not configured')"
echo "Memory: $(free -h | grep Mem | awk '{print $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $4}' | sed 's/G/ GB/')"
echo "CPU: $(nproc) cores"

print_success "🎉 VM setup completed successfully!"
echo ""
echo "📋 Next Steps:"
echo "=============="
echo "1. Configure gcloud authentication:"
echo "   gcloud auth login"
echo "   gcloud config set project nine-tones-bots-2025-468320"
echo ""
echo "2. Add SOAP credentials to GCP Secret Manager:"
echo "   gcloud secrets versions access latest --secret=myapp-env > /tmp/myapp.env"
echo "   # Edit /tmp/myapp.env and add:"
echo "   # SOAP_SU=username:userid"
echo "   # SOAP_SP=your_password"
echo "   gcloud secrets versions add myapp-env --data-file=/tmp/myapp.env"
echo "   rm /tmp/myapp.env"
echo ""
echo "3. Configure GitHub Actions runner:"
echo "   cd ~/.github-runner"
echo "   ./config.sh --url https://github.com/BorisSolomonia/tasty_sal_app_2 --token YOUR_TOKEN"
echo "   sudo systemctl enable github-runner"
echo "   sudo systemctl start github-runner"
echo ""
echo "4. Add GitHub Secrets in repository settings:"
echo "   REACT_APP_FIREBASE_API_KEY=AIzaSyB15dF8g5C_2D55gOwSx7Txu0dUTKrqAQE"
echo "   REACT_APP_FIREBASE_AUTH_DOMAIN=tastyapp-ff8b2.firebaseapp.com"
echo "   REACT_APP_FIREBASE_PROJECT_ID=tastyapp-ff8b2"
echo "   REACT_APP_FIREBASE_STORAGE_BUCKET=tastyapp-ff8b2.firebasestorage.app"
echo "   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=282950310544"
echo "   REACT_APP_FIREBASE_APP_ID=1:282950310544:web:c2c00922dac72983d71615"
echo ""
echo "5. Test deployment by pushing to master branch"
echo ""
print_warning "⚠️ Logout and login again to apply Docker group membership!"