import { t } from '@/entrypoints/shared/i18n'

/** Placeholder for storage targets that have no adapter yet. */
export default function NoSelection() {
    return (
        <>
            <h3 className='noselection'>{t('noStorageSelected')}</h3>
        </>
    )
}
