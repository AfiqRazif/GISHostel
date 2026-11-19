import type { Timestamp } from 'firebase/firestore';

export type HostelLocation = 'Apartment Desa Jati 2' | 'Nilai Square';
export type RoomStatus =
  | 'Vacant'
  | 'Occupied'
  | 'Maintenance'
  | 'Reserved / Blocked';
export type ResidentType = 'Student' | 'Lecturer / Staff' | 'Guest';
export type OccupancyMode = 'Single Bed' | 'Whole Unit Exclusive';
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
  | 'Internal Adjustment';
export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue' | 'Waived';
export type PhysicalReceiptStatus = 'Pending Issuance' | 'Issued';
export type StaffRole = 'Master Admin' | 'Admin' | 'Staff';
export type TabKey = 'dashboard' | 'students' | 'payments' | 'rooms' | 'users';

export const STAFF_ROLES: StaffRole[] = ['Master Admin', 'Admin', 'Staff'];

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

export const OCCUPANCY_MODES: OccupancyMode[] = [
  'Single Bed',
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

export interface Student {
  studentId: string;
  fullName: string;
  residentType?: ResidentType;
  occupancyMode?: OccupancyMode;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  assignedRoomId: string;
  hostelLocation: HostelLocation;
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
  hostelLocation: HostelLocation;
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
  createdAt: Timestamp | null;
  updatedBy?: string;
  updatedAt?: Timestamp | null;
}

export interface ResidentBillingSummary {
  residentType: ResidentType;
  occupancyMode: OccupancyMode;
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

export function calculateResidentBilling(
  student: Student,
  payments: Payment[],
  asOfDate = getTodayISO()
): ResidentBillingSummary {
  const residentType: ResidentType = student.residentType || 'Student';
  const occupancyMode: OccupancyMode = student.occupancyMode || 'Single Bed';
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

  const defaults = calculateFirstMonthDefaults(
    student.checkInDate,
    effectiveMonthlyFee
  );
  const firstMonthCharge =
    typeof student.firstMonthCharge === 'number'
      ? Math.max(0, Math.round(student.firstMonthCharge * 100) / 100)
      : defaults.firstMonthCharge;
  const firstMonthNote = student.firstMonthNote || defaults.firstMonthNote;

  const billingEndDate =
    student.status === 'Checked-Out' && student.checkOutDate
      ? student.checkOutDate
      : asOfDate;

  const monthsBilled = calculateMonthsBilled(student.checkInDate, billingEndDate);
  const totalExpectedRent =
    monthsBilled === 1
      ? firstMonthCharge
      : Math.round(
          (firstMonthCharge + (monthsBilled - 1) * effectiveMonthlyFee) * 100
        ) / 100;

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
    occupancyMode,
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
  };
}

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
  const isCheckInMonth =
    MONTH_REGEX.test(billingMonth) &&
    student.checkInDate.slice(0, 7) === billingMonth;

  const monthTargetCharge = isCheckInMonth
    ? summary.firstMonthCharge
    : summary.effectiveMonthlyFee;

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
