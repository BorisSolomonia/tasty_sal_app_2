#!/bin/bash

# 🧪 Test Build Script - Verify TypeScript compilation works

set -e

echo "🧪 Testing TypeScript compilation..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd backend

print_status "Checking backend dependencies..."
if [ ! -d "node_modules" ]; then
    print_status "Installing backend dependencies..."
    npm install
else
    print_success "Backend dependencies already installed"
fi

print_status "Checking TypeScript configuration..."
if [ ! -f "tsconfig.json" ]; then
    print_error "tsconfig.json not found!"
    exit 1
fi

print_success "TypeScript configuration found"

print_status "Testing TypeScript compilation..."
npx tsc --noEmit --project tsconfig.json

if [ $? -eq 0 ]; then
    print_success "✅ TypeScript compilation successful!"
else
    print_error "❌ TypeScript compilation failed!"
    exit 1
fi

print_status "Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    print_success "✅ Build successful!"
    
    print_status "Checking build output..."
    if [ -d "dist" ]; then
        print_success "✅ dist/ directory created"
        ls -la dist/
    else
        print_error "❌ dist/ directory not found"
        exit 1
    fi
else
    print_error "❌ Build failed!"
    exit 1
fi

print_success "🎉 All tests passed! TypeScript build is working correctly."