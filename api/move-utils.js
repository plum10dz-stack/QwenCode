const fs = require('fs');
const path = require('path');

const apiDir = path.resolve(__dirname);
const utilsDir = path.join(apiDir, 'utils');
const middlewareDir = path.join(apiDir, 'middleware');

// 1. Ensure middleware directory exists
if (!fs.existsSync(middlewareDir)) {
  fs.mkdirSync(middlewareDir, { recursive: true });
}

// 2. Define the moves/renames mapping
const filesToMove = [
  // Middlewares
  { from: path.join(utilsDir, 'handleCorsAndPreflight.ts'), to: path.join(middlewareDir, 'cors.middleware.ts') },
  { from: path.join(utilsDir, 'jsonParserBody.ts'), to: path.join(middlewareDir, 'json-body.middleware.ts') },
  { from: path.join(utilsDir, 'jsonDecripter.ts'), to: path.join(middlewareDir, 'decrypt.middleware.ts') },
  { from: path.join(middlewareDir, 'audit.ts'), to: path.join(middlewareDir, 'audit.middleware.ts') },
  
  // Utilities
  { from: path.join(utilsDir, 'Env.ts'), to: path.join(utilsDir, 'env.ts') },
  { from: path.join(utilsDir, 'cookie.ts'), to: path.join(utilsDir, 'cookies.ts') },
  { from: path.join(utilsDir, 'multer.ts'), to: path.join(utilsDir, 'file-upload.ts') }
];

console.log('--- Moving and Renaming Files ---');
filesToMove.forEach(({ from, to }) => {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    console.log(`Moved: ${path.basename(from)} -> ${path.basename(path.dirname(to))}/${path.basename(to)}`);
  }
});

// 3. Define the string replacements for all files
const replacements = [
  { match: /import\s+.*?jsonParserBody.*?['"]\.\/utils\/jsonParserBody['"];?/g, replace: 'import jsonParserBody from "./middleware/json-body.middleware";' },
  { match: /import\s+.*?jsonDecrypter.*?['"]\.\/utils\/jsonDecripter['"];?/g, replace: 'import { jsonDecrypter } from "./middleware/decrypt.middleware";' },
  { match: /import\s+.*?['"]\.\/utils\/Env['"];?/g, replace: 'import "./utils/env";' },
  { match: /import\s+.*?handleCorsAndPreflight.*?['"]\.\/utils\/handleCorsAndPreflight['"];?/g, replace: 'import handleCorsAndPreflight from "./middleware/cors.middleware";' },
  { match: /import\s+.*?auditMiddleware.*?['"]\.\/middleware\/audit['"];?/g, replace: 'import { auditMiddleware } from "./middleware/audit.middleware";' },
  
  // Inside utils/index.ts
  { match: /export \* from ["']\.\/Env["'];?/g, replace: 'export * from "./env";' },
  { match: /export \* from ["']\.\/handleCorsAndPreflight["'];?/g, replace: 'export * from "../middleware/cors.middleware";' },
  { match: /export \* from ["']\.\/jsonDecripter["'];?/g, replace: 'export * from "../middleware/decrypt.middleware";' },
  { match: /export \* from ["']\.\/jsonParserBody["'];?/g, replace: 'export * from "../middleware/json-body.middleware";' },
  { match: /import cookies from ['"]\.\/cookie['"]/g, replace: "import cookies from './cookies'" },

  // General references (in case any exist in other files like def.ts or arbitrary routes)
  { match: /['"]\.\.\/utils\/handleCorsAndPreflight['"]/g, replace: '"../middleware/cors.middleware"' },
  { match: /['"]\.\.\/utils\/jsonParserBody['"]/g, replace: '"../middleware/json-body.middleware"' },
  { match: /['"]\.\.\/utils\/jsonDecripter['"]/g, replace: '"../middleware/decrypt.middleware"' },
  { match: /['"]\.\.\/utils\/Env['"]/g, replace: '"../utils/env"' },
  { match: /['"]\.\.\/utils\/cookie['"]/g, replace: '"../utils/cookies"' },
  { match: /['"]\.\.\/utils\/multer['"]/g, replace: '"../utils/file-upload"' },

  // Also catch exact tsconfig src references just to clean it up
  { match: /"src\/utils\/jsonDecripter\.ts"/g, replace: '"middleware/decrypt.middleware.ts"' },
  { match: /"src\/utils\/jsonParserBody\.ts"/g, replace: '"middleware/json-body.middleware.ts"' },
  { match: /"src\/utils\/handleCorsAndPreflight\.ts"/g, replace: '"middleware/cors.middleware.ts"' },
  { match: /"src\/utils\/Env\.ts"/g, replace: '"utils/env.ts"' },
  { match: /"src\/utils\//g, replace: '"utils/' } // Clean up the remaining src/utils/ -> utils/
];

// Helper to crawl directories and update files
function walkFiles(dir, exts, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') walkFiles(fullPath, exts, callback);
    } else {
      if (exts.includes(path.extname(fullPath)) || f === 'tsconfig.json') {
        callback(fullPath);
      }
    }
  }
}

console.log('\n--- Updating Code Imports ---');
let filesModified = 0;

walkFiles(apiDir, ['.ts', '.json'], (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;

  replacements.forEach(({ match, replace }) => {
    newContent = newContent.replace(match, replace);
  });

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    filesModified++;
    console.log(`Updated imports in: ${path.relative(apiDir, filePath)}`);
  }
});

console.log(`\n✅ Migration complete! Updated ${filesModified} files.`);
