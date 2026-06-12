import React from 'react'
import ReactDOM from 'react-dom/client'
import ReviewApp from './ReviewApp'
import './styles/index.css'
import { initializeRendererTelemetry } from './telemetry'
import { LocalizationProvider } from './localization'

initializeRendererTelemetry('review')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocalizationProvider>
      <ReviewApp />
    </LocalizationProvider>
  </React.StrictMode>
)
