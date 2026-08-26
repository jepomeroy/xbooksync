import appLogo from '@/assets/xbooksync.svg'
import { FaBug } from 'react-icons/fa6'
import { FaCircleQuestion } from 'react-icons/fa6'
import './Option.css'

import Sort from './components/sort'
import Sync from './components/sync'
import Storage from './components/storage'

/**
 * Options shell: header, the active panel, and the bottom nav that switches
 * between panels.
 */
function Option() {
    return (
        <div className='container'>
            <div className='header'>
                <div>
                    <a href='https://github.com/jepomeroy/xbooksync' target='_blank'>
                        <img src={appLogo} className='logo' alt='App logo' />
                    </a>
                </div>
                <div>
                    <h1>XBookSync</h1>
                </div>
            </div>
            <div className='card'>
                <h3>Settings</h3>
                <Sort />
                <Sync />
            </div>
            <div className='card'>
                <h3>Sync Storage</h3>
                <Storage />
            </div>
            <div className='card'>
                <h3>Help</h3>
                <div className='help-setting'>
                    <a href='https://github.com/jepomeroy/xbooksync/blob/main/README.md' target='_blank'>
                        <p>
                            <FaCircleQuestion />
                            Get help on setup and use of XMarkSync.
                        </p>
                    </a>
                </div>
                <div className='help-setting'>
                    <a href='https://github.com/jepomeroy/xbooksync/issues' target='_blank'>
                        <p>
                            <FaBug />
                            For issues or features request in XMarkSync.
                        </p>
                    </a>
                </div>
            </div>
        </div>
    )
}

export default Option
