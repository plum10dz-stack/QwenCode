export const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })


export function now<NUMBER extends true | false = true>(type?: NUMBER): NUMBER extends true ? number : string {
  let now = Date.now();
  now = Math.floor(now / 1000) * 1000;
  return type === true ? now as any : new Date(now).toISOString() as any;
}

const seq = (key: string, prefix: string, pad = 4) => {
  const n: number = parseInt(localStorage.getItem(key) || '0') + 1
  localStorage.setItem(key, n.toString())
  return `${prefix}-${String(n).padStart(pad, '0')}`
}

export const poSeq = () => seq('poSeq', 'PO')
export const soSeq = () => seq('soSeq', 'SO')
export const skuSeq = (cat = 'PRD') => seq('skuSeq', cat.substring(0, 3).toUpperCase())

export const fmtNum = (n: number) => Number(n || 0).toLocaleString('fr-DZ')
export const fmtDate = (d: string) => d
  ? new Date(d).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

export const today = new Date().toLocaleDateString('en', {
  weekday: 'short', month: 'short', day: 'numeric'
})
export function isServiceWorker() {
  return ('ServiceWorkerGlobalScope' in globalThis) && (self instanceof ServiceWorkerGlobalScope);
}

