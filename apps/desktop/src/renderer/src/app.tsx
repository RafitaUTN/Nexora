import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardPage } from '@/pages/dashboard-page'
import { DocumentsPage } from '@/pages/documents-page'
import { DocumentDetailPage } from '@/pages/document-detail-page'
import { SourcesPage } from '@/pages/sources-page'
import { SettingsPage } from '@/pages/settings-page'
import { BackupsPage } from '@/pages/backups-page'
import { AutomationsPage } from '@/pages/automations-page'
import { HistoryPage } from '@/pages/history-page'
import { TagsPage } from '@/pages/tags-page'

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:id" element={<DocumentDetailPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Route>
    </Routes>
  )
}
