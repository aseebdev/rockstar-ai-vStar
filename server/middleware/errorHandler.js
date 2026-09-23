const logger = require('../utils/logger');

/**
 * Global Error Handler Middleware
 * Intercepts all unhandled errors and ensures secrets and system stack traces are not leaked.
 */
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  
  // Log masked error details on server
  logger.error(`[${req.method}] ${req.url} failed with status ${status}:`, err.message || err);

  // Safe client response
  let clientMessage = 'An unexpected server error occurred.';

  if (status < 500) {
    clientMessage = err.message || 'Bad Request';
  } else if ((err.expose || err.provider === 'cloudflare') && err.message) {
    clientMessage = err.message;
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    clientMessage = 'Could not connect to the Astra API gateway. Please check your internet connection or base URL.';
  } else if (err.code === 'ETIMEDOUT') {
    clientMessage = 'Astra API request timed out. Please try again.';
  }

  res.status(status).json({
    error: {
      message: clientMessage,
      status: status
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
