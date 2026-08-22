import { useState } from 'react'
import './toogle.css'

type ToggleProps = {
    label?: string
    initial?: boolean
    onToggle?: (state: boolean) => void
}

export default function Toggle({ label, initial = false, onToggle }: ToggleProps) {
    const [enabled, setEnabled] = useState(initial)

    const handleToggle = () => {
        const newState = !enabled
        setEnabled(newState)
        onToggle?.(newState)
    }

    return (
        <div className='toggle'>
            {label && <span className='toggle-label'>{label}</span>}
            <button
                onClick={handleToggle}
                className={`toggle-switch${enabled ? ' is-on' : ''}`}
            >
                <span className='toggle-knob' />
            </button>
        </div>
    )
}
