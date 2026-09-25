import appLogo from '@/assets/icon.svg'

import './Option.css'
import Tabs from './components/tabs'
import Settings from './pages/settings'
import Tools from './pages/tools'

//tabData mock:
const tabData = [
    { id: 'settings', title: 'Settings', content: <Settings /> },
    { id: 'tools', title: 'Tools', content: <Tools /> },
]

/** Options page: header, followed by cards for sync/sort settings, storage settings, and help links. */
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
                    <h1>XBookSync Options</h1>
                </div>
            </div>
            <div className='tabs-wrapper'>
                <Tabs>
                    <Tabs.Titles items={tabData.map(({ id, title }) => ({ id, title }))} />
                    <Tabs.Contents
                        items={tabData.map(({ id, content }) => ({
                            id,
                            content,
                        }))}
                    />
                </Tabs>
            </div>
        </div>
    )
}

export default Option
