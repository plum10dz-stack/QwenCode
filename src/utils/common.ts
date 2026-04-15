export const SCHEMA = [
  { name: 'products', keyPath: 'id', indexes: [{ name: 'sku', keyPath: 'sku', unique: true }] },
  { name: 'categories', keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: true }] },
  { name: 'suppliers', keyPath: 'id' },
  { name: 'customers', keyPath: 'id', indexes: [{ name: 'email', keyPath: 'email' }] },
  { name: 'endCustomers', keyPath: 'id' },
  { name: 'movements', keyPath: 'id', indexes: [{ name: 'product_id', keyPath: 'product_id' }] },
  { name: 'purchaseOrders', keyPath: 'id' },
  { name: 'salesOrders', keyPath: 'id' },
  { name: 'pPayments', keyPath: 'id', indexes: [{ name: 'order_id', keyPath: 'order_id' }] },
  { name: 'sPayments', keyPath: 'id', indexes: [{ name: 'order_id', keyPath: 'order_id' }] },
]
export async function openCache<T>(callback: (cache: Cache) => Promise<T | undefined>): Promise<T | undefined> {
  const cache = await caches.open('sw-kv');
  return await callback(cache);
}
// Save a value
// 1. Added 'void' because setCacheValue doesn't return the Promise from openCache
export async function setCacheValue<R>(cache: Cache, key: string, value: R): Promise<void> {

  // 2. Ensure the key is a Request object so we can modify it
  const request = new Request(key, { method: 'GET' });
  return await cache.put(
    request,
    new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' }
    })
  ).then(v => {
    console.log(v);
  }).catch(r => {
    console.log(r);
  });

}

// Read a value
export async function getCacheValue<R>(cache: Cache, key: string): Promise<R | string | undefined> {

  // 3. Also ensure the match uses GET
  const request = new Request(key, { method: 'GET' });
  const response = await cache.match(request);

  // 4. Added a try/catch around .json() in case the cached data is corrupted
  if (response) {
    let data;
    try {
      data = await response.text();
      return JSON.parse(data) as R;

    } catch {
      return data;
    }
  }
  return undefined;
}

export async function sleep(ms?: number) { if (!ms) return; return new Promise(res => setTimeout(res, ms)); }
// Example usage in SW
self.addEventListener('activate', async () => {
  await openCache(async (cache) => {
    await setCacheValue(cache, '/lastUpdate', Date.now());
    await getCacheValue(cache, '/lastUpdate');
  });
});

export async function saveFile(file: string = '/.env', content: any) {
  try {
    return await openCache(async (cache) => {
      return await setCacheValue(cache, file, content);
    });
  } catch (error) {
    console.error(error);
    return undefined;
  }
}
export async function LoadFile(file: string = '/.env'): Promise<Array<any> | Object | string | number | boolean | undefined> {
  try {
    return await openCache(async (cache) => {
      return await getCacheValue<Array<any> | Object | string | number | boolean>(cache, file);
    });
  } catch (error) {
    console.error(error);
    return undefined;
  }
}
export function tryParseJSON<T>(data?: string): T | string | undefined {
  try {
    if (typeof data !== 'string') return data;
    return JSON.parse(data) as T;
  } catch {
    return data;
  }
}
export async function parseEnvFile(env: Map<string, string>, { file, content }: { file?: string, content?: any } = { file: '/.env' }) {
  content = content ? content : await LoadFile(file);
  if (typeof content === 'string') {
    content = tryParseJSON(content);
  }

  if (content === undefined) return;
  if (Array.isArray(content)) {
    for (const [key, value] of content) {

      env.set(key, value);
    }
  } else if (typeof content === 'object') {
    for (const [key, value] of Object.entries(content)) {
      env.set(key, value as any);
    }
  } else if (typeof content === 'string') {
    const lines = content.split('\n');
    for (const line of lines) {
      const [key, value] = line.split('=');
      env.set(key, value);
    }
  }
}
declare interface task<ARGS extends any[] = any[]> {
  fn(task: this, ...ARGS: ARGS): Promise<any>, args?: any[]
};
export class TaskControlSignal {
  readonly result: any;
  readonly retry?: boolean;
  readonly pause?: boolean;
  readonly error?: any;
  readonly replace?: task; // (or QueueJob, if you used my previous rename)
  constructor(data: Partial<TaskControlSignal>) {
    Object.assign(this, data);
  }
}

export function parseNumber(value: any, positive: boolean = false): number {
  value = Number(value);
  if (isNaN(value) || !isFinite(value)) {
    return 0;
  }
  if (positive && value < 0) {
    return 0;
  }

  return value;
}