import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { callSoap } from "./soapClient";

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SOAP_ENDPOINT', 'SOAP_SU', 'SOAP_SP'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please check your .env file or environment configuration');
  process.exit(1);
}

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? ['http://localhost:3004', 'http://localhost:3005']
    : process.env.FRONTEND_URL || true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Allowed RS.ge operations
const ALLOWED_OPERATIONS = new Set<string>([
  "get_error_codes",
  "get_service_users",
  "get_name_from_tin",
  "get_akciz_codes",
  "get_waybill",
  "get_waybills",
  "get_buyer_waybills",
  "chek_service_user",
  "save_waybill",
  "send_waybill",
  "save_invoice",
  "close_waybill",
  "confirm_waybill",
  "reject_waybill",
  "get_waybill_types",
  "get_waybills_v1",
]);

// Health check endpoints
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "9-tones-backend" 
  });
});

// Health check endpoint for API route (used by deployment scripts)
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "9-tones-backend-api" 
  });
});

// RS.ge API endpoint
app.post("/api/rs/:operation", async (req, res) => {
  const operation = req.params.operation;
  
  // Validate operation
  if (!ALLOWED_OPERATIONS.has(operation)) {
    return res.status(400).json({ 
      error: "Operation not supported",
      operation,
      allowedOperations: Array.from(ALLOWED_OPERATIONS)
    });
  }
  
  try {
    console.log(`[API] Received request for operation: ${operation}`);
    
    // Call SOAP service
    const result = await callSoap(operation, req.body);
    
    // Return result
    res.json({
      success: true,
      operation,
      data: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error(`[API] Error in operation ${operation}:`, error);
    
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      operation,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3005;

app.listen(PORT, () => {
  console.log(`✅ 9-tones backend server running on port ${PORT}`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/api/rs/`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});