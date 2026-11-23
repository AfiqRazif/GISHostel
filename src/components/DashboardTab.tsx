import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BedDouble,
  Building,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  Plus,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  calculateResidentBilling,
  formatRM,
  formatTimestamp,
  getCurrentMonthISO,
  getPaymentBankRef,
  getPaymentReceiptNo,
  getPaymentRecordedBy,
  getPhysicalReceiptStatus,
  HOSTEL_LOCATIONS,
  HostelLocation,
  isCashPaymentType,
  Payment,
  Room,
  StaffRole,
  Student,
  TabKey,
} from '../types/hostel';
import { StatusBadge } from './StatusBadge';

interface DashboardTabProps {
  rooms: Room[];
  students: Student[];
  payments: Payment[];
  staffRole: StaffRole;
  loading: boolean;
  onNavigate: (tab: TabKey) => void;
  onRecordPayment: (studentId: string, amount: number) => void;
  onLoadSampleData: () => void;
  seedingData: boolean;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DashboardTab({
  rooms,
  students,
  payments,
  staffRole,
  loading,
  onNavigate,
  onRecordPayment,
  onLoadSampleData,
  seedingData,
}: DashboardTabProps) {
  const isViewer = staffRole === 'Viewer';
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthISO());
  const [watchlistSegment, setWatchlistSegment] = useState<'active' | 'checked-out'>('active');

  const scopedRooms = useMemo(() => {
    return locationFilter === 'All'
      ? rooms
      : rooms.filter((r) => r.location === locationFilter);
  }, [rooms, locationFilter]);

  const scopedStudents = useMemo(() => {
    return locationFilter === 'All'
      ? students
      : students.filter((s) => s.hostelLocation === locationFilter);
  }, [students, locationFilter]);

  const scopedPayments = useMemo(() => {
    return locationFilter === 'All'
      ? payments
      : payments.filter((p) => p.hostelLocation === locationFilter);
  }, [payments, locationFilter]);

  const studentBillings = useMemo(() => {
    return scopedStudents.map((student) => ({
      student,
      billing: calculateResidentBilling(student, payments),
    }));
  }, [scopedStudents, payments]);

  const metrics = useMemo(() => {
    const totalBeds = scopedRooms.length;
    const activeOccupiedBeds = scopedRooms.filter((r) => r.status === 'Occupied').length;
    const blockedBeds = scopedRooms.filter((r) => r.status === 'Reserved / Blocked').length;
    const vacantBeds = scopedRooms.filter((r) => r.status === 'Vacant').length;
    const maintenanceBeds = scopedRooms.filter((r) => r.status === 'Maintenance').length;
    const effectiveOccupied = activeOccupiedBeds + blockedBeds;
    const effectiveOccupancyPct =
      totalBeds > 0 ? (effectiveOccupied / totalBeds) * 100 : 0;

    const activeResidents = studentBillings.filter(
      ({ student }) => student.status === 'Active'
    );
    const expectedMonthlyRevenue = activeResidents.reduce(
      (sum, { billing }) => sum + billing.effectiveMonthlyFee,
      0
    );
    const totalMonthlyRebates = activeResidents.reduce(
      (sum, { billing }) => sum + billing.monthlyRebate,
      0
    );

    const monthPayments = scopedPayments.filter(
      (p) => p.billingMonth === selectedMonth
    );
    const cashCollectedMonth = monthPayments
      .filter(
        (p) =>
          p.status === 'Paid' &&
          p.paymentType === 'Monthly Rent' &&
          isCashPaymentType(p.paymentType)
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const waiversMonth = monthPayments
      .filter(
        (p) =>
          p.paymentType === 'Rebate / Fee Waiver' &&
          (p.status === 'Paid' || p.status === 'Waived')
      )
      .reduce((sum, p) => sum + p.amount, 0);

    const activeArrears = studentBillings
      .filter(({ student }) => student.status !== 'Checked-Out')
      .reduce((sum, { billing }) => sum + billing.outstandingBalance, 0);

    const alumniArrears = studentBillings
      .filter(({ student }) => student.status === 'Checked-Out')
      .reduce((sum, { billing }) => sum + billing.outstandingBalance, 0);

    const totalArrears = activeArrears + alumniArrears;

    const totalDepositsHeld = activeResidents.reduce(
      (sum, { student }) => sum + (student.depositPaid || 0),
      0
    );

    const pendingPhysicalReceiptsCount = scopedPayments.filter(
      (p) => getPhysicalReceiptStatus(p) === 'Pending Issuance'
    ).length;

    return {
      totalBeds,
      activeOccupiedBeds,
      blockedBeds,
      vacantBeds,
      maintenanceBeds,
      effectiveOccupancyPct,
      activeCount: activeResidents.length,
      expectedMonthlyRevenue,
      totalMonthlyRebates,
      cashCollectedMonth,
      waiversMonth,
      activeArrears,
      alumniArrears,
      totalArrears,
      totalDepositsHeld,
      pendingPhysicalReceiptsCount,
    };
  }, [scopedRooms, scopedPayments, studentBillings, selectedMonth]);

  const activeWatchlist = useMemo(() => {
    return studentBillings
      .filter(
        ({ student, billing }) =>
          student.status !== 'Checked-Out' && billing.outstandingBalance > 0
      )
      .sort((a, b) => b.billing.outstandingBalance - a.billing.outstandingBalance);
  }, [studentBillings]);

  const checkedOutWatchlist = useMemo(() => {
    return studentBillings
      .filter(
        ({ student, billing }) =>
          student.status === 'Checked-Out' && billing.outstandingBalance > 0
      )
      .sort((a, b) => b.billing.outstandingBalance - a.billing.outstandingBalance);
  }, [studentBillings]);

  const displayedWatchlist =
    watchlistSegment === 'active' ? activeWatchlist : checkedOutWatchlist;

  const locationBreakdown = useMemo(() => {
    return HOSTEL_LOCATIONS.map((loc) => {
      const locRooms = rooms.filter((r) => r.location === loc);
      const total = locRooms.length;
      const occupied = locRooms.filter((r) => r.status === 'Occupied').length;
      const blocked = locRooms.filter((r) => r.status === 'Reserved / Blocked').length;
      const vacant = locRooms.filter((r) => r.status === 'Vacant').length;
      const maintenance = locRooms.filter((r) => r.status === 'Maintenance').length;
      const occupancyPct =
        total > 0 ? Math.round(((occupied + blocked) / total) * 100) : 0;

      const activeEffectiveRevenue = students
        .filter((s) => s.status === 'Active' && s.hostelLocation === loc)
        .reduce(
          (sum, s) => sum + calculateResidentBilling(s, payments).effectiveMonthlyFee,
          0
        );
      const potentialRevenue = locRooms
        .filter((r) => r.status !== 'Maintenance')
        .reduce((sum, r) => sum + r.monthlyRate, 0);

      return {
        location: loc,
        total,
        occupied,
        blocked,
        vacant,
        maintenance,
        occupancyPct,
        activeEffectiveRevenue,
        potentialRevenue,
      };
    });
  }, [rooms, students, payments]);

  const recentAuditItems = useMemo(() => {
    type AuditRow = {
      key: string;
      entity: 'Room' | 'Resident' | 'Payment';
      recordId: string;
      summary: string;
      status: string;
      updatedBy: string;
      updatedAtMs: number;
      updatedAtLabel: string;
    };

    const items: AuditRow[] = [
      ...scopedRooms.map((r) => ({
        key: `room-${r.roomId}`,
        entity: 'Room' as const,
        recordId: r.roomId,
        summary: `${r.location} · ${formatRM(r.monthlyRate)}/mo`,
        status: r.status,
        updatedBy: r.updatedBy,
        updatedAtMs: r.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(r.updatedAt),
      })),
      ...scopedStudents.map((s) => ({
        key: `student-${s.studentId}`,
        entity: 'Resident' as const,
        recordId: s.studentId,
        summary: `${s.fullName} (${s.assignedRoomId})`,
        status: s.status,
        updatedBy: s.updatedBy,
        updatedAtMs: s.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(s.updatedAt),
      })),
      ...scopedPayments.map((p) => ({
        key: `payment-${p.paymentId}`,
        entity: 'Payment' as const,
        recordId: getPaymentReceiptNo(p),
        summary: `${p.studentName} · ${formatRM(p.amount)} (${p.paymentType})`,
        status: p.status,
        updatedBy: p.updatedBy,
        updatedAtMs: p.updatedAt?.toMillis?.() ?? 0,
        updatedAtLabel: formatTimestamp(p.updatedAt),
      })),
    ];

    return items.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 8);
  }, [scopedRooms, scopedStudents, scopedPayments]);

  const handleExportResidentBalancesCsv = () => {
    const headers = [
      'Resident ID',
      'Full Name',
      'Resident Type',
      'Occupancy Mode',
      'Program',
      'Hostel Location',
      'Assigned Room ID',
      'Status',
      'Check-In Date',
      'Check-Out Date',
      'Standard Room Rate (RM)',
      'Monthly Rebate (RM)',
      'Rebate Reason',
      'Effective Monthly Fee (RM)',
      'First Month Charge (RM)',
      'First Month Note',
      'Months Billed',
      'Total Expected Rent (RM)',
      'Total Rent Credited (RM)',
      'Outstanding Balance (RM)',
      'Deposit Paid (RM)',
      'Phone',
      'Emergency Contact',
    ];
    const rows = studentBillings
      .sort((a, b) => b.billing.outstandingBalance - a.billing.outstandingBalance)
      .map(({ student, billing }) => [
        student.studentId,
        student.fullName,
        billing.residentType,
        billing.occupancyMode,
        student.program,
        student.hostelLocation,
        student.assignedRoomId,
        student.status,
        student.checkInDate,
        student.checkOutDate || '',
        billing.standardRoomRate.toFixed(2),
        billing.monthlyRebate.toFixed(2),
        billing.rebateReason,
        billing.effectiveMonthlyFee.toFixed(2),
        billing.firstMonthCharge.toFixed(2),
        billing.firstMonthNote,
        billing.monthsBilled,
        billing.totalExpectedRent.toFixed(2),
        billing.totalRentCredited.toFixed(2),
        billing.outstandingBalance.toFixed(2),
        (student.depositPaid || 0).toFixed(2),
        student.phone,
        student.emergencyContact,
      ]);

    const locSlug =
      locationFilter === 'All'
        ? 'all-locations'
        : locationFilter.toLowerCase().replace(/\s+/g, '-');
    downloadCsvFile(
      `gis-resident-balances-${locSlug}-${selectedMonth}.csv`,
      headers,
      rows
    );
  };

  const handleExportPaymentLedgerCsv = () => {
    const headers = [
      'Receipt No',
      'Payment ID',
      'Billing Month',
      'Transaction Date',
      'Resident ID',
      'Resident Name',
      'Room ID',
      'Hostel Location',
      'Payment Type',
      'Payment Method',
      'Bank Ref No',
      'Amount (RM)',
      'Status',
      'Physical Receipt Status',
      'Physical Receipt No',
      'Cash Received (RM)',
      'Notes',
      'Recorded By',
    ];
    const rows = [...scopedPayments]
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''))
      .map((p) => [
        getPaymentReceiptNo(p),
        p.paymentId,
        p.billingMonth,
        p.paymentDate,
        p.studentId,
        p.studentName,
        p.roomId,
        p.hostelLocation,
        p.paymentType,
        p.paymentMethod,
        getPaymentBankRef(p),
        p.amount.toFixed(2),
        p.status,
        getPhysicalReceiptStatus(p),
        p.physicalReceiptNo || '',
        p.status === 'Paid' && isCashPaymentType(p.paymentType)
          ? p.amount.toFixed(2)
          : '0.00',
        p.notes,
        getPaymentRecordedBy(p),
      ]);

    const locSlug =
      locationFilter === 'All'
        ? 'all-locations'
        : locationFilter.toLowerCase().replace(/\s+/g, '-');
    downloadCsvFile(
      `gis-payment-ledger-${locSlug}-${selectedMonth}.csv`,
      headers,
      rows
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200 rounded-xl p-5 h-32 animate-pulse"
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
          Start by loading sample GIS Nilai rooms, residents, and RM payment
          records for Apartment Desa Jati 2 and Nilai Square, or add rooms
          manually in Room Inventory.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!isViewer && (
            <button
              type="button"
              onClick={onLoadSampleData}
              disabled={seedingData}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {seedingData ? 'Loading Sample Data...' : 'Load Sample GIS Data'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('rooms')}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            Go to Room Inventory
          </button>
        </div>
        {isViewer && (
          <p className="text-xs text-amber-800 mt-4">
            Read-Only Viewer Mode — Contact a Master Admin or Staff member to initialize hostel data.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter & Export Reports Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="dash-location" className="sr-only">
              Hostel Location
            </label>
            <select
              id="dash-location"
              value={locationFilter}
              onChange={(e) =>
                setLocationFilter(e.target.value as 'All' | HostelLocation)
              }
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
            >
              <option value="All">All Locations</option>
              {HOSTEL_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="dash-month"
              className="text-xs font-medium text-slate-500 whitespace-nowrap"
            >
              Collection Month:
            </label>
            <input
              id="dash-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <span className="text-xs font-medium text-slate-500 mr-1 hidden sm:inline">
            Export Reports:
          </span>
          <button
            type="button"
            onClick={handleExportResidentBalancesCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Resident Balances &amp; Status (.csv)</span>
          </button>
          <button
            type="button"
            onClick={handleExportPaymentLedgerCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Payment Ledger (.csv)</span>
          </button>
        </div>
      </div>

      {/* 6-Card KPI Strip (3x2 grid) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* KPI 1: Bed Capacity Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Bed Capacity</span>
            <BedDouble className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {metrics.effectiveOccupancyPct.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-600 mt-1 tabular-nums">
            {metrics.activeOccupiedBeds} Occupied · {metrics.blockedBeds} Blocked ·{' '}
            <strong className="text-emerald-700">{metrics.vacantBeds} Vacant</strong>
          </p>
          {metrics.maintenanceBeds > 0 && (
            <p className="text-xs text-amber-700 mt-0.5 tabular-nums">
              {metrics.maintenanceBeds} Maintenance ({metrics.totalBeds} total)
            </p>
          )}
        </div>

        {/* KPI 2: Expected Monthly Revenue */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Expected Monthly Revenue</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 mt-2 font-mono tabular-nums">
            {formatRM(metrics.expectedMonthlyRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.activeCount} active residents · -{formatRM(metrics.totalMonthlyRebates)} rebates
          </p>
        </div>

        {/* KPI 3: Cash/Bank Collected This Month */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Collected ({selectedMonth})</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-emerald-700 mt-2 font-mono tabular-nums">
            {formatRM(metrics.cashCollectedMonth)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Rent cash/bank only · {formatRM(metrics.waiversMonth)} waived
          </p>
        </div>

        {/* KPI 4: Cumulative Outstanding Arrears */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Cumulative Arrears</span>
            <AlertCircle className="w-4 h-4 text-slate-400" />
          </div>
          <p
            className={`font-display text-2xl font-bold mt-2 font-mono tabular-nums ${
              metrics.totalArrears > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {formatRM(metrics.totalArrears)}
          </p>
          <div className="text-xs text-slate-600 mt-1 tabular-nums space-y-0.5">
            <p>
              Active: <strong className="text-slate-900">{formatRM(metrics.activeArrears)}</strong>
            </p>
            <p>
              Alumni: <strong className="text-slate-900">{formatRM(metrics.alumniArrears)}</strong>
            </p>
          </div>
        </div>

        {/* KPI 5: Total Security Deposits Held */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Security Deposits Held</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <p className="font-display text-2xl font-bold text-blue-900 mt-2 font-mono tabular-nums">
            {formatRM(metrics.totalDepositsHeld)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Across {metrics.activeCount} active resident contracts
          </p>
        </div>

        {/* KPI 6: Pending Physical Receipts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Pending Physical Receipts</span>
              <FileCheck2 className="w-4 h-4 text-slate-400" />
            </div>
            <p
              className={`font-display text-2xl font-bold mt-2 font-mono tabular-nums ${
                metrics.pendingPhysicalReceiptsCount > 0
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {metrics.pendingPhysicalReceiptsCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Awaiting physical receipt book issuance
            </p>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              <span>Review in Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Overdue & Arrears Watchlist */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Overdue &amp; Arrears Watchlist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cumulative expected rent minus settled rent payments &amp; fee waivers
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setWatchlistSegment('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                watchlistSegment === 'active'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Residents ({activeWatchlist.length})
            </button>
            <button
              type="button"
              onClick={() => setWatchlistSegment('checked-out')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                watchlistSegment === 'checked-out'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Past / Checked-Out ({checkedOutWatchlist.length})
            </button>
          </div>
        </div>

        {displayedWatchlist.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No outstanding arrears for{' '}
            {watchlistSegment === 'active'
              ? 'Active Residents'
              : 'Past / Checked-Out Residents'}
            {locationFilter !== 'All' ? ` at ${locationFilter}` : ''}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Resident</th>
                  <th className="py-3 px-4">Room / Hostel</th>
                  <th className="py-3 px-4">Tenancy</th>
                  <th className="py-3 px-4 text-right">Expected Rent</th>
                  <th className="py-3 px-4 text-right">Credited</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4">Status</th>
                  {!isViewer && <th className="py-3 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {displayedWatchlist.map(({ student, billing }) => (
                  <tr key={student.studentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{student.fullName}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        {student.studentId} · {billing.residentType}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {student.assignedRoomId || 'Room Unassigned'}
                      </p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">
                        {student.hostelLocation || 'Unassigned'}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      <p>
                        {student.checkInDate}
                        {student.checkOutDate ? ` → ${student.checkOutDate}` : ' → Present'}
                      </p>
                      <p className="text-slate-400">
                        {billing.monthsBilled} mo × {formatRM(billing.effectiveMonthlyFee)}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {formatRM(billing.totalExpectedRent)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 tabular-nums whitespace-nowrap">
                      {formatRM(billing.totalRentCredited)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-bold text-red-700 tabular-nums whitespace-nowrap">
                      {formatRM(billing.outstandingBalance)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={student.status} />
                    </td>
                    {!isViewer && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onRecordPayment(student.studentId, billing.outstandingBalance)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Record Payment</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Location Occupancy & Recent Staff Audit Trail */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Hostel Occupancy by Location
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Live bed capacity &amp; effective monthly yield
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('rooms')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              <span>Inventory</span>
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
                      {item.occupied} Occ · {item.blocked} Blk · {item.vacant} Vac · {item.maintenance} Maint
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                      {formatRM(item.activeEffectiveRevenue)}
                      <span className="text-xs font-normal text-slate-500">
                        {' '}
                        / {formatRM(item.potentialRevenue)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {item.occupancyPct}% effective ({item.total} beds)
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
                        className="bg-indigo-400 h-full"
                        style={{ width: `${(item.blocked / item.total) * 100}%` }}
                        title={`Reserved / Blocked: ${item.blocked}`}
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

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Staff Audit Activity
              </h2>
            </div>
            <span className="text-xs text-slate-500">Latest writes</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">ID / Receipt</th>
                  <th className="py-2.5 px-4">Details</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Staff</th>
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
                    <td className="py-2.5 px-4 text-xs text-slate-700 max-w-[200px] truncate">
                      {row.summary}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 truncate max-w-[140px]">
                      {row.updatedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
