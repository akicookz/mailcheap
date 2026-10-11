import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loading } from "@/components/app-ui";
import AuthGuard from "@/components/AuthGuard";
import ErrorBoundary from "@/components/ErrorBoundary";
import Overview from "@/pages/Overview";
import CampaignList from "@/pages/CampaignList";
import NewsletterList from "@/pages/NewsletterList";
import NewsletterSettings from "@/pages/NewsletterSettings";
import Contacts from "@/pages/Contacts";
import SettingsPage from "@/pages/SettingsPage";
import DomainsPage from "@/pages/DomainsPage";
import DomainDetailsPage from "@/pages/DomainDetailsPage";
import Layout from "@/components/Layout";
const CampaignEditor = lazy(() => import("@/pages/CampaignEditor"));
export default function App() {
  return (
    <ErrorBoundary>
      <AuthGuard>
        {(onLogout) => (
          <Routes>
            <Route element={<Layout onLogout={onLogout} />}>
              <Route index element={<Overview />} />
              <Route path="campaigns" element={<CampaignList />} />
              <Route
                path="campaigns/:id"
                element={
                  <Suspense fallback={<Loading />}>
                    <CampaignEditor />
                  </Suspense>
                }
              />
              <Route path="contacts" element={<Contacts />} />
              <Route path="newsletters" element={<NewsletterList />} />
              <Route path="newsletters/:id" element={<NewsletterSettings />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="domains" element={<DomainsPage />} />
              <Route path="domains/:name" element={<DomainDetailsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </AuthGuard>
    </ErrorBoundary>
  );
}
