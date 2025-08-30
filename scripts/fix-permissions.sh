#!/bin/bash

# 🔧 Fix TypeScript Binary Permissions

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

print_status "🔧 Fixing TypeScript and Node.js binary permissions..."

# Navigate to backend directory
cd backend

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    print_status "📦 Installing backend dependencies..."
    npm install
fi

# Fix permissions for all binaries in .bin directory
if [ -d "node_modules/.bin" ]; then
    print_status "🔧 Fixing binary permissions..."
    chmod +x node_modules/.bin/*
    print_success "✅ Binary permissions fixed"
else
    print_error "❌ node_modules/.bin directory not found"
    exit 1
fi

# Test TypeScript compilation
print_status "🧪 Testing TypeScript compilation..."
if npx tsc --noEmit; then
    print_success "✅ TypeScript compilation test passed"
else
    print_error "❌ TypeScript compilation test failed"
    exit 1
fi

# Test build
print_status "🏗️ Testing build..."
if npm run build; then
    print_success "✅ Build test passed"
    
    if [ -d "dist" ]; then
        print_success "✅ dist/ directory created successfully"
        ls -la dist/
    fi
else
    print_error "❌ Build test failed"
    exit 1
fi

print_success "🎉 All permissions fixed and tests passed!"