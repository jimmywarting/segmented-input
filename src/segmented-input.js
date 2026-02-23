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
   * @param {Array<{value?: string, placeholder?: string, min?: number, max?: number, step?: number, radix?: number, pattern?: RegExp, maxLength?: number}>} options.segments
   *   Segment metadata.  `value` is the default numeric value used when incrementing from a blank state;
   *   `placeholder` is the display string shown in the segment when it has no real value (e.g. 'hh', 'mm', 'ss') –
   *   defaults to `value` when not set;
   *   `min`/`max` clamp up/down arrow changes;
   *   `step` controls how much each arrow press changes the value (default 1);
   *   `radix` sets the numeric base for increment/decrement (default 10, use 16 for hex segments);
   *   `pattern` is an optional RegExp tested against each typed character – non-matching keys are blocked;
   *   `maxLength` sets the maximum number of typed characters before auto-advancing (inferred from `max` when not set).
   * @param {function(string[]): string} options.format
   *   Converts an array of segment value strings into the full display string.
   * @param {function(string): string[]} options.parse
   *   Splits the full display string back into an array of segment value strings.
   *   Must always return the same number of elements as `options.segments`.
   * @param {string} [options.invalidMessage]
   *   The message passed to `setCustomValidity()` when one or more segments still show
   *   placeholder text (i.e. the value is incomplete).  Defaults to `'Please fill in all fields.'`.
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
    this._invalidMessage = options.invalidMessage ?? 'Please fill in all fields.'
    // Buffer accumulates typed characters for the active segment between focus changes.
    this._segmentBuffer = ''

    // Compute the placeholder values once (used for Backspace reset and the HTML placeholder).
    // Resolution order: explicit `placeholder` string > `value` default > `min` > '0'.
    // For non-numeric segments (e.g. UUID hex groups) always set an explicit `placeholder`.
    this._placeholderValues = this.segments.map(s => s.placeholder ?? String(s.value ?? s.min ?? 0))
    this._formattedPlaceholder = this._format(this._placeholderValues)

    // Set input.placeholder to the formatted segment placeholders when one is not already set.
    if (!input.placeholder) {
      input.placeholder = this._formattedPlaceholder
    }

    // Leave input.value as-is when it already has a real value from markup.
    // When empty, we keep it empty so the browser shows the HTML placeholder attribute
    // and the field correctly fails constraint validation (e.g. required).

    // Set initial validity so a pre-filled value with partial placeholders is flagged.
    this._updateValidity()

    this._onClick = this._onClickOrFocus.bind(this)
    this._onFocus = this._onFocusIn.bind(this)
    this._onBlur = this._onBlurOut.bind(this)
    this._onKeyDown = this._onKeydown.bind(this)

    input.addEventListener('click', this._onClick)
    input.addEventListener('focus', this._onFocus)
    input.addEventListener('blur', this._onBlur)
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
    this._segmentBuffer = '' // clear typed-character buffer on every segment change
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
    this._updateValidity()
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
    this.input.removeEventListener('blur', this._onBlur)
    this.input.removeEventListener('keydown', this._onKeyDown)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _adjustSegment (index, direction) {
    const seg = this.segments[index]
    if (!seg) return

    // Ensure the placeholder is shown before we start reading/writing the value.
    if (!this.input.value) this.input.value = this._formattedPlaceholder

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
    this._updateValidity()
  }

  _dispatch (type) {
    this.input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  _onFocusIn () {
    // When the input has no value, fill in the formatted placeholder so the segments
    // are visible while the field is focused.  We do this synchronously (before the
    // setTimeout) so that the click handler that fires right after can read the value.
    if (!this.input.value) {
      this.input.value = this._formattedPlaceholder
      // Immediately sync validity: the value is now non-empty so 'required' would
      // pass, but the placeholder state is still incomplete — set the custom validity
      // message now so the browser's constraint popup shows our message instead of
      // silently treating the field as valid.
      this._updateValidity()
    }
    // Defer the actual selection so the browser has finished placing its own cursor.
    setTimeout(() => {
      this.focusSegment(this._activeSegment)
    }, 0)
  }

  _onBlurOut () {
    // If the user left the field without entering any real data (all segments still
    // show their placeholder text), clear the value so the HTML placeholder attribute
    // is shown again and constraint validation (e.g. required) fails correctly.
    if (this._isPlaceholderState()) {
      this.input.value = ''
      this._activeSegment = 0
      this._segmentBuffer = ''
    }
    // Keep custom validity in sync regardless (covers the partial-placeholder case
    // like "hh:30:10" where the empty-value case is already handled by required).
    this._updateValidity()
  }

  _onClickOrFocus (event) {
    const pos = this.input.selectionStart
    const ranges = this.getSegmentRanges()
    const index = getCursorSegment(pos, ranges)
    this._activeSegment = index
    this._segmentBuffer = '' // clear buffer when user clicks
    // Use setTimeout to override any native selection that the browser
    // applies after the click event fires.
    setTimeout(() => highlightSegment(this.input, index, ranges), 0)
  }

  _onKeydown (event) {
    // Intercept ALL printable characters: handle them ourselves so the segment
    // always stays highlighted and we control overflow / auto-advance behavior.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      this._handleSegmentInput(event.key)
      return
    }

    switch (event.key) {
      case 'Backspace':
        event.preventDefault()
        // Reset the whole active segment to its placeholder value (matching the behavior
        // of Chrome's <input type="date"> where Backspace clears the focused segment).
        {
          const placeholder = this._placeholderValues[this._activeSegment]
          this._segmentBuffer = ''
          const values = this._parse(this.input.value)
          values[this._activeSegment] = placeholder
          this.input.value = this._format(values)
          this._dispatch('input')
          this._updateValidity()
          highlightSegment(this.input, this._activeSegment, this.getSegmentRanges())
        }
        break

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

  /**
   * Handle a single printable character typed by the user.
   * Accumulates characters in `_segmentBuffer`, updates the input value,
   * then auto-advances to the next segment when the maximum length is reached
   * or when no further digit could produce a valid in-range value.
   * @param {string} key - a single printable character
   */
  _handleSegmentInput (key) {
    const seg = this.segments[this._activeSegment]
    if (!seg) return

    // Ensure the placeholder is shown before we start reading/writing the value.
    if (!this.input.value) this.input.value = this._formattedPlaceholder

    // Reject characters that don't match the segment's allowed pattern
    if (seg.pattern && !seg.pattern.test(key)) return

    const radix = seg.radix ?? 10
    const newBuffer = this._segmentBuffer + key

    // For numeric segments with a max, reject a digit that would make the
    // value exceed the maximum; commit whatever is already buffered and advance.
    if (seg.max !== undefined && !this._isDecimalSegment(seg)) {
      const numVal = parseInt(newBuffer, radix)
      if (numVal > seg.max) {
        // Current buffer is already a valid value; advance to the next segment.
        this._advanceSegment()
        return
      }
    }

    this._segmentBuffer = newBuffer

    // Write the buffered text into the active segment and reformat.
    const values = this._parse(this.input.value)
    values[this._activeSegment] = this._segmentBuffer
    this.input.value = this._format(values)
    this._dispatch('input')
    this._updateValidity()

    // Re-highlight the segment (without clearing the buffer).
    highlightSegment(this.input, this._activeSegment, this.getSegmentRanges())

    // Auto-advance when the buffer can no longer grow into a valid value.
    if (this._shouldAutoAdvance(seg, this._segmentBuffer, radix)) {
      this._advanceSegment()
    }
  }

  /**
   * Returns true when the typed buffer should trigger auto-advance.
   * Mirrors Chrome's `<input type=date>` behavior:
   * - advance when the buffer is as long as the formatted maximum value; or
   * - advance when the smallest possible next digit would already overflow max.
   * @param {{max?: number, step?: number, maxLength?: number}} seg
   * @param {string} buffer
   * @param {number} radix
   * @returns {boolean}
   */
  _shouldAutoAdvance (seg, buffer, radix) {
    // Explicit maxLength always wins (used for non-numeric segments like UUID hex groups)
    if (seg.maxLength !== undefined) return buffer.length >= seg.maxLength

    if (seg.max === undefined) return false

    if (this._isDecimalSegment(seg)) {
      // For decimal segments (e.g. alpha 0–1 step 0.1) derive max display length
      const decimals = (String(seg.step).split('.')[1] || '').length
      const maxLen = String(seg.max.toFixed(decimals)).length
      return buffer.length >= maxLen
    }

    // Integer / hex segment
    const maxLen = Math.floor(seg.max).toString(radix).length
    if (buffer.length >= maxLen) return true

    // Would the smallest possible next digit overflow? (e.g. "3" in a max=12 field:
    // 3 * 10 = 30 > 12, so no two-digit number starting with 3 is valid → advance)
    const val = parseInt(buffer, radix)
    return val * radix > seg.max
  }

  /**
   * Synchronise the input's custom validity with the current placeholder state.
   *
   * - Empty value (`""`) → clear custom validity; `required` handles it natively.
   * - Any segment still shows its placeholder (partial or fully unfilled) →
   *   set a custom validity message so the form fails validation on submit.
   * - All segments have real values → clear custom validity (input is valid).
   */
  _updateValidity () {
    if (!this.input.value) {
      this.input.setCustomValidity('')
      return
    }
    const values = this._parse(this.input.value)
    const hasPlaceholder = this._placeholderValues.some((p, i) => values[i] === p)
    this.input.setCustomValidity(hasPlaceholder ? this._invalidMessage : '')
  }

  /**
   * Returns true when every segment in the current input value shows its
   * placeholder text, meaning the user has not entered any real data.
   * Used by the blur handler to clear the value for constraint validation.
   * @returns {boolean}
   */
  _isPlaceholderState () {
    if (!this.input.value) return true
    const values = this._parse(this.input.value)
    return this._placeholderValues.every((p, i) => values[i] === p)
  }

  /**
   * Returns true when the segment's step implies decimal values (e.g. step=0.1).
   * @param {{step?: number}} seg
   * @returns {boolean}
   */
  _isDecimalSegment (seg) {
    return String(seg.step ?? 1).includes('.')
  }

  /**
   * Move to the next segment (clearing the buffer).  Called after a segment
   * value has been committed via typing or overflow.
   */
  _advanceSegment () {
    if (this._activeSegment < this.segments.length - 1) {
      this.focusSegment(this._activeSegment + 1)
    } else {
      // Already on the last segment: just clear the buffer and re-highlight.
      this._segmentBuffer = ''
      highlightSegment(this.input, this._activeSegment, this.getSegmentRanges())
    }
  }
}
