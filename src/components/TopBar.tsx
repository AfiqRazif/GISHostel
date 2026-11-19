import type { User } from 'firebase/auth';
import { Database, LogOut, Menu } from 'lucide-react';
import type { TabKey } from '../types/hostel';

interface TopBarProps {
  activeTab: TabKey;
  user: User;
  isDatabaseEmpty: boolean;
  seedingData: boolean;
  onLoadSampleData: () => void;
  onSignOut: () => void;
  onOpenMobileMenu: () => void;
}

const TAB_TITLES: Record<TabKey, string> = {
  dashboard: 'Dashboard Overview',
  students: 'Student Residency',
  payments: 'Payments & Fee Ledger',
  rooms: 'Room Inventory',
};

export function TopBar({
  activeTab,
  user,
  isDatabaseEmpty,
  seedingData,
  onLoadSampleData,
  onSignOut,
  onOpenMobileMenu,
}: TopBarProps) {
  const displayName = user.displayName || user.email?.split('@')[0] || 'GIS Staff';
  const email = user.email || '';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-500 whitespace-nowrap">
            GIS Nilai Hostel
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">
            /
          </span>
          <h1 className="font-display text-base font-semibold text-slate-900 truncate">
            {TAB_TITLES[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        {isDatabaseEmpty && (
          <button
            type="button"
            onClick={onLoadSampleData}
            disabled={seedingData}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {seedingData ? 'Loading Sample Data...' : 'Load Sample GIS Data'}
            </span>
          </button>
        )}

        <div className="hidden md:flex flex-col items-end text-right min-w-0">
          <span className="text-xs font-semibold text-slate-900 truncate max-w-[180px]">
            {displayName}
          </span>
          <span className="text-xs text-slate-500 truncate max-w-[220px]">
            {email}
          </span>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-500" />
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
}
