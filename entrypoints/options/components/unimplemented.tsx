import { t } from '@/entrypoints/shared/i18n'

/** Placeholder for storage targets that have no adapter yet. */
export default function Unimplemented() {
    return (
        <>
            <h3 className='unimplemented'>{t('notImplemented')}</h3>
        </>
    )
}
