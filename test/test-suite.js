/**
 * Astra Local AI - Automated Test Suite
 * Tests utilities, security middleware, Astra service adapter, and live API endpoints.
 */

const http = require('http');
const path = require('path');
const logger = require('../server/utils/logger');
const { getLocalNetworkIp } = require('../server/utils/network');
const { validateChatPayload, securityHeaders } = require('../server/middleware/security');
const astraService = require('../server/services/astra');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS:\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('       ASTRA LOCAL AI TEST SUITE        ');
  console.log('========================================\n');

  // 1. Logger Masking Tests
  console.log('1. Testing Secret Masking in Logger:');
  const sampleBearer = 'Bearer sk-astra-1234567890abcdef12345678';
  const maskedBearer = logger.maskSecret(sampleBearer);
  assert(!maskedBearer.includes('1234567890abcdef'), 'Bearer token secret is masked');
  assert(maskedBearer.includes('****'), 'Mask contains asterisk redaction');

  const sampleKey = 'sk-astra-secretkey99998888';
  const maskedKey = logger.maskSecret(sampleKey);
  assert(!maskedKey.includes('secretkey99998888'), 'Plain API key is masked');

  // 2. Network Discovery Tests
  console.log('\n2. Testing Network IP Discovery:');
  const lanIp = getLocalNetworkIp();
  assert(typeof lanIp === 'string' && lanIp.length > 0, `LAN IP resolved to: ${lanIp}`);

  // 3. Security Payload Validation Tests
  console.log('\n3. Testing Payload Validation Middleware:');
  let mockRes = {
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) { this.body = data; return this; }
  };

  // Test missing messages
  let calledNext = false;
  validateChatPayload({ body: {} }, mockRes, () => { calledNext = true; });
  assert(mockRes.statusCode === 400, 'Rejects request missing "messages" with 400');

  // Test invalid role
  mockRes = {
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) { this.body = data; return this; }
  };
  validateChatPayload({ body: { messages: [{ role: 'admin_bypass', content: 'test' }] } }, mockRes, () => {});
  assert(mockRes.statusCode === 400, 'Rejects invalid role with 400');

  // Test valid messages
  calledNext = false;
  validateChatPayload({ body: { messages: [{ role: 'user', content: 'hello' }] } }, mockRes, () => { calledNext = true; });
  assert(calledNext === true, 'Accepts valid user message array');

  // 4. Astra Service Adapter Tests
  console.log('\n4. Testing Astra Service Adapter:');
  const status = astraService.getStatus();
  assert(status.ok === true, 'Adapter status has ok: true');
  assert(typeof status.apiConfigured === 'boolean', 'Adapter reports apiConfigured boolean');
  assert(!status.hasOwnProperty('apiKey'), 'STRICT: Status NEVER exposes raw "apiKey" field');
  assert(!status.hasOwnProperty('keyMasked'), 'STRICT: Status NEVER exposes "keyMasked" field');
  assert(typeof status.model === 'string', 'Adapter reports model identifier');
  assert(typeof status.baseUrl === 'string', 'Base URL is represented as a string');
  assert(typeof status.endpointConfigured === 'boolean', 'Adapter reports endpointConfigured boolean');
  assert(typeof status.modelConfigured === 'boolean', 'Adapter reports modelConfigured boolean');

  const errText = astraService.formatApiError(401, { message: 'Invalid token' });
  assert(errText.includes('401') && errText.includes('ASTRA_API_KEY'), 'Formats 401 error with helpful guidance');


  // 4b. Intent Router Tests
  console.log('\n4b. Testing multimodal intent routing:');
  const fs = require('fs');
  const vm = require('vm');
  const routerCode = fs.readFileSync(path.join(__dirname, '../public/js/intent-router.js'), 'utf8');
  const routerContext = { window: {} };
  vm.createContext(routerContext);
  vm.runInContext(routerCode, routerContext);
  const intent = routerContext.window.RockstarIntent;
  assert(intent.classify('generate a donkey image', []) === 'image-generate', 'Explicit image generation routes to image tool');
  assert(intent.classify('create a logo for my company', []) === 'image-generate', 'Logo creation routes to image tool');
  assert(intent.classify('can you create images or not possible?', []) === 'text', 'Image capability question stays in text chat');
  assert(intent.classify('what images can you generate?', []) === 'text', 'Image capability question stays in text chat');
  assert(intent.classify('how do I generate an image?', []) === 'text', 'Instructional image question stays in text chat');
  assert(intent.classify('make this image brighter', [{kind:'image',dataUrl:'data:image/png;base64,AA=='}]) === 'image-edit', 'Attached image edit routes to image tool');
  assert(intent.classify('learn me javascript', []) === 'text', 'Normal learning prompt stays in text chat');
  assert(intent.classify('draw a cat', []) === 'image-generate', 'Explicit visual drawing request routes to image tool');

  // 5. Live Server Endpoint Tests
  console.log('\n5. Testing Live Server Routes:');
  const express = require('express');
  const cors = require('cors');
  const apiRoutes = require('../server/routes/api');
  const { errorHandler } = require('../server/middleware/errorHandler');

  const testApp = express();
  testApp.use(securityHeaders);
  testApp.use(cors());
  testApp.use(express.json());
  testApp.use(express.static(path.join(__dirname, '../public')));
  testApp.use('/api', apiRoutes);
  testApp.use(errorHandler);

  const testPort = 3099;
  const server = testApp.listen(testPort);

  function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: testPort,
        path,
        method: options.method || 'GET',
        headers: options.headers || {}
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null, raw: data });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      req.end();
    });
  }

  try {
    // Test GET /api/health
    const healthRes = await makeRequest('/api/health');
    assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
    assert(healthRes.body.ok === true, 'Health body has ok: true');
    assert(typeof healthRes.body.apiConfigured === 'boolean', 'Health body has apiConfigured flag');
    assert(!JSON.stringify(healthRes.body).includes('key'), 'Health response strictly contains zero key strings');

    // Test Security Headers
    assert(healthRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header present');
    assert(healthRes.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY header present');
    assert(Boolean(healthRes.headers['content-security-policy']), 'Content-Security-Policy header present');

    // Test GET /api/test-connection
    const testConnRes = await makeRequest('/api/test-connection');
    assert(testConnRes.status === 200, 'GET /api/test-connection returns 200 OK');
    assert(typeof testConnRes.body.ok === 'boolean', 'Test connection body returns boolean ok status');

    // Test POST /api/test-connection
    const postTestConnRes = await makeRequest('/api/test-connection', { method: 'POST' });
    assert(postTestConnRes.status === 200, 'POST /api/test-connection returns 200 OK');

    // Test GET /api/models
    const modelsRes = await makeRequest('/api/models');
    assert(modelsRes.status === 200, 'GET /api/models returns 200 OK');
    assert(Array.isArray(modelsRes.body.models), 'Models response contains models array');
    assert(typeof modelsRes.body.currentModel === 'string', 'Models response identifies current model');
    assert(!JSON.stringify(modelsRes.body).match(/sk-[A-Za-z0-9_-]{8,}/), 'Models response contains no API-key-like secret');

    // Test POST /api/chat with empty body
    const badChatRes = await makeRequest('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {}
    });
    assert(badChatRes.status === 400, 'POST /api/chat with invalid payload returns 400 Bad Request');

    // Test static file serving: GET /
    const rootRes = await makeRequest('/');
    assert(rootRes.status === 200, 'GET / serves index.html successfully');
    assert(rootRes.raw.includes('Astra AI'), 'Served HTML contains "Astra AI" brand title');

  } catch (err) {
    console.error('Server request failed:', err);
    failed++;
  } finally {
    server.close();
  }

  // Summary
  console.log('\n========================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('  \x1b[32m✔ ALL SYSTEM TESTS PASSED SUCCESSFULLY!\x1b[0m\n');
    process.exit(0);
  }
}

runTests();
