import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import {
  calculateFirstMonthDefaults,
  calculateResidentBilling,
  DATE_REGEX,
  formatRM,
  getLocationPrefix,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  isCashPaymentType,
  isSettledPaymentStatus,
  Payment,
  ResidentHostelLocation,
  Room,
  sanitizeIdSegment,
  StaffRole,
  Student,
} from '../types/hostel';

interface ReportsTabProps {
  rooms: Room[];
  students: Student[];
  payments: Payment[];
  staffRole: StaffRole;
  staffName: string;
  staffEmail: string;
  loading: boolean;
}

type ReportSubView = 'collection' | 'defaulters';
type MonthRangeKey = 'FULL' | 'H1' | 'H2';
type DefaulterStatusFilter = 'All' | 'Active' | 'Checked-Out';
type SeverityTier = 'Critical' | 'High' | 'Moderate';

const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

interface MonthCellData {
  tenantCount: number;
  expected: number;
  actual: number;
}

interface UnitSummaryRow {
  unitKey: string;
  unitCode: string;
  location: HostelLocation;
  block: string;
  unitNo: string;
  bedLabels: string[];
  totalBeds: number;
  standardMonthlyRate: number;
  optimalMonthlyRent: number;
  months: MonthCellData[]; // length 12
  periodExpected: number;
  periodActual: number;
  periodOutstanding: number;
  isArchived?: boolean;
}

interface SectionTotals {
  totalBeds: number;
  optimalMonthlyRent: number;
  optimalPeriodPotential: number;
  monthlyExpected: number[];
  monthlyActual: number[];
  monthlyTenants: number[];
  totalExpected: number;
  totalActual: number;
  totalOutstanding: number;
}

interface DefaulterRow {
  rank: number;
  student: Student;
  severity: SeverityTier;
  monthsOverdue: number;
  currentOrLastUnit: string;
  hostelLocation: ResidentHostelLocation;
  monthlyRate: number;
  totalExpected: number;
  totalPaid: number;
  lastPaymentDate: string | null;
  outstandingBalance: number;
}

function roundMoney(val: number): number {
  return Math.round((val || 0) * 100) / 100;
}

function formatCompactMoney(val: number): string {
  const num = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
  return num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computeSectionTotals(
  rows: UnitSummaryRow[],
  monthIndices: number[]
): SectionTotals {
  const monthlyExpected = Array.from({ length: 12 }, () => 0);
  const monthlyActual = Array.from({ length: 12 }, () => 0);
  const monthlyTenants = Array.from({ length: 12 }, () => 0);

  let totalBeds = 0;
  let optimalMonthlyRent = 0;
  let totalExpected = 0;
  let totalActual = 0;

  for (const row of rows) {
    totalBeds += row.totalBeds;
    optimalMonthlyRent += row.optimalMonthlyRent;
    totalExpected += row.periodExpected;
    totalActual += row.periodActual;
    for (const idx of monthIndices) {
      monthlyExpected[idx] += row.months[idx].expected;
      monthlyActual[idx] += row.months[idx].actual;
      monthlyTenants[idx] += row.months[idx].tenantCount;
    }
  }

  return {
    totalBeds,
    optimalMonthlyRent: roundMoney(optimalMonthlyRent),
    optimalPeriodPotential: roundMoney(optimalMonthlyRent * monthIndices.length),
    monthlyExpected: monthlyExpected.map(roundMoney),
    monthlyActual: monthlyActual.map(roundMoney),
    monthlyTenants,
    totalExpected: roundMoney(totalExpected),
    totalActual: roundMoney(totalActual),
    totalOutstanding: roundMoney(totalExpected - totalActual),
  };
}

function parseUnitPrefixFromRoomId(roomId: string): {
  location: HostelLocation;
  block: string;
  unitNo: string;
  unitCode: string;
} | null {
  const clean = roomId.trim().toUpperCase();
  if (!clean) return null;
  const parts = clean.split('-');
  if (parts.length < 3) return null;
  if (parts[0] === 'DJ2') {
    return {
      location: 'Apartment Desa Jati 2',
      block: parts[1],
      unitNo: parts[2],
      unitCode: `DJ2-${parts[1]}-${parts[2]}`,
    };
  }
  if (parts[0] === 'NSQ') {
    return {
      location: 'Nilai Square',
      block: parts[1],
      unitNo: parts[2],
      unitCode: `NSQ-${parts[1]}-${parts[2]}`,
    };
  }
  return null;
}

export function ReportsTab({
  rooms,
  students,
  payments,
  staffRole,
  staffName,
  staffEmail,
  loading,
}: ReportsTabProps) {
  const todayISO = getTodayISO();
  const currentYear = Number.parseInt(todayISO.slice(0, 4), 10) || 2026;

  const [subView, setSubView] = useState<ReportSubView>('collection');

  // Sub-View 1 filters
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [collectionLocation, setCollectionLocation] = useState<
    'All' | HostelLocation
  >('All');
  const [monthRange, setMonthRange] = useState<MonthRangeKey>('FULL');

  // Sub-View 2 filters
  const [defaulterLocation, setDefaulterLocation] = useState<
    'All' | HostelLocation
  >('All');
  const [defaulterStatus, setDefaulterStatus] =
    useState<DefaulterStatusFilter>('All');
  const [defaulterSeverity, setDefaulterSeverity] = useState<
    'All' | SeverityTier
  >('All');

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>([
      currentYear - 1,
      currentYear,
      currentYear + 1,
    ]);
    const extractYear = (d: string | null | undefined) => {
      if (!d || d.length < 4) return;
      const y = Number.parseInt(d.slice(0, 4), 10);
      if (!Number.isNaN(y) && y >= 2020 && y <= 2035) {
        yearSet.add(y);
      }
    };
    for (const s of students) {
      extractYear(s.checkInDate);
      extractYear(s.checkOutDate);
      if (Array.isArray(s.stayHistory)) {
        for (const seg of s.stayHistory) {
          extractYear(seg.startDate);
          extractYear(seg.endDate);
        }
      }
    }
    for (const p of payments) {
      extractYear(p.billingMonth);
      extractYear(p.paymentDate);
    }
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [students, payments, currentYear]);

  const visibleMonthIndices = useMemo(() => {
    if (monthRange === 'H1') return [0, 1, 2, 3, 4, 5];
    if (monthRange === 'H2') return [6, 7, 8, 9, 10, 11];
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }, [monthRange]);

  const collectionReport = useMemo(() => {
    const effectiveAsOfDate =
      selectedYear < currentYear
        ? `${selectedYear}-12-31`
        : selectedYear === currentYear
          ? todayISO
          : `${selectedYear}-01-01`;

    interface UnitAccumulator {
      unitKey: string;
      unitCode: string;
      location: HostelLocation;
      block: string;
      unitNo: string;
      bedLabels: string[];
      totalBeds: number;
      optimalMonthlyRent: number;
      standardMonthlyRate: number;
      tenantSets: Array<Set<string>>;
      expectedByMonth: number[];
      actualByMonth: number[];
      isArchived: boolean;
    }

    const unitsByKey = new Map<string, UnitAccumulator>();
    const roomIdToUnitKey = new Map<string, string>();
    const unitCodeToUnitKey = new Map<string, string>();

    const makeUnitKey = (
      location: HostelLocation,
      block: string,
      unitNo: string
    ) =>
      `${location}::${sanitizeIdSegment(block) || 'X'}::${sanitizeIdSegment(unitNo) || '00'}`;

    // Group existing rooms into physical units
    const roomsByUnit = new Map<string, Room[]>();
    for (const r of rooms) {
      const uKey = makeUnitKey(r.location, r.block, r.unitNo);
      const list = roomsByUnit.get(uKey) || [];
      list.push(r);
      roomsByUnit.set(uKey, list);
    }

    for (const [uKey, unitRooms] of roomsByUnit.entries()) {
      const sortedBeds = [...unitRooms].sort((a, b) =>
        a.bedSlot.localeCompare(b.bedSlot, undefined, { numeric: true })
      );
      const sample = sortedBeds[0];
      const prefix = getLocationPrefix(sample.location);
      const blk = sanitizeIdSegment(sample.block) || 'X';
      const uNo = sanitizeIdSegment(sample.unitNo) || '00';
      const defaultUnitCode = `${prefix}-${blk}-${uNo}`;
      const unitCode =
        sortedBeds.length === 1 &&
        !sortedBeds[0].roomId.toUpperCase().startsWith(`${defaultUnitCode}-`)
          ? sortedBeds[0].roomId
          : defaultUnitCode;
      const totalBeds = sortedBeds.length;
      const optimalMonthlyRent = roundMoney(
        sortedBeds.reduce((sum, bed) => sum + (bed.monthlyRate || 0), 0)
      );
      const standardMonthlyRate =
        totalBeds > 0 ? roundMoney(optimalMonthlyRent / totalBeds) : 0;

      unitsByKey.set(uKey, {
        unitKey: uKey,
        unitCode,
        location: sample.location,
        block: sample.block,
        unitNo: sample.unitNo,
        bedLabels: sortedBeds.map((b) => b.bedSlot),
        totalBeds,
        optimalMonthlyRent,
        standardMonthlyRate,
        tenantSets: Array.from({ length: 12 }, () => new Set<string>()),
        expectedByMonth: Array.from({ length: 12 }, () => 0),
        actualByMonth: Array.from({ length: 12 }, () => 0),
        isArchived: false,
      });

      unitCodeToUnitKey.set(defaultUnitCode, uKey);
      unitCodeToUnitKey.set(unitCode.toUpperCase(), uKey);
      for (const bed of sortedBeds) {
        roomIdToUnitKey.set(bed.roomId, uKey);
      }
    }

    const resolveOrCreateUnitKey = (
      rawRoomId: string,
      fallbackLocation?: ResidentHostelLocation,
      fallbackRate?: number
    ): string | null => {
      const roomId = (rawRoomId || '').trim();
      if (!roomId) return null;

      const exact = roomIdToUnitKey.get(roomId);
      if (exact) return exact;

      const parsed = parseUnitPrefixFromRoomId(roomId);
      if (parsed) {
        const matchedCode = unitCodeToUnitKey.get(parsed.unitCode);
        if (matchedCode) {
          roomIdToUnitKey.set(roomId, matchedCode);
          return matchedCode;
        }
        const newKey = makeUnitKey(parsed.location, parsed.block, parsed.unitNo);
        if (!unitsByKey.has(newKey)) {
          const rate = roundMoney(fallbackRate || 0);
          unitsByKey.set(newKey, {
            unitKey: newKey,
            unitCode: parsed.unitCode,
            location: parsed.location,
            block: parsed.block,
            unitNo: parsed.unitNo,
            bedLabels: [roomId],
            totalBeds: 1,
            optimalMonthlyRent: rate,
            standardMonthlyRate: rate,
            tenantSets: Array.from({ length: 12 }, () => new Set<string>()),
            expectedByMonth: Array.from({ length: 12 }, () => 0),
            actualByMonth: Array.from({ length: 12 }, () => 0),
            isArchived: true,
          });
          unitCodeToUnitKey.set(parsed.unitCode, newKey);
        }
        roomIdToUnitKey.set(roomId, newKey);
        return newKey;
      }

      if (fallbackLocation && fallbackLocation !== 'Unassigned') {
        const newKey = `${fallbackLocation}::ARCHIVED::${roomId}`;
        if (!unitsByKey.has(newKey)) {
          const rate = roundMoney(fallbackRate || 0);
          unitsByKey.set(newKey, {
            unitKey: newKey,
            unitCode: roomId,
            location: fallbackLocation,
            block: '-',
            unitNo: roomId,
            bedLabels: [roomId],
            totalBeds: 1,
            optimalMonthlyRent: rate,
            standardMonthlyRate: rate,
            tenantSets: Array.from({ length: 12 }, () => new Set<string>()),
            expectedByMonth: Array.from({ length: 12 }, () => 0),
            actualByMonth: Array.from({ length: 12 }, () => 0),
            isArchived: true,
          });
        }
        roomIdToUnitKey.set(roomId, newKey);
        return newKey;
      }

      return null;
    };

    const yearPrefix = `${selectedYear}-`;
    const studentMonthUnitMap = new Map<string, string>();
    const studentById = new Map(students.map((s) => [s.studentId, s]));

    // 1. Allocate expected rent and tenant counts from stayHistory segments
    for (const student of students) {
      const billing = calculateResidentBilling(
        student,
        payments,
        effectiveAsOfDate
      );

      for (const sb of billing.segments) {
        const seg = sb.segment;
        if (!DATE_REGEX.test(seg.startDate) || seg.startDate > effectiveAsOfDate) {
          continue;
        }
        if (selectedYear > currentYear) {
          continue;
        }

        const targetUnitKey = resolveOrCreateUnitKey(
          seg.roomId || student.assignedRoomId,
          seg.hostelLocation !== 'Unassigned'
            ? seg.hostelLocation
            : student.hostelLocation,
          seg.standardRoomRate
        );
        if (!targetUnitKey) continue;
        const unitAcc = unitsByKey.get(targetUnitKey);
        if (!unitAcc) continue;

        const segStartYM = seg.startDate.slice(0, 7);
        const segFirstCharge =
          typeof seg.firstMonthCharge === 'number'
            ? roundMoney(Math.max(0, seg.firstMonthCharge))
            : calculateFirstMonthDefaults(seg.startDate, seg.effectiveMonthlyFee)
                .firstMonthCharge;

        for (const ym of sb.billedMonths) {
          if (!ym.startsWith(yearPrefix)) continue;
          const mIdx = Number.parseInt(ym.slice(5, 7), 10) - 1;
          if (mIdx < 0 || mIdx > 11) continue;

          const monthExpected =
            ym === segStartYM ? segFirstCharge : seg.effectiveMonthlyFee;
          unitAcc.tenantSets[mIdx].add(student.studentId);
          unitAcc.expectedByMonth[mIdx] += monthExpected;
          studentMonthUnitMap.set(`${student.studentId}::${ym}`, targetUnitKey);
        }
      }
    }

    // 2. Allocate actual Monthly Rent payments collected in selectedYear
    let unallocatedActualTotal = 0;
    for (const p of payments) {
      if (
        p.status !== 'Paid' ||
        p.paymentType !== 'Monthly Rent' ||
        !p.billingMonth?.startsWith(yearPrefix)
      ) {
        continue;
      }
      const mIdx = Number.parseInt(p.billingMonth.slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;

      const student = studentById.get(p.studentId);
      let unitKey: string | null =
        studentMonthUnitMap.get(`${p.studentId}::${p.billingMonth}`) || null;

      if (!unitKey) {
        unitKey = resolveOrCreateUnitKey(
          p.roomId || student?.assignedRoomId || '',
          p.hostelLocation !== 'Unassigned'
            ? p.hostelLocation
            : student?.hostelLocation
        );
      }

      if (unitKey && unitsByKey.has(unitKey)) {
        unitsByKey.get(unitKey)!.actualByMonth[mIdx] += p.amount || 0;
      } else {
        unallocatedActualTotal += p.amount || 0;
      }
    }

    // 3. Convert accumulators into sorted UnitSummaryRow objects
    const allUnitRows: UnitSummaryRow[] = Array.from(unitsByKey.values())
      .map((acc) => {
        const months: MonthCellData[] = Array.from({ length: 12 }, (_, idx) => ({
          tenantCount: acc.tenantSets[idx].size,
          expected: roundMoney(acc.expectedByMonth[idx]),
          actual: roundMoney(acc.actualByMonth[idx]),
        }));
        const periodExpected = roundMoney(
          visibleMonthIndices.reduce((sum, idx) => sum + months[idx].expected, 0)
        );
        const periodActual = roundMoney(
          visibleMonthIndices.reduce((sum, idx) => sum + months[idx].actual, 0)
        );
        return {
          unitKey: acc.unitKey,
          unitCode: acc.unitCode,
          location: acc.location,
          block: acc.block,
          unitNo: acc.unitNo,
          bedLabels: acc.bedLabels,
          totalBeds: acc.totalBeds,
          standardMonthlyRate: acc.standardMonthlyRate,
          optimalMonthlyRent: acc.optimalMonthlyRent,
          months,
          periodExpected,
          periodActual,
          periodOutstanding: roundMoney(periodExpected - periodActual),
          isArchived: acc.isArchived,
        };
      })
      .sort((a, b) => {
        if (a.location !== b.location) {
          return a.location.localeCompare(b.location);
        }
        const blkCmp = a.block.localeCompare(b.block, undefined, { numeric: true });
        if (blkCmp !== 0) return blkCmp;
        const unitCmp = a.unitNo.localeCompare(b.unitNo, undefined, { numeric: true });
        if (unitCmp !== 0) return unitCmp;
        return a.unitCode.localeCompare(b.unitCode, undefined, { numeric: true });
      });

    const jatiRows =
      collectionLocation === 'All' ||
      collectionLocation === 'Apartment Desa Jati 2'
        ? allUnitRows.filter((u) => u.location === 'Apartment Desa Jati 2')
        : [];
    const nsqRows =
      collectionLocation === 'All' || collectionLocation === 'Nilai Square'
        ? allUnitRows.filter((u) => u.location === 'Nilai Square')
        : [];

    const visibleRows = [...jatiRows, ...nsqRows];
    const jatiTotals = computeSectionTotals(jatiRows, visibleMonthIndices);
    const nsqTotals = computeSectionTotals(nsqRows, visibleMonthIndices);
    const grandTotals = computeSectionTotals(visibleRows, visibleMonthIndices);

    const collectionRatePct =
      grandTotals.totalExpected > 0
        ? Math.round(
            (grandTotals.totalActual / grandTotals.totalExpected) * 1000
          ) / 10
        : 0;

    return {
      jatiRows,
      nsqRows,
      jatiTotals,
      nsqTotals,
      grandTotals,
      collectionRatePct,
      unallocatedActualTotal: roundMoney(unallocatedActualTotal),
    };
  }, [
    rooms,
    students,
    payments,
    selectedYear,
    currentYear,
    todayISO,
    collectionLocation,
    visibleMonthIndices,
  ]);

  // Sub-View 2: Student Outstanding Defaulters
  const allDefaulters = useMemo(() => {
    const list: Omit<DefaulterRow, 'rank'>[] = [];

    for (const student of students) {
      const billing = calculateResidentBilling(student, payments);
      if (billing.outstandingBalance <= 0.009) continue;

      const settledPayments = payments
        .filter(
          (p) =>
            p.studentId === student.studentId &&
            isSettledPaymentStatus(p.status) &&
            isCashPaymentType(p.paymentType)
        )
        .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

      const lastPaymentDate = settledPayments[0]?.paymentDate || null;

      const lastSeg =
        billing.segments.length > 0
          ? billing.segments[billing.segments.length - 1].segment
          : null;
      const currentOrLastUnit =
        (student.assignedRoomId || '').trim() ||
        (lastSeg?.roomId || '').trim() ||
        'Room Unassigned';

      const monthlyRate = billing.effectiveMonthlyFee;
      const monthsOverdue =
        monthlyRate > 0
          ? Math.round((billing.outstandingBalance / monthlyRate) * 10) / 10
          : Math.max(1, billing.monthsBilled);

      let severity: SeverityTier = 'Moderate';
      if (billing.outstandingBalance >= 1000 || monthsOverdue >= 4) {
        severity = 'Critical';
      } else if (billing.outstandingBalance >= 500 || monthsOverdue >= 2) {
        severity = 'High';
      }

      list.push({
        student,
        severity,
        monthsOverdue,
        currentOrLastUnit,
        hostelLocation: student.hostelLocation || 'Unassigned',
        monthlyRate,
        totalExpected: billing.totalExpectedRent,
        totalPaid: billing.totalRentCredited,
        lastPaymentDate,
        outstandingBalance: billing.outstandingBalance,
      });
    }

    return list.sort((a, b) => {
      const balDiff = b.outstandingBalance - a.outstandingBalance;
      if (Math.abs(balDiff) > 0.005) return balDiff;
      return a.student.fullName.localeCompare(b.student.fullName);
    });
  }, [students, payments]);

  const filteredDefaulters = useMemo(() => {
    return allDefaulters
      .filter((row) =>
        defaulterLocation === 'All'
          ? true
          : row.hostelLocation === defaulterLocation
      )
      .filter((row) => {
        if (defaulterStatus === 'All') return true;
        return row.student.status === defaulterStatus;
      })
      .filter((row) =>
        defaulterSeverity === 'All' ? true : row.severity === defaulterSeverity
      )
      .map((row, idx) => ({
        ...row,
        rank: idx + 1,
      }));
  }, [allDefaulters, defaulterLocation, defaulterStatus, defaulterSeverity]);

  const defaulterStats = useMemo(() => {
    let criticalCount = 0;
    let highCount = 0;
    let moderateCount = 0;
    let totalRecoverableArrears = 0;

    for (const row of filteredDefaulters) {
      if (row.severity === 'Critical') criticalCount += 1;
      else if (row.severity === 'High') highCount += 1;
      else moderateCount += 1;
      totalRecoverableArrears += row.outstandingBalance;
    }

    return {
      totalCount: filteredDefaulters.length,
      criticalCount,
      highCount,
      moderateCount,
      totalRecoverableArrears: roundMoney(totalRecoverableArrears),
    };
  }, [filteredDefaulters]);

  const handleExportCollectionExcel = () => {
    const wb = XLSX.utils.book_new();
    const monthRangeLabel =
      monthRange === 'FULL'
        ? 'JAN–DEC'
        : monthRange === 'H1'
          ? 'JAN–JUN'
          : 'JUL–DEC';

    // Sheet 1: Grand Totals Summary
    const summaryRows: Array<Record<string, string | number>> = [
      {
        Section: `GLOBAL INSTITUTE OF STUDIES (GIS) NILAI — ${selectedYear} (${monthRangeLabel})`,
        'Total Beds (Optimal)': '',
        'Optimal Monthly Baseline (RM)': '',
        'Total Optimal Potential (RM)': '',
        'Total Expected Collection (RM)': '',
        'Total Actual Collection (RM)': '',
        'Total Outstanding / Variance (RM)': '',
        'Collection Rate (%)': '',
      },
    ];

    if (
      collectionLocation === 'All' ||
      collectionLocation === 'Apartment Desa Jati 2'
    ) {
      const jt = collectionReport.jatiTotals;
      const jtRate =
        jt.totalExpected > 0
          ? Math.round((jt.totalActual / jt.totalExpected) * 1000) / 10
          : 0;
      summaryRows.push({
        Section: 'HOSTEL JATI (Apartment Desa Jati 2)',
        'Total Beds (Optimal)': jt.totalBeds,
        'Optimal Monthly Baseline (RM)': jt.optimalMonthlyRent,
        'Total Optimal Potential (RM)': jt.optimalPeriodPotential,
        'Total Expected Collection (RM)': jt.totalExpected,
        'Total Actual Collection (RM)': jt.totalActual,
        'Total Outstanding / Variance (RM)': jt.totalOutstanding,
        'Collection Rate (%)': jtRate,
      });
    }
    if (
      collectionLocation === 'All' ||
      collectionLocation === 'Nilai Square'
    ) {
      const nt = collectionReport.nsqTotals;
      const ntRate =
        nt.totalExpected > 0
          ? Math.round((nt.totalActual / nt.totalExpected) * 1000) / 10
          : 0;
      summaryRows.push({
        Section: 'HOSTEL NSQ (Nilai Square)',
        'Total Beds (Optimal)': nt.totalBeds,
        'Optimal Monthly Baseline (RM)': nt.optimalMonthlyRent,
        'Total Optimal Potential (RM)': nt.optimalPeriodPotential,
        'Total Expected Collection (RM)': nt.totalExpected,
        'Total Actual Collection (RM)': nt.totalActual,
        'Total Outstanding / Variance (RM)': nt.totalOutstanding,
        'Collection Rate (%)': ntRate,
      });
    }

    const gt = collectionReport.grandTotals;
    summaryRows.push({
      Section: 'GRAND TOTALS SUMMARY',
      'Total Beds (Optimal)': gt.totalBeds,
      'Optimal Monthly Baseline (RM)': gt.optimalMonthlyRent,
      'Total Optimal Potential (RM)': gt.optimalPeriodPotential,
      'Total Expected Collection (RM)': gt.totalExpected,
      'Total Actual Collection (RM)': gt.totalActual,
      'Total Outstanding / Variance (RM)': gt.totalOutstanding,
      'Collection Rate (%)': collectionReport.collectionRatePct,
    });

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [
      { wch: 44 },
      { wch: 20 },
      { wch: 26 },
      { wch: 26 },
      { wch: 28 },
      { wch: 26 },
      { wch: 28 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Grand Totals Summary');

    const buildMatrixSheet = (
      rows: UnitSummaryRow[],
      totals: SectionTotals,
      sheetName: string
    ) => {
      const headers: string[] = [
        'Unit',
        'Beds (Optimal)',
        'Monthly Rent / Person (RM)',
        'Optimal Monthly Rent / Unit (RM)',
      ];
      for (const mIdx of visibleMonthIndices) {
        const lbl = MONTH_LABELS[mIdx];
        headers.push(`${lbl} Tenants`, `${lbl} Expected (RM)`, `${lbl} Actual (RM)`);
      }
      headers.push(
        'Total Expected (RM)',
        'Total Actual (RM)',
        'Unit Outstanding (RM)'
      );

      const aoa: Array<Array<string | number>> = [headers];

      for (const r of rows) {
        const line: Array<string | number> = [
          r.unitCode,
          r.totalBeds,
          r.standardMonthlyRate,
          r.optimalMonthlyRent,
        ];
        for (const mIdx of visibleMonthIndices) {
          line.push(
            r.months[mIdx].tenantCount,
            r.months[mIdx].expected,
            r.months[mIdx].actual
          );
        }
        line.push(r.periodExpected, r.periodActual, r.periodOutstanding);
        aoa.push(line);
      }

      // Footer sum row
      const footerLine: Array<string | number> = [
        'TOTAL MONTHLY COLLECTION',
        totals.totalBeds,
        '',
        totals.optimalMonthlyRent,
      ];
      for (const mIdx of visibleMonthIndices) {
        footerLine.push(
          totals.monthlyTenants[mIdx],
          totals.monthlyExpected[mIdx],
          totals.monthlyActual[mIdx]
        );
      }
      footerLine.push(
        totals.totalExpected,
        totals.totalActual,
        totals.totalOutstanding
      );
      aoa.push(footerLine);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 18 },
        { wch: 14 },
        { wch: 22 },
        { wch: 26 },
        ...visibleMonthIndices.flatMap(() => [
          { wch: 12 },
          { wch: 15 },
          { wch: 15 },
        ]),
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    if (collectionReport.jatiRows.length > 0) {
      buildMatrixSheet(
        collectionReport.jatiRows,
        collectionReport.jatiTotals,
        'Hostel Jati Summary'
      );
    }
    if (collectionReport.nsqRows.length > 0) {
      buildMatrixSheet(
        collectionReport.nsqRows,
        collectionReport.nsqTotals,
        'Hostel NSQ Summary'
      );
    }

    const locSlug =
      collectionLocation === 'All'
        ? 'all'
        : collectionLocation === 'Apartment Desa Jati 2'
          ? 'jati'
          : 'nsq';
    XLSX.writeFile(
      wb,
      `gis-hostel-collection-summary-${selectedYear}-${monthRange.toLowerCase()}-${locSlug}.xlsx`
    );
  };

  const handleExportDefaultersExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredDefaulters.map((r) => ({
      'Rank (#)': r.rank,
      Severity: r.severity.toUpperCase(),
      'Est. Months Overdue': r.monthsOverdue,
      'Student ID': r.student.studentId,
      'Full Name': r.student.fullName,
      'Phone / Contact': r.student.phone || '-',
      'Emergency Contact': r.student.emergencyContact || '-',
      Status: r.student.status,
      'Current / Last Unit': r.currentOrLastUnit,
      'Hostel Location': r.hostelLocation,
      'Monthly Rate (RM)': r.monthlyRate,
      'Total Expected (RM)': r.totalExpected,
      'Total Paid (RM)': r.totalPaid,
      'Last Payment Date': r.lastPaymentDate || 'Never Paid',
      'Outstanding Balance (RM)': r.outstandingBalance,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 30 },
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Outstanding Defaulters');

    const summaryWs = XLSX.utils.json_to_sheet([
      { Metric: 'Generated Date', Value: todayISO },
      { Metric: 'Location Filter', Value: defaulterLocation },
      { Metric: 'Status Filter', Value: defaulterStatus },
      { Metric: 'Severity Filter', Value: defaulterSeverity },
      { Metric: 'Total Defaulters Count', Value: defaulterStats.totalCount },
      { Metric: 'Critical Severity Count', Value: defaulterStats.criticalCount },
      { Metric: 'High Severity Count', Value: defaulterStats.highCount },
      { Metric: 'Moderate Severity Count', Value: defaulterStats.moderateCount },
      {
        Metric: 'Total Recoverable Arrears (RM)',
        Value: defaulterStats.totalRecoverableArrears,
      },
    ]);
    summaryWs['!cols'] = [{ wch: 32 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Defaulters Summary');

    XLSX.writeFile(wb, `gis-hostel-defaulters-report-${todayISO}.xlsx`);
  };

  const renderCollectionSection = (
    title: string,
    subtitle: string,
    rows: UnitSummaryRow[],
    totals: SectionTotals
  ) => (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden print:border-slate-400 print:rounded-none">
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4 flex-wrap print:px-2 print:py-1.5 print:bg-slate-100">
        <div>
          <h3 className="font-display text-sm font-bold text-slate-900 tracking-wide uppercase print:text-xs">
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 print:text-[10px]">
            {subtitle} · {rows.length} unit(s) · {totals.totalBeds} optimal bed(s)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums print:text-[10px]">
          <span className="text-slate-600">
            Expected:{' '}
            <strong className="text-slate-900">
              {formatRM(totals.totalExpected)}
            </strong>
          </span>
          <span className="text-slate-600">
            Actual:{' '}
            <strong className="text-emerald-700">
              {formatRM(totals.totalActual)}
            </strong>
          </span>
          <span className="text-slate-600">
            Variance:{' '}
            <strong
              className={
                totals.totalOutstanding > 0 ? 'text-red-700' : 'text-slate-900'
              }
            >
              {formatRM(totals.totalOutstanding)}
            </strong>
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          No rooms or units configured for this hostel location yet.
        </div>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse text-xs print:text-[8px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase">
                <th className="sticky left-0 z-20 bg-slate-100 px-3 py-2.5 font-semibold border-r border-slate-200 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:px-1 print:py-1">
                  Unit
                </th>
                <th className="px-2.5 py-2.5 font-semibold text-right border-r border-slate-200 whitespace-nowrap print:px-1 print:py-1">
                  No. of Tenant
                  <span className="block font-normal text-[10px] normal-case text-slate-500 print:text-[7px]">
                    (Optimal)
                  </span>
                </th>
                <th className="px-2.5 py-2.5 font-semibold text-right border-r border-slate-200 whitespace-nowrap print:px-1 print:py-1">
                  Monthly Rent
                  <span className="block font-normal text-[10px] normal-case text-slate-500 print:text-[7px]">
                    Per Person (RM)
                  </span>
                </th>
                <th className="px-2.5 py-2.5 font-semibold text-right border-r border-slate-300 whitespace-nowrap print:px-1 print:py-1">
                  Total Optimal
                  <span className="block font-normal text-[10px] normal-case text-slate-500 print:text-[7px]">
                    Monthly / Unit (RM)
                  </span>
                </th>
                {visibleMonthIndices.map((mIdx) => (
                  <th
                    key={MONTH_LABELS[mIdx]}
                    className="px-2 py-2.5 font-semibold text-center border-r border-slate-200 whitespace-nowrap min-w-[92px] print:min-w-0 print:px-1 print:py-1"
                  >
                    {MONTH_LABELS[mIdx]} {selectedYear}
                    <span className="block font-normal text-[10px] normal-case text-slate-500 print:text-[7px]">
                      Ten · Exp · Act
                    </span>
                  </th>
                ))}
                <th className="sticky right-0 z-20 bg-slate-100 px-3 py-2.5 font-semibold text-right border-l border-slate-300 whitespace-nowrap min-w-[120px] shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:min-w-0 print:px-1 print:py-1">
                  TOTALS
                  <span className="block font-normal text-[10px] normal-case text-slate-500 print:text-[7px]">
                    Exp · Act · Out
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => (
                <tr
                  key={row.unitKey}
                  className="group hover:bg-slate-50/90 transition-colors print:break-inside-avoid"
                >
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2 border-r border-slate-200 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:px-1 print:py-1">
                    <div className="font-mono font-semibold text-slate-900">
                      {row.unitCode}
                    </div>
                    <div className="text-[11px] text-slate-500 print:text-[7px]">
                      Blk {row.block} · Unit {row.unitNo}
                      {row.isArchived ? ' · Archived' : ''}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-800 border-r border-slate-200 print:px-1 print:py-1">
                    {row.totalBeds}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-700 border-r border-slate-200 print:px-1 print:py-1">
                    {formatCompactMoney(row.standardMonthlyRate)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono tabular-nums font-medium text-slate-900 border-r border-slate-300 print:px-1 print:py-1">
                    {formatCompactMoney(row.optimalMonthlyRent)}
                  </td>

                  {visibleMonthIndices.map((mIdx) => {
                    const cell = row.months[mIdx];
                    const hasActivity =
                      cell.tenantCount > 0 || cell.expected > 0 || cell.actual > 0;
                    const monthVar = roundMoney(cell.expected - cell.actual);
                    return (
                      <td
                        key={`${row.unitKey}-${mIdx}`}
                        className={`px-2 py-1.5 border-r border-slate-200 align-top font-mono tabular-nums text-[11px] leading-tight print:px-1 print:py-1 print:text-[7.5px] ${
                          hasActivity ? 'bg-white' : 'bg-slate-50/40 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-500">T:</span>
                          <span className="font-semibold text-slate-800">
                            {cell.tenantCount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-500">E:</span>
                          <span className="text-slate-700">
                            {formatCompactMoney(cell.expected)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-slate-500">A:</span>
                          <span
                            className={`font-semibold ${
                              cell.actual > 0
                                ? monthVar <= 0.01
                                  ? 'text-emerald-700'
                                  : 'text-blue-900'
                                : cell.expected > 0
                                  ? 'text-red-700'
                                  : 'text-slate-400'
                            }`}
                          >
                            {formatCompactMoney(cell.actual)}
                          </span>
                        </div>
                      </td>
                    );
                  })}

                  <td className="sticky right-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-1.5 border-l border-slate-300 font-mono tabular-nums text-[11px] leading-tight shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:px-1 print:py-1 print:text-[7.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Exp:</span>
                      <span className="font-semibold text-slate-900">
                        {formatCompactMoney(row.periodExpected)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Act:</span>
                      <span className="font-semibold text-emerald-700">
                        {formatCompactMoney(row.periodActual)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 mt-0.5 pt-0.5">
                      <span className="text-slate-500">Out:</span>
                      <span
                        className={`font-bold ${
                          row.periodOutstanding > 0.01
                            ? 'text-red-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {formatCompactMoney(row.periodOutstanding)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold text-slate-900 print:bg-slate-200">
                <td className="sticky left-0 z-20 bg-slate-100 px-3 py-2.5 border-r border-slate-200 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:px-1 print:py-1 print:bg-slate-200">
                  Total Monthly Collection
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono tabular-nums border-r border-slate-200 print:px-1 print:py-1">
                  {totals.totalBeds}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-slate-500 border-r border-slate-200 print:px-1 print:py-1">
                  —
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono tabular-nums border-r border-slate-300 print:px-1 print:py-1">
                  {formatCompactMoney(totals.optimalMonthlyRent)}
                </td>
                {visibleMonthIndices.map((mIdx) => (
                  <td
                    key={`foot-${title}-${mIdx}`}
                    className="px-2 py-2 border-r border-slate-200 font-mono tabular-nums text-[11px] leading-tight print:px-1 print:py-1 print:text-[7.5px]"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-slate-500 font-normal">T:</span>
                      <span>{totals.monthlyTenants[mIdx]}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-slate-500 font-normal">E:</span>
                      <span>{formatCompactMoney(totals.monthlyExpected[mIdx])}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 text-emerald-800">
                      <span className="text-slate-500 font-normal">A:</span>
                      <span>{formatCompactMoney(totals.monthlyActual[mIdx])}</span>
                    </div>
                  </td>
                ))}
                <td className="sticky right-0 z-20 bg-slate-100 px-3 py-2 border-l border-slate-300 font-mono tabular-nums text-[11px] leading-tight shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)] print:static print:shadow-none print:px-1 print:py-1 print:text-[7.5px] print:bg-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 font-normal">Exp:</span>
                    <span>{formatCompactMoney(totals.totalExpected)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-emerald-800">
                    <span className="text-slate-600 font-normal">Act:</span>
                    <span>{formatCompactMoney(totals.totalActual)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-slate-300 mt-0.5 pt-0.5">
                    <span className="text-slate-600 font-normal">Out:</span>
                    <span
                      className={
                        totals.totalOutstanding > 0.01
                          ? 'text-red-700'
                          : 'text-slate-900'
                      }
                    >
                      {formatCompactMoney(totals.totalOutstanding)}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        Loading hostel inventory, residency segments, and payment records for reporting...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dynamic @page print orientation per active sub-view */}
      <style>{`
        @media print {
          @page {
            size: ${subView === 'collection' ? 'A4 landscape' : 'A4 portrait'};
            margin: 10mm;
          }
        }
      `}</style>

      {/* Official Print Letterhead (shown only on print) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-base font-bold text-slate-900 uppercase tracking-wide">
              GLOBAL INSTITUTE OF STUDIES (GIS) NILAI
            </p>
            <p className="text-xs text-slate-700 font-medium mt-0.5">
              Student Affairs &amp; Hostel Administration Department · Apartment Desa Jati 2 &amp; Nilai Square
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-700 font-mono tabular-nums">
            <p className="font-semibold text-slate-900">
              {subView === 'collection'
                ? `HOSTEL COLLECTION SUMMARY (${selectedYear} · ${
                    monthRange === 'FULL'
                      ? 'JAN–DEC'
                      : monthRange === 'H1'
                        ? 'H1 JAN–JUN'
                        : 'H2 JUL–DEC'
                  })`
                : 'STUDENT OUTSTANDING DEFAULTERS REPORT'}
            </p>
            <p>Printed: {todayISO}</p>
            <p>Generated by: {staffName || staffEmail}</p>
          </div>
        </div>
      </div>

      {/* Top Report Mode Switcher & Header Bar (screen-only) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Official GIS Nilai Hostel Reports
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Annual unit-level rent collection matrix and severity-ranked student arrears statements
              {staffRole === 'Viewer' ? ' · Read-Only Access' : ''}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Report sub-views"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 self-start lg:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'collection'}
              onClick={() => setSubView('collection')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'collection'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Annual Collection Summary</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'defaulters'}
              onClick={() => setSubView('defaulters')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'defaulters'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Outstanding Defaulters ({allDefaulters.length})</span>
            </button>
          </div>
        </div>

        {/* Sub-View Controls */}
        {subView === 'collection' ? (
          <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-end justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-3xl">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Collection Year
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hostel Location
                </label>
                <select
                  value={collectionLocation}
                  onChange={(e) =>
                    setCollectionLocation(
                      e.target.value as 'All' | HostelLocation
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="All">All Locations (Jati + NSQ)</option>
                  {HOSTEL_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc === 'Nilai Square' ? 'Nilai Square (NSQ)' : loc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Month Range
                </label>
                <select
                  value={monthRange}
                  onChange={(e) =>
                    setMonthRange(e.target.value as MonthRangeKey)
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="FULL">Full Year (JAN–DEC)</option>
                  <option value="H1">H1 (JAN–JUN)</option>
                  <option value="H2">H2 (JUL–DEC)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleExportCollectionExcel}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Export Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF Report</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-end justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-3xl">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hostel Location
                </label>
                <select
                  value={defaulterLocation}
                  onChange={(e) =>
                    setDefaulterLocation(
                      e.target.value as 'All' | HostelLocation
                    )
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="All">All Locations</option>
                  {HOSTEL_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc === 'Nilai Square' ? 'Nilai Square (NSQ)' : loc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Student Status
                </label>
                <select
                  value={defaulterStatus}
                  onChange={(e) =>
                    setDefaulterStatus(e.target.value as DefaulterStatusFilter)
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active Only</option>
                  <option value="Checked-Out">Checked-Out Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Severity Tier
                </label>
                <select
                  value={defaulterSeverity}
                  onChange={(e) =>
                    setDefaulterSeverity(e.target.value as 'All' | SeverityTier)
                  }
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="All">All Severities</option>
                  <option value="Critical">Critical (≥ RM 1,000 or ≥ 4 mos)</option>
                  <option value="High">High (RM 500–999 or 2–3 mos)</option>
                  <option value="Moderate">Moderate (&lt; RM 500 / 1 mo)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleExportDefaultersExcel}
                disabled={filteredDefaulters.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Download Defaulters (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Defaulters List</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SUB-VIEW 1: ANNUAL HOSTEL COLLECTION SUMMARY MATRIX */}
      {subView === 'collection' && (
        <div className="space-y-6 print:space-y-4">
          {(collectionLocation === 'All' ||
            collectionLocation === 'Apartment Desa Jati 2') &&
            renderCollectionSection(
              'HOSTEL JATI COLLECTION SUMMARY',
              'Apartment Desa Jati 2',
              collectionReport.jatiRows,
              collectionReport.jatiTotals
            )}

          {(collectionLocation === 'All' ||
            collectionLocation === 'Nilai Square') &&
            renderCollectionSection(
              'HOSTEL NSQ COLLECTION SUMMARY',
              'Nilai Square (NSQ)',
              collectionReport.nsqRows,
              collectionReport.nsqTotals
            )}

          {collectionReport.unallocatedActualTotal > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-900">
              Note: {formatRM(collectionReport.unallocatedActualTotal)} in Monthly
              Rent payments for {selectedYear} could not be linked to a specific
              unit (e.g., paid before room placement).
            </div>
          )}

          {/* GRAND TOTALS SUMMARY BOX */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 print:border-slate-400 print:rounded-none print:p-3 print:break-inside-avoid">
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200 print:mb-2 print:pb-2">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 uppercase tracking-wide">
                  GRAND TOTALS SUMMARY · {selectedYear} (
                  {monthRange === 'FULL'
                    ? 'JAN–DEC'
                    : monthRange === 'H1'
                      ? 'JAN–JUN'
                      : 'JUL–DEC'}
                  )
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 print:text-[10px]">
                  Consolidated across{' '}
                  {collectionLocation === 'All'
                    ? 'Apartment Desa Jati 2 & Nilai Square'
                    : collectionLocation}{' '}
                  ({collectionReport.grandTotals.totalBeds} optimal bed capacity)
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums print:text-[10px]">
                Legend: T = Tenants · E = Expected · A = Actual Rent Collected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 print:p-2">
                <p className="text-xs font-medium text-slate-500">
                  Total Optimal Potential
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1 print:text-sm">
                  {formatRM(collectionReport.grandTotals.optimalPeriodPotential)}
                </p>
                <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5 print:text-[9px]">
                  {formatRM(collectionReport.grandTotals.optimalMonthlyRent)}/mo ×{' '}
                  {visibleMonthIndices.length} mos
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/70 print:p-2">
                <p className="text-xs font-medium text-slate-500">
                  Total Expected Collection
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1 print:text-sm">
                  {formatRM(collectionReport.grandTotals.totalExpected)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 print:text-[9px]">
                  After rebates &amp; proration
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5 bg-emerald-50/50 print:p-2">
                <p className="text-xs font-medium text-emerald-800">
                  Total Actual Collection
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1 print:text-sm">
                  {formatRM(collectionReport.grandTotals.totalActual)}
                </p>
                <p className="text-[11px] text-emerald-700/80 mt-0.5 print:text-[9px]">
                  Settled Monthly Rent
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5 bg-red-50/40 print:p-2">
                <p className="text-xs font-medium text-red-800">
                  Total Outstanding / Variance
                </p>
                <p
                  className={`text-lg font-bold font-mono tabular-nums mt-1 print:text-sm ${
                    collectionReport.grandTotals.totalOutstanding > 0.01
                      ? 'text-red-700'
                      : 'text-slate-900'
                  }`}
                >
                  {formatRM(collectionReport.grandTotals.totalOutstanding)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 print:text-[9px]">
                  Expected minus Actual
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3.5 bg-blue-50/50 print:p-2">
                <p className="text-xs font-medium text-blue-900">
                  Overall Collection Rate
                </p>
                <p className="text-lg font-bold font-mono tabular-nums text-blue-900 mt-1 print:text-sm">
                  {collectionReport.collectionRatePct.toFixed(1)}%
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 print:text-[9px]">
                  Actual / Expected
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* SUB-VIEW 2: STUDENT OUTSTANDING DEFAULTERS REPORT */}
      {subView === 'defaulters' && (
        <div className="space-y-5 print:space-y-3">
          {/* Summary Header */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 print:border-slate-400 print:rounded-none print:p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:grid-cols-5 print:gap-2">
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 print:p-2">
                <p className="text-xs font-medium text-slate-500">
                  Total Defaulters
                </p>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1 print:text-sm">
                  {defaulterStats.totalCount}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sorted highest arrears first
                </p>
              </div>

              <div className="border border-red-200 rounded-lg p-3 bg-red-50/50 print:p-2">
                <p className="text-xs font-semibold text-red-800">CRITICAL</p>
                <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1 print:text-sm">
                  {defaulterStats.criticalCount}
                </p>
                <p className="text-[11px] text-red-700/80 mt-0.5">
                  ≥ RM 1,000 or ≥ 4 mos
                </p>
              </div>

              <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/50 print:p-2">
                <p className="text-xs font-semibold text-orange-800">HIGH</p>
                <p className="text-xl font-bold font-mono tabular-nums text-orange-700 mt-1 print:text-sm">
                  {defaulterStats.highCount}
                </p>
                <p className="text-[11px] text-orange-700/80 mt-0.5">
                  RM 500–999 or 2–3 mos
                </p>
              </div>

              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 print:p-2">
                <p className="text-xs font-semibold text-amber-800">MODERATE</p>
                <p className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1 print:text-sm">
                  {defaulterStats.moderateCount}
                </p>
                <p className="text-[11px] text-amber-700/80 mt-0.5">
                  &gt; RM 0 and &lt; RM 500
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-red-50/40 print:p-2">
                <p className="text-xs font-medium text-red-800">
                  Total Recoverable Arrears
                </p>
                <p className="text-xl font-bold font-mono tabular-nums text-red-700 mt-1 print:text-sm">
                  {formatRM(defaulterStats.totalRecoverableArrears)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Filtered scope total
                </p>
              </div>
            </div>
          </section>

          {/* Defaulters Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden print:border-slate-400 print:rounded-none">
            {filteredDefaulters.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <AlertTriangle className="w-7 h-7 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">
                  No Outstanding Defaulters Match Current Filters
                </p>
                <p className="text-xs text-slate-500">
                  Adjust the Hostel Location, Student Status, or Severity Tier filters above to inspect other accounts.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left border-collapse text-xs print:text-[9px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase print:bg-slate-100">
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Rank (#)
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Severity
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Student Name &amp; ID
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Phone / Contact
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Status
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Current / Last Unit
                      </th>
                      <th className="px-3 py-3 font-semibold text-right whitespace-nowrap print:px-1.5 print:py-1.5">
                        Monthly Rate
                      </th>
                      <th className="px-3 py-3 font-semibold text-right whitespace-nowrap print:px-1.5 print:py-1.5">
                        Total Expected
                      </th>
                      <th className="px-3 py-3 font-semibold text-right whitespace-nowrap print:px-1.5 print:py-1.5">
                        Total Paid
                      </th>
                      <th className="px-3 py-3 font-semibold whitespace-nowrap print:px-1.5 print:py-1.5">
                        Last Payment
                      </th>
                      <th className="px-3 py-3 font-semibold text-right whitespace-nowrap print:px-1.5 print:py-1.5">
                        Outstanding
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDefaulters.map((row) => {
                      const severityClass =
                        row.severity === 'Critical'
                          ? 'bg-red-100 text-red-800 border-red-300'
                          : row.severity === 'High'
                            ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300';

                      return (
                        <tr
                          key={row.student.studentId}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-3 py-2.5 font-mono font-bold tabular-nums text-slate-700 print:px-1.5 print:py-1.5">
                            #{row.rank}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap print:px-1.5 print:py-1.5">
                            <span
                              className={`inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide rounded border print:text-[8px] print:px-1 ${severityClass}`}
                            >
                              {row.severity}
                            </span>
                            <span className="block text-[10px] font-mono tabular-nums text-slate-500 mt-0.5 print:text-[7.5px]">
                              ~{row.monthsOverdue} mo(s)
                            </span>
                          </td>
                          <td className="px-3 py-2.5 print:px-1.5 print:py-1.5">
                            <div className="font-semibold text-slate-900">
                              {row.student.fullName}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 print:text-[8px]">
                              {row.student.studentId} · {row.student.program}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 print:px-1.5 print:py-1.5">
                            <div className="font-mono text-slate-800 whitespace-nowrap">
                              {row.student.phone || '—'}
                            </div>
                            {row.student.emergencyContact && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px] print:max-w-[110px] print:text-[7.5px]">
                                {row.student.emergencyContact}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap print:px-1.5 print:py-1.5">
                            <span
                              className={`font-medium ${
                                row.student.status === 'Active'
                                  ? 'text-emerald-700'
                                  : row.student.status === 'Checked-Out'
                                    ? 'text-slate-600'
                                    : 'text-red-700'
                              }`}
                            >
                              {row.student.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap print:px-1.5 print:py-1.5">
                            <div className="font-mono font-medium text-slate-900">
                              {row.currentOrLastUnit}
                            </div>
                            <div className="text-[11px] text-slate-500 print:text-[7.5px]">
                              {row.hostelLocation === 'Nilai Square'
                                ? 'Nilai Square (NSQ)'
                                : row.hostelLocation}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                            {formatRM(row.monthlyRate)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                            {formatRM(row.totalExpected)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                            {formatRM(row.totalPaid)}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap print:px-1.5 print:py-1.5">
                            {row.lastPaymentDate ? (
                              <span className="text-slate-800">
                                {row.lastPaymentDate}
                              </span>
                            ) : (
                              <span className="text-red-700 font-medium">
                                Never Paid
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-red-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                            {formatRM(row.outstandingBalance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-slate-900 print:bg-slate-100">
                      <td
                        colSpan={7}
                        className="px-3 py-2.5 text-right uppercase text-xs print:px-1.5 print:py-1.5"
                      >
                        Totals ({defaulterStats.totalCount} resident
                        {defaulterStats.totalCount === 1 ? '' : 's'})
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap print:px-1.5 print:py-1.5">
                        {formatRM(
                          filteredDefaulters.reduce(
                            (sum, r) => sum + r.totalExpected,
                            0
                          )
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                        {formatRM(
                          filteredDefaulters.reduce(
                            (sum, r) => sum + r.totalPaid,
                            0
                          )
                        )}
                      </td>
                      <td className="px-3 py-2.5 print:px-1.5 print:py-1.5" />
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-bold text-red-700 whitespace-nowrap print:px-1.5 print:py-1.5">
                        {formatRM(defaulterStats.totalRecoverableArrears)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Official Print Signature Footer (shown only on print) */}
      <div className="hidden print:grid grid-cols-3 gap-8 pt-10 mt-6 border-t border-slate-300 break-inside-avoid">
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-600 mb-10">
            Prepared By:
          </p>
          <div className="border-t border-slate-700 pt-1 text-[10px] text-slate-800">
            <p className="font-semibold">{staffName || staffEmail}</p>
            <p className="text-slate-600">Hostel Administration · GIS Nilai</p>
            <p className="text-slate-500 mt-0.5">Date: {todayISO}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-600 mb-10">
            Reviewed By:
          </p>
          <div className="border-t border-slate-700 pt-1 text-[10px] text-slate-800">
            <p className="font-semibold">Head of Student Affairs / Finance</p>
            <p className="text-slate-600">Global Institute of Studies (GIS) Nilai</p>
            <p className="text-slate-500 mt-0.5">Date: ______________________</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase text-slate-600 mb-10">
            Approved By:
          </p>
          <div className="border-t border-slate-700 pt-1 text-[10px] text-slate-800">
            <p className="font-semibold">Chief Executive / Campus Director</p>
            <p className="text-slate-600">Global Institute of Studies (GIS) Nilai</p>
            <p className="text-slate-500 mt-0.5">Date: ______________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
