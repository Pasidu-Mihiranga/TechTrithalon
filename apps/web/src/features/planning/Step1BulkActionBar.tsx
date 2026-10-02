import { Ban, CheckCircle, Clock, Download, X } from 'lucide-react'

export interface Step1BulkActionBarProps {
  selectedCount: number
  onExclude: () => void
  onInclude: () => void
  onMoveToDeferred: () => void
  onExportCsv: () => void
  onClearSelection: () => void
}

export function Step1BulkActionBar({
  selectedCount,
  onExclude,
  onInclude,
  onMoveToDeferred,
  onExportCsv,
  onClearSelection,
}: Step1BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="floating-bulk-bar" role="toolbar" aria-label="Bulk actions for selected orders">
      <div className="bulk-bar-count">
        <span className="bulk-badge-num">{selectedCount}</span>
        <span className="bulk-badge-label">
          {selectedCount === 1 ? 'order selected' : 'orders selected'}
        </span>
      </div>

      <div className="bulk-bar-divider" aria-hidden="true" />

      <button type="button" className="bulk-bar-btn" onClick={onExclude}>
        <Ban size={14} aria-hidden="true" />
        <span>Exclude from plan</span>
      </button>

      <button type="button" className="bulk-bar-btn" onClick={onInclude}>
        <CheckCircle size={14} aria-hidden="true" />
        <span>Include</span>
      </button>

      <button type="button" className="bulk-bar-btn" onClick={onMoveToDeferred}>
        <Clock size={14} aria-hidden="true" />
        <span>Move to Deferred</span>
      </button>

      <button type="button" className="bulk-bar-btn" onClick={onExportCsv}>
        <Download size={14} aria-hidden="true" />
        <span>Export CSV</span>
      </button>

      <button
        type="button"
        className="bulk-bar-btn-close"
        onClick={onClearSelection}
        aria-label="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  )
}
