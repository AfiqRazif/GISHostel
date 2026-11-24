import type { Timestamp } from 'firebase/firestore';

export type HostelLocation = 'Apartment Desa Jati 2' | 'Nilai Square';
export type ResidentHostelLocation = HostelLocation | 'Unassigned';
export type RoomStatus =
  | 'Vacant'
  | 'Occupied'
  | 'Maintenance'
  | 'Reserved / Blocked';
export type ResidentType = 'Student' | 'Lecturer / Staff' | 'Guest';
export type OccupantType = 'Student' | 'Lecturer / Staff' | 'Event Guest';
export type AssignableOccupancyMode =
  | 'Single Bed'
  | 'Custom Multi-Bed'
  | 'Whole Unit Exclusive';
export type OccupancyMode = AssignableOccupancyMode | 'Unassigned';
export type ResidentOccupancyMode = OccupancyMode;
export type RebateReason =
  | 'None'
  | 'Management Rebate'
  | 'Staff Housing'
  | 'Sponsor / Scholarship'
  | 'Other';
export type ProgramType = 'Diploma' | 'SKM' | 'DiFFER' | 'Other';
export type StudentStatus = 'Active' | 'Checked-Out' | 'Suspended';
export type PaymentType =
  | 'Monthly Rent'
  | 'Registration/Deposit'
  | 'Utility/Penalty'
  | 'Rebate / Fee Waiver'
  | 'Deposit Refund';
export type PaymentMethod =
  | 'DuitNow QR'
  | 'Online Transfer'
  | 'Cash'
  | 'PTPTN/Sponsor'
  | 'Internal Adjustment'
  | 'Historical Migration';
export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue' | 'Waived';
export type PhysicalReceiptStatus = 'Pending Issuance' | 'Issued';
export type StaffRole = 'Master Admin' | 'Admin' | 'Staff' | 'Viewer';
export type TabKey = 'dashboard' | 'students' | 'payments' | 'rooms' | 'reports' | 'users';

export const STAFF_ROLES: StaffRole[] = [
  'Master Admin',
  'Admin',
  'Staff',
  'Viewer',
];

export const HOSTEL_LOCATIONS: HostelLocation[] = [
  'Apartment Desa Jati 2',
  'Nilai Square',
];

export const ROOM_STATUSES: RoomStatus[] = [
  'Vacant',
  'Occupied',
  'Reserved / Blocked',
  'Maintenance',
];

export const RESIDENT_TYPES: ResidentType[] = [
  'Student',
  'Lecturer / Staff',
  'Guest',
];

export const OCCUPANT_TYPES: OccupantType[] = [
  'Student',
  'Lecturer / Staff',
  'Event Guest',
];

export const OCCUPANCY_MODES: AssignableOccupancyMode[] = [
  'Single Bed',
  'Custom Multi-Bed',
  'Whole Unit Exclusive',
];

export const REBATE_REASONS: RebateReason[] = [
  'None',
  'Management Rebate',
  'Staff Housing',
  'Sponsor / Scholarship',
  'Other',
];

export const PROGRAMS: ProgramType[] = ['Diploma', 'SKM', 'DiFFER', 'Other'];
export const STUDENT_STATUSES: StudentStatus[] = [
  'Active',
  'Checked-Out',
  'Suspended',
];
export const PAYMENT_TYPES: PaymentType[] = [
  'Monthly Rent',
  'Registration/Deposit',
  'Utility/Penalty',
  'Rebate / Fee Waiver',
  'Deposit Refund',
];
export const PAYMENT_METHODS: PaymentMethod[] = [
  'DuitNow QR',
  'Online Transfer',
  'Cash',
  'PTPTN/Sponsor',
  'Internal Adjustment',
  'Historical Migration',
];
export const BATCH_PAST_PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Online Transfer',
  'DuitNow QR',
  'PTPTN/Sponsor',
  'Historical Migration',
];
export const PAYMENT_STATUSES: PaymentStatus[] = [
  'Paid',
  'Pending',
  'Overdue',
  'Waived',
];

// Blueprint validation constants synced verbatim with firebase-blueprint.json
export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const FIELD_LIMITS = {
  roomId: { min: 3, max: 64 },
  block: { min: 1, max: 32 },
  unitNo: { min: 1, max: 32 },
  bedSlot: { min: 1, max: 32 },
  monthlyRate: { min: 0, max: 10000 },
  studentId: { min: 3, max: 64 },
  fullName: { min: 2, max: 120 },
  phone: { min: 6, max: 32 },
  emergencyContact: { min: 6, max: 120 },
  depositPaid: { min: 0, max: 50000 },
  monthlyFee: { min: 0, max: 10000 },
  paymentId: { min: 3, max: 64 },
  receiptNo: { min: 3, max: 32 },
  bankRefNo: { min: 0, max: 64 },
  notes: { min: 0, max: 240 },
  amount: { min: 0, max: 50000 },
  email: { min: 3, max: 160 },
  statusNote: { min: 0, max: 160 },
  rebateReason: { min: 0, max: 64 },
} as const;

export interface Room {
  roomId: string;
  location: HostelLocation;
  block: string;
  unitNo: string;
  bedSlot: string;
  monthlyRate: number;
  status: RoomStatus;
  currentStudentId: string | null;
  currentStudentName: string | null;
  statusNote?: string | null;
  exclusiveResidentId?: string | null;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface StayHistorySegment {
  id: string;
  roomId: string;
  hostelLocation: ResidentHostelLocation;
  occupancyMode: OccupancyMode;
  bedsOccupied?: number;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD | null
  standardRoomRate: number;
  monthlyRebate: number;
  effectiveMonthlyFee: number;
  firstMonthCharge?: number | null;
  reason: string;
  recordedBy: string;
  recordedAt: string;
}

export interface Student {
  studentId: string;
  fullName: string;
  residentType?: ResidentType;
  occupantType?: OccupantType;
  occupancyMode?: ResidentOccupancyMode;
  bedsOccupied?: number;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  assignedRoomId: string;
  hostelLocation: ResidentHostelLocation;
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  standardRoomRate?: number;
  monthlyRebate?: number;
  rebateReason?: string;
  effectiveMonthlyFee?: number;
  monthlyFee: number;
  firstMonthCharge?: number;
  firstMonthNote?: string;
  stayHistory?: StayHistorySegment[];
  status: StudentStatus;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface Payment {
  paymentId: string;
  receiptNo?: string;
  studentId: string;
  studentName: string;
  roomId: string;
  hostelLocation: ResidentHostelLocation;
  billingMonth: string;
  paymentType: PaymentType | string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  bankRefNo?: string;
  referenceNo?: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
  proofImageData?: string | null;
  physicalReceiptStatus?: PhysicalReceiptStatus;
  physicalReceiptNo?: string;
  receiptIssuedBy?: string | null;
  receiptIssuedAt?: Timestamp | null;
  recordedBy?: string;
  recordedAt?: Timestamp | null;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface StaffUser {
  uid: string;
  username: string;
  email: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
  authProvider?: string;
  createdAt: Timestamp | null;
  updatedBy?: string;
  updatedAt?: Timestamp | null;
}

export interface SegmentBillingBreakdown {
  segment: StayHistorySegment;
  monthsBilled: number;
  billedMonths: string[];
  expectedRent: number;
}

export interface ResidentBillingSummary {
  residentType: ResidentType;
  occupantType: OccupantType;
  occupancyMode: ResidentOccupancyMode;
  bedsOccupied: number;
  standardRoomRate: number;
  monthlyRebate: number;
  rebateReason: string;
  effectiveMonthlyFee: number;
  firstMonthCharge: number;
  firstMonthNote: string;
  monthsBilled: number;
  totalExpectedRent: number;
  totalRentCredited: number;
  outstandingBalance: number;
  segments: SegmentBillingBreakdown[];
}

export function resolveOccupantType(
  resident?: Pick<Student, 'occupantType' | 'residentType'> | null
): OccupantType {
  if (
    resident?.occupantType === 'Student' ||
    resident?.occupantType === 'Lecturer / Staff' ||
    resident?.occupantType === 'Event Guest'
  ) {
    return resident.occupantType;
  }
  if (resident?.residentType === 'Lecturer / Staff') {
    return 'Lecturer / Staff';
  }
  if (resident?.residentType === 'Guest') {
    return 'Event Guest';
  }
  return 'Student';
}

export function toLegacyResidentType(occupantType: OccupantType): ResidentType {
  if (occupantType === 'Lecturer / Staff') return 'Lecturer / Staff';
  if (occupantType === 'Event Guest') return 'Guest';
  return 'Student';
}

export function normalizeAssignableOccupancyMode(
  mode: string | null | undefined
): AssignableOccupancyMode {
  if (mode === 'Whole Unit Exclusive') return 'Whole Unit Exclusive';
  if (mode === 'Custom Multi-Bed') return 'Custom Multi-Bed';
  return 'Single Bed';
}

export function resolveBedsOccupiedCount(
  mode: string | null | undefined,
  bedsOccupied?: number | null,
  hasAssignedRoom = true
): number {
  if (!hasAssignedRoom || mode === 'Unassigned') return 0;
  if (mode === 'Single Bed') return 1;
  if (typeof bedsOccupied === 'number' && Number.isFinite(bedsOccupied) && bedsOccupied >= 1) {
    return Math.floor(bedsOccupied);
  }
  return 1;
}

export function formatRM(amount: number | null | undefined): string {
  const num = typeof amount === 'number' && !Number.isNaN(amount) ? amount : 0;
  return `RM ${num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function sanitizeIdSegment(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getLocationPrefix(location: HostelLocation): string {
  return location === 'Apartment Desa Jati 2' ? 'DJ2' : 'NSQ';
}

export function buildRoomId(
  location: HostelLocation,
  block: string,
  unitNo: string,
  bedSlot: string
): string {
  const prefix = getLocationPrefix(location);
  const b = sanitizeIdSegment(block) || 'X';
  const u = sanitizeIdSegment(unitNo) || '00';
  const s = sanitizeIdSegment(bedSlot) || 'B1';
  return `${prefix}-${b}-${u}-${s}`.slice(0, FIELD_LIMITS.roomId.max);
}

export function generateBulkBedSlots(
  count: number,
  prefix = 'B',
  startNumber = 1
): string[] {
  const safeCount = Math.min(8, Math.max(1, Math.floor(count)));
  const safeStart = Math.max(1, Math.floor(startNumber || 1));
  const cleanPrefix = (prefix || 'B').trim().slice(0, 20) || 'B';
  return Array.from({ length: safeCount }, (_, idx) => `${cleanPrefix}${safeStart + idx}`);
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatTimestamp(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') {
    return 'Just now';
  }
  const date = ts.toDate();
  return date.toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateMonthsBilled(
  checkInDate: string,
  endDate: string
): number {
  if (!DATE_REGEX.test(checkInDate) || !DATE_REGEX.test(endDate)) {
    return 1;
  }
  const [sY, sM, sD] = checkInDate.split('-').map(Number);
  const [eY, eM, eD] = endDate.split('-').map(Number);
  const diffMonths = (eY - sY) * 12 + (eM - sM) + (eD >= sD ? 1 : 0);
  return Math.max(1, diffMonths);
}

export function isRentCreditType(paymentType: string): boolean {
  return (
    paymentType === 'Monthly Rent' ||
    paymentType === 'Rebate / Fee Waiver'
  );
}

export function isSettledPaymentStatus(status: PaymentStatus): boolean {
  return status === 'Paid' || status === 'Waived';
}

export function isCashPaymentType(paymentType: string): boolean {
  return paymentType !== 'Rebate / Fee Waiver';
}

export function getPaymentReceiptNo(p: Payment): string {
  return p.receiptNo || p.paymentId;
}

export function getPaymentBankRef(p: Payment): string {
  return p.bankRefNo || p.referenceNo || '';
}

export function getPaymentRecordedBy(p: Payment): string {
  return p.recordedBy || p.updatedBy;
}

export function getPhysicalReceiptStatus(p: Payment): PhysicalReceiptStatus {
  return p.physicalReceiptStatus === 'Issued' ? 'Issued' : 'Pending Issuance';
}

export function normalizeStaffLoginEmail(identifier: string): string {
  const clean = identifier.trim().toLowerCase();
  if (!clean) return '';
  return clean.includes('@') ? clean : `${clean}@gis-hostel.local`;
}

export function extractUsernameFromEmail(email: string): string {
  const clean = email.trim().toLowerCase();
  if (!clean) return 'staff';
  if (clean.endsWith('@gis-hostel.local')) {
    return clean.replace(/@gis-hostel\.local$/, '');
  }
  return clean.split('@')[0] || clean;
}

export function calculateFirstMonthDefaults(
  checkInDate: string,
  effectiveMonthlyFee: number
): { firstMonthCharge: number; firstMonthNote: string } {
  const cleanFee = Math.max(0, Math.round((effectiveMonthlyFee || 0) * 100) / 100);
  if (!DATE_REGEX.test(checkInDate)) {
    return {
      firstMonthCharge: cleanFee,
      firstMonthNote: 'Standard Full Month',
    };
  }
  const day = Number.parseInt(checkInDate.split('-')[2] || '1', 10);
  if (day > 15) {
    return {
      firstMonthCharge: Math.round((cleanFee / 2) * 100) / 100,
      firstMonthNote: 'After 15th Half-Rate',
    };
  }
  return {
    firstMonthCharge: cleanFee,
    firstMonthNote: 'Standard Full Month',
  };
}

export function subtractOneDayISO(dateStr: string): string {
  if (!DATE_REGEX.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function enumerateMonthsISO(startYM: string, endYM: string): string[] {
  if (!MONTH_REGEX.test(startYM) || !MONTH_REGEX.test(endYM) || startYM > endYM) {
    return [];
  }
  const [sY, sM] = startYM.split('-').map(Number);
  const [eY, eM] = endYM.split('-').map(Number);
  const out: string[] = [];
  let y = sY;
  let m = sM;
  let guard = 0;
  while ((y < eY || (y === eY && m <= eM)) && guard < 240) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

export function getNormalizedStayHistory(student: Student): StayHistorySegment[] {
  if (Array.isArray(student.stayHistory)) {
    return [...student.stayHistory]
      .map((seg, idx) => {
        const segStartDate = seg.startDate || student.checkInDate;
        const segStdRate =
          typeof seg.standardRoomRate === 'number'
            ? seg.standardRoomRate
            : student.standardRoomRate ?? student.monthlyFee;
        const segRebate =
          typeof seg.monthlyRebate === 'number'
            ? seg.monthlyRebate
            : student.monthlyRebate ?? 0;
        const segEffFee =
          typeof seg.effectiveMonthlyFee === 'number'
            ? seg.effectiveMonthlyFee
            : Math.max(0, segStdRate - segRebate);
        const segFirstMonth =
          typeof seg.firstMonthCharge === 'number'
            ? seg.firstMonthCharge
            : calculateFirstMonthDefaults(segStartDate, segEffFee).firstMonthCharge;
        const segOccupancyMode: OccupancyMode =
          seg.occupancyMode === 'Unassigned'
            ? 'Unassigned'
            : seg.occupancyMode
              ? normalizeAssignableOccupancyMode(seg.occupancyMode)
              : student.occupancyMode && student.occupancyMode !== 'Unassigned'
                ? normalizeAssignableOccupancyMode(student.occupancyMode)
                : 'Single Bed';
        const segBedsOccupied = resolveBedsOccupiedCount(
          segOccupancyMode,
          typeof seg.bedsOccupied === 'number'
            ? seg.bedsOccupied
            : !seg.endDate
              ? student.bedsOccupied
              : undefined,
          Boolean((seg.roomId || '').trim())
        );

        return {
          ...seg,
          id: seg.id || `SEG-${student.studentId}-${idx + 1}`,
          roomId: seg.roomId || '',
          hostelLocation: seg.hostelLocation || student.hostelLocation || 'Unassigned',
          occupancyMode: segOccupancyMode,
          bedsOccupied: segBedsOccupied,
          startDate: segStartDate,
          endDate: seg.endDate ?? null,
          standardRoomRate: segStdRate,
          monthlyRebate: segRebate,
          effectiveMonthlyFee: segEffFee,
          firstMonthCharge: segFirstMonth,
          reason: seg.reason || 'Initial Check-In',
          recordedBy: seg.recordedBy || student.updatedBy || 'System',
          recordedAt: seg.recordedAt || '',
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  const standardRoomRate =
    typeof student.standardRoomRate === 'number'
      ? student.standardRoomRate
      : student.monthlyFee;
  const monthlyRebate =
    typeof student.monthlyRebate === 'number' ? student.monthlyRebate : 0;
  const effectiveMonthlyFee =
    typeof student.effectiveMonthlyFee === 'number'
      ? student.effectiveMonthlyFee
      : Math.max(0, standardRoomRate - monthlyRebate);
  const fallbackMode: OccupancyMode = !(student.assignedRoomId || '').trim()
    ? 'Unassigned'
    : normalizeAssignableOccupancyMode(student.occupancyMode);
  const fallbackBeds = resolveBedsOccupiedCount(
    fallbackMode,
    student.bedsOccupied,
    Boolean((student.assignedRoomId || '').trim())
  );

  return [
    {
      id: `SEG-INIT-${student.studentId}`,
      roomId: student.assignedRoomId || '',
      hostelLocation: student.hostelLocation || 'Unassigned',
      occupancyMode: fallbackMode,
      bedsOccupied: fallbackBeds,
      startDate: student.checkInDate,
      endDate: student.status === 'Checked-Out' ? student.checkOutDate : null,
      standardRoomRate,
      monthlyRebate,
      effectiveMonthlyFee,
      firstMonthCharge:
        typeof student.firstMonthCharge === 'number'
          ? student.firstMonthCharge
          : calculateFirstMonthDefaults(student.checkInDate, effectiveMonthlyFee)
              .firstMonthCharge,
      reason: 'Initial Check-In',
      recordedBy: student.updatedBy || 'System',
      recordedAt: '',
    },
  ];
}

export function calculateResidentBilling(
  student: Student,
  payments: Payment[],
  asOfDate = getTodayISO()
): ResidentBillingSummary {
  const occupantType = resolveOccupantType(student);
  const residentType: ResidentType =
    student.residentType || toLegacyResidentType(occupantType);
  const hasAssignedRoom = Boolean((student.assignedRoomId || '').trim());
  const occupancyMode: ResidentOccupancyMode = !hasAssignedRoom
    ? 'Unassigned'
    : normalizeAssignableOccupancyMode(student.occupancyMode);
  const bedsOccupied = resolveBedsOccupiedCount(
    occupancyMode,
    student.bedsOccupied,
    hasAssignedRoom
  );
  const standardRoomRate =
    typeof student.standardRoomRate === 'number'
      ? student.standardRoomRate
      : student.monthlyFee;
  const monthlyRebate =
    typeof student.monthlyRebate === 'number' ? student.monthlyRebate : 0;
  const rebateReason = student.rebateReason || 'None';
  const effectiveMonthlyFee =
    typeof student.effectiveMonthlyFee === 'number'
      ? student.effectiveMonthlyFee
      : Math.max(0, standardRoomRate - monthlyRebate);

  const normalizedSegments = getNormalizedStayHistory(student);
  const activeOpenSeg = normalizedSegments.find((s) => !s.endDate);
  const firstSeg = normalizedSegments[0];
  const defaults = calculateFirstMonthDefaults(
    student.checkInDate,
    effectiveMonthlyFee
  );
  const firstMonthCharge =
    typeof student.firstMonthCharge === 'number'
      ? Math.max(0, Math.round(student.firstMonthCharge * 100) / 100)
      : activeOpenSeg && typeof activeOpenSeg.firstMonthCharge === 'number'
        ? Math.max(0, Math.round(activeOpenSeg.firstMonthCharge * 100) / 100)
        : firstSeg && typeof firstSeg.firstMonthCharge === 'number'
          ? Math.max(0, Math.round(firstSeg.firstMonthCharge * 100) / 100)
          : defaults.firstMonthCharge;
  const firstMonthNote = student.firstMonthNote || defaults.firstMonthNote;

  const billingEndDate =
    student.status === 'Checked-Out' && student.checkOutDate
      ? student.checkOutDate
      : asOfDate;

  let monthsBilled = 0;
  let totalExpectedRent = 0;
  const segmentBreakdowns: SegmentBillingBreakdown[] = [];

  if (normalizedSegments.length === 0) {
    monthsBilled = 0;
    totalExpectedRent = 0;
  } else if (normalizedSegments.length === 1) {
    const seg = normalizedSegments[0];
    const segEnd = seg.endDate || billingEndDate;
    const effectiveEnd =
      DATE_REGEX.test(seg.startDate) && DATE_REGEX.test(segEnd) && segEnd < seg.startDate
        ? seg.startDate
        : segEnd;
    monthsBilled = calculateMonthsBilled(seg.startDate, effectiveEnd);
    const segFirstCharge =
      typeof seg.firstMonthCharge === 'number'
        ? Math.max(0, Math.round(seg.firstMonthCharge * 100) / 100)
        : calculateFirstMonthDefaults(seg.startDate, seg.effectiveMonthlyFee)
            .firstMonthCharge;
    const segRate = seg.effectiveMonthlyFee;
    totalExpectedRent =
      monthsBilled === 1
        ? segFirstCharge
        : Math.round((segFirstCharge + (monthsBilled - 1) * segRate) * 100) / 100;

    const startYM = seg.startDate.slice(0, 7);
    const endYM = effectiveEnd.slice(0, 7);
    const billedMonths = enumerateMonthsISO(startYM, endYM).slice(0, monthsBilled);
    segmentBreakdowns.push({
      segment: seg,
      monthsBilled,
      billedMonths,
      expectedRent: totalExpectedRent,
    });
  } else {
    // Multi-segment billing: each segment uses its own isolated snapshot rates & firstMonthCharge
    const claimedMonths = new Set<string>();

    for (let i = 0; i < normalizedSegments.length; i++) {
      const seg = normalizedSegments[i];
      if (!DATE_REGEX.test(seg.startDate) || seg.startDate > billingEndDate) {
        segmentBreakdowns.push({
          segment: seg,
          monthsBilled: 0,
          billedMonths: [],
          expectedRent: 0,
        });
        continue;
      }

      const rawEnd = seg.endDate || billingEndDate;
      let clampedEnd = rawEnd > billingEndDate ? billingEndDate : rawEnd;
      if (clampedEnd < seg.startDate) {
        clampedEnd = seg.startDate;
      }

      const startYM = seg.startDate.slice(0, 7);
      const endYM = clampedEnd.slice(0, 7);
      const segMonths = enumerateMonthsISO(startYM, endYM);
      const billedForSeg: string[] = [];
      let segExpected = 0;

      const segFirstCharge =
        typeof seg.firstMonthCharge === 'number'
          ? Math.max(0, Math.round(seg.firstMonthCharge * 100) / 100)
          : calculateFirstMonthDefaults(seg.startDate, seg.effectiveMonthlyFee)
              .firstMonthCharge;

      for (const ym of segMonths) {
        if (claimedMonths.has(ym)) continue;
        claimedMonths.add(ym);
        billedForSeg.push(ym);

        if (ym === startYM) {
          segExpected += segFirstCharge;
        } else {
          segExpected += seg.effectiveMonthlyFee;
        }
      }

      segExpected = Math.round(segExpected * 100) / 100;
      monthsBilled += billedForSeg.length;
      totalExpectedRent += segExpected;
      segmentBreakdowns.push({
        segment: seg,
        monthsBilled: billedForSeg.length,
        billedMonths: billedForSeg,
        expectedRent: segExpected,
      });
    }

    if (monthsBilled === 0) {
      monthsBilled = 1;
      totalExpectedRent = firstMonthCharge;
    } else {
      totalExpectedRent = Math.round(totalExpectedRent * 100) / 100;
    }
  }

  const totalRentCredited =
    Math.round(
      payments
        .filter(
          (p) =>
            p.studentId === student.studentId &&
            isRentCreditType(p.paymentType) &&
            isSettledPaymentStatus(p.status)
        )
        .reduce((sum, p) => sum + p.amount, 0) * 100
    ) / 100;

  const outstandingBalance = Math.max(
    0,
    Math.round((totalExpectedRent - totalRentCredited) * 100) / 100
  );

  return {
    residentType,
    occupantType,
    occupancyMode,
    bedsOccupied,
    standardRoomRate,
    monthlyRebate,
    rebateReason,
    effectiveMonthlyFee,
    firstMonthCharge,
    firstMonthNote,
    monthsBilled,
    totalExpectedRent,
    totalRentCredited,
    outstandingBalance,
    segments: segmentBreakdowns,
  };
}

export const calculateStudentBilling = calculateResidentBilling;

export interface MonthInstallmentStatus {
  monthTargetCharge: number;
  alreadyCreditedForMonth: number;
  remainingBeforeEntry: number;
  remainingAfterEntry: number;
  isFullSettlement: boolean;
  existingInstallmentsCount: number;
}

export function calculateMonthInstallmentStatus(
  student: Student,
  payments: Payment[],
  billingMonth: string,
  currentEntryAmount: number,
  excludePaymentId?: string
): MonthInstallmentStatus {
  const summary = calculateResidentBilling(student, payments);
  let monthTargetCharge = summary.effectiveMonthlyFee;
  if (MONTH_REGEX.test(billingMonth) && summary.segments.length > 0) {
    const owner = summary.segments.find((sb) =>
      sb.billedMonths.includes(billingMonth)
    );
    if (owner) {
      monthTargetCharge =
        billingMonth === owner.segment.startDate.slice(0, 7) &&
        typeof owner.segment.firstMonthCharge === 'number'
          ? owner.segment.firstMonthCharge
          : owner.segment.effectiveMonthlyFee;
    } else {
      const matchingRange = [...summary.segments]
        .reverse()
        .find((sb) => sb.segment.startDate.slice(0, 7) <= billingMonth);
      if (matchingRange) {
        monthTargetCharge =
          billingMonth === matchingRange.segment.startDate.slice(0, 7) &&
          typeof matchingRange.segment.firstMonthCharge === 'number'
            ? matchingRange.segment.firstMonthCharge
            : matchingRange.segment.effectiveMonthlyFee;
      } else if (student.checkInDate.slice(0, 7) === billingMonth) {
        monthTargetCharge = summary.firstMonthCharge;
      }
    }
  } else if (
    MONTH_REGEX.test(billingMonth) &&
    student.checkInDate.slice(0, 7) === billingMonth
  ) {
    monthTargetCharge = summary.firstMonthCharge;
  }

  const settledForMonth = payments.filter(
    (p) =>
      p.paymentId !== excludePaymentId &&
      p.studentId === student.studentId &&
      p.billingMonth === billingMonth &&
      isRentCreditType(p.paymentType) &&
      isSettledPaymentStatus(p.status)
  );

  const alreadyCreditedForMonth =
    Math.round(settledForMonth.reduce((sum, p) => sum + p.amount, 0) * 100) /
    100;

  const remainingBeforeEntry = Math.max(
    0,
    Math.round((monthTargetCharge - alreadyCreditedForMonth) * 100) / 100
  );
  const cleanAmount = Math.max(0, Number(currentEntryAmount) || 0);
  const remainingAfterEntry = Math.max(
    0,
    Math.round((remainingBeforeEntry - cleanAmount) * 100) / 100
  );

  return {
    monthTargetCharge,
    alreadyCreditedForMonth,
    remainingBeforeEntry,
    remainingAfterEntry,
    isFullSettlement: remainingAfterEntry <= 0.009,
    existingInstallmentsCount: settledForMonth.length,
  };
}

export function generateReceiptNumber(
  billingMonth: string,
  existingPayments: Payment[]
): string {
  const ym = billingMonth.replace('-', '');
  const prefix = `GIS-${ym}-`;
  let maxSeq = 0;
  for (const p of existingPayments) {
    const r = getPaymentReceiptNo(p);
    if (r.startsWith(prefix)) {
      const tail = r.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `${prefix}${nextSeq}`;
}
