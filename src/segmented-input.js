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
export class SegmentedInput extends EventTarget {
  // ---------------------------------------------------------------------------
  // Private fields
  // ---------------------------------------------------------------------------

  #format
  #parse
  #activeSegment
  #invalidMessage
  #segmentBuffer
  #placeholderJustSet
  #placeholderValues
  #formattedPlaceholder
  /** CSS class added to `input` when the active segment is a selectable action segment.
   *  Lets developers style `input.si-action-active::selection` differently. */
  #actionClass
  /** clientX captured at mousedown – used to recover intended click position after
   *  the value changes in #onFocusIn for an initially-empty input. */
  #pendingClickX = null

  // Bound event-handler references kept for clean removeEventListener in destroy().
  #onClick
  #onFocus
  #onBlur
  #onKeyDown
  #onMouseDown

  /**
   * @param {HTMLInputElement} input - the input element to enhance
   * @param {Object} options
   * @param {Array<{value?: string, placeholder?: string, type?: string, options?: string[], onClick?: Function, min?: number, max?: number, step?: number, radix?: number, pattern?: RegExp, maxLength?: number}>} options.segments
   *   Segment metadata.  `value` is the default numeric value used when incrementing from a blank state;
   *   `placeholder` is the display string shown in the segment when it has no real value (e.g. 'hh', 'mm', 'ss') –
   *   defaults to `value` when not set;
   *   `options` is an array of allowed string values; ↑/↓ cycle through them and typing matches the first option
   *   whose text starts with the pressed key (skips `min`/`max`/`pattern` processing);
   *   `onClick` makes the segment an **action segment** – it cannot be focused, typed into, or incremented;
   *   when the user clicks on it, `onClick(instance)` is called (useful for "set to today" calendar buttons etc.);
   *   action segments are excluded from constraint-validity checks so they never block form submission;
   *   add `selectable: true` to an action segment to make it reachable via Tab/Arrow keys; once focused,
   *   pressing Enter triggers its `onClick` — useful for making icon buttons keyboard accessible;
   *   you may also mark a segment as `type: 'action'` to make it non-editable without (yet) providing an `onClick`;
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
   * @param {string} [options.actionActiveClass]
   *   CSS class added to the `<input>` when the active segment is a selectable action segment.
   *   Defaults to `'si-action-active'`.  Use for `input.si-action-active::selection { ... }` styling.
   */
  constructor (input, options) {
    if (!input || input.tagName !== 'INPUT') {
      throw new TypeError('SegmentedInput: first argument must be an <input> element')
    }
    if (typeof options.format !== 'function' || typeof options.parse !== 'function') {
      throw new TypeError('SegmentedInput: options.format and options.parse must be functions')
    }

    super() // EventTarget constructor

    this.input = input
    this.segments = options.segments || []
    this.#format = options.format
    this.#parse = options.parse
    this.#activeSegment = this.#findEditable(0, +1) ?? 0
    this.#invalidMessage = options.invalidMessage ?? 'Please fill in all fields.'
    this.#actionClass = options.actionActiveClass ?? 'si-action-active'
    // Buffer accumulates typed characters for the active segment between focus changes.
    this.#segmentBuffer = ''
    // Flag set by #onFocusIn when it fills in the placeholder from an empty value;
    // used by #onClickOrFocus together with #pendingClickX for single-click action detection.
    this.#placeholderJustSet = false

    // Compute the placeholder values once (used for Backspace reset and the HTML placeholder).
    // Resolution order: explicit `placeholder` string > `value` default > `min` > '0'.
    // For non-numeric segments (e.g. UUID hex groups) always set an explicit `placeholder`.
    this.#placeholderValues = this.segments.map(s => s.placeholder ?? String(s.value ?? s.min ?? 0))
    // Guarded version (ZWS around action segments) is used for input.value.
    // Clean version (no ZWS) is used for the HTML placeholder attribute.
    this.#formattedPlaceholder = this.#formatGuarded(this.#placeholderValues)

    // Set input.placeholder to the formatted segment placeholders when one is not already set.
    if (!input.placeholder) {
      input.placeholder = this.#format(this.#placeholderValues)
    }

    // Leave input.value as-is when it already has a real value from markup.
    // When empty, we keep it empty so the browser shows the HTML placeholder attribute
    // and the field correctly fails constraint validation (e.g. required).

    // Set initial validity so a pre-filled value with partial placeholders is flagged.
    this.#updateValidity()

    this.#onClick = this.#onClickOrFocus.bind(this)
    this.#onFocus = this.#onFocusIn.bind(this)
    this.#onBlur = this.#onBlurOut.bind(this)
    this.#onKeyDown = this.#onKeydown.bind(this)
    this.#onMouseDown = this.#captureMouseX.bind(this)

    input.addEventListener('mousedown', this.#onMouseDown)
    input.addEventListener('click', this.#onClick)
    input.addEventListener('focus', this.#onFocus)
    input.addEventListener('blur', this.#onBlur)
    input.addEventListener('keydown', this.#onKeyDown)
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * The "clean" value — `input.value` with every action segment's text (and any
   * immediately-preceding zero-width space separators) removed.
   *
   * Returns `""` when the field is empty or still showing its full placeholder.
   *
   * @example
   * // dateWithPicker: input.value is "2024-01-15​📅"
   * //                 instance.value is "2024-01-15"
   * console.log(instance.value)
   */
  get value () {
    if (!this.input.value || this.#isPlaceholderState()) return ''
    const ranges = this.getSegmentRanges()
    let result = this.input.value
    // Iterate in reverse so earlier offsets remain valid after each splice.
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (!this.#isActionSegment(this.segments[i])) continue
      const { start, end } = ranges[i]
      // Strip ZWS guards the library adds on both sides of each action segment value.
      let from = start
      while (from > 0 && result.codePointAt(from - 1) === 0x200B) from--
      let to = end
      while (to < result.length && result.codePointAt(to) === 0x200B) to++
      result = result.slice(0, from) + result.slice(to)
    }
    // Trim trailing whitespace that may remain from the separator before the icon.
    return result.trimEnd()
  }

  /**
   * Compute and return the character ranges for every segment based on the
   * current input value.
   * @returns {Array<{start: number, end: number, value: string}>}
   */
  getSegmentRanges () {
    return getSegmentRanges(
      this.input.value,
      v => this.#parse(this.#stripZWS(v)),
      v => this.#formatGuarded(v),
    )
  }

  /**
   * Move focus (text selection) to a specific segment.
   * The index is clamped to the valid range so callers don't have to guard it.
   * @param {number} index
   */
  focusSegment (index) {
    let clamped = Math.max(0, Math.min(index, this.segments.length - 1))
    // If the target is a non-selectable action segment, find the nearest editable one
    const seg = this.segments[clamped]
    if (this.#isActionSegment(seg) && !seg.selectable) {
      const fwd = this.#findEditable(clamped + 1, +1)
      const bwd = this.#findEditable(clamped - 1, -1)
      if (fwd !== null) clamped = fwd
      else if (bwd !== null) clamped = bwd
      else return // all segments are action segments (edge case)
    }
    // Emit blur for the segment we're leaving (only when actually changing)
    if (clamped !== this.#activeSegment) {
      const prevIndex = this.#activeSegment
      const prevSeg = this.segments[prevIndex]
      this.#emit('segmentblur', { index: prevIndex, segment: prevSeg })
    }
    this.#activeSegment = clamped
    this.#segmentBuffer = '' // clear typed-character buffer on every segment change
    // Add/remove the action CSS class so developers can style ::selection differently.
    const targetSeg = this.segments[clamped]
    if (this.#isActionSegment(targetSeg) && targetSeg.selectable) {
      this.input.classList.add(this.#actionClass)
    } else {
      this.input.classList.remove(this.#actionClass)
    }
    highlightSegment(this.input, clamped, this.getSegmentRanges())
    this.#emit('segmentfocus', { index: clamped, segment: this.segments[clamped] })
  }

  /**
   * Return the current string value of a specific segment.
   * @param {number} index
   * @returns {string}
   */
  getSegmentValue (index) {
    return this.#currentValues()[index]
  }

  /**
   * Overwrite a single segment's value, reformat the input, and rehighlight.
   * Fires synthetic `input` and `change` events so that framework bindings work.
   * @param {number} index
   * @param {string|number} newValue
   */
  setSegmentValue (index, newValue) {
    const values = this.#currentValues()
    values[index] = String(newValue)
    this.input.value = this.#formatGuarded(values)
    this.focusSegment(index)
    this.#dispatch('input')
    this.#dispatch('change')
    this.#updateValidity()
    this.#emit('segmentchange', { index, value: String(newValue) })
  }

  /**
   * Increment the active segment by its configured `step` (default 1),
   * clamped to `max` if defined.
   */
  increment () {
    this.#adjustSegment(this.#activeSegment, +1)
  }

  /**
   * Decrement the active segment by its configured `step` (default 1),
   * clamped to `min` if defined.
   */
  decrement () {
    this.#adjustSegment(this.#activeSegment, -1)
  }

  /**
   * Remove all event listeners and detach the instance from the input element.
   */
  destroy () {
    this.input.removeEventListener('mousedown', this.#onMouseDown)
    this.input.removeEventListener('click', this.#onClick)
    this.input.removeEventListener('focus', this.#onFocus)
    this.input.removeEventListener('blur', this.#onBlur)
    this.input.removeEventListener('keydown', this.#onKeyDown)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #adjustSegment (index, direction) {
    const seg = this.segments[index]
    if (!seg) return

    // Action segments cannot be adjusted.
    if (this.#isActionSegment(seg)) return

    // Text segments (type: 'text') have no numeric meaning; up/down is a no-op.
    if (seg.type === 'text') return

    // Enum segments (options: [...]) cycle through the list with ↑/↓.
    if (seg.options) {
      if (!this.input.value) this.input.value = this.#formattedPlaceholder
      const values = this.#currentValues()
      const idx = seg.options.indexOf(values[index])
      const newIdx = ((idx === -1 ? 0 : idx) + direction + seg.options.length) % seg.options.length
      values[index] = seg.options[newIdx]
      this.input.value = this.#formatGuarded(values)
      this.focusSegment(index)
      this.#dispatch('input')
      this.#dispatch('change')
      this.#updateValidity()
      this.#emit('segmentchange', { index, value: values[index] })
      return
    }

    // Ensure the placeholder is shown before we start reading/writing the value.
    if (!this.input.value) this.input.value = this.#formattedPlaceholder

    const radix = seg.radix ?? 10
    const values = this.#currentValues()
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

    this.input.value = this.#formatGuarded(values)
    this.focusSegment(index)
    this.#dispatch('input')
    this.#dispatch('change')
    this.#updateValidity()
    this.#emit('segmentchange', { index, value: values[index] })
  }

  #dispatch (type) {
    this.input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  }

  /**
   * Dispatch a CustomEvent on this SegmentedInput instance (which extends EventTarget).
   * Listeners can be added via `instance.addEventListener(type, handler)`.
   * @param {string} type
   * @param {object} detail
   */
  #emit (type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  /** Store the mouse X position at mousedown time, before #onFocusIn can change
   *  input.value (which resets selectionStart to 0).  Used in #onClickOrFocus to
   *  recover the intended click target via canvas character-width estimation. */
  #captureMouseX (event) {
    this.#pendingClickX = event.clientX
  }

  /**
   * Estimate which character index in the input corresponds to a given clientX.
   * Uses canvas measureText so it works with any font and handles emoji / multi-
   * code-unit characters correctly for typical input fonts.
   * Falls back to selectionStart on any error (e.g. no 2D canvas support).
   * @param {number} clientX
   * @returns {number}
   */
  #charPosFromX (clientX) {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const style = window.getComputedStyle(this.input)
      ctx.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily]
        .filter(Boolean).join(' ')
      const text = this.input.value || this.#formattedPlaceholder
      const rect = this.input.getBoundingClientRect()
      const padding = parseFloat(style.paddingLeft) || 0
      const x = clientX - rect.left - padding

      // Binary search: smallest i where measureText(text[0..i]) >= x
      let lo = 0, hi = text.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (ctx.measureText(text.slice(0, mid)).width < x) lo = mid + 1
        else hi = mid
      }
      return Math.min(lo, text.length)
    } catch (_) {
      return this.input.selectionStart ?? 0
    }
  }

  #onFocusIn () {
    // When the input has no value, fill in the formatted placeholder so the segments
    // are visible while the field is focused.  We do this synchronously (before the
    // setTimeout) so that the click handler that fires right after can read the value.
    if (!this.input.value) {
      this.input.value = this.#formattedPlaceholder
      // Set this flag so #onClickOrFocus knows the value was just set from empty;
      // after the programmatic value change selectionStart is reset to 0, so we
      // use #pendingClickX (captured at mousedown) to recover the intended target.
      this.#placeholderJustSet = true
      // Immediately sync validity: the value is now non-empty so 'required' would
      // pass, but the placeholder state is still incomplete — set the custom validity
      // message now so the browser's constraint popup shows our message instead of
      // silently treating the field as valid.
      this.#updateValidity()
    } else {
      // Normalize to the canonical ZWS-guarded format in case the value was set
      // externally (e.g. directly via input.value = "2024-01-15 📅") without ZWS guards.
      const normalized = this.#formatGuarded(this.#parse(this.#stripZWS(this.input.value)))
      if (this.input.value !== normalized) this.input.value = normalized
    }
    // Defer the actual selection so the browser has finished placing its own cursor.
    setTimeout(() => {
      this.#placeholderJustSet = false
      this.focusSegment(this.#activeSegment)
    }, 0)
  }

  #onBlurOut () {
    // Remove the action class and notify listeners that the current segment is losing focus.
    this.input.classList.remove(this.#actionClass)
    if (this.segments.length > 0) {
      this.#emit('segmentblur', { index: this.#activeSegment, segment: this.segments[this.#activeSegment] })
    }
    // If the user left the field without entering any real data (all segments still
    // show their placeholder text), clear the value so the HTML placeholder attribute
    // is shown again and constraint validation (e.g. required) fails correctly.
    if (this.#isPlaceholderState()) {
      this.input.value = ''
      this.#activeSegment = 0
      this.#segmentBuffer = ''
    }
    // Keep custom validity in sync regardless (covers the partial-placeholder case
    // like "hh:30:10" where the empty-value case is already handled by required).
    this.#updateValidity()
  }

  #onClickOrFocus (event) {
    if (this.#placeholderJustSet) {
      this.#placeholderJustSet = false

      // #onFocusIn just set input.value from empty, resetting selectionStart to 0.
      // Use the clientX captured at mousedown to estimate the intended click target.
      // This enables single-click action-segment firing even on an unfocused input.
      let charPos = null
      let targetIndex = this.#activeSegment
      if (this.#pendingClickX !== null) {
        charPos = this.#charPosFromX(this.#pendingClickX)
        targetIndex = getCursorSegment(charPos, this.getSegmentRanges())
      }
      this.#pendingClickX = null

      const clickedSeg = this.segments[targetIndex]
      if (this.#isActionSegment(clickedSeg)) {
        // Only fire onClick when charPos is strictly inside the action segment (exclusive end).
        // A click on the trailing ZWS or the right margin of the input routes to the nearest
        // editable segment instead.
        const r = this.getSegmentRanges()[targetIndex]
        if (r && charPos !== null && charPos >= r.start && charPos < r.end) {
          if (typeof clickedSeg.onClick === 'function') clickedSeg.onClick(this)
        } else {
          const prev = this.#findEditable(targetIndex - 1, -1)
          if (prev !== null) this.#activeSegment = prev
        }
        // The setTimeout queued by #onFocusIn will call focusSegment(#activeSegment).
        return
      }

      // Non-action segment: update #activeSegment so the setTimeout from #onFocusIn
      // focuses the segment the user actually clicked on (not always the first one).
      this.#activeSegment = targetIndex
      this.#segmentBuffer = ''
      return
    }

    this.#pendingClickX = null

    const pos = this.input.selectionStart
    const ranges = this.getSegmentRanges()
    const index = getCursorSegment(pos, ranges)

    // If user clicked on an action segment, fire its onClick callback only when
    // the cursor landed strictly inside the segment (exclusive end).
    // A click at the right edge (trailing ZWS) or on the right margin routes to
    // the nearest editable segment instead.
    const clickedSeg = this.segments[index]
    if (this.#isActionSegment(clickedSeg)) {
      const r = ranges[index]
      if (r && pos >= r.start && pos < r.end) {
        if (typeof clickedSeg.onClick === 'function') clickedSeg.onClick(this)
      } else {
        const prev = this.#findEditable(index - 1, -1)
        const fallback = prev ?? this.#findEditable(0, +1)
        if (fallback !== null) {
          this.#activeSegment = fallback
          setTimeout(() => highlightSegment(this.input, fallback, this.getSegmentRanges()), 0)
        }
      }
      return
    }

    this.#activeSegment = index
    this.#segmentBuffer = '' // clear buffer when user clicks
    // Use setTimeout to override any native selection that the browser
    // applies after the click event fires.
    setTimeout(() => highlightSegment(this.input, index, ranges), 0)
  }

  #onKeydown (event) {
    // Intercept ALL printable characters: handle them ourselves so the segment
    // always stays highlighted and we control overflow / auto-advance behavior.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      this.#handleSegmentInput(event.key)
      return
    }

    switch (event.key) {
      case 'Backspace':
        event.preventDefault()
        // Reset the whole active segment to its placeholder value (matching the behavior
        // of Chrome's <input type="date"> where Backspace clears the focused segment).
        {
          const placeholder = this.#placeholderValues[this.#activeSegment]
          this.#segmentBuffer = ''
          const values = this.#currentValues()
          values[this.#activeSegment] = placeholder
          this.input.value = this.#formatGuarded(values)
          this.#dispatch('input')
          this.#updateValidity()
          this.#emit('segmentchange', { index: this.#activeSegment, value: placeholder })
          highlightSegment(this.input, this.#activeSegment, this.getSegmentRanges())
        }
        break

      case 'Enter': {
        // Fire onClick on a selectable action segment when Enter is pressed.
        const seg = this.segments[this.#activeSegment]
        if (this.#isActionSegment(seg) && seg.selectable && typeof seg.onClick === 'function') {
          event.preventDefault()
          seg.onClick(this)
        }
        break
      }

      case 'ArrowLeft': {
        event.preventDefault()
        const prev = this.#findNavigable(this.#activeSegment - 1, -1)
        if (prev !== null) this.focusSegment(prev)
        break
      }

      case 'ArrowRight': {
        event.preventDefault()
        const next = this.#findNavigable(this.#activeSegment + 1, +1)
        if (next !== null) this.focusSegment(next)
        break
      }

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
          // Shift+Tab: move to previous navigable segment, or let the browser move focus out
          const prev = this.#findNavigable(this.#activeSegment - 1, -1)
          if (prev !== null) {
            event.preventDefault()
            this.focusSegment(prev)
          }
        } else {
          // Tab: move to next navigable segment, or let the browser move focus out
          const next = this.#findNavigable(this.#activeSegment + 1, +1)
          if (next !== null) {
            event.preventDefault()
            this.focusSegment(next)
          }
        }
        break

      default:
        break
    }
  }

  /**
   * Handle a single printable character typed by the user.
   * Accumulates characters in the segment buffer, updates the input value,
   * then auto-advances to the next segment when the maximum length is reached
   * or when no further digit could produce a valid in-range value.
   * @param {string} key - a single printable character
   */
  #handleSegmentInput (key) {
    const seg = this.segments[this.#activeSegment]
    if (!seg || this.#isActionSegment(seg)) return

    // Ensure the placeholder is shown before we start reading/writing the value.
    if (!this.input.value) this.input.value = this.#formattedPlaceholder

    // Enum segments (options: [...]): match typed key to the first option that starts
    // with it (case-insensitive), then immediately advance to the next segment.
    // Single pass: prefer exact match, fall back to first prefix match.
    if (seg.options) {
      let match = null
      for (const opt of seg.options) {
        if (opt.toLowerCase() === key.toLowerCase()) { match = opt; break }
        if (!match && opt.toLowerCase().startsWith(key.toLowerCase())) match = opt
      }
      if (match) {
        const values = this.#currentValues()
        values[this.#activeSegment] = match
        this.input.value = this.#formatGuarded(values)
        this.#dispatch('input')
        this.#updateValidity()
        this.#emit('segmentchange', { index: this.#activeSegment, value: match })
        highlightSegment(this.input, this.#activeSegment, this.getSegmentRanges())
        this.#advanceSegment()
      }
      return
    }

    // Reject characters that don't match the segment's allowed pattern
    if (seg.pattern && !seg.pattern.test(key)) return

    const radix = seg.radix ?? 10
    const newBuffer = this.#segmentBuffer + key

    // For numeric segments with a max, reject a digit that would make the
    // value exceed the maximum; commit whatever is already buffered and advance.
    if (seg.max !== undefined && !this.#isDecimalSegment(seg)) {
      const numVal = parseInt(newBuffer, radix)
      if (numVal > seg.max) {
        // Current buffer is already a valid value; advance to the next segment.
        this.#advanceSegment()
        return
      }
    }

    this.#segmentBuffer = newBuffer

    // Write the buffered text into the active segment and reformat.
    const values = this.#currentValues()
    values[this.#activeSegment] = this.#segmentBuffer
    this.input.value = this.#formatGuarded(values)
    this.#dispatch('input')
    this.#updateValidity()
    this.#emit('segmentchange', { index: this.#activeSegment, value: this.#segmentBuffer })

    // Re-highlight the segment (without clearing the buffer).
    highlightSegment(this.input, this.#activeSegment, this.getSegmentRanges())

    // Auto-advance when the buffer can no longer grow into a valid value.
    if (this.#shouldAutoAdvance(seg, this.#segmentBuffer, radix)) {
      this.#advanceSegment()
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
  #shouldAutoAdvance (seg, buffer, radix) {
    // Explicit maxLength always wins (used for non-numeric segments like UUID hex groups)
    if (seg.maxLength !== undefined) return buffer.length >= seg.maxLength

    if (seg.max === undefined) return false

    if (this.#isDecimalSegment(seg)) {
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
  #updateValidity () {
    if (!this.input.value) {
      this.input.setCustomValidity('')
      return
    }
    const values = this.#currentValues()
    const hasPlaceholder = this.#placeholderValues.some((p, i) =>
      !this.#isActionSegment(this.segments[i]) && values[i] === p
    )
    this.input.setCustomValidity(hasPlaceholder ? this.#invalidMessage : '')
  }

  /**
   * Returns true when every segment in the current input value shows its
   * placeholder text, meaning the user has not entered any real data.
   * Used by the blur handler to clear the value for constraint validation.
   * @returns {boolean}
   */
  #isPlaceholderState () {
    if (!this.input.value) return true
    const values = this.#currentValues()
    return this.#placeholderValues.every((p, i) => {
      if (this.#isActionSegment(this.segments[i])) return true // action segs don't affect state
      return values[i] === p
    })
  }

  /**
   * Returns true when the segment's step implies decimal values (e.g. step=0.1).
   * @param {{step?: number}} seg
   * @returns {boolean}
   */
  #isDecimalSegment (seg) {
    return String(seg.step ?? 1).includes('.')
  }

  /**
   * Returns true when the segment has `type: 'action'` or an `onClick` callback,
   * making it an action (button) segment.  Action segments cannot be focused,
   * typed into, or incremented; clicking them fires `onClick(instance)` when
   * the callback is present.  They are also excluded from constraint-validity
   * checks so a trailing icon never blocks form submission.
   * @param {{type?: string, onClick?: Function}} seg
   * @returns {boolean}
   */
  #isActionSegment (seg) {
    return !!(seg && (seg.type === 'action' || typeof seg.onClick === 'function'))
  }

  /**
   * Strip all U+200B zero-width-space characters from a string.
   * Used to remove the ZWS guards that #formatGuarded inserts around action segments
   * before passing the value to the developer's parse() function.
   * @param {string} str
   * @returns {string}
   */
  #stripZWS (str) {
    return str.replace(/\u200B/g, '')
  }

  /**
   * Like `this.#format(values)` but wraps each action segment's value in
   * U+200B (zero-width space) guards so that:
   *   – clicking just to the LEFT of the icon routes to the preceding segment
   *     (ZWS creates equal-distance tie → tie-break picks left)
   *   – clicking at the right boundary or on the right margin routes to the
   *     preceding segment (handled by exclusive-end check in #onClickOrFocus)
   * The ZWS chars have zero visual width and are invisible to the user.
   * @param {string[]} values
   * @returns {string}
   */
  #formatGuarded (values) {
    const raw = this.#format(values)
    if (!this.segments.some(s => this.#isActionSegment(s))) return raw

    // Locate each action segment's value in the raw format output using the
    // same left-to-right indexOf scan as getSegmentRanges.
    let searchFrom = 0
    const actionRanges = []
    for (let i = 0; i < values.length; i++) {
      const val = String(values[i])
      const start = raw.indexOf(val, searchFrom)
      if (start !== -1) {
        if (this.#isActionSegment(this.segments[i])) {
          actionRanges.push({ start, end: start + val.length })
        }
        searchFrom = start + val.length
      }
    }

    // Wrap action values with ZWS guards (reverse order preserves offsets).
    let result = raw
    for (let j = actionRanges.length - 1; j >= 0; j--) {
      const { start, end } = actionRanges[j]
      result = result.slice(0, start) + '\u200B' + result.slice(start, end) + '\u200B' + result.slice(end)
    }
    return result
  }

  /**
   * Parse the current input value into an array of segment value strings,
   * stripping any U+200B ZWS guards first so the developer's parse() function
   * never sees zero-width-space characters.
   * @returns {string[]}
   */
  #currentValues () {
    return this.#parse(this.#stripZWS(this.input.value))
  }

  /**
   * Starting from `fromIndex`, scan in `direction` (+1 or -1) and return the
   * index of the first non-action segment.  Returns `null` if none is found.
   * @param {number} fromIndex
   * @param {number} direction - +1 (forward) or -1 (backward)
   * @returns {number|null}
   */
  #findEditable (fromIndex, direction) {
    let i = fromIndex
    while (i >= 0 && i < this.segments.length) {
      if (!this.#isActionSegment(this.segments[i])) return i
      i += direction
    }
    return null
  }

  /**
   * Like `#findEditable`, but also returns selectable action segments so that
   * Arrow/Tab keyboard navigation can reach them.  Non-selectable action segments
   * are still skipped.
   * @param {number} fromIndex
   * @param {number} direction - +1 (forward) or -1 (backward)
   * @returns {number|null}
   */
  #findNavigable (fromIndex, direction) {
    let i = fromIndex
    while (i >= 0 && i < this.segments.length) {
      const seg = this.segments[i]
      if (!this.#isActionSegment(seg) || seg.selectable) return i
      i += direction
    }
    return null
  }

  /**
   * Move to the next segment (clearing the buffer).  Called after a segment
   * value has been committed via typing or overflow.
   */
  #advanceSegment () {
    const next = this.#findEditable(this.#activeSegment + 1, +1)
    if (next !== null) {
      this.focusSegment(next)
    } else {
      // Already on the last editable segment: just clear the buffer and re-highlight.
      this.#segmentBuffer = ''
      highlightSegment(this.input, this.#activeSegment, this.getSegmentRanges())
    }
  }
}
