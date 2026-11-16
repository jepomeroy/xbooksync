import React from 'react'
import ReactDOM from 'react-dom/client'
import Option from './Option.tsx'
import '../shared/style.css'
import { applyDocumentLocale, t } from '../shared/i18n'

applyDocumentLocale()
document.title = t('optionsTitle')

// Options page entry point. StrictMode double-invokes effects in development,
// which is deliberate here: the settings components load from extension
// storage on mount, and that has to stay idempotent.
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Option />
    </React.StrictMode>,
)
