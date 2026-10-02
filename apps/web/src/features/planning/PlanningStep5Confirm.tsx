import { useState } from 'react'
import {
  ArrowRight,
  Box,
  Check,
  CheckCircle,
  Clock,
  Download,
  Lock,
  Mail,
  MessageSquare,
  Navigation,
  Send,
  Smartphone,
  Truck,
  X,
} from 'lucide-react'

export interface PlanningStep5ConfirmProps {
  activeDepot: string
  planDate: string
}

interface ManifestRow {
  vehicle: string
  driver: string
  stops: number
  volume: string
  departs: string
  bay: string
  accentColor: string
}

const MANIFESTS: ManifestRow[] = [
  { vehicle: 'VEH014', driver: 'Kasun Perera', stops: 6, volume: '34.2 m³', departs: '04:30', bay: 'Bay 1', accentColor: '#FFC20E' },
  { vehicle: 'VEH021', driver: 'Dinesh Silva', stops: 15, volume: '31.8 m³', departs: '04:35', bay: 'Bay 1', accentColor: '#10B981' },
  { vehicle: 'VEH055', driver: 'Chaminda Bandara', stops: 8, volume: '8.5 m³', departs: '04:45', bay: 'Bay 2', accentColor: '#8B5CF6' },
  { vehicle: 'VEH009', driver: 'Nuwan Pradeep', stops: 7, volume: '22.4 m³', departs: '04:40', bay: 'Bay 2', accentColor: '#3B82F6' },
  { vehicle: 'VEH072', driver: 'Sunil Jayasuriya', stops: 6, volume: '9.2 m³', departs: '05:00', bay: 'Bay 3', accentColor: '#F97316' },
  { vehicle: 'VEH033', driver: 'Saman Kumara', stops: 8, volume: '28.5 m³', departs: '05:15', bay: 'Bay 3', accentColor: '#EC4899' },
]

export function PlanningStep5Confirm({ activeDepot, planDate }: PlanningStep5ConfirmProps) {
  const [notifyLoaderApp, setNotifyLoaderApp] = useState(true)
  const [notifyDriverSms, setNotifyDriverSms] = useState(true)
  const [notifySupervisorEmail, setNotifySupervisorEmail] = useState(false)

  // 5A+ Modal State
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [modalEmailChecked, setModalEmailChecked] = useState(false)

  // 5B Plan Sent State
  const [planSent, setPlanSent] = useState(false)
  const [showToast, setShowToast] = useState(true)

  function handleSendPlan() {
    setConfirmModalOpen(false)
    setPlanSent(true)
    setShowToast(true)
  }

  // 5B: Plan Sent View
  if (planSent) {
    return (
      <div className="planning-step5-container animate-fade-in">
        {/* Floating Top Notification Toast */}
        {showToast && (
          <div className="top-floating-toast">
            <div className="toast-left">
              <CheckCircle size={16} className="text-success" />
              <span>Plan sent to {activeDepot || 'Peliyagoda'} loader team</span>
            </div>
            <div className="toast-right">
              <button
                type="button"
                className="toast-undo-btn"
                onClick={() => {
                  setPlanSent(false)
                  setShowToast(false)
                }}
              >
                <span>Undo · 4:52</span>
              </button>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => setShowToast(false)}
                aria-label="Dismiss toast"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="step5-sent-grid">
          {/* Left Card: Sent Status & Timeline */}
          <div className="sent-timeline-card">
            <div className="sent-head-row">
              <div className="sent-big-icon-box">
                <Check size={28} className="text-white" />
              </div>
              <div>
                <h2 className="sent-main-title">Plan sent to loader</h2>
                <p className="sent-main-subtitle">
                  Sent Mon 28 Sep at 18:42 by Dispatcher · Morning shift. The {activeDepot || 'Peliyagoda'} loader team acknowledged at 18:44.
                </p>
              </div>
            </div>

            {/* Timeline milestone nodes */}
            <div className="sent-timeline-body">
              <div className="milestone-row done">
                <div className="milestone-time">18:42</div>
                <div className="milestone-node">
                  <Check size={12} />
                </div>
                <div className="milestone-content">
                  <div className="milestone-title">Plan locked and sent</div>
                  <div className="milestone-sub">15 manifests · 185 orders · 410.5 m³</div>
                </div>
              </div>

              <div className="milestone-row done">
                <div className="milestone-time">18:43</div>
                <div className="milestone-node">
                  <Check size={12} />
                </div>
                <div className="milestone-content">
                  <div className="milestone-title">SMS delivered to 15 drivers</div>
                  <div className="milestone-sub">Route link and first stop for each driver</div>
                </div>
              </div>

              <div className="milestone-row done">
                <div className="milestone-time">18:44</div>
                <div className="milestone-node">
                  <Check size={12} />
                </div>
                <div className="milestone-content">
                  <div className="milestone-title">Loader acknowledged</div>
                  <div className="milestone-sub">Kamal Jayawardena · Bay supervisor, {activeDepot || 'Peliyagoda'}</div>
                </div>
              </div>

              <div className="milestone-row pending">
                <div className="milestone-time">04:00</div>
                <div className="milestone-node empty" />
                <div className="milestone-content">
                  <div className="milestone-title-row">
                    <span className="milestone-title">Loading starts</span>
                    <span className="badge-tomorrow">Tomorrow</span>
                  </div>
                  <div className="milestone-sub">Bays 1–4 · reefers first, as noted</div>
                </div>
              </div>

              <div className="milestone-row pending">
                <div className="milestone-time">04:30</div>
                <div className="milestone-node empty" />
                <div className="milestone-content">
                  <div className="milestone-title-row">
                    <span className="milestone-title">First vehicle departs</span>
                    <span className="badge-tomorrow">Tomorrow</span>
                  </div>
                  <div className="milestone-sub">VEH014 · Kasun Perera · Colombo</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Card: Tomorrow at a Glance */}
          <div className="sent-glance-card">
            <div className="glance-head">
              <span className="glance-title">Tomorrow at a glance</span>
              <span className="badge-locked">
                <Lock size={12} aria-hidden="true" />
                <span>Locked</span>
              </span>
            </div>

            <div className="glance-map-preview">
              <svg viewBox="0 0 400 240" className="glance-map-svg" aria-label="Route map overview">
                <rect width="400" height="240" fill="#F8FAFC" />
                <ellipse cx="200" cy="120" rx="90" ry="50" fill="#E2F0D9" opacity="0.8" />
                <path d="M 200 40 Q 140 100 120 180" fill="none" stroke="#FFC20E" strokeWidth="3.5" />
                <path d="M 200 40 Q 180 120 190 200" fill="none" stroke="#EF4444" strokeWidth="3" />
                <path d="M 200 40 Q 240 100 270 190" fill="none" stroke="#3B82F6" strokeWidth="3" />
                <path d="M 200 40 Q 280 80 320 160" fill="none" stroke="#8B5CF6" strokeWidth="3" />
                <circle cx="200" cy="40" r="7" fill="#1E293B" />
                <circle cx="200" cy="40" r="3" fill="#FFC20E" />
              </svg>
            </div>

            <div className="glance-stats-list">
              <div className="glance-stat-row">
                <span className="glance-stat-lbl"><Truck size={14} /> Vehicles</span>
                <span className="glance-stat-val">15</span>
              </div>
              <div className="glance-stat-row">
                <span className="glance-stat-lbl"><Box size={14} /> Orders</span>
                <span className="glance-stat-val">185</span>
              </div>
              <div className="glance-stat-row">
                <span className="glance-stat-lbl"><Navigation size={14} /> Volume</span>
                <span className="glance-stat-val">410.5 m³</span>
              </div>
              <div className="glance-stat-row">
                <span className="glance-stat-lbl"><Clock size={14} /> Distance</span>
                <span className="glance-stat-val">1,195 km</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 5A: Confirm & Send Overview
  return (
    <div className="planning-step5-container animate-fade-in">
      {/* Ready Banner */}
      <div className="confirm-ready-banner">
        <div className="confirm-banner-left">
          <div className="confirm-icon-box">
            <Send size={24} className="text-warning" />
          </div>
          <div>
            <h2 className="confirm-banner-title">Ready to send tomorrow's plan</h2>
            <p className="confirm-banner-subtitle">
              Check the manifests, choose who gets notified, then send to the {activeDepot || 'Peliyagoda'} loader team.
            </p>
          </div>
        </div>
        <div className="confirm-banner-badge">
          <Clock size={14} aria-hidden="true" />
          <span>Editable until 05:00 tomorrow</span>
        </div>
      </div>

      {/* 5 KPI Tiles */}
      <div className="kpi-grid-5">
        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box orange"><Truck size={15} /></span>
            <span className="kpi-label">Vehicles</span>
          </div>
          <div className="kpi-value">15</div>
          <div className="kpi-sub">incl. 1 standby van</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box amber"><Box size={15} /></span>
            <span className="kpi-label">Orders</span>
          </div>
          <div className="kpi-value">185</div>
          <div className="kpi-sub">1 deferred to Wed</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box green"><Navigation size={15} /></span>
            <span className="kpi-label">Volume</span>
          </div>
          <div className="kpi-value">410.5 m³</div>
          <div className="kpi-sub">of 412.5 m³ confirmed</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box teal"><Clock size={15} /></span>
            <span className="kpi-label">Distance</span>
          </div>
          <div className="kpi-value">1,195 km</div>
          <div className="kpi-sub">100% on-time</div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-tile-header">
            <span className="kpi-icon-box blue"><Send size={15} /></span>
            <span className="kpi-label">First departure</span>
          </div>
          <div className="kpi-value">04:30</div>
          <div className="kpi-sub">VEH014 · Bay 1</div>
        </div>
      </div>

      {/* Main Split: Manifests Table (Left) + Notify Card (Right) */}
      <div className="confirm-main-grid">
        {/* Left Column: Vehicle Manifests */}
        <div className="manifests-card">
          <div className="manifests-head">
            <div className="manifests-title-group">
              <span className="manifests-title">Vehicle manifests</span>
              <span className="manifests-count-badge">15</span>
            </div>
            <button type="button" className="toolbar-btn">
              <Download size={14} aria-hidden="true" />
              <span>Download all (PDF)</span>
            </button>
          </div>

          <div className="manifests-table-container">
            <table className="manifests-table">
              <thead>
                <tr>
                  <th>VEHICLE</th>
                  <th>DRIVER</th>
                  <th>STOPS</th>
                  <th>VOLUME</th>
                  <th>DEPARTS</th>
                  <th>BAY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {MANIFESTS.map((m) => (
                  <tr key={m.vehicle}>
                    <td className="td-veh-id">
                      <span className="veh-accent-bar" style={{ background: m.accentColor }} />
                      <strong>{m.vehicle}</strong>
                    </td>
                    <td>{m.driver}</td>
                    <td>{m.stops}</td>
                    <td>{m.volume}</td>
                    <td className="td-time">{m.departs}</td>
                    <td><span className="bay-badge">{m.bay}</span></td>
                    <td>
                      <span className="status-badge-ready">
                        <Check size={11} aria-hidden="true" />
                        <span>Ready</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Notify Card & Send Action */}
        <div className="confirm-side-col">
          <div className="notify-card">
            <h3 className="notify-title">Notify</h3>

            <div className="notify-rows">
              <div className="notify-row">
                <div className="notify-icon-box"><Smartphone size={16} /></div>
                <div className="notify-info">
                  <div className="notify-name">Loader app – {activeDepot || 'Peliyagoda'}</div>
                  <div className="notify-desc">Manifests + load order per bay</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyLoaderApp}
                  className={`toggle-switch ${notifyLoaderApp ? 'active' : ''}`}
                  onClick={() => setNotifyLoaderApp(!notifyLoaderApp)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              <div className="notify-row">
                <div className="notify-icon-box"><MessageSquare size={16} /></div>
                <div className="notify-info">
                  <div className="notify-name">SMS to drivers</div>
                  <div className="notify-desc">15 drivers · route link & first stop</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifyDriverSms}
                  className={`toggle-switch ${notifyDriverSms ? 'active' : ''}`}
                  onClick={() => setNotifyDriverSms(!notifyDriverSms)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              <div className="notify-row">
                <div className="notify-icon-box"><Mail size={16} /></div>
                <div className="notify-info">
                  <div className="notify-name">Email depot supervisor</div>
                  <div className="notify-desc">PDF summary of the plan</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifySupervisorEmail}
                  className={`toggle-switch ${notifySupervisorEmail ? 'active' : ''}`}
                  onClick={() => setNotifySupervisorEmail(!notifySupervisorEmail)}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            </div>

            <div className="notify-send-action">
              <button
                type="button"
                className="btn-primary-yellow full-width"
                onClick={() => setConfirmModalOpen(true)}
              >
                <Send size={16} aria-hidden="true" />
                <span>Send plan to loaders</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 5A+: Send Confirmation Modal */}
      {confirmModalOpen && (
        <div className="modal-overlay" onClick={() => setConfirmModalOpen(false)}>
          <div className="modal-dialog-card animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head-center">
              <div className="confirm-modal-icon-box">
                <Send size={24} className="text-warning" />
              </div>
              <h3 className="modal-title">Send plan to loader?</h3>
              <p className="modal-subtitle">
                15 vehicle manifests for {planDate || 'Tue 29 Sep 2026'} will go to the {activeDepot || 'Peliyagoda Depot'} loader team. You can still make changes until 05:00.
              </p>
            </div>

            <div className="confirm-checklist-box">
              <div className="checklist-item">
                <CheckCircle size={16} className="text-success" />
                <span>185 orders · 410.5 m³ across 15 vehicles</span>
              </div>
              <div className="checklist-item">
                <CheckCircle size={16} className="text-success" />
                <span>1 order deferred to Wed 30 Sep</span>
              </div>
              <div className="checklist-item">
                <CheckCircle size={16} className="text-success" />
                <span>Loader app + SMS to 15 drivers</span>
              </div>
            </div>

            <label className="confirm-email-checkbox">
              <input
                type="checkbox"
                checked={modalEmailChecked}
                onChange={(e) => setModalEmailChecked(e.target.checked)}
              />
              <span>Also email the depot supervisor</span>
            </label>

            <div className="modal-actions-footer">
              <span className="keyboard-hint">Press ⌘Enter</span>
              <div className="modal-btn-group">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setConfirmModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-confirm"
                  onClick={handleSendPlan}
                >
                  <Send size={15} aria-hidden="true" />
                  <span>Send to loader</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
