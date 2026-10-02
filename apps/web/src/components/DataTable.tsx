import type { ReactNode } from 'react'

export type SortDirection = 'asc' | 'desc'
export interface SortState { key: string; direction: SortDirection }

export interface Column<Row> {
  key: string
  header: string
  cell: (row: Row) => ReactNode
  align?: 'start' | 'end'
  /** Set to make the header a sort control. Sorting itself is done by the server. */
  sortable?: boolean
}

interface DataTableProps<Row> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  caption: string
  sort?: SortState
  onSortChange?: (next: SortState) => void
  /** When set with onSelectedKeysChange, renders a selection column. */
  selectedKeys?: ReadonlySet<string>
  onSelectedKeysChange?: (next: Set<string>) => void
}

export function DataTable<Row>({
  columns, rows, rowKey, caption, sort, onSortChange, selectedKeys, onSelectedKeysChange,
}: DataTableProps<Row>) {
  const selectable = selectedKeys != null && onSelectedKeysChange != null
  const allKeys = rows.map(rowKey)
  const allSelected = selectable && allKeys.length > 0 && allKeys.every((k) => selectedKeys.has(k))
  const ariaSort = (col: Column<Row>) => (sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined)
  const toggle = (col: Column<Row>) => onSortChange?.({ key: col.key, direction: sort?.key === col.key && sort.direction === 'asc' ? 'desc' : 'asc' })

  function toggleAll() {
    if (!onSelectedKeysChange) return
    if (allSelected) {
      const next = new Set(selectedKeys)
      for (const k of allKeys) next.delete(k)
      onSelectedKeysChange(next)
    } else {
      onSelectedKeysChange(new Set([...selectedKeys!, ...allKeys]))
    }
  }

  function toggleOne(key: string) {
    if (!onSelectedKeysChange || !selectedKeys) return
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectedKeysChange(next)
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className="table-select">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} scope="col" aria-sort={ariaSort(col)} className={col.align === 'end' ? 'align-end' : undefined}>
                {col.sortable ? <button type="button" className="th-sort" onClick={() => toggle(col)}>{col.header}</button> : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            return (
              <tr key={key}>
                {selectable && (
                  <td className="table-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${key}`}
                      checked={selectedKeys.has(key)}
                      onChange={() => toggleOne(key)}
                    />
                  </td>
                )}
                {columns.map((col) => <td key={col.key} className={col.align === 'end' ? 'align-end' : undefined}>{col.cell(row)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
