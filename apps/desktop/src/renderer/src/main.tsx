import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toast'
import { queryClient } from '@/lib/query-client'
import { useAppEvents } from '@/lib/events'
import App from './app'
import './index.css'

function AppContent(): JSX.Element {
  useAppEvents()
  return <App />
}

function Root(): JSX.Element {
  return (
    <HashRouter>
      <QueryClientProvider client={queryClient}>
        <AppContent />
        <Toaster />
      </QueryClientProvider>
    </HashRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
