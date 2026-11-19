import { useMemo } from 'react';
import {
  ArrowUpRight,
  BedDouble,
  Building,
  Clock,
  CreditCard,
  Users,
} from 'lucide-react';
import {
  formatRM,
  formatTimestamp,
  getCurrentMonthISO,
  HOSTEL_LOCATIONS,
  Payment,
  Room,
  Student,
  TabKey,
} from '../types/hostel';
import { StatusBadge } from './StatusBadge';

interface DashboardTabProps {
  rooms: Room[];
  students: Student[];
  payments: Payment[];
  loading: boolean;
  onNavigate: (tab: TabKey) => void;
  onLoadSampleData: () => void;
  seedingData: boolean;
}

export function DashboardTab({
  rooms,
  students,
  payments,
  loading,
  onNavigate,
  onLoadSampleData,
  seedingData,
}: DashboardTabProps) {
  const currentMonth = getCurrentMonthISO();

  const metrics = useMemo(() => {
    const totalBeds = rooms.length;
    const occupiedBeds = rooms.filter((r) => r.status === 'Occupied').length;
    const vacantBeds = rooms.filter((r) => r.status === 'Vacant').length;
    const maintenanceBeds = rooms.filter((r) => r.status === 'Maintenance').length;
    const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

    const activeStudents = students.filter((s) => s.status === 'Active').length;
    const suspendedStudents = students.filter((s) => s.status === 'Suspended').length;
    const checkedOutStudents = students.filter((s) => s.status === 'Checked-Out').length;

    const monthPayments = payments.filter((p) => p.billingMonth === currentMonth);
    const collectedMonth = monthPayments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const outstandingMonth = monthPayments
      .filter((p) => p.status === 'Pending' || p.status === 'Overdue')
      .reduce((sum, p) => sum + p.amount, 0);
    const expectedMonthlyRent = students
      .filter((s) => s.status === 'Active')
      .reduce((sum, s) => sum + s.monthlyFee, 0);

    return {
      totalBeds,
      occupiedBeds,
      vacantBeds,
      maintenanceBeds,
      occupancyRate,
      activeStudents,
      suspendedStudents,
      checkedOutStudents,
      collectedMonth,
      outstandingMonth,
      expectedMonthlyRent,
    };
  }, [rooms, students, payments, currentMonth]);

  const locationBreakdown = useMemo(() => {
    return HOSTEL_LOCATIONS.map((loc) => {
      const locRooms = rooms.filter((r) => r.location === loc);
      const total = locRooms.length;
      const occupied = locRooms.filter((r) => r.status === 'Occupied').length;
      const vacant = locRooms.filter((r) => r.status === 'Vacant').length;
      const maintenance = locRooms.filter((r) => r.status === 'Maintenance').length;
      const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;
      const activeRevenue = locRooms
        .filter((r) => r.status === 'Occupied')
        .reduce((sum, r) => sum + r.monthlyRate, 0);
      const potentialRevenue = locRooms
        .filter((r) => r.status !== 'Maintenance')
        .reduce((sum, r) => sum + r.monthlyRate, 0);

      return {
        location: loc,
        total,
        occupied,
        vacant,
        maintenance,
        occupancyPct,
        activeRevenue,
        potentialRevenue,
      };
    });
  }, [rooms]);

  const attentionPayments = useMemo(() => {
    return payments
      .filter((p) => p.status === 'Overdue' || p.status === 'Pending')
      .slice(0, 5);
  }, [payments]);

  const recentAuditItems = useMemo(() => {
    type AuditRow = {
      key: string;
      entity: 'Room' | 'Student' | 'Payment';
      recordId: string;
      summary: string;
      status: string;
      updatedBy: string;
      updatedAtMs: number;
      updatedAtLabel: string;
    };

    const items: AuditRow[] = [
      ...rooms.map((r) => ({
        key: `room-${r.roomId}`,
        entity: 'Room' as const,
        recordId: r.roomId,
        summary: `${r.location} · ${formatRM(r.monthlyRate)}/mo`,
        status: r.status,
        updatedBy: r.updatedBy,
        updatedAtMs: r.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(r.updatedAt),
      })),
      ...students.map((s) => ({
        key: `student-${s.studentId}`,
        entity: 'Student' as const,
        recordId: s.studentId,
        summary: `${s.fullName} (${s.assignedRoomId})`,
        status: s.status,
        updatedBy: s.updatedBy,
        updatedAtMs: s.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(s.updatedAt),
      })),
      ...payments.map((p) => ({
        key: `payment-${p.paymentId}`,
        entity: 'Payment' as const,
        recordId: p.paymentId,
        summary: `${p.studentName} · ${formatRM(p.amount)}`,
        status: p.status,
        updatedBy: p.updatedBy,
        updatedAtMs: p.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(p.updatedAt),
      })),
    ];

    return items.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 8);
  }, [rooms, students, payments]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200 rounded-xl p-5 h-28 animate-pulse"
            />
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl h-64 animate-pulse" />
      </div>
    );
  }

  if (rooms.length === 0 && students.length === 0 && payments.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-2xl mx-auto mt-6">
        <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center mx-auto mb-4">
          <Building className="w-6 h-6" />
        </div>
        <h2 className="font-display text-xl font-semibold text-slate-900">
          Hostel Database is Currently Empty
        </h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
          Start by loading sample GIS Nilai rooms, students, and RM payment
          records for Apartment Desa Jati 2 and Nilai Square, or add rooms
          manually in Room Inventory.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onLoadSampleData}
            disabled={seedingData}
            className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {seedingData ? 'Loading Sample Data...' : 'Load Sample GIS Data'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('rooms')}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Go to Room Inventory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Card KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Bed Occupancy</span>
            <BedDouble className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {metrics.occupancyRate.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.occupiedBeds} occupied of {metrics.totalBeds} total beds
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Vacant Beds Ready</span>
            <Building className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
            {metrics.vacantBeds}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.maintenanceBeds} under maintenance
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Residents</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {metrics.activeStudents}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.suspendedStudents} suspended · {metrics.checkedOutStudents} checked out
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Collected ({currentMonth})</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {formatRM(metrics.collectedMonth)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatRM(metrics.outstandingMonth)} pending · Est. {formatRM(metrics.expectedMonthlyRent)}/mo
          </p>
        </div>
      </section>

      {/* Location Occupancy & Outstanding Payments */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Hostel Occupancy by Location
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live bed capacity and active monthly rental yield
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('rooms')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              <span>Manage Inventory</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {locationBreakdown.map((item) => (
              <div key={item.location} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.location}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                      {item.occupied} Occupied · {item.vacant} Vacant · {item.maintenance} Maintenance
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">
                      {formatRM(item.activeRevenue)}
                      <span className="text-xs font-normal text-slate-500">
                        {' '}
                        / {formatRM(item.potentialRevenue)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {item.occupancyPct}% of {item.total} beds filled
                    </p>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  {item.total > 0 && (
                    <>
                      <div
                        className="bg-blue-900 h-full"
                        style={{ width: `${(item.occupied / item.total) * 100}%` }}
                        title={`Occupied: ${item.occupied}`}
                      />
                      <div
                        className="bg-amber-400 h-full"
                        style={{ width: `${(item.maintenance / item.total) * 100}%` }}
                        title={`Maintenance: ${item.maintenance}`}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Pending &amp; Overdue Dues
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unsettled student hostel fees
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              <span>View Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {attentionPayments.length === 0 ? (
            <div className="my-auto py-8 text-center text-sm text-slate-500">
              All recorded student payments are settled.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {attentionPayments.map((p) => (
                <div
                  key={p.paymentId}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {p.studentName}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums truncate">
                      {p.roomId} · {p.billingMonth} · {p.paymentType}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                      {formatRM(p.amount)}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Multi-Staff Audit Trail */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Staff Audit Activity
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Latest database writes with staff attribution
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Record ID</th>
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Updated By</th>
                <th className="py-2.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {recentAuditItems.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                    {row.entity}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                    {row.recordId}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate">
                    {row.summary}
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {row.updatedBy}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-500 text-right tabular-nums whitespace-nowrap">
                    {row.updatedAtLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
