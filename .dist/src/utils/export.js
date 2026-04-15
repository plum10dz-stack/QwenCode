"use strict";
/**
 * utils/export.ts — Export and share utilities.
 * CSV, JSON, Excel (SheetJS npm), HTML, Image, WhatsApp, Email.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCSV = exportCSV;
exports.exportJSON = exportJSON;
exports.exportExcel = exportExcel;
exports.exportHTML = exportHTML;
exports.exportImage = exportImage;
exports.shareWhatsApp = shareWhatsApp;
exports.shareEmail = shareEmail;
exports.orderSummaryText = orderSummaryText;
// ── Internal helpers ──────────────────────────────────────────────────────────
function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
function flattenRows(rows) {
    return rows.map(r => {
        const out = {};
        for (const [k, v] of Object.entries(r)) {
            if (Array.isArray(v))
                out[k] = JSON.stringify(v);
            else if (v !== null && typeof v === 'object')
                out[k] = JSON.stringify(v);
            else
                out[k] = v !== null && v !== void 0 ? v : '';
        }
        return out;
    });
}
// ── CSV ───────────────────────────────────────────────────────────────────────
function exportCSV(rows, filename = 'export.csv') {
    if (!rows.length)
        return;
    const flat = flattenRows(rows);
    const headers = Object.keys(flat[0]);
    const csv = [
        headers.join(','),
        ...flat.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    download(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}
// ── JSON ──────────────────────────────────────────────────────────────────────
function exportJSON(rows, filename = 'export.json') {
    download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), filename);
}
// ── Excel (SheetJS — npm package) ────────────────────────────────────────────
function exportExcel(rows_1) {
    return __awaiter(this, arguments, void 0, function* (rows, filename = 'export.xlsx', sheetName = 'Sheet1') {
        if (!rows.length)
            return;
        const flat = flattenRows(rows);
        try {
            // Dynamically import xlsx. 
            // We type as 'any' here to avoid requiring the library at compile time if not installed.
            const XLSX = yield Promise.resolve().then(() => __importStar(require('xlsx')));
            const ws = XLSX.utils.json_to_sheet(flat);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, filename);
        }
        catch (e) {
            console.warn('[exportExcel] SheetJS unavailable, falling back to CSV:', e.message);
            exportCSV(rows, filename.replace('.xlsx', '.csv'));
        }
    });
}
// ── HTML ──────────────────────────────────────────────────────────────────────
function exportHTML(rows, filename = 'export.html', title = 'Export') {
    if (!rows.length)
        return;
    const flat = flattenRows(rows);
    const headers = Object.keys(flat[0]);
    const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const tbody = flat.map(r => `<tr>${headers.map(h => `<td>${String(r[h]).replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('\n');
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:sans-serif;padding:20px;background:#f9fafb}
  h2{margin-bottom:16px;color:#111}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #d1d5db;padding:8px 12px;text-align:left}
  th{background:#1e293b;color:#fff;font-weight:600}
  tr:nth-child(even){background:#f1f5f9}
</style>
</head><body>
<h2>${title}</h2>
<p style="color:#6b7280;margin-bottom:12px">${flat.length} records · Exported ${new Date().toLocaleString()}</p>
<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
</body></html>`;
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
}
// ── Image (html2canvas) ───────────────────────────────────────────────────────
function exportImage(elementId_1) {
    return __awaiter(this, arguments, void 0, function* (elementId, filename = 'export.png') {
        const el = document.getElementById(elementId);
        if (!el) {
            console.warn('[exportImage] element not found:', elementId);
            return;
        }
        try {
            // Using 'any' for the imported module to avoid TS errors with external CDN dynamic imports
            const html2canvas = (yield Promise.resolve(`${'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.min.js'}`).then(s => __importStar(require(s)))).default;
            const canvas = yield html2canvas(el, { scale: 2, backgroundColor: '#0a0b0f' });
            canvas.toBlob((blob) => {
                if (blob)
                    download(blob, filename);
            }, 'image/png');
        }
        catch (e) {
            console.warn('[exportImage]', e.message);
        }
    });
}
// ── Share: WhatsApp ───────────────────────────────────────────────────────────
function shareWhatsApp(text) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
// ── Share: Email ──────────────────────────────────────────────────────────────
function shareEmail(subject, body) {
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
// ── Order summary text (for WhatsApp / Email) ─────────────────────────────────
function orderSummaryText(order, getCustomer, getProduct) {
    var _a;
    const customer = ((_a = getCustomer === null || getCustomer === void 0 ? void 0 : getCustomer(order.customer_id)) === null || _a === void 0 ? void 0 : _a.full_name) || '—';
    const lines = (order.lines || []).map(l => {
        const p = getProduct === null || getProduct === void 0 ? void 0 : getProduct(l.product_id);
        return `  • ${(p === null || p === void 0 ? void 0 : p.name) || l.product_id}  ×${l.qty}  @${fmtNum(l.unit_price)}  = ${fmtNum(l.line_total)} DZD`;
    }).join('\n');
    const ref = order.so_number || order.po_number || '';
    const date = order.delivery_date || order.expected_date || '';
    return [
        `📦 Order: ${ref}`,
        `👤 Customer: ${customer}`,
        date ? `📅 Date: ${date}` : '',
        '',
        'Lines:',
        lines || '  (no lines)',
        '',
        `Subtotal:  ${fmtNum(order.subtotal || 0)} DZD`,
        `TVA:       ${fmtNum(order.tax_amount || 0)} DZD`,
        `TOTAL:     ${fmtNum(order.total || 0)} DZD`,
    ].filter(l => l !== null).join('\n');
}
/** Inline fmtNum for share text (avoids circular import with helpers.js) */
function fmtNum(n) {
    return Number(n || 0).toLocaleString('fr-DZ');
}
// /**
//  * utils/export.js — Export and share utilities.
//  * CSV, JSON, Excel (SheetJS npm), HTML, Image, WhatsApp, Email.
//  */
// // ── Internal helpers ──────────────────────────────────────────────────────────
// function download(blob, filename) {
//   const a = document.createElement('a')
//   a.href = URL.createObjectURL(blob)
//   a.download = filename
//   a.click()
//   URL.revokeObjectURL(a.href)
// }
// function flattenRows(rows) {
//   return rows.map(r => {
//     const out = {}
//     for (const [k, v] of Object.entries(r)) {
//       if (Array.isArray(v))                         out[k] = JSON.stringify(v)
//       else if (v !== null && typeof v === 'object') out[k] = JSON.stringify(v)
//       else                                          out[k] = v ?? ''
//     }
//     return out
//   })
// }
// // ── CSV ───────────────────────────────────────────────────────────────────────
// export function exportCSV(rows, filename = 'export.csv') {
//   if (!rows.length) return
//   const flat    = flattenRows(rows)
//   const headers = Object.keys(flat[0])
//   const csv     = [
//     headers.join(','),
//     ...flat.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
//   ].join('\n')
//   download(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename)
// }
// // ── JSON ──────────────────────────────────────────────────────────────────────
// export function exportJSON(rows, filename = 'export.json') {
//   download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), filename)
// }
// // ── Excel (SheetJS — npm package) ────────────────────────────────────────────
// export async function exportExcel(rows, filename = 'export.xlsx', sheetName = 'Sheet1') {
//   if (!rows.length) return
//   const flat = flattenRows(rows)
//   try {
//     const XLSX = await import('xlsx')
//     const ws = XLSX.utils.json_to_sheet(flat)
//     const wb = XLSX.utils.book_new()
//     XLSX.utils.book_append_sheet(wb, ws, sheetName)
//     XLSX.writeFile(wb, filename)
//   } catch (e) {
//     console.warn('[exportExcel] SheetJS unavailable, falling back to CSV:', e.message)
//     exportCSV(rows, filename.replace('.xlsx', '.csv'))
//   }
// }
// // ── HTML ──────────────────────────────────────────────────────────────────────
// export function exportHTML(rows, filename = 'export.html', title = 'Export') {
//   if (!rows.length) return
//   const flat    = flattenRows(rows)
//   const headers = Object.keys(flat[0])
//   const thead   = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`
//   const tbody   = flat.map(r =>
//     `<tr>${headers.map(h => `<td>${String(r[h]).replace(/</g,'&lt;')}</td>`).join('')}</tr>`
//   ).join('\n')
//   const html = `<!DOCTYPE html>
// <html lang="en"><head><meta charset="utf-8"><title>${title}</title>
// <style>
//   body{font-family:sans-serif;padding:20px;background:#f9fafb}
//   h2{margin-bottom:16px;color:#111}
//   table{border-collapse:collapse;width:100%;font-size:13px}
//   th,td{border:1px solid #d1d5db;padding:8px 12px;text-align:left}
//   th{background:#1e293b;color:#fff;font-weight:600}
//   tr:nth-child(even){background:#f1f5f9}
// </style>
// </head><body>
// <h2>${title}</h2>
// <p style="color:#6b7280;margin-bottom:12px">${flat.length} records · Exported ${new Date().toLocaleString()}</p>
// <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
// </body></html>`
//   download(new Blob([html], { type: 'text/html;charset=utf-8' }), filename)
// }
// // ── Image (html2canvas) ───────────────────────────────────────────────────────
// export async function exportImage(elementId, filename = 'export.png') {
//   const el = document.getElementById(elementId)
//   if (!el) { console.warn('[exportImage] element not found:', elementId); return }
//   try {
//     const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.min.js')).default
//     const canvas      = await html2canvas(el, { scale: 2, backgroundColor: '#0a0b0f' })
//     canvas.toBlob(blob => download(blob, filename), 'image/png')
//   } catch (e) {
//     console.warn('[exportImage]', e.message)
//   }
// }
// // ── Share: WhatsApp ───────────────────────────────────────────────────────────
// export function shareWhatsApp(text) {
//   window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
// }
// // ── Share: Email ──────────────────────────────────────────────────────────────
// export function shareEmail(subject, body) {
//   window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
// }
// // ── Order summary text (for WhatsApp / Email) ─────────────────────────────────
// export function orderSummaryText(order, getCustomer, getProduct) {
//   const customer = getCustomer?.(order.customer_id)?.full_name || '—'
//   const lines  = (order.lines || []).map(l => {
//     const p = getProduct?.(l.product_id)
//     return `  • ${p?.name || l.product_id}  ×${l.qty}  @${fmtNum(l.unit_price)}  = ${fmtNum(l.line_total)} DZD`
//   }).join('\n')
//   const ref    = order.so_number || order.po_number || ''
//   const date   = order.delivery_date || order.expected_date || ''
//   return [
//     `📦 Order: ${ref}`,
//     `👤 Customer: ${customer}`,
//     date ? `📅 Date: ${date}` : '',
//     '',
//     'Lines:',
//     lines || '  (no lines)',
//     '',
//     `Subtotal:  ${fmtNum(order.subtotal || 0)} DZD`,
//     `TVA:       ${fmtNum(order.tax_amount || 0)} DZD`,
//     `TOTAL:     ${fmtNum(order.total || 0)} DZD`,
//   ].filter(l => l !== null).join('\n')
// }
// /** Inline fmtNum for share text (avoids circular import with helpers.js) */
// function fmtNum(n) {
//   return Number(n || 0).toLocaleString('fr-DZ')
// }
