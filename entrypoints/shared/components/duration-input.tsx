import { useEffect, useRef, useState } from '#imports'
import { FaMinus, FaPlus } from 'react-icons/fa6'

import './duration-input.css'

const SECONDS_PER_DAY = 86400
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

const DEFAULT_DEBOUNCE_MS = 400
/** Time held before press-and-hold starts repeating. */
const HOLD_DELAY_MS = 400
/** Repeat rate once press-and-hold kicks in. */
const HOLD_INTERVAL_MS = 80

/** `1 day` / `2 days` — the singular/plural split every unit below needs. */
const pluralize = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

type DurationInputProps = {
    /** Text shown beside the field group; omitted for an unlabelled group. */
    label?: string
    /** Lower bound, inclusive, in seconds. Every field's value is clamped to it. Default 0. */
    min?: number
    /** Upper bound, inclusive, in seconds. Default unbounded. */
    max?: number
    /** Amount, in seconds, the seconds field's plus/minus buttons add or subtract per click. Default 1. */
    step?: number
    /** Current value, in seconds. Controlled: the parent owns this, same as {@link Toggle}'s `checked`. */
    value: number
    /** Fired with the clamped, committed value, at most once per {@link DurationInputProps.debounceMs}. */
    onChange: (value: number) => void
    /** Debounce window, in ms, between the last click and the `onChange` call. Default {@link DEFAULT_DEBOUNCE_MS}. */
    debounceMs?: number
}

/**
 * Days/hours/minutes/seconds duration field, stepped only by buttons — there's
 * no free-text entry, so nothing to validate on the way in.
 *
 * All four fields are derived from a single `total` (seconds) rather than kept
 * as four independent counters. That's what gives the rollover its "for free"
 * correctness: incrementing seconds past 59 changes what `total % 60` and
 * `Math.floor(total / 60) % 60` evaluate to, which *is* seconds rolling to 0 and
 * minutes carrying up. The same arithmetic borrows going the other way — e.g.
 * decrementing seconds at 0 needs a minute, so seconds lands on 59. No
 * per-field carry/borrow bookkeeping needed.
 *
 * @param props - See {@link DurationInputProps}.
 */
export default function DurationInput({
    label,
    min = 0,
    max = Infinity,
    step = 1,
    value,
    onChange,
    debounceMs = DEFAULT_DEBOUNCE_MS,
}: DurationInputProps) {
    const [total, setTotal] = useState(value)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    // Set by mousedown and consumed by the click that follows it on release, so
    // a plain click (or hold) doesn't also apply the browser's own synthesized
    // click adjustment on top of what mousedown already applied. Left false for
    // a keyboard-triggered click (Enter/Space), which has no preceding
    // mousedown, so that path still works.
    const heldViaMouseRef = useRef(false)

    // Follow external updates (hydration from storage, a watcher elsewhere) as
    // long as the user isn't mid-click — a pending debounce means the fields
    // already show something newer than what's in `value`.
    useEffect(() => {
        if (timeoutRef.current) return
        setTotal(value)
    }, [value])

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
            if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
        }
    }, [])

    const clamp = (n: number) => Math.min(max, Math.max(min, n))

    /** Schedules the parent callback with `next`, debounced. */
    const scheduleCommit = (next: number) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null
            onChange(next)
        }, debounceMs)
    }

    /**
     * Applies one step to the shared total and (re-)debounces the callback.
     *
     * Updates via the functional form of `setTotal` rather than closing over
     * `total`, since press-and-hold calls this repeatedly from the same
     * `setInterval` closure — a closed-over `total` would stay stuck at
     * whatever it was when the hold started instead of accumulating.
     */
    const adjust = (delta: number) => {
        setTotal(prev => {
            const next = clamp(prev + delta)
            scheduleCommit(next)
            return next
        })
    }

    const stopHold = () => {
        if (holdTimeoutRef.current) {
            clearTimeout(holdTimeoutRef.current)
            holdTimeoutRef.current = null
        }
        if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current)
            holdIntervalRef.current = null
        }
    }

    /** Applies one step immediately, then repeats it if the button stays held. */
    const startHold = (delta: number) => {
        heldViaMouseRef.current = true
        adjust(delta)
        holdTimeoutRef.current = setTimeout(() => {
            holdIntervalRef.current = setInterval(() => adjust(delta), HOLD_INTERVAL_MS)
        }, HOLD_DELAY_MS)
    }

    /** A plain click applies one step — but not if mousedown already handled it via {@link startHold}. */
    const handleClick = (delta: number) => {
        if (heldViaMouseRef.current) {
            heldViaMouseRef.current = false
            return
        }
        adjust(delta)
    }

    const days = Math.floor(total / SECONDS_PER_DAY)
    const hours = Math.floor((total % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
    const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
    const seconds = total % SECONDS_PER_MINUTE

    const fields = [
        { abbr: 'Days', display: days, unitSeconds: SECONDS_PER_DAY },
        { abbr: 'Hours', display: hours, unitSeconds: SECONDS_PER_HOUR },
        { abbr: 'Minutes', display: minutes, unitSeconds: SECONDS_PER_MINUTE },
        { abbr: 'Seconds', display: seconds, unitSeconds: step },
    ]

    // Reads off `total`, not the debounced `value` prop, so it updates on every
    // click instead of lagging a beat behind the fields it's summarizing.
    const parts = [
        days > 0 && pluralize(days, 'day'),
        hours > 0 && pluralize(hours, 'hour'),
        minutes > 0 && pluralize(minutes, 'minute'),
        seconds > 0 && pluralize(seconds, 'second'),
    ].filter((part): part is string => Boolean(part))
    const humanDuration =
        parts.length === 0
            ? pluralize(0, 'second')
            : parts.length === 1
              ? parts[0]
              : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

    return (
        <div className='duration-input'>
            {label && <span className='duration-input-label'>{label}</span>}
            <div className='duration-input-fields'>
                {fields.map(f => (
                    <div className='duration-field' key={f.abbr}>
                        <button
                            type='button'
                            className='duration-field-btn'
                            onMouseDown={() => startHold(-f.unitSeconds)}
                            onMouseUp={stopHold}
                            onMouseLeave={() => {
                                stopHold()
                                heldViaMouseRef.current = false
                            }}
                            onClick={() => handleClick(-f.unitSeconds)}
                            aria-label={`Decrease ${f.abbr}`}
                        >
                            <FaMinus />
                        </button>
                        <span className='duration-field-value'>{f.display}</span>
                        <button
                            type='button'
                            className='duration-field-btn'
                            onMouseDown={() => startHold(f.unitSeconds)}
                            onMouseUp={stopHold}
                            onMouseLeave={() => {
                                stopHold()
                                heldViaMouseRef.current = false
                            }}
                            onClick={() => handleClick(f.unitSeconds)}
                            aria-label={`Increase ${f.abbr}`}
                        >
                            <FaPlus />
                        </button>
                        <span className='duration-field-unit'>{f.abbr}</span>
                    </div>
                ))}
                <p className='duration-input-summary'>Every {humanDuration}</p>
            </div>
        </div>
    )
}
