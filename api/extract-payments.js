const fs = require('fs');

const extra = require('../api-extra.json');
const paymentFile = extra.files.find(f => f.path.includes('payments.ts') || f.path.includes('routers/tables/payments.ts') || f.path.includes('routers\\\\tables\\\\payments.ts') || f.path.includes('routers/payments.ts'));

if (paymentFile) {
    fs.writeFileSync('D:\\SOS\\scratch.ts', paymentFile.content);
    console.log('Found it!');
} else {
    // What if it's named something else?
    const allMatching = extra.files.filter(f => f.path.includes('payments.ts'));
    console.log('Found matches:', allMatching.map(f => f.path));
}
