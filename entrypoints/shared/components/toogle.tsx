import './toogle.css'

type ToggleProps = {
    /** Text shown beside the switch; omitted for an unlabelled toggle. */
    label?: string
    /**
     * Current position.
     *
     * Controlled: the parent owns this value and the switch renders whatever it
     * is told. Settings hydrate asynchronously from extension storage, so a
     * toggle that latched its position at mount time would be stuck showing the
     * pre-hydration default.
     */
    checked: boolean
    /** Fired with the requested new position; the parent applies it to {@link ToggleProps.checked}. */
    onToggle: (state: boolean) => void
}

/**
 * Switch-style boolean control.
 *
 * A `<button role="switch">` rather than a checkbox, so the knob can be styled
 * freely while `aria-checked` keeps it announced as a switch.
 *
 * @param props - See {@link ToggleProps}.
 */
export default function Toggle({ label, checked, onToggle }: ToggleProps) {
    return (
        <div className='toggle'>
            {label && <span className='toggle-label'>{label}</span>}
            <button
                onClick={() => onToggle(!checked)}
                role='switch'
                aria-checked={checked}
                aria-label={label}
                className={`toggle-switch${checked ? ' is-on' : ''}`}
            >
                <span className='toggle-knob' />
            </button>
        </div>
    )
}
