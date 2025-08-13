#!/bin/bash

# GCP deployment script for 9-tones-app
# Usage: ./build-and-deploy.sh [PROJECT_ID] [REGION]

set -e

PROJECT_ID=${1:-"your-gcp-project-id"}
REGION=${2:-"us-central1"}
SERVICE_NAME="9-tones-app"
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "🚀 Starting deployment to GCP..."
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"

# Authenticate with GCP (ensure gcloud is configured)
echo "🔐 Checking GCP authentication..."
gcloud auth list --filter=status:ACTIVE --format="value(account)" || {
    echo "❌ No active GCP authentication found. Please run: gcloud auth login"
    exit 1
}

# Set project
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required GCP APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create secrets for RS.ge API (if they don't exist)
echo "🔑 Setting up secrets..."
gcloud secrets describe rs-api-config >/dev/null 2>&1 || {
    echo "Creating rs-api-config secret..."
    echo "Please enter RS.ge API credentials:"
    read -p "SOAP Endpoint: " SOAP_ENDPOINT
    read -p "SOAP Username: " SOAP_SU
    read -s -p "SOAP Password: " SOAP_SP
    echo
    
    # Create secret with JSON format
    echo "{\"endpoint\":\"${SOAP_ENDPOINT}\",\"username\":\"${SOAP_SU}\",\"password\":\"${SOAP_SP}\"}" | \
    gcloud secrets create rs-api-config --data-file=-
}

# Build and push image
echo "🏗️ Building Docker image..."
docker build -t ${IMAGE_TAG} .

echo "📤 Pushing image to Google Container Registry..."
gcloud auth configure-docker
docker push ${IMAGE_TAG}

# Deploy to Cloud Run
echo "🌐 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image=${IMAGE_TAG} \
    --platform=managed \
    --region=${REGION} \
    --allow-unauthenticated \
    --port=3000 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=1 \
    --max-instances=10 \
    --set-env-vars="NODE_ENV=production" \
    --set-secrets="SOAP_ENDPOINT=rs-api-config:latest:endpoint,SOAP_SU=rs-api-config:latest:username,SOAP_SP=rs-api-config:latest:password"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format="value(status.url)")

echo "✅ Deployment completed successfully!"
echo "🌍 Frontend URL: ${SERVICE_URL}"
echo "🔗 Backend API URL: ${SERVICE_URL}/api"
echo "🏥 Health Check: ${SERVICE_URL}/health"

# Test deployment
echo "🧪 Testing deployment..."
curl -f "${SERVICE_URL}/health" && echo "✅ Health check passed" || echo "❌ Health check failed"

echo "🎉 Deployment script completed!"