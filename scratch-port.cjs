const fs = require('fs');

const code = fs.readFileSync('src/server/index.ts', 'utf8');

// We want to extract everything from `app.get("/health"` (line 156) down to `export default app;` (or similar).
// And convert to Hono.

let out = `import { Hono } from 'hono';\n`;
// Extract all imports from index.ts
const imports = code.match(/^import .* from .*;/gm).join('\n');
out += imports + '\n\n';

out += `export const legacyRoutes = new Hono();\n\n`;

// Find all app.(get|post|put|delete) blocks
const routeRegex = /app\.(get|post|put|delete)\(['"]([^'"]+)['"],\s*(?:async\s*)?\((?:_?req|req),\s*res\)\s*=>\s*\{([\s\S]*?)\n\}\);/g;

let match;
while ((match = routeRegex.exec(code)) !== null) {
  const method = match[1];
  const route = match[2];
  let body = match[3];

  // Replace req/res
  body = body.replace(/req\.body(\s+as\s+.*)?;?/g, (m) => `await c.req.json().catch(() => ({}))${m.includes('as') ? m.substring(m.indexOf('as')) : ''}`);
  body = body.replace(/req\.query\.([a-zA-Z0-9_]+)/g, "c.req.query('$1')");
  body = body.replace(/req\.query/g, "c.req.query()");
  body = body.replace(/req\.params\.([a-zA-Z0-9_]+)/g, "c.req.param('$1')");
  
  // Replace res.json
  body = body.replace(/return\s+res\.status\((\d+)\)\.json\((.*)\);?/g, "return c.json($2, $1);");
  body = body.replace(/res\.status\((\d+)\)\.json\((.*)\);?/g, "return c.json($2, $1);");
  body = body.replace(/return\s+res\.json\((.*)\);?/g, "return c.json($1);");
  body = body.replace(/res\.json\((.*)\);?/g, "return c.json($1);");
  body = body.replace(/res\.send\((.*)\);?/g, "return c.text($1);");

  // Fix await c.req.json() if it's used synchronously
  // Actually, just changing `(req, res)` to `async (c)`
  
  out += `legacyRoutes.${method}('${route}', async (c) => {\n${body}\n});\n\n`;
}

fs.writeFileSync('src/server/legacyRoutes.ts', out);
console.log('Done!');
