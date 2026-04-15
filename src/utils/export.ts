/**
 * utils/export.ts — Export and share utilities.
 * CSV, JSON, Excel (SheetJS npm), HTML, Image, WhatsApp, Email.
 */

// ── Type Definitions ──────────────────────────────────────────────────────────

interface OrderLine {
  product_id: string | number;
  qty: number;
  unit_price: number;
  line_total: number;
}

interface Order {
  customer_id: string | number;
  lines?: OrderLine[];
  so_number?: string;
  po_number?: string;
  delivery_date?: string;
  expected_date?: string;
  subtotal?: number;
  tax_amount?: number;
  total?: number;
}

interface Customer {
  full_name?: string;
}

interface Product {
  name?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function flattenRows(rows: any[]): Record<string, any>[] {
  return rows.map(r => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (Array.isArray(v)) out[k] = JSON.stringify(v);
      else if (v !== null && typeof v === 'object') out[k] = JSON.stringify(v);
      else out[k] = v ?? '';
    }
    return out;
  });
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportCSV(rows: any[], filename: string = 'export.csv'): void {
  if (!rows.length) return;
  const flat = flattenRows(rows);
  const headers = Object.keys(flat[0]);
  const csv = [
    headers.join(','),
    ...flat.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  download(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export function exportJSON(rows: any, filename: string = 'export.json'): void {
  download(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), filename);
}

// ── Excel (SheetJS — npm package) ────────────────────────────────────────────

export async function exportExcel(rows: any[], filename: string = 'export.xlsx', sheetName: string = 'Sheet1'): Promise<void> {
  if (!rows.length) return;
  const flat = flattenRows(rows);
  try {
    // Dynamically import xlsx. 
    // We type as 'any' here to avoid requiring the library at compile time if not installed.
    const XLSX: any = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  } catch (e: any) {
    console.warn('[exportExcel] SheetJS unavailable, falling back to CSV:', e.message);
    exportCSV(rows, filename.replace('.xlsx', '.csv'));
  }
}

// ── HTML ──────────────────────────────────────────────────────────────────────

export function exportHTML(rows: any[], filename: string = 'export.html', title: string = 'Export'): void {
  if (!rows.length) return;
  const flat = flattenRows(rows);
  const headers = Object.keys(flat[0]);
  const thead = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  const tbody = flat.map(r =>
    `<tr>${headers.map(h => `<td>${String(r[h]).replace(/</g, '&lt;')}</td>`).join('')}</tr>`
  ).join('\n');
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

export async function exportImage(elementId: string, filename: string = 'export.png'): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) { console.warn('[exportImage] element not found:', elementId); return; }

  try {
    // Using 'any' for the imported module to avoid TS errors with external CDN dynamic imports
    const html2canvas: any = (await import(<any>'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.esm.min.js')).default;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#0a0b0f' });
    canvas.toBlob((blob: Blob | null) => {
      if (blob) download(blob, filename);
    }, 'image/png');
  } catch (e: any) {
    console.warn('[exportImage]', e.message);
  }
}

// ── Share: WhatsApp ───────────────────────────────────────────────────────────

export function shareWhatsApp(text: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// ── Share: Email ──────────────────────────────────────────────────────────────

export function shareEmail(subject: string, body: string): void {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Order summary text (for WhatsApp / Email) ─────────────────────────────────

export function orderSummaryText(
  order: Order,
  getCustomer?: (id: string | number) => Customer | undefined,
  getProduct?: (id: string | number) => Product | undefined
): string {
  const customer = getCustomer?.(order.customer_id)?.full_name || '—';
  const lines = (order.lines || []).map(l => {
    const p = getProduct?.(l.product_id);
    return `  • ${p?.name || l.product_id}  ×${l.qty}  @${fmtNum(l.unit_price)}  = ${fmtNum(l.line_total)} DZD`;
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
function fmtNum(n: number | string): string {
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
