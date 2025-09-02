# 9-Tones Backend API

Backend service for the 9-tones-app that provides RS.ge API integration through SOAP web services.

## Features

- **SOAP Client**: Full integration with RS.ge SOAP web services
- **API Proxy**: REST API endpoints for frontend communication
- **Error Handling**: Comprehensive error handling and retry logic
- **CORS Support**: Configured for frontend integration
- **Logging**: Detailed operation logging

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Configuration
The `.env` file contains the RS.ge API credentials:
```
SOAP_ENDPOINT=https://services.rs.ge/WayBillService/WayBillService.asmx
SOAP_SU=username:405747492
SOAP_SP=Password1@
PORT=3005
NODE_ENV=development
```

**Important**: Replace the credentials with your actual RS.ge API credentials.

### 3. Start the Backend Server

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:3005
## API Endpoints

### Health Check
```
GET /health
```
Returns server status and basic information.

### RS.ge API Operations
```
POST /api/rs/{operation}
```

#### Supported Operations

**Waybill Operations:**
- `get_waybills` - Get waybills for date range
- `get_buyer_waybills` - Get buyer waybills for date range
- `get_waybill` - Get specific waybill by ID
- `save_waybill` - Save waybill data
- `send_waybill` - Send waybill to system
- `close_waybill` - Close waybill
- `confirm_waybill` - Confirm waybill
- `reject_waybill` - Reject waybill
- `save_invoice` - Save invoice data

**Utility Operations:**
- `get_service_users` - Get service users list
- `get_error_codes` - Get error codes
- `get_name_from_tin` - Get company name from TIN
- `get_akciz_codes` - Get akciz codes
- `get_waybill_types` - Get waybill types
- `chek_service_user` - Check service user

#### Request Format
```json
{
  "param1": "value1",
  "param2": "value2"
}
```

#### Response Format
```json
{
  "success": true,
  "operation": "operation_name",
  "data": {
    "STATUS": 0,
    "RESULT": "..."
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Error Handling

The backend includes comprehensive error handling:

- **SOAP Faults**: Automatically parsed and returned as errors
- **HTTP Errors**: Network and timeout errors
- **Validation**: Input validation and sanitization
- **Retry Logic**: Automatic retry for specific error codes (-101, -1064)
- **Rate Limiting**: Built-in protection against API abuse

## Development

### Project Structure
```
backend/
├── src/
│   ├── index.ts          # Main server file
│   └── soapClient.ts     # SOAP client implementation
├── package.json
├── tsconfig.json
├── .env
└── README.md
```

### Adding New Operations
1. Add the operation name to `ALLOWED_OPERATIONS` in `index.ts`
2. The SOAP client will automatically handle the operation
3. Update frontend components to use the new operation

### Logging
The backend includes detailed logging:
- Operation requests and responses
- Error messages and stack traces
- Performance metrics
- SOAP request/response details

## Troubleshooting

### Common Issues

1. **SOAP Endpoint Unreachable**
   - Check internet connection
   - Verify SOAP_ENDPOINT URL
   - Check firewall settings

2. **Authentication Errors**
   - Verify SOAP_SU and SOAP_SP credentials
   - Check with RS.ge support for credential issues

3. **Permission Errors**
   - Ensure credentials have required permissions
   - Check user roles in RS.ge system

4. **Network Timeouts**
   - Increase timeout values in soapClient.ts
   - Check network stability

### Support

For RS.ge API documentation and support:
- RS.ge Developer Portal
- Technical support contacts
- API documentation

For backend issues:
- Check logs for detailed error messages
- Verify environment configuration
- Test with health check endpoint