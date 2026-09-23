/**
 * Masked Logger for Astra Local AI
 * Ensures no API keys or sensitive authorization headers ever leak to stdout, logs, or error responses.
 */

function maskSecret(str) {
  if (!str || typeof str !== 'string') return str;
  // Mask Bearer tokens
  let masked = str.replace(/Bearer\s+([A-Za-z0-9_\-\.]{4})([A-Za-z0-9_\-\.]+)/gi, (match, prefix, rest) => {
    return `Bearer ${prefix}${'*'.repeat(Math.min(rest.length, 16))}`;
  });
  // Mask sk- keys
  masked = masked.replace(/(sk-[A-Za-z0-9_\-\.]{4})([A-Za-z0-9_\-\.]+)/gi, (match, prefix, rest) => {
    return `${prefix}${'*'.repeat(Math.min(rest.length, 16))}`;
  });
  return masked;
}

const logger = {
  info: (...args) => {
    const time = new Date().toLocaleTimeString();
    const cleanArgs = args.map(arg => typeof arg === 'string' ? maskSecret(arg) : arg);
    console.log(`[${time}] [INFO]`, ...cleanArgs);
  },
  warn: (...args) => {
    const time = new Date().toLocaleTimeString();
    const cleanArgs = args.map(arg => typeof arg === 'string' ? maskSecret(arg) : arg);
    console.warn(`[${time}] [WARN]`, ...cleanArgs);
  },
  error: (...args) => {
    const time = new Date().toLocaleTimeString();
    const cleanArgs = args.map(arg => {
      if (arg instanceof Error) {
        return maskSecret(arg.message);
      }
      return typeof arg === 'string' ? maskSecret(arg) : arg;
    });
    console.error(`[${time}] [ERROR]`, ...cleanArgs);
  },
  maskSecret
};

module.exports = logger;
