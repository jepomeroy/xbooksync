import { FaCircleQuestion, FaBug } from 'react-icons/fa6'
import Sort from '../components/sort'
import Sync from '../components/sync'
import Storage from '../components/storage'

export default function Settings() {
    return (
        <>
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
                            Get help on setup and use of XBookSync.
                        </p>
                    </a>
                </div>
                <div className='help-setting'>
                    <a href='https://github.com/jepomeroy/xbooksync/issues' target='_blank'>
                        <p>
                            <FaBug />
                            For issues or feature requests in XBookSync.
                        </p>
                    </a>
                </div>
            </div>
        </>
    )
}
