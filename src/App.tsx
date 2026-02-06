import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { hasToken, clearToken } from './lib/api';
import { SiteContext, useSiteProvider } from './hooks/useSites';
import AuthModal from './components/AuthModal';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ContentListPage from './pages/ContentListPage';
import ContentDetailPage from './pages/ContentDetailPage';
import TopicsPage from './pages/TopicsPage';
import RunsPage from './pages/RunsPage';
import ReviewPage from './pages/ReviewPage';

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const siteProvider = useSiteProvider();

  if (!authed) {
    return <AuthModal onAuth={() => { setAuthed(true); siteProvider.reload(); }} />;
  }

  if (siteProvider.loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Loading sites...</p>
        </div>
      </div>
    );
  }

  if (siteProvider.error) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-500 text-sm mb-4">Failed to load: {siteProvider.error}</p>
          <button 
            onClick={() => { clearToken(); setAuthed(false); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Try different token
          </button>
        </div>
      </div>
    );
  }

  return (
    <SiteContext.Provider value={siteProvider}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout onLogout={() => { clearToken(); setAuthed(false); }} />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/content" element={<ContentListPage />} />
            <Route path="/content/:id" element={<ContentDetailPage />} />
            <Route path="/content/:id/review" element={<ReviewPage />} />
            <Route path="/topics" element={<TopicsPage />} />
            <Route path="/runs" element={<RunsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SiteContext.Provider>
  );
}
