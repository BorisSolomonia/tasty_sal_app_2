import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { callSoap } from "./soapClient";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : true,
  credentials: true
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    service: "9-tones-backend" 
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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ 9-tones backend server running on port ${PORT}`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}/api/rs/`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});