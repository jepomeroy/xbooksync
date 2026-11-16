import { FaCircleQuestion, FaBug } from 'react-icons/fa6'
import Sort from '../components/sort'
import Sync from '../components/sync'
import Storage from '../components/storage'
import { t } from '@/entrypoints/shared/i18n'

/** Settings tab: sync/sort settings, storage settings, and help links. */
export default function Settings() {
    return (
        <>
            <div className='card'>
                <h3>{t('settingsHeading')}</h3>
                <Sort />
                <Sync />
            </div>
            <div className='card'>
                <h3>{t('syncStorageHeading')}</h3>
                <Storage />
            </div>
            <div className='card'>
                <h3>{t('helpHeading')}</h3>
                <div className='help-setting'>
                    <a href='https://github.com/jepomeroy/xbooksync/blob/main/README.md' target='_blank'>
                        <p>
                            <FaCircleQuestion />
                            {t('helpSetup')}
                        </p>
                    </a>
                </div>
                <div className='help-setting'>
                    <a href='https://github.com/jepomeroy/xbooksync/issues' target='_blank'>
                        <p>
                            <FaBug />
                            {t('helpIssues')}
                        </p>
                    </a>
                </div>
            </div>
        </>
    )
}
