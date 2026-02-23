/**
 * segmented-input.js
 *
 * A library for creating segmented text inputs that behave like <input type="date">.
 * Factored out from the cursor-selection logic in html-duration-picker.js by nadchif,
 * generalized to support any custom format: IPv4, IPv6, RGBA, duration, UUID, MAC, etc.
 *
 * @license MIT
 */

/**
 * Compute the start/end character positions of each segment within the formatted string.
 *
 * Segments are located by searching for each segment's value in the formatted string
 * in order, advancing the search position after each find. This correctly handles
 * any format function that may transform or pad individual values (e.g. padStart),
 * as long as segments appear in their natural left-to-right order in the output.
 *
 * @param {string} value - the full formatted string currently in the input
 * @param {function(string): string[]} parse - splits the formatted string into segment values
 * @param {function(string[]): string} format - joins segment values back into a formatted string
 * @returns {Array<{start: number, end: number, value: string}>}
 */
export function getSegmentRanges (value, parse, format) {
  const segmentValues = parse(value)
  // Use the normalised/formatted string so that positions are consistent
  // with whatever value the SegmentedInput class writes back to input.value.
  const formatted = format(segmentValues)
  const ranges = []
  let searchFrom = 0

  for (let i = 0; i < segmentValues.length; i++) {
    const segVal = String(segmentValues[i])
    const start = formatted.indexOf(segVal, searchFrom)
    if (start === -1) {
      // Fallback: append a zero-width range at the current search position
      ranges.push({ start: searchFrom, end: searchFrom, value: segVal })
    } else {
      const end = start + segVal.length
      ranges.push({ start, end, value: segVal })
      searchFrom = end
    }
  }

  return ranges
}

/**
 * Determine which segment index a cursor position falls within.
 * When the cursor is between segments (e.g. on a separator) the nearest segment
 * is returned.  Clamped to [0, segmentRanges.length - 1].
 *
 * @param {number} cursorPos
 * @param {Array<{start: number, end: number}>} segmentRanges
 * @returns {number} segment index
 */
export function getCursorSegment (cursorPos, segmentRanges) {
  if (!segmentRanges.length) return 0

  // Exact hit – cursor is inside the segment
  for (let i = 0; i < segmentRanges.length; i++) {
    if (cursorPos >= segmentRanges[i].start && cursorPos <= segmentRanges[i].end) {
      return i
    }
  }

  // Cursor is before the first segment
  if (cursorPos < segmentRanges[0].start) return 0

  // Cursor is after the last segment
  if (cursorPos > segmentRanges[segmentRanges.length - 1].end) {
    return segmentRanges.length - 1
  }

  // Cursor is on a separator between two segments – pick the nearest one
  for (let i = 0; i < segmentRanges.length - 1; i++) {
    if (cursorPos > segmentRanges[i].end && cursorPos < segmentRanges[i + 1].start) {
      const distLeft = cursorPos - segmentRanges[i].end
      const distRight = segmentRanges[i + 1].start - cursorPos
      return distLeft <= distRight ? i : i + 1
    }
  }

  return 0
}

/**
 * Highlight (select) a segment inside an input element.
 *
 * @param {HTMLInputElement} input
 * @param {number} segmentIndex
 * @param {Array<{start: number, end: number}>} segmentRanges
 */
export function highlightSegment (input, segmentIndex, segmentRanges) {
  const seg = segmentRanges[segmentIndex]
  if (seg) {
    input.setSelectionRange(seg.start, seg.end)
  }
}

/**
 * A `SegmentedInput` instance attaches to an `<input>` element and turns it into
 * a segmented picker that works like `<input type="date">`.
 *
 * @example
 * // RGBA colour picker
 * const picker = new SegmentedInput(document.querySelector('#color'), {
 *   segments: [
 *     { value: '125', min: 0, max: 255, step: 1 },
 *     { value: '125', min: 0, max: 255, step: 1 },
 *     { value: '125', min: 0, max: 255, step: 1 },
 *     { value: '0.5', min: 0, max: 1,   step: 0.1 },
 *   ],
 *   format: (v) => `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${v[3]})`,
 *   parse:  (s) => {
 *     const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
 *     return m ? [m[1], m[2], m[3], m[4] ?? '1'] : ['0', '0', '0', '1']
 *   },
 * })
 */
export class SegmentedInput {
  /**
   * @param {HTMLInputElement} input - the input element to enhance
   * @param {Object} options
   * @param {Array<{value?: string, min?: number, max?: number, step?: number, radix?: number, pattern?: RegExp}>} options.segments
   *   Segment metadata.  `value` is the default; `min`/`max` clamp up/down arrow changes;
   *   `step` controls how much each arrow press changes the value (default 1);
   *   `radix` sets the numeric base for increment/decrement (default 10, use 16 for hex segments);
   *   `pattern` is an optional RegExp tested against each typed character – non-matching keys are blocked.
   * @param {function(string[]): string} options.format
   *   Converts an array of segment value strings into the full display string.
   * @param {function(string): string[]} options.parse
   *   Splits the full display string back into an array of segment value strings.
   *   Must always return the same number of elements as `options.segments`.
   */
  constructor (input, options) {
    if (!input || input.tagName !== 'INPUT') {
      throw new TypeError('SegmentedInput: first argument must be an <input> element')
    }
    if (typeof options.format !== 'function' || typeof options.parse !== 'function') {
      throw new TypeError('SegmentedInput: options.format and options.parse must be functions')
    }

    this.input = input
    this.segments = options.segments || []
    this._format = options.format
    this._parse = options.parse
    this._activeSegment = 0

    // Set initial value if the input is empty
    if (!input.value) {
      input.value = this._format(this.segments.map(s => String(s.value ?? s.min ?? 0)))
    }

    this._onClick = this._onClickOrFocus.bind(this)
    this._onFocus = this._onFocusIn.bind(this)
    this._onKeyDown = this._onKeydown.bind(this)

    input.addEventListener('click', this._onClick)
    input.addEventListener('focus', this._onFocus)
    input.addEventListener('keydown', this._onKeyDown)
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Compute and return the character ranges for every segment based on the
   * current input value.
   * @returns {Array<{start: number, end: number, value: string}>}
   */
  getSegmentRanges () {
    return getSegmentRanges(this.input.value, this._parse, this._format)
  }

  /**
   * Move focus (text selection) to a specific segment.
   * The index is clamped to the valid range so callers don't have to guard it.
   * @param {number} index
   */
  focusSegment (index) {
    const clamped = Math.max(0, Math.min(index, this.segments.length - 1))
    this._activeSegment = clamped
    highlightSegment(this.input, clamped, this.getSegmentRanges())
  }

  /**
   * Return the current string value of a specific segment.
   * @param {number} index
   * @returns {string}
   */
  getSegmentValue (index) {
    return this._parse(this.input.value)[index]
  }

  /**
   * Overwrite a single segment's value, reformat the input, and rehighlight.
   * Fires synthetic `input` and `change` events so that framework bindings work.
   * @param {number} index
   * @param {string|number} newValue
   */
  setSegmentValue (index, newValue) {
    const values = this._parse(this.input.value)
    values[index] = String(newValue)
    this.input.value = this._format(values)
    this.focusSegment(index)
    this._dispatch('input')
    this._dispatch('change')
  }

  /**
   * Increment the active segment by its configured `step` (default 1),
   * clamped to `max` if defined.
   */
  increment () {
    this._adjustSegment(this._activeSegment, +1)
  }

  /**
   * Decrement the active segment by its configured `step` (default 1),
   * clamped to `min` if defined.
   */
  decrement () {
    this._adjustSegment(this._activeSegment, -1)
  }

  /**
   * Remove all event listeners and detach the instance from the input element.
   */
  destroy () {
    this.input.removeEventListener('click', this._onClick)
    this.input.removeEventListener('focus', this._onFocus)
    this.input.removeEventListener('keydown', this._onKeyDown)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _adjustSegment (index, direction) {
    const seg = this.segments[index]
    if (!seg) return

    const radix = seg.radix ?? 10
    const values = this._parse(this.input.value)
    const step = seg.step ?? 1

    // Use parseFloat for base-10 (supports decimals), parseInt for other radixes
    let current = radix === 10
      ? parseFloat(values[index])
      : parseInt(values[index], radix)
    if (isNaN(current)) {
      current = radix === 10
        ? parseFloat(String(seg.value ?? 0)) || 0
        : parseInt(String(seg.value ?? 0), radix) || 0
    }

    let next = current + direction * step

    if (seg.max !== undefined && next > seg.max) next = seg.max
    if (seg.min !== undefined && next < seg.min) next = seg.min

    if (radix !== 10) {
      values[index] = Math.round(next).toString(radix).toUpperCase()
    } else {
      // Preserve the number of decimal places implied by `step`
      const decimals = (String(step).split('.')[1] || '').length
      values[index] = decimals > 0 ? next.toFixed(decimals) : String(Math.round(next))
    }

    this.input.value = this._format(values)
    this.focusSegment(index)
    this._dispatch('input')
    this._dispatch('change')
  }

  _dispatch (type) {
    this.input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  _onFocusIn () {
    // When tabbing into the field, defer so the browser has finished
    // placing the native selection before we override it.
    setTimeout(() => {
      this.focusSegment(this._activeSegment)
    }, 0)
  }

  _onClickOrFocus (event) {
    const pos = this.input.selectionStart
    const ranges = this.getSegmentRanges()
    const index = getCursorSegment(pos, ranges)
    this._activeSegment = index
    // Use setTimeout to override any native selection that the browser
    // applies after the click event fires.
    setTimeout(() => highlightSegment(this.input, index, ranges), 0)
  }

  _onKeydown (event) {
    // Block printable characters that don't match the active segment's pattern.
    // This prevents e.g. typing letters into a numeric RGBA segment.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const seg = this.segments[this._activeSegment]
      if (seg && seg.pattern && !seg.pattern.test(event.key)) {
        event.preventDefault()
        return
      }
    }

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        this.focusSegment(this._activeSegment - 1)
        break

      case 'ArrowRight':
        event.preventDefault()
        this.focusSegment(this._activeSegment + 1)
        break

      case 'ArrowUp':
        event.preventDefault()
        this.increment()
        break

      case 'ArrowDown':
        event.preventDefault()
        this.decrement()
        break

      case 'Tab':
        if (event.shiftKey) {
          // Shift+Tab: move to previous segment, or let the browser move focus out
          if (this._activeSegment > 0) {
            event.preventDefault()
            this.focusSegment(this._activeSegment - 1)
          }
        } else {
          // Tab: move to next segment, or let the browser move focus out
          if (this._activeSegment < this.segments.length - 1) {
            event.preventDefault()
            this.focusSegment(this._activeSegment + 1)
          }
        }
        break

      default:
        break
    }
  }
}
