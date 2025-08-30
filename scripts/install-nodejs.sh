#!/bin/bash

# 🟢 Quick Node.js Installation Script for GitHub Runner

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_status "🟢 Installing Node.js 20.x LTS for GitHub Runner..."

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "✅ Node.js already installed: $NODE_VERSION"
    
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_success "✅ npm already installed: $NPM_VERSION"
        exit 0
    fi
fi

# Install Node.js 20.x
print_status "📦 Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

print_status "📦 Installing Node.js..."
sudo apt-get install -y nodejs

# Verify installation
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    print_success "✅ Node.js installed: $NODE_VERSION"
    print_success "✅ npm installed: $NPM_VERSION"
    
    # Test npm
    print_status "🧪 Testing npm..."
    npm --version > /dev/null
    print_success "✅ npm is working correctly"
    
    # Add to PATH for GitHub runner
    print_status "🔧 Ensuring Node.js is in PATH..."
    echo 'export PATH="/usr/bin:$PATH"' >> ~/.bashrc
    
    print_success "🎉 Node.js installation completed!"
else
    print_error "❌ Node.js installation failed"
    exit 1
fi