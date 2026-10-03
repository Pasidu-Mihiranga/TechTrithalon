import { useSyncExternalStore } from 'react'

/**
 * Which kind of device is showing the app. The field roles were designed per device (Figma: loader
 * tablet 834 px with phone twins, driver phone 402 px), so shells switch layout on this rather than on
 * one width breakpoint.
 */
export type DeviceClass = 'phone' | 'tablet' | 'desktop'

/** Viewport widths (CSS px) that bound each class; they match the Figma frame families. */
export const DEVICE_BREAKPOINTS = { phoneMax: 767, tabletMax: 1023, touchTabletMax: 1366 } as const

/**
 * Phone below 768 px. Tablet up to 1023 px, or up to 1366 px when the main pointer is touch (an iPad
 * Pro in landscape is a tablet, a 1280 px laptop is not). A browser that reports itself as mobile is a
 * phone or tablet even when zoomed out.
 */
export function classifyDevice(width: number, coarsePointer: boolean, reportsMobile = false): DeviceClass {
  if (width <= DEVICE_BREAKPOINTS.phoneMax) return 'phone'
  if (width <= DEVICE_BREAKPOINTS.tabletMax) return 'tablet'
  if (coarsePointer && width <= DEVICE_BREAKPOINTS.touchTabletMax) return 'tablet'
  if (reportsMobile) return 'tablet'
  return 'desktop'
}

function read(): DeviceClass {
  if (typeof window === 'undefined') return 'desktop'
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const mobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true
  return classifyDevice(window.innerWidth, coarse, mobile)
}

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  window.addEventListener('orientationchange', onChange)
  const pointer = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null
  pointer?.addEventListener?.('change', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    window.removeEventListener('orientationchange', onChange)
    pointer?.removeEventListener?.('change', onChange)
  }
}

/** The current device class; re-renders on resize, rotation or a pointer change. */
export function useDeviceClass(): DeviceClass {
  return useSyncExternalStore(subscribe, read, () => 'desktop')
}
