# segmented-input

A tiny, dependency-free JavaScript library that turns any `<input>` element into a **segmented picker** that works exactly like `<input type="date">`.

- Click a segment → it is highlighted automatically
- `←` / `→` arrow keys → move between segments
- `↑` / `↓` arrow keys → increment / decrement the active segment
- `Tab` / `Shift+Tab` → cycle through segments (or leave the field)
- Works for **any** custom format: IPv4, IPv6, RGBA, duration, UUID, MAC address, …

---

## Installation

```html
<!-- ES module – no build step required -->
<script type="module">
  import { SegmentedInput, presets } from './index.js'
</script>
```

Or copy `src/segmented-input.js` and `src/presets.js` into your project.

---

## Quick start

```html
<input id="color" value="rgba(125, 125, 125, 0.5)" />

<script type="module">
  import { SegmentedInput, presets } from './index.js'

  // Attach the RGBA preset – first click focuses the "r" segment
  new SegmentedInput(document.getElementById('color'), presets.rgba)
</script>
```

---

## Built-in presets

| Key        | Example value                          |
|------------|----------------------------------------|
| `ipv4`     | `192.168.1.1`                          |
| `ipv6`     | `2001:0db8:85a3:0000:0000:8a2e:0370:7334` |
| `duration` | `01:30:00`                             |
| `rgba`     | `rgba(125, 125, 125, 0.5)`             |
| `uuid`     | `550e8400-e29b-41d4-a716-446655440000` |
| `mac`      | `00:1A:2B:3C:4D:5E`                    |

```js
import { SegmentedInput, presets } from 'segmented-input'

new SegmentedInput(el, presets.ipv4)
new SegmentedInput(el, presets.rgba)
new SegmentedInput(el, presets.duration)
// …
```

---

## Custom format

Supply a `format` function (array → string) and a `parse` function (string → array), plus one `segments` entry per segment:

```js
new SegmentedInput(el, {
  // Segment metadata: default value, min/max clamping, and step size
  segments: [
    { value: '125', min: 0, max: 255, step: 1   },   // r
    { value: '125', min: 0, max: 255, step: 1   },   // g
    { value: '125', min: 0, max: 255, step: 1   },   // b
    { value: '0.5', min: 0, max: 1,   step: 0.1 },   // a
  ],
  format: (v) => `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${v[3]})`,
  parse:  (s) => {
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    return m ? [m[1], m[2], m[3], m[4] ?? '1'] : ['0', '0', '0', '1']
  },
})
```

---

## API

### `new SegmentedInput(input, options)`

| Option | Type | Description |
|--------|------|-------------|
| `segments` | `Array` | One entry per segment. Each entry may have `value` (default), `min`, `max`, `step`. |
| `format` | `(values: string[]) => string` | Build the display string from an array of segment values. |
| `parse` | `(str: string) => string[]` | Split the display string into segment values. Must always return the same number of elements as `segments`. |

#### Instance methods

| Method | Description |
|--------|-------------|
| `focusSegment(index)` | Highlight the segment at `index` (clamped). |
| `getSegmentValue(index)` | Return the current string value of segment `index`. |
| `setSegmentValue(index, value)` | Overwrite a segment value and reformat. Fires `input` + `change` events. |
| `increment()` | Increment the active segment. |
| `decrement()` | Decrement the active segment. |
| `getSegmentRanges()` | Return `{start, end, value}[]` for all segments in the current value. |
| `destroy()` | Remove event listeners. |

---

### Low-level helpers (also exported)

```js
import { getSegmentRanges, getCursorSegment, highlightSegment } from 'segmented-input'
```

| Function | Description |
|----------|-------------|
| `getSegmentRanges(value, parse, format)` | Compute `{start, end, value}[]` for each segment. |
| `getCursorSegment(cursorPos, segmentRanges)` | Return the index of the segment the cursor position falls in. |
| `highlightSegment(input, index, segmentRanges)` | Call `setSelectionRange` to highlight a segment. |

---

## Demo

Open `demo.html` in a browser (serve via any static file server, e.g. `npx serve .`).

---

## License

MIT