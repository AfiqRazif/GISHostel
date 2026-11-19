import type { Timestamp } from 'firebase/firestore';

export type HostelLocation = 'Apartment Desa Jati 2' | 'Nilai Square';
export type RoomStatus = 'Vacant' | 'Occupied' | 'Maintenance';
export type ProgramType = 'Diploma' | 'SKM' | 'DiFFER' | 'Other';
export type StudentStatus = 'Active' | 'Checked-Out' | 'Suspended';
export type PaymentType = 'Monthly Rent' | 'Hostel Deposit' | 'Utility / Misc' | 'Refund';
export type PaymentMethod = 'Online Transfer (FPX/DuitNow)' | 'Cash' | 'JomPAY' | 'Card';
export type PaymentStatus = 'Paid' | 'Pending' | 'Overdue' | 'Waived';
export type TabKey = 'dashboard' | 'students' | 'payments' | 'rooms';

export const HOSTEL_LOCATIONS: HostelLocation[] = [
  'Apartment Desa Jati 2',
  'Nilai Square',
];

export const ROOM_STATUSES: RoomStatus[] = ['Vacant', 'Occupied', 'Maintenance'];
export const PROGRAMS: ProgramType[] = ['Diploma', 'SKM', 'DiFFER', 'Other'];
export const STUDENT_STATUSES: StudentStatus[] = ['Active', 'Checked-Out', 'Suspended'];
export const PAYMENT_TYPES: PaymentType[] = [
  'Monthly Rent',
  'Hostel Deposit',
  'Utility / Misc',
  'Refund',
];
export const PAYMENT_METHODS: PaymentMethod[] = [
  'Online Transfer (FPX/DuitNow)',
  'Cash',
  'JomPAY',
  'Card',
];
export const PAYMENT_STATUSES: PaymentStatus[] = ['Paid', 'Pending', 'Overdue', 'Waived'];

// Blueprint validation constants synced verbatim with firebase-blueprint.json & firestore.rules
export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const FIELD_LIMITS = {
  roomId: { min: 3, max: 64 },
  block: { min: 1, max: 32 },
  unitNo: { min: 1, max: 32 },
  bedSlot: { min: 1, max: 16 },
  monthlyRate: { min: 0, max: 10000 },
  studentId: { min: 3, max: 64 },
  fullName: { min: 2, max: 120 },
  phone: { min: 6, max: 32 },
  emergencyContact: { min: 6, max: 120 },
  depositPaid: { min: 0, max: 50000 },
  monthlyFee: { min: 0, max: 10000 },
  paymentId: { min: 3, max: 64 },
  referenceNo: { min: 0, max: 64 },
  notes: { min: 0, max: 240 },
  amount: { min: 0, max: 50000 },
  email: { min: 3, max: 160 },
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
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface Student {
  studentId: string;
  fullName: string;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  assignedRoomId: string;
  hostelLocation: HostelLocation;
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  monthlyFee: number;
  status: StudentStatus;
  updatedBy: string;
  updatedAt: Timestamp | null;
}

export interface Payment {
  paymentId: string;
  studentId: string;
  studentName: string;
  roomId: string;
  hostelLocation: HostelLocation;
  billingMonth: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
  updatedBy: string;
  updatedAt: Timestamp | null;
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
