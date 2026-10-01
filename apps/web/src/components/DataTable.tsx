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
}

export function DataTable<Row>({ columns, rows, rowKey, caption, sort, onSortChange }: DataTableProps<Row>) {
  const ariaSort = (col: Column<Row>) => (sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined)
  const toggle = (col: Column<Row>) => onSortChange?.({ key: col.key, direction: sort?.key === col.key && sort.direction === 'asc' ? 'desc' : 'asc' })
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" aria-sort={ariaSort(col)} className={col.align === 'end' ? 'align-end' : undefined}>
                {col.sortable ? <button type="button" className="th-sort" onClick={() => toggle(col)}>{col.header}</button> : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => <td key={col.key} className={col.align === 'end' ? 'align-end' : undefined}>{col.cell(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
