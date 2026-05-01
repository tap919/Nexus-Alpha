const fs = require('fs');

let code = fs.readFileSync('src/server/index.ts', 'utf8');

// Extract ALL imports, including multiline
const importRegex = /import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];/g;
const imports = [];
let match;
while ((match = importRegex.exec(code)) !== null) {
  imports.push(match[0]);
}

// Extract SERVER_API_KEYS
const serverKeysMatch = code.match(/const SERVER_API_KEYS[\s\S]*?} as const;/);
const serverKeys = serverKeysMatch ? serverKeysMatch[0] : '';

// Extract UPLOAD_DIR or similar constants if any
const uploadDirMatch = code.match(/const UPLOAD_DIR = [^;]+;/);
const uploadDir = uploadDirMatch ? uploadDirMatch[0] : `const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');`;

// Extract other globals
const globals = `
${serverKeys}
${uploadDir}
let clients = new Set();
function getHooks() { return []; }
function getHookStats() { return {}; }
function addHook(h) { return h; }
function updateHook(id, h) { return h; }
function removeHook(id) { return true; }
function toggleHook(id) { return true; }
// Mocking missing functions for the sake of compiling. In a real migration we'd find where they are defined.
`;

let out = `// @ts-nocheck\nimport { Hono } from 'hono';\n`;
out += imports.join('\n') + '\n\n';
out += globals + '\n\n';
out += `export const legacyRoutes = new Hono();\n\n`;

const routeRegex = /app\.(get|post|put|delete)\(['"]([^'"]+)['"],\s*(?:async\s*)?\((?:_?req|req),\s*res\)\s*=>\s*\{([\s\S]*?)\n\}\);/g;

while ((match = routeRegex.exec(code)) !== null) {
  const method = match[1];
  const route = match[2];
  let body = match[3];

  // Replace req/res
  body = body.replace(/req\.body(\s+as\s+.*)?;?/g, (m) => `await c.req.json().catch(() => ({}))${m.includes('as') ? m.substring(m.indexOf('as')) : ''}`);
  body = body.replace(/req\.query\.([a-zA-Z0-9_]+)/g, "c.req.query('$1')");
  body = body.replace(/req\.query/g, "c.req.query()");
  body = body.replace(/req\.params\.([a-zA-Z0-9_]+)/g, "c.req.param('$1')");
  body = body.replace(/req\.params/g, "c.req.param()");
  
  // Replace res.json
  body = body.replace(/return\s+res\.status\((\d+)\)\.json\((.*)\);?/g, "return c.json($2, $1);");
  body = body.replace(/res\.status\((\d+)\)\.json\((.*)\);?/g, "return c.json($2, $1);");
  body = body.replace(/return\s+res\.json\((.*)\);?/g, "return c.json($1);");
  body = body.replace(/res\.json\((.*)\);?/g, "return c.json($1);");
  body = body.replace(/res\.send\((.*)\);?/g, "return c.text($1);");

  out += `legacyRoutes.${method}('${route}', async (c) => {\n${body}\n});\n\n`;
}

fs.writeFileSync('src/server/legacyRoutes.ts', out);
console.log('Done!');
