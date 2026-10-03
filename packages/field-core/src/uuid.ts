/**
 * UUIDv7 (RFC 9562): 48-bit Unix milliseconds, version 7, 74 random bits. Time-ordered, so the server's
 * primary-key index stays compact, and unique without coordination, so the phone can make it offline.
 */
export function uuidv7(now: number = Date.now(), random: (bytes: Uint8Array) => Uint8Array = fill): string {
  const bytes = random(new Uint8Array(16))
  let ms = now
  for (let i = 5; i >= 0; i--) { bytes[i] = ms % 256; ms = Math.floor(ms / 256) }
  bytes[6] = 0x70 | (bytes[6] & 0x0f)
  bytes[8] = 0x80 | (bytes[8] & 0x3f)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function fill(bytes: Uint8Array) {
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}
