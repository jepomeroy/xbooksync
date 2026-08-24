import { FaCircleQuestion } from 'react-icons/fa6'
import { FaBug } from 'react-icons/fa6'

/** Help panel: outbound links to the docs and the issue tracker. */
export default function HelpPage() {
    return (
        <div className='card'>
            <h3>Help</h3>
            <div className='setting-group'>
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
