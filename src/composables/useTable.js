/**
 * useTable — direct access to a Memory Table instance.
 *
 * Uses getMemory() to always resolve the live Memory instance,
 * even after initApi() replaced it post-import.
 *
 * @example
 * const { rows, save, del, find } = useTable('products')
 * await save({ ...product, price: 99 })
 */
import { getMemory } from '@/data/api.js'

export function useTable(tableName) {
  // Resolve lazily — called at component setup time, always after initApi()
  const table = getMemory().table(tableName)
  return {
    /** Reactive array — same reference Memory holds */
    rows:   table.rows,
    save:   (row) => table.save(row),
    del:    (id)  => table.delete(id),
    find:   (id)  => table.find(id),
    newRow: ()    => table.newRow(),
  }
}
