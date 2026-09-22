/**
 * Rockstar AI — Vercel / Node entrypoint
 *
 * Vercel's current Express/Node deployment detection looks for the server
 * entrypoint at the project root. The application itself remains in
 * server/server.js so local `npm start` keeps working exactly as before.
 */
module.exports = require('./server/server');
