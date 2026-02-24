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
// placeholder '--' uses a character blocked by pattern: /\d/, so it is never
// a real value and cleanly signals an unfilled segment to _updateValidity.
// ---------------------------------------------------------------------------
const ipv4 = {
  segments: [
    { value: '0', placeholder: '--', min: 0, max: 255, step: 1, pattern: /\d/ },
    { value: '0', placeholder: '--', min: 0, max: 255, step: 1, pattern: /\d/ },
    { value: '0', placeholder: '--', min: 0, max: 255, step: 1, pattern: /\d/ },
    { value: '0', placeholder: '--', min: 0, max: 255, step: 1, pattern: /\d/ },
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
// placeholder '----' uses '-' which is blocked by pattern, so '0000' is always valid.
// ---------------------------------------------------------------------------
const ipv6 = {
  segments: Array.from({ length: 8 }, () => ({
    value: '0000', placeholder: '----', min: 0, max: 0xFFFF, step: 1, radix: 16, pattern: /[0-9a-fA-F]/,
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
    { value: '00', placeholder: 'hh', min: 0, step: 1, maxLength: 3, pattern: /\d/ },
    { value: '00', placeholder: 'mm', min: 0, max: 59, step: 1, pattern: /\d/ },
    { value: '00', placeholder: 'ss', min: 0, max: 59, step: 1, pattern: /\d/ },
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
// placeholder '--' uses '-' which is blocked by both numeric patterns (/\d/ and
// /[\d.]/), and '--' never appears inside the "rgba(...)" boilerplate, so
// getSegmentRanges always finds the correct positions via indexOf.
// parse uses a relaxed regex so placeholder strings round-trip correctly.
// ---------------------------------------------------------------------------
const rgba = {
  segments: [
    { value: '0',   placeholder: '--', min: 0, max: 255, step: 1,   pattern: /\d/    },
    { value: '0',   placeholder: '--', min: 0, max: 255, step: 1,   pattern: /\d/    },
    { value: '0',   placeholder: '--', min: 0, max: 255, step: 1,   pattern: /\d/    },
    { value: '1',   placeholder: '--', min: 0, max: 1,   step: 0.1, pattern: /[\d.]/ },
  ],
  format (values) {
    return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${values[3]})`
  },
  parse (str) {
    // Relaxed capture groups accept any non-comma/paren characters so that
    // placeholder strings (e.g. 'r', 'g', '--') round-trip through parse/format.
    const m = str.match(/rgba?\(\s*([^,)]+?)\s*,\s*([^,)]+?)\s*,\s*([^,)]+?)(?:\s*,\s*([^)]+?))?\s*\)/)
    if (m) return [m[1], m[2], m[3], m[4] ?? '1']
    return ['0', '0', '0', '1']
  },
}

// ---------------------------------------------------------------------------
// UUID  – 550e8400-e29b-41d4-a716-446655440000
// Segment values are hex strings; no numeric min/max applies.
// placeholder uses 'x' characters (blocked by pattern) so all-zero UUIDs
// like 00000000-0000-0000-0000-000000000000 are never flagged as invalid.
// maxLength is used for auto-advance since there is no numeric max to derive from.
// ---------------------------------------------------------------------------
const uuid = {
  segments: [
    { value: '00000000',     placeholder: 'xxxxxxxx',     maxLength: 8,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',         placeholder: 'xxxx',         maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',         placeholder: 'xxxx',         maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '0000',         placeholder: 'xxxx',         maxLength: 4,  pattern: /[0-9a-fA-F]/ },
    { value: '000000000000', placeholder: 'xxxxxxxxxxxx', maxLength: 12, pattern: /[0-9a-fA-F]/ },
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
// placeholder '--' uses '-' (blocked by pattern) so '00' is always a valid value.
// ---------------------------------------------------------------------------
const mac = {
  segments: Array.from({ length: 6 }, () => ({
    value: '00', placeholder: '--', min: 0, max: 255, step: 1, radix: 16, pattern: /[0-9a-fA-F]/,
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

// ---------------------------------------------------------------------------
// Time (24-hour clock)  – HH:MM:SS
// Like duration but hours are capped at 23.
// ---------------------------------------------------------------------------
const time = {
  segments: [
    { value: '00', placeholder: 'hh', min: 0, max: 23, step: 1, pattern: /\d/ },
    { value: '00', placeholder: 'mm', min: 0, max: 59, step: 1, pattern: /\d/ },
    { value: '00', placeholder: 'ss', min: 0, max: 59, step: 1, pattern: /\d/ },
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
// Date  – YYYY-MM-DD
// placeholder 'yyyy'/'mm'/'dd' uses letters blocked by pattern: /\d/
// and none of those strings appear in the '-' separators.
// ---------------------------------------------------------------------------
const date = {
  segments: [
    { value: new Date().getFullYear(), placeholder: 'yyyy', min: 1, max: 9999, step: 1, maxLength: 4, pattern: /\d/ },
    { value: '01',   placeholder: 'mm',   min: 1, max: 12,   step: 1, pattern: /\d/ },
    { value: '01',   placeholder: 'dd',   min: 1, max: 31,   step: 1, pattern: /\d/ },
  ],
  format (values) {
    return `${String(values[0]).padStart(4, '0')}-${String(values[1]).padStart(2, '0')}-${String(values[2]).padStart(2, '0')}`
  },
  parse (str) {
    const parts = str.split('-')
    while (parts.length < 3) parts.push('01')
    return [parts[0].padStart(4, '0'), parts[1].padStart(2, '0'), parts[2].padStart(2, '0')]
  },
}

// ---------------------------------------------------------------------------
// Credit card number  – 1234 5678 9012 3456
// 4 groups of 4 digits separated by spaces.
// placeholder 'nnnn' uses 'n' which is not a digit and not a space.
// ---------------------------------------------------------------------------
const creditCard = {
  segments: Array.from({ length: 4 }, () => ({
    value: '0000', placeholder: 'nnnn', min: 0, max: 9999, step: 1, maxLength: 4, pattern: /\d/,
  })),
  format (values) {
    return values.map(v => String(v).padStart(4, '0')).join(' ')
  },
  parse (str) {
    const parts = str.split(' ')
    while (parts.length < 4) parts.push('0000')
    return parts.slice(0, 4).map(p => p.padStart(4, '0'))
  },
}

// ---------------------------------------------------------------------------
// Semantic version  – MAJOR.MINOR.PATCH  (e.g. 1.2.3)
// No upper bound on any segment; maxLength: 3 caps typing at 3 digits.
// placeholder 'n' uses a letter blocked by pattern, not '.' separator.
// ---------------------------------------------------------------------------
const semver = {
  segments: [
    { value: '1', placeholder: 'n', min: 0, step: 1, maxLength: 3, pattern: /\d/ },
    { value: '0', placeholder: 'n', min: 0, step: 1, maxLength: 3, pattern: /\d/ },
    { value: '0', placeholder: 'n', min: 0, step: 1, maxLength: 3, pattern: /\d/ },
  ],
  format (values) {
    return values.join('.')
  },
  parse (str) {
    const parts = str.split('.')
    while (parts.length < 3) parts.push('0')
    return parts.slice(0, 3)
  },
}

// ---------------------------------------------------------------------------
// Credit card expiry date  – MM/YY
// placeholder 'mm'/'yy' uses letters not in '/\d/' and not in '/' separator.
// ---------------------------------------------------------------------------
const expiryDate = {
  segments: [
    { value: '01', placeholder: 'mm', min: 1, max: 12, step: 1, pattern: /\d/ },
    { value: '25', placeholder: 'yy', min: 0, max: 99, step: 1, pattern: /\d/ },
  ],
  format (values) {
    return `${String(values[0]).padStart(2, '0')}/${String(values[1]).padStart(2, '0')}`
  },
  parse (str) {
    const parts = str.split('/')
    while (parts.length < 2) parts.push('00')
    return [parts[0].padStart(2, '0'), parts[1].padStart(2, '0')]
  },
}

// ---------------------------------------------------------------------------
// US phone number  – (NXX) NXX-XXXX
// Area code / exchange: placeholder 'nnn' (not a digit, not in '() -').
// Subscriber: placeholder 'xxxx' (not a digit, not in '() -').
// parse uses a relaxed regex so placeholder strings round-trip correctly.
// ---------------------------------------------------------------------------
const phone = {
  segments: [
    { value: '555',  placeholder: 'nnn',  min: 0, max: 999,  step: 1, maxLength: 3, pattern: /\d/ },
    { value: '555',  placeholder: 'nnn',  min: 0, max: 999,  step: 1, maxLength: 3, pattern: /\d/ },
    { value: '5555', placeholder: 'xxxx', min: 0, max: 9999, step: 1, maxLength: 4, pattern: /\d/ },
  ],
  format (values) {
    return `(${values[0]}) ${values[1]}-${values[2]}`
  },
  parse (str) {
    // Relaxed capture groups so placeholder strings (e.g. 'nnn', 'xxxx') round-trip.
    const m = str.match(/\(([^)]*)\)\s*([^-]*)-(.*)/)
    if (m) return [m[1].trim(), m[2].trim(), m[3].trim()]
    return ['nnn', 'nnn', 'xxxx']
  },
}

// ---------------------------------------------------------------------------
// HSLA colour  – hsla(H, S%, L%, A)  where H ∈ [0,360], S/L ∈ [0,100], A ∈ [0,1]
// placeholder '--' never appears in the 'hsla(', '%, ', ')' boilerplate and
// is blocked by both /\d/ and /[\d.]/ patterns.
// parse uses a relaxed regex so placeholder strings round-trip correctly.
// ---------------------------------------------------------------------------
const hsla = {
  segments: [
    { value: '0', placeholder: '--', min: 0,   max: 360, step: 1,   pattern: /\d/    },
    { value: '0', placeholder: '--', min: 0,   max: 100, step: 1,   pattern: /\d/    },
    { value: '0', placeholder: '--', min: 0,   max: 100, step: 1,   pattern: /\d/    },
    { value: '1', placeholder: '--', min: 0,   max: 1,   step: 0.1, pattern: /[\d.]/ },
  ],
  format (values) {
    return `hsla(${values[0]}, ${values[1]}%, ${values[2]}%, ${values[3]})`
  },
  parse (str) {
    // Captures content before '%' separators; accepts placeholder strings like '--'.
    const m = str.match(/hsla?\(\s*([^,]+),\s*([^%]+)%\s*,\s*([^%]+)%\s*(?:,\s*([^)]+))?\)/)
    if (m) return [m[1].trim(), m[2].trim(), m[3].trim(), (m[4]?.trim() ?? '1')]
    return ['0', '0', '0', '1']
  },
}

// ---------------------------------------------------------------------------
// Price  – $NNN.CC  (dollars and cents)
// placeholder '--' uses '-' which is blocked by pattern: /\d/
// ---------------------------------------------------------------------------
const price = {
  segments: [
    // Dollars: no upper bound; cap typing at 5 digits (0–99999)
    { value: '0', placeholder: '--', min: 0, step: 1, maxLength: 5, pattern: /\d/ },
    // Cents: 00–99
    { value: '00', placeholder: '--', min: 0, max: 99, step: 1, pattern: /\d/ },
  ],
  format (values) {
    return `$${values[0]}.${String(values[1]).padStart(2, '0')}`
  },
  parse (str) {
    const without$ = str.replace(/^\$/, '')
    const dot = without$.indexOf('.')
    if (dot === -1) return [without$ || '--', '--']
    return [without$.slice(0, dot) || '--', without$.slice(dot + 1).padStart(2, '0')]
  },
}

// ---------------------------------------------------------------------------
// Math expression  – (x + y) / z
// Demonstrates arbitrary expression layouts; all three operands are integers.
// placeholder '--' uses '-' which is blocked by pattern: /\d/ and does not
// appear in the '(', ' + ', ') / ' boilerplate.
// ---------------------------------------------------------------------------
const mathExpr = {
  segments: [
    { value: '0', placeholder: '--', min: 0, max: 999, step: 1, pattern: /\d/ },
    { value: '0', placeholder: '--', min: 0, max: 999, step: 1, pattern: /\d/ },
    { value: '1', placeholder: '--', min: 0, max: 999, step: 1, pattern: /\d/ },
  ],
  format (values) {
    return `(${values[0]} + ${values[1]}) / ${values[2]}`
  },
  parse (str) {
    const m = str.match(/\(\s*([^+)]+?)\s*\+\s*([^)]+?)\s*\)\s*\/\s*(.+)/)
    if (m) return [m[1].trim(), m[2].trim(), m[3].trim()]
    return ['--', '--', '--']
  },
}

// ---------------------------------------------------------------------------
// Full name  – First Last
// Text segments (type: 'text') have no numeric meaning; up/down arrows are no-ops.
// placeholder '----------' uses '-' which is blocked by pattern: /\p{L}/u
// and does not appear in the space separator.
// maxLength caps each name at 20 characters before auto-advancing to last name.
// ---------------------------------------------------------------------------
const fullName = {
  segments: [
    { value: '', type: 'text', placeholder: '----------', maxLength: 20, pattern: /\p{L}/u },
    { value: '', type: 'text', placeholder: '----------', maxLength: 20, pattern: /\p{L}/u },
  ],
  format (values) {
    return `${values[0]} ${values[1]}`
  },
  parse (str) {
    const idx = str.indexOf(' ')
    if (idx === -1) return [str, '----------']
    return [str.slice(0, idx), str.slice(idx + 1)]
  },
}

// ---------------------------------------------------------------------------
// Calculator  – x op y  (e.g. "3 * 4")
// The operator segment uses options: [] so ↑/↓ cycles through +, -, *, /
// and typing any of those characters selects it.
// placeholder '?' for the operator (not a digit, not in any operand).
// ---------------------------------------------------------------------------
const calc = {
  segments: [
    { value: '1', placeholder: '--', min: 0, max: 999, step: 1, pattern: /\d/ },
    { value: '+', placeholder: '?',  options: ['+', '-', '*', '/'] },
    { value: '1', placeholder: '--', min: 0, max: 999, step: 1, pattern: /\d/ },
  ],
  format (values) {
    return `${values[0]} ${values[1]} ${values[2]}`
  },
  parse (str) {
    // Match either a number (digits) or the placeholder '--'.
    const m = str.match(/^(--|[\d]+)\s+([^\s]+)\s+(--|[\d]+)$/)
    if (m) return [m[1], m[2], m[3]]
    return ['--', '+', '--']
  },
}

// ---------------------------------------------------------------------------
// Currency  – <symbol>NNN.CC  (e.g. "$19.99", "€9.99")
// The currency-symbol segment uses options: [] so ↑/↓ cycles through $, €, £, ¥.
// Typing $ selects $ directly; others are reachable via arrow keys.
// placeholder '?' for the symbol (not a digit, not '.').
// ---------------------------------------------------------------------------
const currency = {
  segments: [
    { value: '$',  placeholder: '?',  options: ['$', '€', '£', '¥'] },
    { value: '0',  placeholder: '--', min: 0, step: 1, maxLength: 5, pattern: /\d/ },
    { value: '00', placeholder: '--', min: 0, max: 99, step: 1,      pattern: /\d/ },
  ],
  format (values) {
    return `${values[0]}${values[1]}.${String(values[2]).padStart(2, '0')}`
  },
  parse (str) {
    // Match optional leading currency symbol + (number or placeholder '--').(number or placeholder '--')
    const m = str.match(/^([^\d\-]+)(--|\d+)\.(--|\d+)$/)
    if (m) return [m[1], m[2], m[3].padStart(2, '0')]
    return ['?', '--', '--']
  },
}

// ---------------------------------------------------------------------------
// Date range – YYYY-MM-DD → YYYY-MM-DD  (start date and end date in one field)
// Six segments: [startYear, startMonth, startDay, endYear, endMonth, endDay].
// The two date halves share the same placeholder strings ('yyyy', 'mm', 'dd');
// getSegmentRanges finds them in left-to-right order via cumulative indexOf so
// both halves are located correctly even when their values are identical.
// ---------------------------------------------------------------------------
const dateRange = {
  segments: [
    // Start date
    { value: String(new Date().getFullYear()), placeholder: 'yyyy', min: 1, max: 9999, step: 1, maxLength: 4, pattern: /\d/ },
    { value: '01', placeholder: 'mm', min: 1, max: 12, step: 1, pattern: /\d/ },
    { value: '01', placeholder: 'dd', min: 1, max: 31, step: 1, pattern: /\d/ },
    // End date
    { value: String(new Date().getFullYear()), placeholder: 'yyyy', min: 1, max: 9999, step: 1, maxLength: 4, pattern: /\d/ },
    { value: '01', placeholder: 'mm', min: 1, max: 12, step: 1, pattern: /\d/ },
    { value: '01', placeholder: 'dd', min: 1, max: 31, step: 1, pattern: /\d/ },
  ],
  format (values) {
    const pad4 = v => String(v).padStart(4, '0')
    const pad2 = v => String(v).padStart(2, '0')
    return `${pad4(values[0])}-${pad2(values[1])}-${pad2(values[2])} \u2192 ${pad4(values[3])}-${pad2(values[4])}-${pad2(values[5])}`
  },
  parse (str) {
    const halves = str.split(' \u2192 ')
    // Parse a single YYYY-MM-DD string (or a partial/placeholder string) into [year, month, day].
    // Non-digit placeholder values (e.g. 'yyyy', 'mm', 'dd') pass through unchanged so that
    // _isPlaceholderState correctly identifies unfilled segments.
    const parseDate = (s) => {
      const parts = (s || '').split('-')
      const y = parts[0] || 'yyyy'
      const m = parts[1] || 'mm'
      const d = parts[2] || 'dd'
      // Only pad strings that look like real numeric values (avoid corrupting placeholder text).
      const padIfNumeric = (v, len) => /^\d+$/.test(v) ? v.padStart(len, '0') : v
      return [padIfNumeric(y, 4), padIfNumeric(m, 2), padIfNumeric(d, 2)]
    }
    // Guard against missing separator: treat the whole string as the start date.
    return [...parseDate(halves[0]), ...parseDate(halves[1] ?? '')]
  },
}

// ---------------------------------------------------------------------------
// Date with picker button  – YYYY-MM-DD 📅
//
// Three editable date segments followed by an action segment whose value is '📅'.
// The library automatically wraps the icon with U+200B zero-width-space guards so:
//   • clicking just to the LEFT of the icon selects the day segment (equal-distance
//     tie-break picks the left side)
//   • clicking at the RIGHT boundary or the right margin of the input routes to the
//     day segment (exclusive-end check in #onClickOrFocus)
// Neither the format() nor parse() functions need to handle \u200B.
//
// Supply an onClick handler when instantiating:
//
//   new SegmentedInput(el, {
//     ...presets.dateWithPicker,
//     segments: presets.dateWithPicker.segments.map((s, i) =>
//       i === 3 ? { ...s, onClick (inst) { /* set today's date */ } } : s
//     ),
//   })
// ---------------------------------------------------------------------------
const dateWithPicker = {
  segments: [
    { value: String(new Date().getFullYear()), placeholder: 'yyyy', min: 1, max: 9999, step: 1, maxLength: 4, pattern: /\d/ },
    { value: '01', placeholder: 'mm', min: 1, max: 12, step: 1, pattern: /\d/ },
    { value: '01', placeholder: 'dd', min: 1, max: 31, step: 1, pattern: /\d/ },
    // Action segment — type: 'action' marks it as non-editable; consumer adds onClick.
    // The library injects \u200B guards around the icon automatically.
    { value: '📅', placeholder: '📅', type: 'action' },
  ],
  format (values) {
    const pad4 = v => String(v).padStart(4, '0')
    const pad2 = v => String(v).padStart(2, '0')
    // Simple space separator between the date and the icon.
    // The library adds \u200B guards around the icon automatically.
    return `${pad4(values[0])}-${pad2(values[1])}-${pad2(values[2])} ${values[3]}`
  },
  parse (str) {
    // The library strips \u200B before calling parse(), so str is e.g. "2024-01-15 📅".
    // Strip the icon suffix, then split on '-'.
    const dateStr = str.replace(/\s*📅\s*$/, '').trim()
    const parts = dateStr.split('-')
    while (parts.length < 3) parts.push('01')
    const padIfNum = (v, len) => /^\d+$/.test(v) ? v.padStart(len, '0') : v
    return [padIfNum(parts[0], 4), padIfNum(parts[1], 2), padIfNum(parts[2], 2), '📅']
  },
}

export const presets = {
  ipv4, ipv6, duration, rgba, uuid, mac,
  time, date, dateRange, dateWithPicker, creditCard, semver, expiryDate, phone, hsla,
  price, mathExpr, fullName, calc, currency,
}