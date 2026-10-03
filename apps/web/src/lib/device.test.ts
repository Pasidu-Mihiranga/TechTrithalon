import { describe, expect, it } from 'vitest'
import { classifyDevice } from './device'

describe('classifyDevice', () => {
  it('treats Figma phone widths as phones', () => {
    expect(classifyDevice(375, true)).toBe('phone')
    expect(classifyDevice(402, true)).toBe('phone')
    expect(classifyDevice(430, false)).toBe('phone')
  })
  it('treats the loader tablet frame and touch landscape tablets as tablets', () => {
    expect(classifyDevice(834, true)).toBe('tablet')
    expect(classifyDevice(1024, true)).toBe('tablet')
    expect(classifyDevice(900, false)).toBe('tablet')
    expect(classifyDevice(1194, true)).toBe('tablet')
    expect(classifyDevice(1280, false, true)).toBe('tablet')
  })
  it('keeps desktop browsers on the desktop layout', () => {
    expect(classifyDevice(1024, false)).toBe('desktop')
    expect(classifyDevice(1280, false)).toBe('desktop')
    expect(classifyDevice(1440, true)).toBe('desktop')
  })
})
