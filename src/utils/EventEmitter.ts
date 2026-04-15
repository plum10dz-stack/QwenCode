export declare type EventCallback<T extends any[]> = (...args: T) => void;
export declare type ALL = typeof ALL;
export const ALL = Symbol('ALL');
/**
 * src/flow/sw/EventEmitter
 *
 * Minimal synchronous event emitter for intra-SW communication.
 * ServerDB emits 'updates'; LocalDB subscribes to it.
 * Neither BroadcastChannel nor postMessage is needed for this wiring.
 */
type ORecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export class EventEmitter<args extends any[], event extends string = string> {
  readonly #set: Map<event | ALL, Set<EventCallback<args>>> = new Map();

  on(events: ORecord<event | ALL, EventCallback<args>>): this
  on(event: ALL | event, handler: EventCallback<args>): this
  on(handler: EventCallback<args>): this
  on(event: ALL | event | ORecord<event | ALL, EventCallback<args>> | EventCallback<args>, handler?: EventCallback<args>): this {
    if (typeof event === 'function') {
      return this.on(ALL, event as EventCallback<args>);
    }
    if (typeof event === 'object') {
      for (const [key, value] of Object.entries(event)) {
        this.on(key as event, value as EventCallback<args>);
      }
      return this;
    }
    if (!this.#set.has(event)) this.#set.set(event, new Set())
    this.#set.get(event)!.add(handler!)
    return this;
  }

  /**
   * @param {string}   event
   * @param {Function} handler
   * @returns {this}
   */
  off(event: event | ALL, handler: (...args: args) => void): this {
    this.#set.get(event as event)?.delete(handler)
    return this
  }

  /**
   * Register a handler that fires exactly once then removes itself.
   * @param {string}   event
   * @param {Function} handler
   * @returns {Function} returns a function to remove the handler
   */
  once(event: event | ALL, handler: (...args: args) => void): () => void {
    const w = (...args: args) => { this.off(event, w); return handler(...args) }
    this.on(event as event, w);
    return () => this.off(event, w);
  }

  /**
   * Synchronously invoke all handlers registered for `event`.
   * Errors are caught and logged; they do not stop remaining handlers.
   * @param {string} event
   * @param {...any}  args
   */
  emit(event: event | ALL, ...args: args) {
    const handlers = this.#set.get(event as event)
    if (handlers)
      for (const fn of handlers) {
        try { fn(...args) }
        catch (e) { console.error(`[EventEmitter:${String(event)}]`, e) }
      }
    if (event !== ALL) {
      this.emit(ALL, ...args);
    }
  }
  /**
   * Check if an event has any handlers.
   * @param {string} event
   * @returns {boolean}
   */
  has(event: event | ALL): boolean {
    return this.#set.has(event as event);
  }
  /**
   * Asynchronously invoke all handlers registered for `event`.
   * Errors are caught and logged; they do not stop remaining handlers.
   * @param {string} event
   * @param {...any}  args
   * @returns {Promise<any>}
   */
  async emitAsync(event: ALL | event, ...args: args) {
    const handlers = this.#set.get(event as event);
    const ret = [];
    if (handlers)
      for (const fn of handlers) {
        try { ret.push(await fn(...args)); }
        catch (e) { console.error(`[EventEmitter:${String(event)}]`, e) }
      }
    if (event !== ALL) {
      const resp = await this.emitAsync(ALL, ...args) as any[];
      if (Array.isArray(resp)) ret.push(...resp);
    }
    return ret.length <= 1 ? ret[0] : ret;
  }
  /** Remove all handlers for an event, or all handlers if no event given. */
  removeAllListeners(event?: event | ALL) {
    if (event) this.#set.delete(event as event)
    else this.#set.clear()
  }
  wait(event: event | ALL, timeout?: number): Promise<args | null> {
    return new Promise((resolve) => {
      const timeoutId = typeof timeout === 'number' ? setTimeout(() => {
        handler();
        resolve(null);
      }, timeout) : null;
      const handler = this.once(event, (...args: args) => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        resolve(args);
      });
    });
  }
}
/**
 * @type {Map<string, EventEmitter>}    
 */
const _eventEmitters: Map<string, EventEmitter<any[]>> = new Map();
/**
 * Get an EventEmitter by name.
 * @param {string} name
 * @returns {EventEmitter<any[]>}
 */
export function getEventEmitter(name: string): EventEmitter<any[]> {
  if (!name) throw new Error('EventEmitter name is required');
  if (!_eventEmitters.has(name)) _eventEmitters.set(name, new EventEmitter());
  return _eventEmitters.get(name)!;
}
/**
 * Remove an EventEmitter by name.
 * @param {string} name
 */
export function removeEventEmitter(name: string) {
  if (!name) throw new Error('EventEmitter name is required');
  _eventEmitters.delete(name);
}
/**
 * Check if an EventEmitter exists by name.
 * @param {string} name
 * @returns {boolean}
 */
export function hasEventEmitter(name: string): boolean {
  if (!name) throw new Error('EventEmitter name is required');
  return _eventEmitters.has(name);
}
function buildObject<K extends string, V>(props: K[], value: V): ORecord<K | ALL, V> {
  const o = {} as ORecord<K | ALL, V>;
  for (let i = 0; i < props.length; i++) {
    o[props[i]] = value;
  }
  return o;
}
/**
 * Register a handler for an event.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
export function on(eventGroup: string, event: string | string[], handler: EventCallback<any[]>) {
  event = typeof event === 'string' ? [event] : event;
  const events = buildObject(event, handler);
  getEventEmitter(eventGroup).on(events);

  return () => {
    const x = getEventEmitter(eventGroup);
    for (const event in events) {
      x.off(event, handler);
    }
  }
}
/**
 * Remove a handler for an event.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
export function off(eventGroup: string, event: string, handler: (...args: any[]) => void) {
  getEventEmitter(eventGroup).off(event, handler);
}
/**
 * Register a handler for an event that fires exactly once.
 * @param {string} eventGroup
 * @param {string} event
 * @param {Function} handler
 */
export function once(eventGroup: string, event: string, handler: (...args: any[]) => void) {
  getEventEmitter(eventGroup).once(event, handler);
}
/**
* Emit an event.
* @param {string} eventGroup
* @param {string} event
* @param {...any} args
*/
export function emit(eventGroup: string, event: string, ...args: any[]) {
  getEventEmitter(eventGroup).emit(event, ...args);
}
/**
 * Remove all handlers for an event.
 * @param {string} eventGroup
 * @param {string} event
 */
export function removeAllListeners(eventGroup: string, event: string) {
  getEventEmitter(eventGroup).removeAllListeners(event);
}