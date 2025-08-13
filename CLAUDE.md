# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Frontend (React)
- `npm start` - Start development server (runs on http://localhost:3000)
- `npm run build` - Build for production
- `npm run build:prod` - Build for production with CI=false (Windows)
- `npm run build:prod:unix` - Build for production with CI=false (Unix/Linux)
- `npm test` - Run tests with Jest/React Testing Library in watch mode
- `npm test -- --watchAll=false` - Run tests once without watch mode
- `npm test -- --testPathPattern=<pattern>` - Run specific test files

### Backend (Node.js/TypeScript)
- `cd backend && npm run dev` - Start backend development server with ts-node
- `cd backend && npm run build` - Compile TypeScript to dist/
- `cd backend && npm start` - Run compiled backend from dist/

## Architecture Overview

This is a full-stack sales management application with the following structure:

### Frontend Architecture
- **Framework**: React 19 with functional components and hooks
- **Styling**: Tailwind CSS with responsive design
- **State Management**: React Context API with AuthContext and DataContext
- **Database**: Firebase Firestore for real-time data
- **Authentication**: Firebase Auth with role-based access (Admin, Seller, Purchase Manager)
- **File Processing**: XLSX library for Excel import/export functionality

### Key Frontend Components
- **App.js**: Main application entry point with all page components and business logic
- **Context Providers**: AuthProvider and DataProvider manage global state
- **Role-based Navigation**: Different UI based on user role
- **Real-time Data**: Uses Firestore onSnapshot for live updates

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **External Integration**: RS.ge API client using SOAP/XML
- **Purpose**: Proxy server for RS.ge waybill data to avoid CORS issues

### Data Models
- **Users**: name, email, role (Admin/Seller/Purchase Manager)
- **Products**: ProductSKU, ProductName, UnitPrice
- **Customers**: CustomerName, Identification, ContactInfo
- **Orders**: Complex model with OrderDate, CustomerName, ProductSKU, Quantity, pricing fields, status tracking
- **Payments**: supplierName, amount, paymentDate for accounts payable

### Key Business Logic
- **Order Management**: Add orders, bulk operations, status tracking (Pending/Completed/Cancelled)
- **Purchase Management**: Process orders for purchase, supplier assignment, price management
- **Customer Analysis**: Advanced integration with bank statements and RS.ge waybill data
- **Accounts Payable**: Track supplier payments and balances
- **Excel Import/Export**: Extensive use of XLSX for data exchange

### Customer Analysis Advanced Logic (CustomerAnalysisPage.js)
This component implements sophisticated business rules for customer debt analysis:

#### Cutoff Date Logic (2025-04-30)
- **Waybill Filtering**: Displays waybills within selected date range on page
- **Debt Calculation**: Uses ONLY active waybills after cutoff date (2025-04-30) for debt calculation
- **Payment Processing**: All bank payments after cutoff date are automatically saved to Firebase
- **Data Separation**: Display logic (date range) is separate from debt calculation logic (after cutoff)

#### Bank Statement Processing
- **Optimization**: Checks payment amount (Column E) first - skips entire row if amount ≤ 0
- **Column Mapping**: Customer ID from Column L (11), Payment from Column E (4)
- **Dual Bank Support**: TBC (bottom-up processing) and BOG (top-down processing)
- **Automatic Firebase Save**: All payments after 2025-04-30 are saved to Firebase asynchronously

#### Context-Aware Duplicate Detection
Implements sophisticated duplicate detection that considers transaction sequence context:

```javascript
// Not just same customer + date + amount, but also previous transaction context
const isContextAwareDuplicate = (currentPayment, rowIndex, excelData) => {
  // 1. Find potential duplicates in Firebase (same customer, date, amount)
  const potentialDuplicates = firebasePayments.filter(/* basic match */);
  
  // 2. Get previous transaction from Excel file for context
  const previousExcelPayment = getPreviousTransaction(rowIndex, excelData);
  
  // 3. For each potential duplicate, check if previous transaction also matches
  for (const duplicate of potentialDuplicates) {
    const previousFirebasePayment = getPreviousInBatch(duplicate);
    
    // 4. True duplicate only if BOTH current AND previous transactions match
    if (contextMatches(previousExcel, previousFirebase)) {
      return true; // Context-aware duplicate detected
    }
  }
  
  return false; // New transaction - different context
}
```

#### Business Rules Summary
1. **Waybill Count**: Should show exactly 2022 active waybills from 2025-04-30 to current date
2. **Payment Detection**: Only processes rows with payment amount > 0 (Column E)
3. **Context Duplicates**: Same payment different context = different transaction
4. **Firebase Integration**: Real-time sync with automatic duplicate prevention
5. **Date Logic**: Display range ≠ debt calculation range (always after cutoff)
6. **Resource Optimization**: Skips data extraction if payment amount is 0

#### Debugging Features
- **JSON Logging**: Detailed waybill analysis with first/last 5 records
- **Context Tracking**: Logs duplicate detection decisions with full context
- **Performance Monitoring**: Skip counters for zero-amount payments
- **Date Range Validation**: Separate logging for display vs debt calculation

## Firebase Configuration
- Uses environment variables for Firebase config (see Security Fixes Applied section)
- Firestore collections: users, products, customers, orders, payments
- Real-time listeners set up in DataProvider for all collections

## Key Features by Role
- **Admin**: User management, product/customer CRUD, delivery verification, RS.ge API management
- **Seller**: Order entry, customer management, order summaries
- **Purchase Manager**: Order processing, supplier assignment, accounts payable, aggregated reporting

## Deployment to GCP

### Quick Deploy
```bash
# Make script executable and run
chmod +x deploy-scripts/build-and-deploy.sh
./deploy-scripts/build-and-deploy.sh YOUR_PROJECT_ID us-central1
```

### Manual Deployment Steps
1. **Configure Environment Variables**:
   - Copy `.env.production` to `.env.production.local`
   - Copy `backend/.env.production` to `backend/.env.production.local`
   - Fill in production Firebase and RS.ge credentials

2. **Build and Deploy**:
   ```bash
   # Build Docker image
   docker build -t gcr.io/PROJECT_ID/9-tones-app:latest .
   
   # Push to Google Container Registry
   gcloud auth configure-docker
   docker push gcr.io/PROJECT_ID/9-tones-app:latest
   
   # Deploy to Cloud Run
   gcloud run deploy 9-tones-app \
     --image=gcr.io/PROJECT_ID/9-tones-app:latest \
     --platform=managed \
     --region=us-central1 \
     --allow-unauthenticated
   ```

3. **Set up Secrets** (for RS.ge API):
   ```bash
   gcloud secrets create rs-api-config --data-file=secrets.json
   ```

### Deployment Architecture
- **Frontend**: React app served as static files on port 3000
- **Backend**: Express.js API server on port 3001
- **Container**: Multi-stage Docker build with both services
- **Health Checks**: `/health` endpoint for load balancer probes
- **Secrets**: RS.ge credentials stored in Google Secret Manager
- **CORS**: Production-ready configuration with environment-based origins

### Environment Variables Required

#### Frontend (.env.production.local)
- `REACT_APP_FIREBASE_API_KEY` - Firebase API key
- `REACT_APP_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `REACT_APP_FIREBASE_PROJECT_ID` - Firebase project ID
- `REACT_APP_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` - Firebase sender ID
- `REACT_APP_FIREBASE_APP_ID` - Firebase app ID
- `REACT_APP_API_URL` - Backend API URL (production)

#### Backend (backend/.env.production.local)
- `SOAP_ENDPOINT` - RS.ge SOAP endpoint URL
- `SOAP_SU` - RS.ge username:user_id format
- `SOAP_SP` - RS.ge password
- `PORT` - Server port (default 3001)
- `NODE_ENV=production`
- `FRONTEND_URL` - Frontend URL for CORS

### Security Fixes Applied
- ✅ Removed hardcoded Firebase credentials from App.js
- ✅ Added environment variable validation
- ✅ Updated .gitignore to prevent credential commits
- ✅ Production-ready CORS configuration
- ✅ Secrets management via Google Secret Manager
- ✅ Health checks and monitoring endpoints

### Monitoring and Health Checks
- Health endpoint: `/health`
- Startup probes configured for Cloud Run
- Container health checks with curl
- Automatic restart policies

## Development Notes
- Uses Tailwind for all styling - follow existing utility class patterns
- All text is in Georgian language - maintain language consistency
- Font size accessibility controls implemented
- Excel export functionality requires XLSX library loaded via CDN
- RS.ge integration requires backend service running on port 3001
- Environment variables are validated on startup for both frontend and backend