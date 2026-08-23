import appLogo from '@/assets/xbooksync.svg'
import { FaDatabase } from 'react-icons/fa6'
import { FaRotate } from 'react-icons/fa6'
import { FaGear } from 'react-icons/fa6'
import { FaCircleQuestion } from 'react-icons/fa6'
import './App.css'

import StoragePage from './pages/storage'
import SettingsPage from './pages/settings'
import HelpPage from './pages/help'
import { StatusType, SyncNowMessage, type MessageResponse } from '../shared/types'
import { syncEnableSetting } from '../shared/localsettings'

enum PanelType {
    Storage, // 0
    Settings, // 2
    Help, // 3
}
function App() {
    const [panel, setPanel] = useState<PanelType>(PanelType.Storage)

    const getPanel = (panel: PanelType) => {
        switch (panel) {
            case PanelType.Storage:
                return StoragePage()
            case PanelType.Settings:
                return SettingsPage()
            case PanelType.Help:
                return HelpPage()
        }
    }

    const syncNow = async () => {
        if ((await syncEnableSetting.getValue()) == true) {
            const result = await browser.runtime.sendMessage<string, MessageResponse>(SyncNowMessage)

            if (result.status === StatusType.Success) {
                console.log('I would sync')
            } else {
                console.log('No sync necessary')
            }
        } else {
            console.log('Sync is disabled')
        }
    }

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
                <div>
                    <button onClick={() => syncNow()}>
                        <FaRotate />
                    </button>
                </div>
            </div>
            <div className='panel'>{getPanel(panel)}</div>
            <div className='selector'>
                <button onClick={() => setPanel(PanelType.Storage)}>
                    <FaDatabase />
                </button>
                <button onClick={() => setPanel(PanelType.Settings)}>
                    <FaGear />
                </button>
                <button onClick={() => setPanel(PanelType.Help)}>
                    <FaCircleQuestion />
                </button>
            </div>
        </div>
    )
}

export default App
