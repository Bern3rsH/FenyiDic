import React from 'react'
import ReactDOM from 'react-dom/client'
import ReadingApp from './ReadingApp'
import './styles/index.css'
import { initializeRendererTelemetry } from './telemetry'

initializeRendererTelemetry('reading')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReadingApp />
  </React.StrictMode>
)
