type FileSettingsProps = {
    value: string
    onChange: (value: string) => void
}

export default function FileSettings({ value, onChange }: FileSettingsProps) {
    return (
        <>
            <label htmlFor='file-path'>file path:</label>
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
