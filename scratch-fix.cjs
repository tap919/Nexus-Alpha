const fs = require('fs');

let code = fs.readFileSync('src/server/legacyRoutes.ts', 'utf8');

code = code.replace(/c\.c\.req\.query\(\)\('([^']+)'\)/g, "c.req.query('$1')");
code = code.replace(/res\.json\(/g, "return c.json(");
code = code.replace(/req\.params\./g, "c.req.param().");
code = code.replace(/req\.params/g, "c.req.param()");
code = code.replace(/return return /g, "return ");

fs.writeFileSync('src/server/legacyRoutes.ts', code);
console.log('Fixed!');
