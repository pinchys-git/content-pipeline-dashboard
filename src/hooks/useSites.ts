import { useState, useEffect, createContext, useContext } from 'react';
import type { Site } from '../lib/types';
import { fetchSites } from '../lib/api';

interface SiteContextType {
  sites: Site[];
  selectedSite: Site | null;
  setSelectedSite: (site: Site) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export const SiteContext = createContext<SiteContextType>({
  sites: [],
  selectedSite: null,
  setSelectedSite: () => {},
  loading: false,
  error: null,
  reload: () => {},
});

export function useSiteProvider() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const reload = () => setRetryCount((c) => c + 1);

  useEffect(() => {
    // Don't fetch if no token yet
    const token = localStorage.getItem('pipeline_token');
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSites()
      .then((s) => {
        setSites(s);
        const saved = localStorage.getItem('selected_site_id');
        const match = saved ? s.find((site) => site.id === saved) : null;
        setSelectedSite(match || s[0] || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [retryCount]);

  const selectSite = (site: Site) => {
    setSelectedSite(site);
    localStorage.setItem('selected_site_id', site.id);
  };

  return { sites, selectedSite, setSelectedSite: selectSite, loading, error, reload };
}

export function useSites() {
  return useContext(SiteContext);
}
