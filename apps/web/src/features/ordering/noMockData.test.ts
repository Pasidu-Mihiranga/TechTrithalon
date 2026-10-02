import { describe, expect, it } from 'vitest'

// Inspect every production source file, including imports outside the query hooks.
const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const forbiddenImport = /(?:from\s*|import\s*\()(['"])[^'"\n]*(?:fixtures?\/|mocks?\/|\/tests?\/|sample-data)[^'"\n]*\1/g

describe('production data sources', () => {
  it('does not import test fixtures, mock services or sample data', () => {
    const violations = Object.entries(sources)
      .filter(([path]) => !/\.test\.tsx?$/.test(path))
      .flatMap(([path, source]) => [...String(source).matchAll(forbiddenImport)].map((match) => `${path}: ${match[0]}`))
    expect(violations).toEqual([])
  })
  it('recognizes fixture imports and dynamic mock imports', () => {
    expect([...`import data from '../fixtures/orders'; import('../mocks/service')`.matchAll(forbiddenImport)]).toHaveLength(2)
  })
})
