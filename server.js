/**
 * Rockstar AI — Vercel Express entrypoint.
 *
 * Vercel detects Express from this root entrypoint. The actual application
 * remains in server/server.js so the local project structure stays intact.
 */
const express = require('express');
const app = require('./server/server');

// Keep Express explicitly imported in the Vercel entrypoint for framework detection.
void express;

module.exports = app;
