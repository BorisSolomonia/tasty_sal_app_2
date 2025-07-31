# 9-Tones App Setup Guide with RS.ge API Integration

This guide explains how to set up and run the complete 9-Tones application with RS.ge API integration.

## Project Structure

```
9-tones-app/
├── backend/              # Node.js/Express backend with RS.ge API
│   ├── src/
│   │   ├── index.ts      # Main server
│   │   └── soapClient.ts # SOAP client for RS.ge
│   ├── package.json
│   └── .env              # Backend configuration
├── src/                  # React frontend
│   ├── App.js            # Main app with authentication
│   ├── RSApiManagementPage.js  # RS.ge API interface
│   └── utils.js          # Utilities and translations
├── package.json          # Frontend dependencies
└── .env                  # Frontend configuration
```

## Setup Instructions

### 1. Frontend Setup

#### Install Dependencies
```bash
# In the root directory (9-tones-app/)
npm install
```

#### Configure Environment
Create/update `.env` file in the root directory:
```
REACT_APP_API_URL=http://localhost:3001
```

#### Firebase Configuration
Update the Firebase configuration in `src/App.js` (lines 35-42) with your Firebase project credentials.

### 2. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install
```

#### Configure Environment
Update `backend/.env` with your RS.ge API credentials:
```
SOAP_ENDPOINT=https://services.rs.ge/WayBillService/WayBillService.asmx
SOAP_SU=your_username:your_user_id
SOAP_SP=your_password
PORT=3001
NODE_ENV=development
```

**Important**: Replace with your actual RS.ge API credentials.

## Running the Application

### 1. Start the Backend Server
```bash
cd backend
npm run dev
```
The backend will start on `http://localhost:3001`

### 2. Start the Frontend Application
```bash
# In the root directory
npm start
```
The frontend will start on `http://localhost:3000`

## User Roles and Access

### Admin
- Complete access to all features
- **RS.ge API Management**: Full access to all RS.ge operations
- User management, product/customer management
- Order summary and delivery checks

### Purchase Manager
- **RS.ge API Management**: Full access to all RS.ge operations
- Purchase order processing and supplier management
- Accounts payable and aggregated orders
- Order summary

### Seller
- Order creation and management
- Customer addition
- Order summary (filtered by date)

## RS.ge API Features

The RS.ge API Management page provides access to all supported operations:

### Waybill Operations
- **Get Waybills**: Retrieve waybills for a date range
- **Get Buyer Waybills**: Retrieve buyer waybills
- **Get Waybill**: Retrieve specific waybill by ID
- **Save Waybill**: Save waybill data
- **Send Waybill**: Send waybill to the system
- **Close Waybill**: Close a waybill
- **Confirm Waybill**: Confirm a waybill
- **Reject Waybill**: Reject a waybill
- **Save Invoice**: Save invoice data

### Utility Operations
- **Get Service Users**: Retrieve service users list
- **Get Error Codes**: Retrieve error codes
- **Get Name from TIN**: Get company name from TIN number
- **Get Akciz Codes**: Retrieve akciz codes
- **Get Waybill Types**: Retrieve waybill types
- **Check Service User**: Check if a service user exists

## First Time Setup

### 1. Create Firebase Project
1. Go to https://console.firebase.google.com
2. Create a new project
3. Enable Authentication and Firestore
4. Update Firebase config in `src/App.js`

### 2. Create First Admin User
1. In Firebase Console, go to Authentication > Users
2. Add a new user with email and password
3. In Firestore, create a `users` collection
4. Add a document with the user's UID as document ID:
   ```json
   {
     "name": "Admin User",
     "email": "admin@example.com",
     "role": "Admin"
   }
   ```

### 3. Configure RS.ge API
1. Obtain RS.ge API credentials from RS.ge
2. Update `backend/.env` with your credentials
3. Test the connection using the RS.ge API Management page

## Testing the Integration

### 1. Backend Health Check
```bash
curl http://localhost:3001/health
```
Should return:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "service": "9-tones-backend"
}
```

### 2. Frontend Access
1. Open http://localhost:3000
2. Login with your admin credentials
3. Navigate to "RS.ge API მართვა" (RS.ge API Management)
4. Test various API operations

### 3. API Operations Test
Try these operations to verify the integration:
- **Get Error Codes**: Should return a list of error codes
- **Get Service Users**: Should return service users (requires valid credentials)
- **Get Name from TIN**: Enter a valid TIN number

## Troubleshooting

### Common Issues

1. **Backend Connection Error**
   - Ensure backend server is running on port 3001
   - Check CORS configuration
   - Verify API_URL in frontend .env

2. **RS.ge API Errors**
   - Verify credentials in backend/.env
   - Check network connectivity
   - Review RS.ge API documentation

3. **Firebase Authentication Issues**
   - Verify Firebase configuration
   - Check user roles in Firestore
   - Ensure proper security rules

4. **Frontend Build Issues**
   - Clear node_modules and reinstall
   - Check for conflicting dependencies
   - Verify React version compatibility

### Log Locations
- **Backend logs**: Console output when running `npm run dev`
- **Frontend logs**: Browser developer console
- **Network requests**: Browser Network tab

## Development

### Adding New RS.ge Operations
1. Add operation to `ALLOWED_OPERATIONS` in `backend/src/index.ts`
2. Add button and handler in `src/RSApiManagementPage.js`
3. Update translations if needed

### Adding New User Roles
1. Update role definitions in Firebase
2. Add role checks in `src/App.js`
3. Update navigation and access controls

## Production Deployment

### Backend
```bash
cd backend
npm run build
npm start
```

### Frontend
```bash
npm run build
# Deploy the build/ folder to your hosting service
```

### Environment Variables
- Update API URLs for production
- Use production Firebase configuration
- Secure RS.ge API credentials

## Support

- **RS.ge API**: Contact RS.ge technical support
- **Firebase**: Firebase documentation and support
- **Application Issues**: Check logs and error messages

## Security Notes

- Keep RS.ge API credentials secure
- Use HTTPS in production
- Implement proper input validation
- Monitor API usage and logs
- Follow Firebase security best practices