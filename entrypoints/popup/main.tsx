import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './style.css'

// Popup entry point. StrictMode double-invokes effects in development, which is
// deliberate here: the settings components load from extension storage on mount,
// and that has to stay idempotent.
ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
