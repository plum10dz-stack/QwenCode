const fs = require('fs');
const path = require('path');

const apiDir = path.resolve(__dirname);
const oldDir = path.join(apiDir, 'routers');
const newDir = path.join(apiDir, 'routes');

const dirs = [
  'auth',
  'core',
  'inventory',
  'sales',
  'purchases'
];

dirs.forEach(dir => {
  const fullPath = path.join(newDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

const movedFiles = [];

function moveFile(oldPath, newSubpath) {
  const src = path.join(oldDir, oldPath);
  const dest = path.join(newDir, newSubpath);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    movedFiles.push(newSubpath);
    console.log(`Moved: ${oldPath} -> routes/${newSubpath}`);
  }
}

// 1. Auth routes
moveFile('auth.ts', 'auth/auth.routes.ts');
moveFile('session.ts', 'auth/session.routes.ts');

// 2. Core routes
moveFile('data.ts', 'core/data.routes.ts');
moveFile('stream.ts', 'core/stream.routes.ts');
moveFile('patch.ts', 'core/patch.routes.ts');
moveFile('tables/users.ts', 'core/users.routes.ts');
moveFile('tables/assets.ts', 'core/assets.routes.ts');
moveFile('tables/logs.ts', 'core/logs.routes.ts');
moveFile('tables/payments.ts', 'core/payments.routes.ts');

// 3. Inventory routes
moveFile('tables/product.ts', 'inventory/products.routes.ts');
moveFile('tables/products.ts', 'inventory/products-legacy.routes.ts');
moveFile('tables/categories.ts', 'inventory/categories.routes.ts');
moveFile('tables/mouvments.ts', 'inventory/movements.routes.ts');
moveFile('tables/inventory.ts', 'inventory/inventory.routes.ts');

// 4. Sales routes
moveFile('tables/customers.ts', 'sales/customers.routes.ts');
moveFile('tables/endCustomers.ts', 'sales/end-customers.routes.ts');
moveFile('tables/salesOrders.ts', 'sales/sales-orders.routes.ts');
moveFile('tables/salesOrderLines.ts', 'sales/sales-lines.routes.ts');
moveFile('tables/spayments.ts', 'sales/sales-payments.routes.ts');

// 5. Purchases routes
moveFile('tables/suppliers.ts', 'purchases/suppliers.routes.ts');
moveFile('tables/purchaseOrders.ts', 'purchases/purchase-orders.routes.ts');
moveFile('tables/purchaseOrdersLines.ts', 'purchases/purchase-lines.routes.ts');
moveFile('tables/ppayments.ts', 'purchases/purchase-payments.routes.ts');

// Create new routes/index.ts to wire them all together seamlessly
const indexContent = movedFiles.map(f => {
  // convert something like 'auth/auth.routes.ts' to './auth/auth.routes'
  const importPath = './' + f.replace('.ts', '');
  return `import "${importPath}";`;
}).join('\n');

fs.writeFileSync(path.join(newDir, 'index.ts'), indexContent);
console.log(`\nCreated routes/index.ts with ${movedFiles.length} imports.`);

// Update index.ts to point to the new routes folder
const rootIndexPath = path.join(apiDir, 'index.ts');
if (fs.existsSync(rootIndexPath)) {
  let content = fs.readFileSync(rootIndexPath, 'utf8');
  content = content.replace(/import\s+["']\.\/routers["'];?/g, 'import "./routes";');
  fs.writeFileSync(rootIndexPath, content);
  console.log('Fixed root index.ts -> import "./routes"');
}

// Optional: fix 'import "../../def"' in the newly moved files
movedFiles.forEach(f => {
  const filepath = path.join(newDir, f);
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Some were 1 level deep (routers/auth.ts -> ../def)
    // Now they are 2 levels deep (routes/auth/auth.routes.ts -> ../../database/types/schema)
    content = content.replace(/import\s+["']\.\.\/def["'];?/g, 'import "../../database/types/schema";');
    
    // Some were 2 levels deep (routers/tables/product.ts -> ../../def)
    // Now they are 2 levels deep (routes/inventory/products.routes.ts -> ../../database/types/schema)
    content = content.replace(/import\s+["']\.\.\/\.\.\/def["'];?/g, 'import "../../database/types/schema";');

    fs.writeFileSync(filepath, content);
  }
});
console.log('Automatically fixed def/schema imports in all moved route files!');

console.log('\n✅ All Done! You can now safely delete the empty "routers" directory.');
