import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { hasToken } from './lib/api';
import { SiteContext, useSiteProvider } from './hooks/useSites';
import AuthModal from './components/AuthModal';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ContentListPage from './pages/ContentListPage';
import ContentDetailPage from './pages/ContentDetailPage';
import TopicsPage from './pages/TopicsPage';
import RunsPage from './pages/RunsPage';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const siteProvider = useSiteProvider();

  if (!authed) {
    return <AuthModal onAuth={() => setAuthed(true)} />;
  }

  return (
    <SiteContext.Provider value={siteProvider}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout onLogout={() => setAuthed(false)} />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/content" element={<ContentListPage />} />
            <Route path="/content/:id" element={<ContentDetailPage />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/runs" element={<RunsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SiteContext.Provider>
  );
}
