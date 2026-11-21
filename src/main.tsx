import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { OnlineGate } from './components/online/OnlineGate.js'
import { setupTheme } from './app/theme.js'
import { ONLINE_MODE } from './services/online/mode.js'
import { ensureKatex } from './services/markdown/katex.js'
import { registerServiceWorker } from './pwa/register.js'
import './app/theme.css'
import './app/global.css'

ensureKatex()
setupTheme()
registerServiceWorker()

createRoot(document.getElementById('root') as HTMLElement).render(
  ONLINE_MODE ? (
    <OnlineGate>
      <App />
    </OnlineGate>
  ) : (
    <App />
  )
)
