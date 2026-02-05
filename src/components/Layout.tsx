import { NavLink, Outlet } from 'react-router-dom';
import { useSites } from '../hooks/useSites';
import { clearToken } from '../lib/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⬡' },
  { to: '/content', label: 'Content', icon: '◈' },
  { to: '/topics', label: 'Topics', icon: '◉' },
  { to: '/runs', label: 'Runs', icon: '▸' },
];

interface Props {
  onLogout: () => void;
}

export default function Layout({ onLogout }: Props) {
  const { sites, selectedSite, setSelectedSite } = useSites();

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <h1 className="text-base font-semibold text-gray-900 tracking-tight">Pipeline</h1>
              <nav className="hidden sm:flex items-center gap-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span className="mr-1.5">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedSite?.id || ''}
                onChange={(e) => {
                  const site = sites.find((s) => s.id === e.target.value);
                  if (site) setSelectedSite(site);
                }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={() => { clearToken(); onLogout(); }}
                className="text-sm text-gray-400 hover:text-gray-600 transition"
                title="Sign out"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="sm:hidden border-t border-gray-100 px-4 py-2 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}
