const logger = require('../utils/logger');

/**
 * Global Error Handler Middleware
 * Intercepts all unhandled errors and ensures secrets and system stack traces are not leaked.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  
  // Log masked error details on server
  const requestId = req.imageRequestId || req.requestId || null;
  logger.error(`[${req.method}] ${req.url} failed with status ${status}${requestId ? ` [${requestId}]` : ''}:`, err?.stack || err?.message || err);

  // Safe client response. Image/provider failures are deliberately made
  // diagnosable without ever returning tokens, stack traces, SQL, or secrets.
  let clientMessage = 'An unexpected server error occurred.';

  if (status < 500) {
    clientMessage = err.message || 'Bad Request';
  } else if (err.code === 'DB_INIT_FAILED') {
    clientMessage = 'Rockstar could not initialize its database connection. Please try again.';
  } else if (err.provider === 'cloudflare' && err.message) {
    clientMessage = err.message;
  } else if (err.expose && err.message) {
    clientMessage = err.message;
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    clientMessage = 'Could not reach a required backend service. Please try again.';
  } else if (err.code === 'ETIMEDOUT') {
    clientMessage = 'A required backend service timed out. Please try again.';
  } else if (String(req.path || '').startsWith('/api/tools/image/')) {
    clientMessage = `Image generation failed inside the Rockstar backend${requestId ? ` (request ${requestId})` : ''}. Please try again.`;
  }

  res.status(status).json({
    error: {
      message: clientMessage,
      status: status,
      ...(requestId ? { requestId } : {})
    }
  });
}

/**
 * 404 handler for API routes
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Endpoint not found: ${req.method} ${req.url}`,
      status: 404
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
