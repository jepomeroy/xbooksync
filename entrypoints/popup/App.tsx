import appLogo from '@/assets/xbooksync.svg'
import './App.css'

import Storage from './components/storage'
import Sync from './components/sync'
import Sort from './components/sort'

function App() {
    return (
        <>
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
            <div className='settings'>
                <div className='card'>
                    <h3>Storage</h3>
                    <Storage />
                </div>
                <div className='card'>
                    <h3>Settings</h3>
                    <Sort />
                    <Sync />
                </div>
                <div className='card'>
                    <h3>Help</h3>
                </div>
            </div>
        </>
    )
}

export default App
