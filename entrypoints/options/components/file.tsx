type FileSettingsProps = {
    /** Current file path. */
    value: string
    /** Fired on every keystroke; the parent decides when to persist. */
    onChange: (value: string) => void
}

/**
 * Settings for the local-file sync target. Fully controlled — it holds no state
 * of its own, so the parent owns both the value and the debounced write.
 */
export default function FileSettings({ value, onChange }: FileSettingsProps) {
    return (
        <>
            <label htmlFor='file-path'>File Location</label>
            <input
                id='file-path'
                type='text'
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder='File path'
            />
        </>
    )
}
