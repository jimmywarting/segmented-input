/**
 * presets.js
 *
 * Ready-to-use SegmentedInput configurations for common input formats.
 * Each preset can be spread into the SegmentedInput constructor options:
 *
 *   import { presets } from 'segmented-input/presets'
 *   const picker = new SegmentedInput(el, { ...presets.ipv4 })
 *
 * @license MIT
 */

// ---------------------------------------------------------------------------
// IPv4  – e.g. 192.168.0.1
// ---------------------------------------------------------------------------
const ipv4 = {
  segments: [
    { value: '0', min: 0, max: 255, step: 1 },
    { value: '0', min: 0, max: 255, step: 1 },
    { value: '0', min: 0, max: 255, step: 1 },
    { value: '0', min: 0, max: 255, step: 1 },
  ],
  format (values) {
    return values.join('.')
  },
  parse (str) {
    const parts = str.split('.')
    // Ensure exactly 4 parts
    while (parts.length < 4) parts.push('0')
    return parts.slice(0, 4)
  },
}

// ---------------------------------------------------------------------------
// IPv6  – e.g. 2001:0db8:85a3:0000:0000:8a2e:0370:7334
// Segment values are stored as hex strings; radix: 16 for correct ↑/↓ counting.
// ---------------------------------------------------------------------------
const ipv6 = {
  segments: Array.from({ length: 8 }, () => ({
    value: '0000', min: 0, max: 0xFFFF, step: 1, radix: 16, pattern: /[0-9a-fA-F]/,
  })),
  format (values) {
    return values.map(v => v.padStart(4, '0')).join(':')
  },
  parse (str) {
    const parts = str.split(':')
    while (parts.length < 8) parts.push('0000')
    return parts.slice(0, 8).map(p => p.padStart(4, '0'))
  },
}

// ---------------------------------------------------------------------------
// Duration  – HH:MM:SS
// ---------------------------------------------------------------------------
const duration = {
  segments: [
    // Hours: no upper bound in a duration, but cap typing at 3 digits (0–999)
    { value: '00', placeholder: 'hh', min: 0, step: 1, maxLength: 3 },
    { value: '00', placeholder: 'mm', min: 0, max: 59, step: 1 },
    { value: '00', placeholder: 'ss', min: 0, max: 59, step: 1 },
  ],
  format (values) {
    return values.map(v => String(v).padStart(2, '0')).join(':')
  },
  parse (str) {
    const parts = str.split(':')
    while (parts.length < 3) parts.push('00')
    return parts.slice(0, 3).map(p => p.padStart(2, '0'))
  },
}

// ---------------------------------------------------------------------------
// RGBA  – rgba(r, g, b, a)  where r/g/b ∈ [0,255] and a ∈ [0,1]
// ---------------------------------------------------------------------------
const rgba = {
  segments: [
    { value: '0',   min: 0, max: 255, step: 1,   pattern: /\d/     },
    { value: '0',   min: 0, max: 255, step: 1,   pattern: /\d/     },
    { value: '0',   min: 0, max: 255, step: 1,   pattern: /\d/     },
    { value: '1',   min: 0, max: 1,   step: 0.1, pattern: /[\d.]/ },
  ],
  format (values) {
    return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${values[3]})`
  },
  parse (str) {
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/)
    if (m) return [m[1], m[2], m[3], m[4] ?? '1']
    return ['0', '0', '0', '1']
  },
}

// ---------------------------------------------------------------------------
// UUID  – 550e8400-e29b-41d4-a716-446655440000
// Segment values are hex strings; no numeric min/max applies.
// maxLength is used for auto-advance since there is no numeric max to derive from.
// ---------------------------------------------------------------------------
const uuid = {
  segments: [
    { value: '00000000', maxLength: 8,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',     maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',     maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',     maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '000000000000', maxLength: 12, pattern: /[0-9a-fA-F]/ },
  ],
  format (values) {
    return values.join('-')
  },
  parse (str) {
    const parts = str.split('-')
    // UUID has 5 groups
    const defaults = ['00000000', '0000', '0000', '0000', '000000000000']
    return defaults.map((d, i) => (parts[i] ?? d) || d)
  },
}

// ---------------------------------------------------------------------------
// MAC address  – 00:1A:2B:3C:4D:5E
// Segment values are stored as uppercase hex strings (e.g. 'FF').
// radix: 16 makes ↑/↓ arrow keys count in hexadecimal (09 → 0A → 0B … → FF).
// ---------------------------------------------------------------------------
const mac = {
  segments: Array.from({ length: 6 }, () => ({
    value: '00', min: 0, max: 255, step: 1, radix: 16, pattern: /[0-9a-fA-F]/,
  })),
  format (values) {
    return values.map(v => v.padStart(2, '0').toUpperCase()).join(':')
  },
  parse (str) {
    const parts = str.split(':')
    while (parts.length < 6) parts.push('00')
    return parts.slice(0, 6).map(p => p.padStart(2, '0').toUpperCase())
  },
}

export const presets = { ipv4, ipv6, duration, rgba, uuid, mac }
