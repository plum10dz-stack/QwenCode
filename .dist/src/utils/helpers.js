"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.today = exports.fmtDate = exports.fmtNum = exports.skuSeq = exports.soSeq = exports.poSeq = exports.uuid = void 0;
exports.now = now;
exports.isServiceWorker = isServiceWorker;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});
exports.uuid = uuid;
function now(type) {
    let now = Date.now();
    now = Math.floor(now / 1000) * 1000;
    return type === true ? now : new Date(now).toISOString();
}
const seq = (key, prefix, pad = 4) => {
    const n = parseInt(localStorage.getItem(key) || '0') + 1;
    localStorage.setItem(key, n.toString());
    return `${prefix}-${String(n).padStart(pad, '0')}`;
};
const poSeq = () => seq('poSeq', 'PO');
exports.poSeq = poSeq;
const soSeq = () => seq('soSeq', 'SO');
exports.soSeq = soSeq;
const skuSeq = (cat = 'PRD') => seq('skuSeq', cat.substring(0, 3).toUpperCase());
exports.skuSeq = skuSeq;
const fmtNum = (n) => Number(n || 0).toLocaleString('fr-DZ');
exports.fmtNum = fmtNum;
const fmtDate = (d) => d
    ? new Date(d).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
exports.fmtDate = fmtDate;
exports.today = new Date().toLocaleDateString('en', {
    weekday: 'short', month: 'short', day: 'numeric'
});
function isServiceWorker() {
    return ('ServiceWorkerGlobalScope' in globalThis) && (self instanceof ServiceWorkerGlobalScope);
}
