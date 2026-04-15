const fs = require('fs');
const path = require('path');

const apiDir = path.resolve(__dirname);

// 1. Create directories
const dirs = [
  'database/sql',
  'database/types',
  'database/adapters'
];

dirs.forEach(dir => {
  const fullPath = path.join(apiDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// 2. Move files
const moves = [
  ['database-init.sql', 'database/sql/01-schema.sql'],
  ['functions.sql',     'database/sql/02-functions.sql'],
  ['database-seed.sql', 'database/sql/03-seed.sql'],
  ['def.d.ts',          'database/types/schema.d.ts'],
  ['database-fn.ts',    'database/adapters/rpc-wrappers.ts'],
  ['database-help.ts',  'database/adapters/ErpHelper.ts']
];

moves.forEach(([src, dest]) => {
  const srcPath = path.join(apiDir, src);
  const destPath = path.join(apiDir, dest);
  
  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
    console.log(`Moved: ${src}  -->  ${dest}`);
  } else if (fs.existsSync(destPath)) {
    console.log(`Skipped: ${src} is already at ${dest}`);
  } else {
    console.log(`Warning: Could not find ${src}`);
  }
});

console.log('\n✅ Database files successfully reorganized!');
