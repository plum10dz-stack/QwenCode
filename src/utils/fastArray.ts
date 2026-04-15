
export class FastArray<T> extends Array<T> {
    destroy() {

    }
    protected _idKey: keyof T;
    private _heap: Map<string | number, T>;
    byId: any;
    constructor(items?: T[], idKey?: keyof T) {
        super();

        this._idKey = idKey || <keyof T>"id";
        this._heap = new Map();
        this.byId = Object.create(null); // Vue-friendly plain object mirror

        if (items) {
            if (Array.isArray(items)) {
                for (var i = 0; i < items.length; i++) {
                    this.push(items[i]);
                }
            }
            else {
                throw new TypeError("FastArray expects an array as first argument.");
            }
        }
    }

    static get [Symbol.species]() {
        return Array;
    }

    //@ts-ignore
    get heap() {
        return this._heap;
    }

    get idKey() {
        return this._idKey;
    }

    set idKey(value) {
        if (typeof value !== "string" || !value.trim()) {
            throw new TypeError("idKey must be a non-empty string.");
        }

        this._idKey = value;
        this.reindex();
    }

    index(id: any) {
        return this._heap.get(id);
    }

    getById(id: any): T | undefined {
        return this._heap.get(id);
    }

    has(id: any) {
        return this._heap.has(id);
    }

    first() {
        return this.length ? this[0] : undefined;
    }

    last() {
        return this.length ? this[this.length - 1] : undefined;
    }

    toArray() {
        return Array.prototype.slice.call(this);
    }

    toJSON() {
        return this.toArray();
    }

    clone() {
        return new FastArray(this.toArray(), this._idKey);
    }

    clear() {
        if (this.length) {
            super.splice(0, this.length);
        }

        this._heap.clear();
        this._resetById();

        return this;
    }

    removeById(id: string | number) {
        var item = this._heap.get(id);
        if (!item) return false;

        var index = super.indexOf(item);
        if (index === -1) {
            this._heap.delete(id);
            delete this.byId[id];
            return false;
        }

        super.splice(index, 1);
        this._heap.delete(id);
        delete this.byId[id];

        return true;
    }

    replaceById(id: any, patch: any) {
        var item = this._heap.get(id);
        if (!item) return undefined;

        this._validatePatch(patch);

        var oldId = item[this._idKey] as string | number;
        Object.assign(item, patch);

        var newId = item[this._idKey] as string | number;

        if (newId !== oldId) {
            if (newId == null || newId === "") {
                throw new TypeError('Item key "' + String(this._idKey) + '" must be valid.');
            }

            if (this._heap.has(newId) && this._heap.get(newId) !== item) {
                throw new Error('Duplicate key "' + newId + '" is not allowed.');
            }

            this._heap.delete(oldId);
            delete this.byId[oldId];

            this._heap.set(newId, item);
            this.byId[newId] = item;
        } else {
            this.byId[newId] = item;
        }

        return item;
    }
    upserts(items: any) {
        for (const item of items) {
            this.upsert(item);
        }
    }
    async delete<P extends T & { id: string }>(row: P | string) {
        if (typeof row === "string") {
            this.removeById(row);
        } else {
            this.removeById(row.id);
        }
    }

    deletes<P extends T & { id: string }>(rows: P[]) {
        for (const row of rows) {
            this.removeById(row.id)
        }
    }
    upsert(item: T) {
        this._validateItem(item);

        var id = item[this._idKey] as string | number;
        var existing = this._heap.get(id);
        if (existing) {
            if (existing === item) return item;

            if (STRATEGY === "STRICT") {
                throw new Error('Duplicate key "' + id + '" is not allowed.');
            }
            if (STRATEGY === "LAX") {
                return existing;
            }
            if (STRATEGY === "REPLACE") {
                Object.assign(existing, item);
                this.byId[id] = existing;
                return existing;
            }
        }

        super.push(item);
        this._heap.set(id, item);
        this.byId[id] = item;
        return item;
    }

    push(...items: T[]) {
        for (var i = 0; i < arguments.length; i++) {
            this.upsert(arguments[i]);
        }
        return this.length;
    }

    unshift() {
        for (var i = arguments.length - 1; i >= 0; i--) {
            var item = arguments[i];
            this._validateItem(item);

            var id = item[this._idKey];
            var existing = this._heap.get(id);

            if (existing) {
                Object.assign(existing, item);
                this.byId[id] = existing;
            } else {
                super.unshift(item);
                this._heap.set(id, item);
                this.byId[id] = item;
            }
        }

        return this.length;
    }

    pop() {
        if (!this.length) return undefined;

        var item = super.pop();

        if (item && typeof item === "object") {
            var id = item[this._idKey] as string | number;
            this._heap.delete(id);
            delete this.byId[id];
        }

        return item;
    }

    shift() {
        if (!this.length) return undefined;

        var item = super.shift();

        if (item && typeof item === "object") {
            var id = item[this._idKey] as string | number;
            this._heap.delete(id);
            delete this.byId[id];
        }

        return item;
    }

    splice(start: number, deleteCount: number | undefined, ...items: T[]) {
        for (let i = 0; i < items.length; i++) {
            this._validateItem(items[i]);
        }

        var normalizedStart = start < 0
            ? Math.max(this.length + start, 0)
            : Math.min(start, this.length);

        var actualDeleteCount;
        if (deleteCount === undefined) {
            actualDeleteCount = this.length - normalizedStart;
        } else {
            actualDeleteCount = Math.max(0, Math.min(deleteCount, this.length - normalizedStart));
        }

        var removed = super.splice(normalizedStart, actualDeleteCount);

        for (let i = 0; i < removed.length; i++) {
            var removedItem = removed[i];
            if (removedItem && typeof removedItem === "object") {
                var removedId = removedItem[this._idKey] as string | number;
                this._heap.delete(removedId);
                delete this.byId[removedId];
            }
        }

        var insertIndex = normalizedStart;

        for (let i = 0; i < items.length; i++) {
            var item = items[i];
            var id = item[this._idKey] as string | number;
            var existing = this._heap.get(id);

            if (existing) {
                Object.assign(existing, item);
                this.byId[id] = existing;
            } else {
                super.splice(insertIndex, 0, item);
                this._heap.set(id, item);
                this.byId[id] = item;
                insertIndex++;
            }
        }

        return removed;
    }

    sort(compareFn: ((a: T, b: T) => number) | undefined) {
        super.sort(compareFn);
        return this;
    }

    reverse() {
        return super.reverse();
    }

    fill(item: T, start: number | undefined, end: number | undefined) {
        this._validateItem(item);

        var id = item[this._idKey] as string | number;
        var existing = this._heap.get(id);
        var value = existing || item;

        if (existing) {
            Object.assign(existing, item);
            this.byId[id] = existing;
        }

        super.fill(value, start, end);
        this.reindex();

        return this;
    }

    copyWithin(target: number, start: number, end: number | undefined) {
        super.copyWithin(target, start, end);
        this.reindex();
        return this;
    }

    reindex() {
        var newMap = new Map();
        var newById = Object.create(null);

        for (var i = 0; i < this.length; i++) {
            var item = this[i];
            this._validateItem(item);

            var id = item[this._idKey];

            if (newMap.has(id)) {
                var existing = newMap.get(id);
                Object.assign(existing, item);
                super.splice(i, 1);
                i--;
                continue;
            }

            newMap.set(id, item);
            newById[id] = item;
        }

        this._heap = newMap;
        this.byId = newById;

        return this;
    }

    _resetById() {
        this.byId = Object.create(null);
    }

    protected _validateItem(item: T | undefined) {
        if (item === null || typeof item !== "object") {
            throw new TypeError("FastArray items must be objects.");
        }

        if (!(this._idKey in item)) {
            throw new TypeError('Item must contain key "' + String(this._idKey) + '".');
        }

        var id = item[this._idKey];

        if (id === undefined || id === null || id === "") {
            throw new TypeError('Item key "' + String(this._idKey) + '" must be valid.');
        }
        // make the id of item immutable
        Object.defineProperty(item, this._idKey, {
            value: id,
            writable: false,
            enumerable: true,
            configurable: false
        });
    }

    _validatePatch(patch: null) {
        if (patch === null || typeof patch !== "object") {
            throw new TypeError("Patch must be an object.");
        }
    }
}
/**
 * STRICT: throws error on duplicate key
 * LAX: ignores duplicate key
 * REPLACE: replaces duplicate key
 * @type {"STRICT" | "LAX" | "REPLACE"}
 */
let STRATEGY = "STRICT";