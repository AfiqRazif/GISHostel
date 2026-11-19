import {
  BedDouble,
  Building2,
  CreditCard,
  LayoutDashboard,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { StaffRole, TabKey } from '../types/hostel';

interface SidebarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  staffRole?: StaffRole;
  counts: {
    vacantBeds: number;
    totalBeds: number;
    activeStudents: number;
    pendingPayments: number;
    staffUsers?: number;
  };
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  key: TabKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'students', label: 'Students', icon: Users },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'rooms', label: 'Room Inventory', icon: BedDouble },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  staffRole,
  counts,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const handleSelect = (key: TabKey) => {
    onSelectTab(key);
    onCloseMobile();
  };

  const navItems =
    staffRole === 'Master Admin'
      ? [
          ...NAV_ITEMS,
          { key: 'users' as TabKey, label: 'User Accounts', icon: UserCog },
        ]
      : NAV_ITEMS;

  const getCountText = (key: TabKey): string | null => {
    switch (key) {
      case 'rooms':
        return `${counts.vacantBeds}/${counts.totalBeds} free`;
      case 'students':
        return `${counts.activeStudents} active`;
      case 'payments':
        return counts.pendingPayments > 0
          ? `${counts.pendingPayments} due`
          : null;
      case 'users':
        return typeof counts.staffUsers === 'number'
          ? `${counts.staffUsers}`
          : null;
      default:
        return null;
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-slate-900 truncate">
              GIS Nilai
            </p>
            <p className="text-xs text-slate-500 truncate">Hostel Management</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          const metaText = getCountText(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelect(item.key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                />
                <span>{item.label}</span>
              </span>
              {metaText && (
                <span
                  className={`text-xs tabular-nums whitespace-nowrap ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {metaText}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">GIS Hostel Properties</p>
        <p>Apartment Desa Jati 2 · Nilai Square</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 print:hidden">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
