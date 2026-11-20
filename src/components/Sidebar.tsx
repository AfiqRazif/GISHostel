import {
  BedDouble,
  Building2,
  CreditCard,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { StaffRole, TabKey } from '../types/hostel';

export type SidebarMode = 'expanded' | 'collapsed' | 'hidden';

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
  sidebarMode: SidebarMode;
  onToggleCollapse: () => void;
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
  sidebarMode,
  onToggleCollapse,
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

  const renderNavContent = (isCollapsed: boolean) => (
    <div
      className={`flex flex-col h-full bg-white border-r border-slate-200 transition-[width] duration-200 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div
        className={`h-16 flex items-center border-b border-slate-200 shrink-0 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand navigation sidebar"
              aria-label="Expand navigation sidebar"
              className="w-9 h-9 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0 hover:bg-blue-800 transition-colors cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
            </button>
          ) : (
            <>
              <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 truncate">
                  GIS Nilai
                </p>
                <p className="text-xs text-slate-500 truncate">Hostel Management</p>
              </div>
            </>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse sidebar to icon rail"
              aria-label="Collapse sidebar to icon rail"
              className="hidden lg:inline-flex p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <nav
        className={`flex-1 p-2.5 space-y-1 ${
          isCollapsed ? 'overflow-visible' : 'overflow-y-auto'
        }`}
        aria-label="Primary"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          const metaText = getCountText(item.key);
          const tooltipLabel = metaText ? `${item.label} (${metaText})` : item.label;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelect(item.key)}
              title={isCollapsed ? tooltipLabel : undefined}
              aria-label={isCollapsed ? tooltipLabel : undefined}
              className={`group relative w-full flex items-center ${
                isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
              } gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
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
                {!isCollapsed && <span>{item.label}</span>}
              </span>
              {!isCollapsed && metaText && (
                <span
                  className={`text-xs tabular-nums whitespace-nowrap ${
                    isActive ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {metaText}
                </span>
              )}
              {isCollapsed && (
                <span
                  role="tooltip"
                  className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-50"
                >
                  {tooltipLabel}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {isCollapsed ? (
        <div className="p-2.5 border-t border-slate-200 flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="group relative w-full py-2 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
            <span
              role="tooltip"
              className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-50"
            >
              Expand sidebar
            </span>
          </button>
        </div>
      ) : (
        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1 shrink-0">
          <p className="font-medium text-slate-700">GIS Hostel Properties</p>
          <p>Apartment Desa Jati 2 · Nilai Square</p>
        </div>
      )}
    </div>
  );

  const isDesktopCollapsed = sidebarMode === 'collapsed';
  const isDesktopHidden = sidebarMode === 'hidden';

  return (
    <>
      {!isDesktopHidden && (
        <aside className="hidden lg:block shrink-0 print:hidden">
          {renderNavContent(isDesktopCollapsed)}
        </aside>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex print:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{renderNavContent(false)}</div>
        </div>
      )}
    </>
  );
}
