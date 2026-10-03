import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Geography } from '../lib/referenceQueries'

export interface DistrictMapProps {
  geography: Geography
  /** Shades each district by this value (its share of the largest). Districts without a value stay neutral. */
  values?: Record<string, number>
  /** Short text on a district's label, e.g. an order count. */
  badges?: Record<string, string>
  /** Hover text per district, one line per entry. */
  details?: Record<string, string[]>
  selected?: string | null
  onSelect?: (district: string | null) => void
  /** Districts whose depot link is drawn bold; the other links are faint. */
  emphasised?: string[]
  /** Focus on one depot: other depots' districts and links fade into context. */
  depot?: string
  /** What the shading means, shown in the legend. */
  legend?: string
  height?: number
  label?: string
}

const BASE_MAP = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'
const STORAGE_KEY = 'waypoint.map.baseLayer'
const SRI_LANKA: L.LatLngBoundsExpression = [[5.8, 79.4], [9.9, 82.0]]

/** Design token value for use in Leaflet's JS styles (they cannot read CSS variables themselves). */
function token(name: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function readBaseLayerPreference() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off' } catch { return true }
}

function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * Interactive district-level map. The competition data has no outlet or depot coordinates, so this
 * draws public district boundaries, two town-level depot points and one line per district from its
 * depot, labelled with the competition's own distance and time. No outlet is ever placed on it.
 */
export function DistrictMap({ geography, values, badges, details, selected, onSelect, emphasised, depot: focusDepot, legend, height = 420, label = 'District map' }: DistrictMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const layers = useRef<L.LayerGroup | null>(null)
  const fitted = useRef<Geography | null>(null)
  const fittedFocus = useRef('')
  const onSelectRef = useRef(onSelect)
  const [baseMap, setBaseMap] = useState(readBaseLayerPreference)
  const [tilesFailed, setTilesFailed] = useState(false)
  const emphasisKey = (emphasised ?? []).join('|')
  const max = useMemo(() => Math.max(0, ...Object.values(values ?? {})), [values])

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  // Create the map once.
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { zoomControl: true, attributionControl: true, minZoom: 6, maxZoom: 13, zoomSnap: 0.25 })
    instance.fitBounds(SRI_LANKA)
    layers.current = L.layerGroup().addTo(instance)
    map.current = instance
    return () => { instance.remove(); map.current = null; tiles.current = null; layers.current = null }
  }, [])

  // Base map tiles are optional: if they cannot load, the districts still draw.
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    tiles.current?.remove()
    tiles.current = null
    if (!baseMap || tilesFailed) return
    let errors = 0
    const layer = L.tileLayer(BASE_MAP, { attribution: TILE_ATTRIBUTION, subdomains: 'abcd', maxZoom: 13, crossOrigin: true })
    layer.on('tileerror', () => { errors += 1; if (errors >= 4) setTilesFailed(true) })
    layer.addTo(instance)
    layer.bringToBack()
    tiles.current = layer
  }, [baseMap, tilesFailed])

  // Draw districts, links and depots whenever the data or the highlighted state changes.
  useEffect(() => {
    const instance = map.current
    const group = layers.current
    if (!instance || !group) return
    group.clearLayers()
    const brand = token('--color-brand-primary', '#FFC20E')
    const border = token('--color-border-default', '#D1D5DB')
    const ink = token('--color-text-primary', '#111827')
    const muted = token('--color-bg-muted', '#E5E7EB')
    const emphasisedSet = new Set(emphasised ?? [])
    const inFocus = (d: Geography['districts'][number]) => d.served && (!focusDepot || d.depot === focusDepot)
    const served = geography.districts.filter(inFocus)

    for (const d of geography.districts) {
      const share = max > 0 ? (values?.[d.district] ?? 0) / max : 0
      const isSelected = selected === d.district
      const focused = inFocus(d)
      const layer = L.geoJSON(d.geometry as unknown as GeoJSON.GeoJsonObject, {
        style: {
          color: isSelected ? ink : focused ? ink : border,
          weight: isSelected ? 3 : focused ? 1.2 : 0.6,
          fillColor: focused ? brand : muted,
          fillOpacity: focused ? (values ? 0.12 + 0.6 * share : 0.28) : 0.5,
        },
      })
      if (focused) {
        const lines = details?.[d.district]
        const tip = el('div', 'district-tip')
        tip.appendChild(el('strong', '', d.district))
        for (const line of lines ?? []) tip.appendChild(el('div', '', line))
        layer.bindTooltip(tip, { sticky: true, direction: 'top' })
        layer.on('click', () => onSelectRef.current?.(selected === d.district ? null : d.district))
        layer.on('mouseover', () => layer.setStyle({ weight: 2.5 }))
        layer.on('mouseout', () => layer.setStyle({ weight: isSelected ? 3 : 1.2 }))
      }
      layer.addTo(group)
    }

    for (const link of geography.links) {
      if (focusDepot && link.depot !== focusDepot) continue
      const depot = geography.depots.find(p => p.name === link.depot)
      const district = geography.districts.find(d => d.district === link.district)
      if (!depot || !district) continue
      const strong = emphasisedSet.has(link.district)
      const line = L.polyline([[depot.lat, depot.lng], [district.labelPoint[1], district.labelPoint[0]]], {
        color: ink, weight: strong ? 4 : 1.5, opacity: strong ? 0.9 : 0.35, dashArray: strong ? undefined : '6 6',
      })
      const tip = el('div', 'district-tip')
      tip.appendChild(el('strong', '', `${link.depot} → ${link.district}`))
      tip.appendChild(el('div', '', `${link.depotToDistrictKm} km · ${link.depotToDistrictMinutes} min (${link.roadClass})`))
      tip.appendChild(el('div', 'district-tip-note', `Straight line; the plan uses ${link.interStopMinutes} min between stops`))
      line.bindTooltip(tip, { sticky: true })
      line.addTo(group)
    }

    for (const d of served) {
      const badge = badges?.[d.district]
      const node = el('div', `district-label${selected === d.district ? ' selected' : ''}`)
      node.appendChild(el('span', 'district-label-name', d.district))
      if (badge) node.appendChild(el('span', 'district-label-badge', badge))
      L.marker([d.labelPoint[1], d.labelPoint[0]], {
        icon: L.divIcon({ html: node, className: 'district-label-wrap', iconSize: [0, 0] }), interactive: false, keyboard: false,
      }).addTo(group)
    }

    for (const depot of geography.depots.filter(p => !focusDepot || p.name === focusDepot)) {
      const pin = el('div', 'depot-pin')
      pin.appendChild(el('span', 'depot-pin-mark', 'D'))
      pin.appendChild(el('span', 'depot-pin-name', depot.name))
      const marker = L.marker([depot.lat, depot.lng], { icon: L.divIcon({ html: pin, className: 'depot-pin-wrap', iconSize: [0, 0] }), keyboard: false })
      const tip = el('div', 'district-tip')
      tip.appendChild(el('strong', '', `${depot.name} depot`))
      tip.appendChild(el('div', 'district-tip-note', depot.basis))
      marker.bindTooltip(tip, { direction: 'top' })
      marker.addTo(group)
    }

    const focusKey = `${focusDepot ?? ''}`
    if (fitted.current !== geography || fittedFocus.current !== focusKey) {
      fitted.current = geography
      fittedFocus.current = focusKey
      fit(instance, geography, focusDepot)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geography, values, badges, details, selected, emphasisKey, max, focusDepot])

  return (
    <div className="district-map" role="region" aria-label={label}>
      <div className="district-map-stage">
      <div ref={container} className="district-map-canvas" style={{ height }} />
      <div className="district-map-controls">
        <button type="button" className="map-btn" onClick={() => map.current && fit(map.current, geography, focusDepot)}>Reset view</button>
        <label className="map-toggle">
          <input type="checkbox" checked={baseMap && !tilesFailed} disabled={tilesFailed}
            onChange={event => {
              setBaseMap(event.target.checked)
              try { window.localStorage.setItem(STORAGE_KEY, event.target.checked ? 'on' : 'off') } catch { /* preference is optional */ }
            }} />
          <span>Base map</span>
        </label>
      </div>
      {legend && values && (
        <div className="district-map-legend" aria-label="Map legend">
          <span className="legend-ramp" aria-hidden="true" />
          <span>{legend}</span>
        </div>
      )}
      </div>
      <p className="district-map-note">
        {tilesFailed ? 'Base map unavailable; showing districts only. ' : ''}
        District-level view. Outlet locations are not in the data, so none are drawn. Depots are town-level points.
      </p>
      <p className="district-map-credit">{geography.attribution}</p>
    </div>
  )
}

function fit(instance: L.Map, geography: Geography, focusDepot?: string) {
  const points: L.LatLngTuple[] = geography.depots.filter(d => !focusDepot || d.name === focusDepot).map(d => [d.lat, d.lng])
  for (const d of geography.districts) if (d.served && (!focusDepot || d.depot === focusDepot)) points.push([d.labelPoint[1], d.labelPoint[0]])
  const size = instance.getSize()
  if (points.length === 0 || size.x === 0) { instance.fitBounds(SRI_LANKA); return }
  instance.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 10 })
}
