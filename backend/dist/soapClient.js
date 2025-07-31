"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callSoap = callSoap;
const axios_1 = __importDefault(require("axios"));
const xml2js_1 = require("xml2js");
const NS = 'http://tempuri.org/';
// Helper: XML-escape special characters
function xmlEscape(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
// Extract numeric seller_un_id from env SOAP_SU
function getSellerId() {
    const su = process.env.SOAP_SU || '';
    return su.includes(':') ? su.split(':')[1] : '';
}
// Render a single SOAP parameter (nested, raw XML, or scalar)
function renderParam(key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Nested object
        const inner = Object.entries(value)
            .map(([k, v]) => renderParam(k, v))
            .join('');
        return `<${key}>${inner}</${key}>`;
    }
    if (typeof value === 'string' && value.trim().startsWith('<')) {
        // Raw XML snippet
        return `<${key}>${value}</${key}>`;
    }
    // Scalar: XML-escape
    return `<${key}>${xmlEscape(String(value))}</${key}>`;
}
// Main SOAP call with retry logic for -101 and -1064
async function callSoap(op, params) {
    console.log(`[SOAP] Calling operation: ${op}`, params);
    // 1) Merge credentials + seller_un_id + caller params
    const allParams = {
        su: process.env.SOAP_SU,
        sp: process.env.SOAP_SP,
        seller_un_id: getSellerId(),
        ...params,
    };
    // 2) Build XML body fields
    const bodyFields = Object.entries(allParams)
        .map(([k, v]) => renderParam(k, v))
        .join('');
    // 3) Wrap in SOAP Envelope
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${op} xmlns="${NS}">
      ${bodyFields}
    </${op}>
  </soap:Body>
</soap:Envelope>`;
    try {
        // 4) Send request (allow HTTP 500 to parse SOAP Fault)
        const response = await axios_1.default.post(process.env.SOAP_ENDPOINT, xml, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: `"${NS}${op}"`,
            },
            validateStatus: () => true,
            timeout: 30000, // 30 seconds timeout
        });
        // 5) Parse XML → JSON
        const parsed = await (0, xml2js_1.parseStringPromise)(response.data, {
            explicitArray: false,
            ignoreAttrs: true,
            tagNameProcessors: [xml2js_1.processors.stripPrefix],
        });
        // 6) Handle SOAP Fault
        const body = parsed.Envelope.Body;
        if (body.Fault) {
            throw new Error(body.Fault.faultstring || 'SOAP Fault');
        }
        // 7) Extract <op>Result and unwrap if nested
        const respNode = body[`${op}Response`];
        let result = respNode[`${op}Result`];
        if (result.RESULT)
            result = result.RESULT;
        // 8) Retry logic:
        //   -101 → missing seller_un_id → retry once (now injected)
        //   -1064 → date-range too large → split into 72h chunks
        const code = Number(result.STATUS);
        if (code === -101 && !params.seller_un_id) {
            console.log('[SOAP] Retrying with seller_un_id');
            return callSoap(op, params);
        }
        if ((op === 'get_waybills' || op === 'get_buyer_waybills') && code === -1064) {
            console.log('[SOAP] Date range too large, splitting into 72h chunks');
            const start = new Date(params.create_date_s);
            const end = new Date(params.create_date_e);
            const maxMs = 72 * 3600 * 1000;
            const calls = [];
            let cur = start;
            while (cur < end) {
                const next = new Date(Math.min(cur.getTime() + maxMs, end.getTime()));
                calls.push(callSoap(op, {
                    ...params,
                    create_date_s: cur.toISOString().slice(0, 19),
                    create_date_e: next.toISOString().slice(0, 19),
                }));
                cur = new Date(next.getTime() + 1);
            }
            const chunks = await Promise.all(calls);
            return chunks.flatMap(chunk => Array.isArray(chunk) ? chunk : [chunk]);
        }
        // 9) Return parsed result
        console.log(`[SOAP] Operation ${op} completed with status: ${code}`);
        return result;
    }
    catch (error) {
        console.error(`[SOAP] Error in operation ${op}:`, error);
        throw error;
    }
}
//# sourceMappingURL=soapClient.js.map