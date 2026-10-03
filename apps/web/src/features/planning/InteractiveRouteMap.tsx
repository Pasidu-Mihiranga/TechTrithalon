import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Warehouse, RotateCcw, Navigation } from 'lucide-react'
import type { VehicleRouteStop } from './PlanningStep3Allocation'

export interface InteractiveRouteMapProps {
  activeDepot: string
  vehicleId: string
  vehicleType?: string
  accentColor?: string
  stops?: VehicleRouteStop[]
  viewMode?: 'this' | 'all'
  allRoutes?: {
    vehicleId: string
    color: string
    stops: VehicleRouteStop[]
  }[]
  onViewStops?: () => void
}

const DEPOT_COORDS: Record<string, [number, number]> = {
  'peliyagoda': [6.9535, 79.9042],
  'kandy': [7.2906, 80.6337],
}

// District coordinates in Sri Lanka (Western Province / Central)
const DISTRICT_COORDS: Record<string, [number, number]> = {
  'colombo 01': [6.9344, 79.8428],
  'colombo 02': [6.9214, 79.8562],
  'colombo 03': [6.8988, 79.8524],
  'colombo 04': [6.8856, 79.8587],
  'colombo 05': [6.8789, 79.8694],
  'colombo 06': [6.8719, 79.8624],
  'colombo 07': [6.9114, 79.8686],
  'colombo 08': [6.9147, 79.8778],
  'rajagiriya': [6.9082, 79.8972],
  'nugegoda': [6.8689, 79.8989],
  'dehiwala': [6.8522, 79.8667],
  'mount lavinia': [6.8333, 79.8656],
  'mt lavinia': [6.8333, 79.8656],
  'gampaha': [7.0873, 79.9942],
  'kandy': [7.2906, 80.6337],
  'colombo': [6.9271, 79.8612],
}

export function InteractiveRouteMap({
  activeDepot,
  vehicleId,
  vehicleType,
  accentColor = '#FFC20E',
  stops = [],
  viewMode = 'this',
  allRoutes = [],
  onViewStops,
}: InteractiveRouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)
  const [currentViewMode, setCurrentViewMode] = useState<'this' | 'all'>(viewMode)

  const depotKey = activeDepot.toLowerCase().replace(/\s+depot/i, '').trim()
  const depotCenter = DEPOT_COORDS[depotKey] ?? [6.9535, 79.9042]

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    // In non-browser / JSDOM test environments, mock or guard
    if (typeof window === 'undefined' || !(mapContainerRef.current instanceof HTMLElement)) return

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: depotCenter,
          zoom: 12,
          zoomControl: false,
        })

        // Read tile URL and attribution from environment variables (not hardcoded)
        const tileUrl =
          (import.meta.env.VITE_MAP_TILE_URL as string) ||
          'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        const attribution =
          (import.meta.env.VITE_MAP_ATTRIBUTION as string) ||
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

        L.tileLayer(tileUrl, {
          maxZoom: 18,
          attribution,
        }).addTo(map)

        // Add custom zoom control at bottom-right
        L.control.zoom({ position: 'bottomright' }).addTo(map)

        layerGroupRef.current = L.layerGroup().addTo(map)
        mapInstanceRef.current = map
      }
    } catch {
      // Graceful fallback if Leaflet cannot instantiate in headless test runner
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
        layerGroupRef.current = null
      }
    }
  }, [depotCenter[0], depotCenter[1]])

  // Update Markers & Routes on vehicle or stop changes
  useEffect(() => {
    const map = mapInstanceRef.current
    const layerGroup = layerGroupRef.current
    if (!map || !layerGroup) return

    layerGroup.clearLayers()

    // 1. Depot Marker
    const depotIconHtml = `
      <div class="leaflet-depot-marker">
        <div class="depot-marker-inner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E293B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/>
            <path d="M6 18h12"/>
            <path d="M6 14h12"/>
          </svg>
        </div>
        <div class="depot-marker-label">${activeDepot} Depot</div>
      </div>
    `
    const depotIcon = L.divIcon({
      className: 'custom-depot-marker',
      html: depotIconHtml,
      iconSize: [120, 36],
      iconAnchor: [60, 36],
    })

    L.marker(depotCenter, { icon: depotIcon })
      .bindPopup(`<strong>${activeDepot} Depot</strong><br/>Dispatch origin and return hub`)
      .addTo(layerGroup)

    const allPoints: [number, number][] = [depotCenter]

    // 2. Draw Routes & Stops
    if (currentViewMode === 'this') {
      if (stops.length > 0) {
        const routeCoords: [number, number][] = [depotCenter]

        stops.forEach((stop, i) => {
          const districtKey = (stop.district || 'colombo').toLowerCase().trim()
          const baseCoord = DISTRICT_COORDS[districtKey] ?? [
            depotCenter[0] - 0.03 - i * 0.015,
            depotCenter[1] - 0.02 + (i % 2) * 0.02,
          ]

          // Add slight offset for unique outlets within same district
          const stopCoord: [number, number] = [
            baseCoord[0] + (i % 3) * 0.004,
            baseCoord[1] + ((i + 1) % 3) * 0.004,
          ]

          routeCoords.push(stopCoord)
          allPoints.push(stopCoord)

          const stopIconHtml = `
            <div class="leaflet-stop-marker" style="background: ${accentColor};">
              <span class="stop-marker-num">${stop.seq ?? i + 1}</span>
            </div>
          `
          const stopIcon = L.divIcon({
            className: 'custom-stop-marker',
            html: stopIconHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          })

          L.marker(stopCoord, { icon: stopIcon })
            .bindPopup(`
              <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
                <strong style="color: #0f172a;">Stop #${stop.seq ?? i + 1}: ${stop.outletName || stop.outletId}</strong><br/>
                <span style="color: #64748b;">Ref: ${stop.ref} · ${stop.volume}</span><br/>
                <span style="color: #059669; font-weight: 600;">Window: ${stop.window}</span>
              </div>
            `)
            .addTo(layerGroup)
        })

        // Return path to depot
        routeCoords.push(depotCenter)

        L.polyline(routeCoords, {
          color: accentColor,
          weight: 4,
          opacity: 0.85,
          dashArray: undefined,
          lineJoin: 'round',
        }).addTo(layerGroup)
      } else {
        // Standby coverage circle
        L.circle(depotCenter, {
          radius: 4000,
          color: '#FFC20E',
          fillColor: '#FEF08A',
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '6, 6',
        }).addTo(layerGroup)
      }
    } else {
      // "All routes" mode
      allRoutes.forEach((r) => {
        if (!r.stops || r.stops.length === 0) return
        const coords: [number, number][] = [depotCenter]
        r.stops.forEach((st, idx) => {
          const districtKey = (st.district || 'colombo').toLowerCase().trim()
          const baseCoord = DISTRICT_COORDS[districtKey] ?? [
            depotCenter[0] - 0.02 - idx * 0.01,
            depotCenter[1] - 0.01 + idx * 0.01,
          ]
          coords.push(baseCoord)
          allPoints.push(baseCoord)
        })
        coords.push(depotCenter)

        L.polyline(coords, {
          color: r.color,
          weight: r.vehicleId === vehicleId ? 4 : 2,
          opacity: r.vehicleId === vehicleId ? 0.9 : 0.45,
        }).addTo(layerGroup)
      })
    }

    // Fit map bounds
    if (allPoints.length > 1) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [35, 35] })
    } else {
      map.setView(depotCenter, 12)
    }
  }, [vehicleId, stops, currentViewMode, accentColor, activeDepot, allRoutes])

  function handleRecentre() {
    if (!mapInstanceRef.current) return
    mapInstanceRef.current.setView(depotCenter, 12, { animate: true })
  }

  return (
    <div className="route-inspect-card">
      {/* Route Inspector Header Matching Figma 3A */}
      <div className="route-inspect-head">
        <div className="route-inspect-head-left">
          <div className="route-inspect-title">
            <span className="route-veh-accent" style={{ background: accentColor }} />
            <span>{vehicleId} · {activeDepot} Route Inspection</span>
          </div>
          <p className="route-inspect-sub">
            {vehicleType ?? 'Fleet Vehicle'} · {stops.length > 0 ? `${stops.length} delivery stops scheduled` : 'Standby · Ready for routes'}
          </p>
        </div>

        <div className="route-inspect-controls">
          <div className="segmented-control" role="group" aria-label="Route view filter">
            <button
              type="button"
              className={`segmented-btn ${currentViewMode === 'this' ? 'active' : ''}`}
              onClick={() => setCurrentViewMode('this')}
            >
              This route
            </button>
            <button
              type="button"
              className={`segmented-btn ${currentViewMode === 'all' ? 'active' : ''}`}
              onClick={() => setCurrentViewMode('all')}
            >
              All routes
            </button>
          </div>

          <button
            type="button"
            className="toolbar-btn"
            title="Re-centre map view"
            onClick={handleRecentre}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Re-centre</span>
          </button>
        </div>
      </div>

      {/* Interactive Leaflet Map Container */}
      <div className="route-map-canvas-container">
        <div
          ref={mapContainerRef}
          className="leaflet-map-element"
          style={{ width: '100%', height: '100%', minHeight: '440px' }}
        />

        {/* Overlay pill when vehicle has 0 stops */}
        {stops.length === 0 && (
          <div className="map-standby-badge animate-fade-in">
            <Warehouse size={14} className="text-brand" aria-hidden="true" />
            <div>
              <div className="standby-badge-title">{vehicleId} on Standby</div>
              <div className="standby-badge-sub">Ready at {activeDepot} Depot. Routes display here when allocated.</div>
            </div>
          </div>
        )}

        {stops.length > 0 && onViewStops && (
          <button
            type="button"
            className="map-view-stops-floating-btn"
            onClick={onViewStops}
          >
            <Navigation size={13} aria-hidden="true" />
            <span>View Stop Sequence ({stops.length})</span>
          </button>
        )}
      </div>
    </div>
  )
}
