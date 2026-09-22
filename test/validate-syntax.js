/**
 * Astra Local AI - Syntax & Integrity Validator
 * Checks all JavaScript, JSON, and essential files for syntax validity.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');

let errorsCount = 0;
let passedCount = 0;

function checkJsSyntax(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    new vm.Script(code, { filename: path.basename(filePath) });
    console.log(`  \x1b[32m✔\x1b[0m JS syntax valid: ${path.relative(rootDir, filePath)}`);
    passedCount++;
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m JS syntax error in ${path.relative(rootDir, filePath)}:`, err.message);
    errorsCount++;
  }
}

function checkJsonSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    console.log(`  \x1b[32m✔\x1b[0m JSON valid: ${path.relative(rootDir, filePath)}`);
    passedCount++;
  } catch (err) {
    console.error(`  \x1b[31m✖\x1b[0m JSON syntax error in ${path.relative(rootDir, filePath)}:`, err.message);
    errorsCount++;
  }
}

function checkFileExists(filePath) {
  if (fs.existsSync(filePath)) {
    console.log(`  \x1b[32m✔\x1b[0m File exists: ${path.relative(rootDir, filePath)}`);
    passedCount++;
  } else {
    console.error(`  \x1b[31m✖\x1b[0m Missing expected file: ${path.relative(rootDir, filePath)}`);
    errorsCount++;
  }
}

console.log('\n--- Running Astra Local AI Integrity & Syntax Check ---\n');

// Required files
const requiredFiles = [
  'package.json',
  '.env.example',
  '.gitignore',
  'start.bat',
  'server/server.js',
  'server/key-vault.js',
  'server/routes/auth.js',
  'server/services/astra.js',
  'server/astra.js',
  'server/routes/api.js',
  'server/middleware/security.js',
  'server/middleware/errorHandler.js',
  'server/utils/network.js',
  'server/utils/logger.js',
  'public/index.html',
  'public/css/tokens.css',
  'public/css/main.css',
  'public/css/components.css',
  'public/css/markdown.css',
  'public/js/markdown.js',
    'public/js/local-engine.js',
  'public/js/storage.js',
  'public/js/astra-client.js',
  'public/js/ui.js',
  'public/js/composer.js',
  'public/js/settings.js',
  'public/js/app.js',
  'public/js/auth.js',
  'public/js/login-experience.js'
];

requiredFiles.forEach(relPath => checkFileExists(path.join(rootDir, relPath)));

console.log('\n--- Checking JSON Syntax ---\n');
checkJsonSyntax(path.join(rootDir, 'package.json'));

console.log('\n--- Checking JS Syntax ---\n');
const jsFiles = [
  'server/server.js',
  'server/key-vault.js',
  'server/routes/auth.js',
  'server/services/astra.js',
  'server/astra.js',
  'server/routes/api.js',
  'server/middleware/security.js',
  'server/middleware/errorHandler.js',
  'server/utils/network.js',
  'server/utils/logger.js',
  'public/js/markdown.js',
    'public/js/local-engine.js',
  'public/js/storage.js',
  'public/js/astra-client.js',
  'public/js/ui.js',
  'public/js/composer.js',
  'public/js/settings.js',
  'public/js/app.js',
  'public/js/auth.js',
  'public/js/login-experience.js'
];

jsFiles.forEach(relPath => checkJsSyntax(path.join(rootDir, relPath)));

console.log(`\nIntegrity Check Summary: ${passedCount} passed, ${errorsCount} failed.\n`);

if (errorsCount > 0) {
  process.exit(1);
} else {
  console.log('  \x1b[32m✔ All syntax and integrity checks PASSED!\x1b[0m\n');
  process.exit(0);
}
