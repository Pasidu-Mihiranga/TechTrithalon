import { lazy, Suspense } from 'react'
import type { DistrictMapProps } from './DistrictMap'
import { LoadingState } from './States'

// Leaflet is only needed on dispatcher planning screens, so it loads on demand and stays out of the main bundle.
const Map = lazy(() => import('./DistrictMap').then(module => ({ default: module.DistrictMap })))

export function DistrictMap(props: DistrictMapProps) {
  return (
    <Suspense fallback={<LoadingState rows={3} label="Loading district map" />}>
      <Map {...props} />
    </Suspense>
  )
}
