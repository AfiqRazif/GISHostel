import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  calculateFirstMonthDefaults,
  DATE_REGEX,
  FIELD_LIMITS,
  formatRM,
  getCurrentMonthISO,
  getTodayISO,
  getNormalizedStayHistory,
  HOSTEL_LOCATIONS,
  HostelLocation,
  ID_REGEX,
  MONTH_REGEX,
  OCCUPANCY_MODES,
  OccupancyMode,
  Payment,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PhysicalReceiptStatus,
  PROGRAMS,
  ProgramType,
  RESIDENT_TYPES,
  ResidentHostelLocation,
  ResidentType,
  Room,
  sanitizeIdSegment,
  StaffRole,
  Student,
} from '../types/hostel';
import {
  BulkImportPaymentItem,
  BulkImportRoomItem,
  BulkImportStudentItem,
  BulkImportTenancyHistoryItem,
  bulkImportPayments,
  bulkImportRooms,
  bulkImportStudents,
  bulkImportTenancyHistory,
  TenancyImportMode,
} from '../lib/hostelService';

export type BulkImportType = 'rooms' | 'students' | 'payments' | 'tenancyHistory';

interface BulkImportModalProps {
  isOpen: boolean;
  importType: BulkImportType;
  staffRole?: StaffRole;
  rooms: Room[];
  students: Student[];
  payments: Payment[];
  staffEmail: string;
  onClose: () => void;
  onImportComplete: (summaryMessage: string) => void;
}

interface ParsedPreviewRow<T> {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  summaryLabel: string;
  detailLabel: string;
  amountOrRateLabel: string;
  statusLabel: string;
  payload: T | null;
}

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toNormalizedRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = normalizeHeaderKey(k);
    if (norm) out[norm] = v;
  }
  return out;
}

function getCell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const norm = normalizeHeaderKey(k);
    if (norm in row && row[norm] !== undefined && row[norm] !== null) {
      return row[norm];
    }
  }
  return '';
}

function trimCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return String(val).trim();
  }
  return String(val).trim();
}

function parseNumberCell(val: unknown): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const cleaned = String(val)
    .replace(/RM/gi, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeExcelDate(val: unknown): string {
  if (val === null || val === undefined || String(val).trim() === '') return '';

  if (typeof val === 'number' && Number.isFinite(val) && val > 1000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && isValidCalendarDate(parsed.y, parsed.m, parsed.d)) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = val.getMonth() + 1;
    const d = val.getDate();
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const str = String(val).trim();
  if (/^\d{4,6}(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed && isValidCalendarDate(parsed.y, parsed.m, parsed.d)) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return '';
}

function normalizeBillingMonth(val: unknown): string {
  if (val === null || val === undefined || String(val).trim() === '') return '';

  if (typeof val === 'number' && Number.isFinite(val) && val > 1000) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y >= 1990 && parsed.y <= 2100 && parsed.m >= 1 && parsed.m <= 12) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
    }
  }

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}`;
  }

  const str = String(val).trim();
  if (/^\d{4,6}(\.\d+)?$/.test(str)) {
    const parsed = XLSX.SSF.parse_date_code(Number(str));
    if (parsed && parsed.y >= 1990 && parsed.y <= 2100 && parsed.m >= 1 && parsed.m <= 12) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
    }
  }

  const ym = str.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }

  const my = str.match(/^(\d{1,2})[-/](\d{4})$/);
  if (my) {
    const m = Number(my[1]);
    const y = Number(my[2]);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }

  return '';
}

function matchEnum<T extends string>(raw: string, allowed: readonly T[]): T | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  for (const candidate of allowed) {
    if (candidate.toLowerCase() === clean) return candidate;
  }
  return null;
}

function matchLocation(raw: string): HostelLocation | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  if (clean === 'apartment desa jati 2' || clean === 'dj2' || clean === 'desa jati 2') {
    return 'Apartment Desa Jati 2';
  }
  if (clean === 'nilai square' || clean === 'nsq') {
    return 'Nilai Square';
  }
  return matchEnum(raw, HOSTEL_LOCATIONS);
}

function matchResidentLocation(raw: string): ResidentHostelLocation | null {
  const clean = raw.trim().toLowerCase();
  if (!clean) return null;
  if (clean === 'unassigned' || clean === 'none' || clean === '-') {
    return 'Unassigned';
  }
  return matchLocation(raw);
}

function downloadTemplateWorkbook(type: BulkImportType) {
  let filename = '';
  let sheetName = '';
  let sampleRows: Record<string, string | number>[] = [];

  if (type === 'rooms') {
    filename = 'gis-rooms-import-template.xlsx';
    sheetName = 'Rooms';
    sampleRows = [
      {
        roomId: 'DJ2-A-05-B1',
        location: 'Apartment Desa Jati 2',
        block: 'A',
        unitNo: '05',
        bedSlot: 'B1',
        monthlyRate: 250,
        status: 'Vacant',
      },
      {
        roomId: 'DJ2-A-05-B2',
        location: 'Apartment Desa Jati 2',
        block: 'A',
        unitNo: '05',
        bedSlot: 'B2',
        monthlyRate: 250,
        status: 'Vacant',
      },
      {
        roomId: 'NSQ-C-09-B1',
        location: 'Nilai Square',
        block: 'C',
        unitNo: '09',
        bedSlot: 'B1',
        monthlyRate: 280,
        status: 'Maintenance',
      },
    ];
  } else if (type === 'students') {
    filename = 'gis-residents-import-template.xlsx';
    sheetName = 'Residents';
    sampleRows = [
      {
        studentId: 'GIS250401',
        fullName: 'Nurul Iman binti Zulkifli',
        phone: '012-345 6789',
        emergencyContact: 'Zulkifli bin Ahmad 019-222 1100',
        program: 'Diploma',
        residentType: 'Student',
        occupancyMode: 'Single Bed',
        assignedRoomId: 'DJ2-A-04-B3',
        hostelLocation: 'Apartment Desa Jati 2',
        checkInDate: '2026-10-18',
        checkOutDate: '',
        depositPaid: 250,
        standardRoomRate: 250,
        monthlyRebate: 0,
        rebateReason: 'None',
        firstMonthCharge: '',
        status: 'Active',
      },
      {
        studentId: 'GIS240199',
        fullName: 'Daniel Hakim bin Roslan',
        phone: '011-7788 9900',
        emergencyContact: 'Roslan bin Isa 013-900 4411',
        program: 'SKM',
        residentType: 'Student',
        occupancyMode: 'Single Bed',
        assignedRoomId: 'DJ2-A-04-B1',
        hostelLocation: 'Apartment Desa Jati 2',
        checkInDate: '2026-01-05',
        checkOutDate: '2026-08-31',
        depositPaid: 250,
        standardRoomRate: 250,
        monthlyRebate: 0,
        rebateReason: 'None',
        firstMonthCharge: '',
        status: 'Checked-Out',
      },
      {
        studentId: 'GIS260015',
        fullName: 'Farahiyah binti Azman',
        phone: '',
        emergencyContact: '',
        program: 'Diploma',
        residentType: 'Student',
        occupancyMode: 'Single Bed',
        assignedRoomId: '',
        hostelLocation: '',
        checkInDate: '',
        checkOutDate: '',
        depositPaid: 250,
        standardRoomRate: 250,
        monthlyRebate: 0,
        rebateReason: 'None',
        firstMonthCharge: '',
        status: 'Active',
      },
    ];
  } else if (type === 'tenancyHistory') {
    filename = 'gis-tenancy-history-import-template.xlsx';
    sheetName = 'TenancyHistory';
    sampleRows = [
      {
        studentId: 'GIS250101',
        roomId: 'DJ2-A-01-B1',
        hostelLocation: 'Apartment Desa Jati 2',
        occupancyMode: 'Single Bed',
        startDate: '2026-01-05',
        endDate: '2026-06-30',
        standardRoomRate: 250,
        monthlyRebate: 0,
        firstMonthCharge: '',
        reason: 'Initial Check-In',
      },
      {
        studentId: 'GIS250101',
        roomId: 'NSQ-C-09-B1',
        hostelLocation: 'Nilai Square',
        occupancyMode: 'Single Bed',
        startDate: '2026-07-01',
        endDate: '',
        standardRoomRate: 280,
        monthlyRebate: 30,
        firstMonthCharge: '',
        reason: 'Maintenance / Unit Upgrade',
      },
    ];
  } else {
    filename = 'gis-payments-import-template.xlsx';
    sheetName = 'HistoricalPayments';
    sampleRows = [
      {
        studentId: 'GIS250101',
        billingMonth: '2026-09',
        paymentType: 'Monthly Rent',
        amount: 250,
        paymentMethod: 'DuitNow QR',
        bankRefNo: 'DUITNOW-20260901-01',
        physicalReceiptStatus: 'Issued',
        physicalReceiptNo: 'BK-DJ2-0088',
        notes: 'September 2026 hostel fee',
      },
      {
        studentId: 'GIS250102',
        billingMonth: '2026-09',
        paymentType: 'Registration/Deposit',
        amount: 250,
        paymentMethod: 'Online Transfer',
        bankRefNo: 'MBB-20260901-12',
        physicalReceiptStatus: 'Pending Issuance',
        physicalReceiptNo: '',
        notes: 'Security deposit import',
      },
    ];
  }

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

const MODAL_META: Record<
  BulkImportType,
  { title: string; subtitle: string; noun: string }
> = {
  rooms: {
    title: 'Bulk Import Rooms & Bed Slots (.xlsx / .csv)',
    subtitle:
      'Upload an Excel or CSV file to add multiple hostel rooms/beds across Apartment Desa Jati 2 and Nilai Square.',
    noun: 'rooms',
  },
  students: {
    title: 'Bulk Import Residents (.xlsx / .csv)',
    subtitle:
      'Only studentId and fullName are required. Leave assignedRoomId blank to import Active residents as Room Unassigned for later bed allocation.',
    noun: 'residents',
  },
  payments: {
    title: 'Master Admin · Bulk Import Historical Payments (.xlsx / .csv)',
    subtitle:
      'Import past rent, deposit, or fee waiver records tied to existing Resident IDs with physical receipt statuses.',
    noun: 'payments',
  },
  tenancyHistory: {
    title: 'Master Admin · Bulk Tenancy History Upload (.xlsx / .csv)',
    subtitle:
      'Import multi-segment room & rate histories per resident. Closed segments lock to their historical period rate without overwriting current active rates.',
    noun: 'stay segments',
  },
};

export function BulkImportModal({
  isOpen,
  importType,
  staffRole = 'Staff',
  rooms,
  students,
  payments,
  staffEmail,
  onClose,
  onImportComplete,
}: BulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors'>('all');
  const [tenancyImportMode, setTenancyImportMode] =
    useState<TenancyImportMode>('append');

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const isMasterAdminRestricted =
    (importType === 'tenancyHistory' || importType === 'payments') &&
    staffRole !== 'Master Admin';

  const validatedRows = useMemo((): ParsedPreviewRow<unknown>[] => {
    if (rawRows.length === 0 || isMasterAdminRestricted) return [];

    if (importType === 'rooms') {
      const existingRoomIds = new Set(rooms.map((r) => r.roomId));
      const seenRoomIds = new Set<string>();

      return rawRows.map((raw, idx): ParsedPreviewRow<BulkImportRoomItem> => {
        const rowNumber = idx + 2;
        const errors: string[] = [];
        const rawRoomId = trimCell(getCell(raw, 'roomId', 'room_id', 'Room ID'));
        const roomId = sanitizeIdSegment(rawRoomId);
        const rawLoc = trimCell(getCell(raw, 'location', 'hostelLocation', 'Location'));
        const block = trimCell(getCell(raw, 'block', 'Block'));
        const unitNo = trimCell(getCell(raw, 'unitNo', 'unit', 'Unit No'));
        const bedSlot = trimCell(getCell(raw, 'bedSlot', 'bed', 'Bed Slot'));
        const monthlyRate = parseNumberCell(
          getCell(raw, 'monthlyRate', 'rate', 'Monthly Rate')
        );
        const rawStatus = trimCell(getCell(raw, 'status', 'Status')) || 'Vacant';

        if (!roomId || roomId.length < FIELD_LIMITS.roomId.min || !ID_REGEX.test(roomId)) {
          errors.push('Invalid or missing roomId (min 3 alphanumeric/hyphen chars)');
        } else if (existingRoomIds.has(roomId)) {
          errors.push(`Duplicate Room ID "${roomId}" already exists in inventory`);
        } else if (seenRoomIds.has(roomId)) {
          errors.push(`Duplicate Room ID "${roomId}" appears earlier in this file`);
        }

        const location = matchLocation(rawLoc);
        if (!location) {
          errors.push(
            `Invalid location "${rawLoc || '(blank)'}" (must be "Apartment Desa Jati 2" or "Nilai Square")`
          );
        }

        if (!block) errors.push('Block is required');
        if (!unitNo) errors.push('Unit No is required');
        if (!bedSlot) errors.push('Bed Slot is required');

        if (
          monthlyRate === null ||
          monthlyRate < FIELD_LIMITS.monthlyRate.min ||
          monthlyRate > FIELD_LIMITS.monthlyRate.max
        ) {
          errors.push('monthlyRate must be a number between 0 and 10,000');
        }

        const status = matchEnum(rawStatus, ['Vacant', 'Maintenance'] as const);
        if (!status) {
          errors.push(
            `Invalid status "${rawStatus}" (use "Vacant" or "Maintenance")`
          );
        }

        const valid = errors.length === 0;
        if (valid && roomId) {
          seenRoomIds.add(roomId);
        }

        return {
          rowNumber,
          valid,
          errors,
          summaryLabel: roomId || rawRoomId || '(missing ID)',
          detailLabel: `${location || rawLoc || '—'} · Blk ${block || '?'} Unit ${unitNo || '?'} (${bedSlot || '?'})`,
          amountOrRateLabel:
            monthlyRate !== null ? formatRM(monthlyRate) : '—',
          statusLabel: status || rawStatus || '—',
          payload:
            valid && location && status && monthlyRate !== null
              ? {
                  roomId,
                  location,
                  block,
                  unitNo,
                  bedSlot,
                  monthlyRate,
                  status,
                }
              : null,
        };
      });
    }

    if (importType === 'students') {
      const existingStudentIds = new Set(students.map((s) => s.studentId));
      const seenStudentIds = new Set<string>();
      const roomById = new Map(rooms.map((r) => [r.roomId, r]));
      const claimedRoomsInFile = new Set<string>();

      return rawRows.map((raw, idx): ParsedPreviewRow<BulkImportStudentItem> => {
        const rowNumber = idx + 2;
        const errors: string[] = [];

        const rawStudentId = trimCell(
          getCell(raw, 'studentId', 'residentId', 'matrixNo', 'Student ID')
        );
        const studentId = sanitizeIdSegment(rawStudentId);
        const fullName = trimCell(getCell(raw, 'fullName', 'name', 'Full Name'));
        const phone = trimCell(getCell(raw, 'phone', 'phoneNo', 'Phone'));
        const emergencyContact = trimCell(
          getCell(raw, 'emergencyContact', 'emergency', 'Emergency Contact')
        );
        const rawResidentType =
          trimCell(getCell(raw, 'residentType', 'Resident Type')) || 'Student';
        const rawProgram = trimCell(getCell(raw, 'program', 'Program'));
        const rawOccupancyMode =
          trimCell(getCell(raw, 'occupancyMode', 'Occupancy Mode')) || 'Single Bed';
        const rawRoomId = trimCell(
          getCell(raw, 'assignedRoomId', 'roomId', 'Assigned Room ID')
        );
        const assignedRoomId = sanitizeIdSegment(rawRoomId);
        const rawLocation = trimCell(
          getCell(raw, 'hostelLocation', 'location', 'Hostel Location')
        );
        const rawCheckIn = getCell(raw, 'checkInDate', 'Check-In Date');
        const checkInDate =
          trimCell(rawCheckIn) === ''
            ? getTodayISO()
            : normalizeExcelDate(rawCheckIn);
        const rawCheckOut = getCell(raw, 'checkOutDate', 'Check-Out Date');
        const checkOutDate = normalizeExcelDate(rawCheckOut);
        const rawStatus =
          trimCell(getCell(raw, 'status', 'Status')) || 'Active';

        const depositPaidRaw = getCell(raw, 'depositPaid', 'Deposit Paid');
        const depositPaid =
          trimCell(depositPaidRaw) === '' ? 0 : parseNumberCell(depositPaidRaw);

        const stdRateRaw = getCell(raw, 'standardRoomRate', 'Standard Room Rate');
        const monthlyRebateRaw = getCell(raw, 'monthlyRebate', 'Monthly Rebate');
        const rebateReason =
          trimCell(getCell(raw, 'rebateReason', 'Rebate Reason')) || 'None';
        const firstMonthChargeRaw = getCell(
          raw,
          'firstMonthCharge',
          'First Month Charge'
        );

        if (
          !studentId ||
          studentId.length < FIELD_LIMITS.studentId.min ||
          !ID_REGEX.test(studentId)
        ) {
          errors.push('Invalid or missing studentId');
        } else if (existingStudentIds.has(studentId)) {
          errors.push(`Duplicate Student ID "${studentId}" already exists`);
        } else if (seenStudentIds.has(studentId)) {
          errors.push(`Duplicate Student ID "${studentId}" in file`);
        }

        if (fullName.length < FIELD_LIMITS.fullName.min) {
          errors.push('fullName must be at least 2 characters');
        }

        const residentTypeNorm =
          rawResidentType.toLowerCase() === 'lecturer' ||
          rawResidentType.toLowerCase() === 'staff'
            ? 'Lecturer / Staff'
            : matchEnum(rawResidentType, RESIDENT_TYPES);
        if (!residentTypeNorm) {
          errors.push(`Invalid residentType "${rawResidentType}"`);
        }

        const program: ProgramType | null = rawProgram
          ? matchEnum(rawProgram, PROGRAMS)
          : residentTypeNorm && residentTypeNorm !== 'Student'
            ? 'Other'
            : 'Diploma';
        if (!program) {
          errors.push(`Invalid program "${rawProgram}" (Diploma, SKM, DiFFER, Other)`);
        }

        const occupancyMode = matchEnum(rawOccupancyMode, OCCUPANCY_MODES);
        if (!occupancyMode) {
          errors.push(`Invalid occupancyMode "${rawOccupancyMode}"`);
        }

        const status = matchEnum(rawStatus, ['Active', 'Checked-Out'] as const);
        if (!status) {
          errors.push('status must be "Active" or "Checked-Out"');
        }

        const room = assignedRoomId ? roomById.get(assignedRoomId) : undefined;
        if (assignedRoomId) {
          if (!room) {
            errors.push(`Room ID ${assignedRoomId} not found`);
          } else if (status === 'Active') {
            if (room.status !== 'Vacant') {
              errors.push(`Room ${room.roomId} is ${room.status} (must be Vacant)`);
            } else if (claimedRoomsInFile.has(room.roomId)) {
              errors.push(
                `Room ${room.roomId} already claimed/blocked by an earlier row in this file`
              );
            }
          }
        }

        let hostelLocation: ResidentHostelLocation | null = room
          ? room.location
          : 'Unassigned';
        if (rawLocation) {
          if (room) {
            const parsedLoc = matchLocation(rawLocation);
            if (!parsedLoc) {
              errors.push(`Invalid hostelLocation "${rawLocation}"`);
            } else if (parsedLoc !== room.location) {
              errors.push(
                `hostelLocation (${parsedLoc}) mismatches room ${room.roomId} (${room.location})`
              );
            } else {
              hostelLocation = parsedLoc;
            }
          } else {
            const parsedResLoc = matchResidentLocation(rawLocation);
            if (!parsedResLoc) {
              errors.push(`Invalid hostelLocation "${rawLocation}"`);
            } else {
              hostelLocation = parsedResLoc;
            }
          }
        }

        if (!DATE_REGEX.test(checkInDate)) {
          errors.push('checkInDate must be valid YYYY-MM-DD (or Excel date)');
        }
        if (status === 'Checked-Out') {
          if (!DATE_REGEX.test(checkOutDate)) {
            errors.push('checkOutDate is required for Checked-Out residents');
          } else if (DATE_REGEX.test(checkInDate) && checkOutDate < checkInDate) {
            errors.push('checkOutDate cannot be earlier than checkInDate');
          }
        }

        if (
          depositPaid === null ||
          depositPaid < 0 ||
          depositPaid > FIELD_LIMITS.depositPaid.max
        ) {
          errors.push('depositPaid must be a valid RM amount');
        }

        const standardRoomRate =
          trimCell(stdRateRaw) === ''
            ? room?.monthlyRate ?? 250
            : parseNumberCell(stdRateRaw);
        if (
          standardRoomRate === null ||
          standardRoomRate < 0 ||
          standardRoomRate > FIELD_LIMITS.monthlyFee.max
        ) {
          errors.push('standardRoomRate must be 0–10,000');
        }

        const monthlyRebate =
          trimCell(monthlyRebateRaw) === '' ? 0 : parseNumberCell(monthlyRebateRaw);
        if (
          monthlyRebate === null ||
          monthlyRebate < 0 ||
          monthlyRebate > FIELD_LIMITS.monthlyFee.max
        ) {
          errors.push('monthlyRebate must be 0–10,000');
        }

        const effectiveMonthlyFee =
          standardRoomRate !== null && monthlyRebate !== null
            ? Math.max(0, Math.round((standardRoomRate - monthlyRebate) * 100) / 100)
            : 0;

        const autoDefaults = calculateFirstMonthDefaults(
          checkInDate,
          effectiveMonthlyFee
        );

        let firstMonthCharge = autoDefaults.firstMonthCharge;
        let firstMonthNote = autoDefaults.firstMonthNote;
        if (trimCell(firstMonthChargeRaw) !== '') {
          const parsedFirst = parseNumberCell(firstMonthChargeRaw);
          if (
            parsedFirst === null ||
            parsedFirst < 0 ||
            parsedFirst > FIELD_LIMITS.monthlyFee.max
          ) {
            errors.push('firstMonthCharge must be blank or 0–10,000');
          } else {
            firstMonthCharge = Math.round(parsedFirst * 100) / 100;
            if (Math.abs(firstMonthCharge - autoDefaults.firstMonthCharge) > 0.01) {
              firstMonthNote = 'Imported Custom Rate';
            }
          }
        }

        const valid = errors.length === 0;
        if (valid && studentId) {
          seenStudentIds.add(studentId);
          if (room && status === 'Active') {
            claimedRoomsInFile.add(room.roomId);
            if (occupancyMode === 'Whole Unit Exclusive') {
              for (const sib of rooms) {
                if (
                  sib.roomId !== room.roomId &&
                  sib.location === room.location &&
                  sib.block === room.block &&
                  sib.unitNo === room.unitNo &&
                  sib.status === 'Vacant'
                ) {
                  claimedRoomsInFile.add(sib.roomId);
                }
              }
            }
          }
        }

        return {
          rowNumber,
          valid,
          errors,
          summaryLabel: `${studentId || rawStudentId || '(missing ID)'} · ${fullName || 'Unnamed'}`,
          detailLabel: `${assignedRoomId || 'Room Unassigned'} · ${hostelLocation || 'Unassigned'} · In: ${checkInDate || 'invalid'}${
            status === 'Checked-Out' ? ` · Out: ${checkOutDate || 'missing'}` : ''
          } · 1st mo: ${formatRM(firstMonthCharge)} (${firstMonthNote})`,
          amountOrRateLabel: `${formatRM(effectiveMonthlyFee)}/mo`,
          statusLabel: status || rawStatus || '—',
          payload:
            valid &&
            hostelLocation &&
            residentTypeNorm &&
            occupancyMode &&
            program &&
            status &&
            depositPaid !== null &&
            standardRoomRate !== null &&
            monthlyRebate !== null
              ? {
                  studentId,
                  fullName,
                  phone: phone.slice(0, FIELD_LIMITS.phone.max),
                  emergencyContact: emergencyContact.slice(
                    0,
                    FIELD_LIMITS.emergencyContact.max
                  ),
                  program,
                  residentType: residentTypeNorm,
                  occupancyMode,
                  assignedRoomId: room ? room.roomId : '',
                  hostelLocation,
                  checkInDate,
                  checkOutDate: status === 'Checked-Out' ? checkOutDate : null,
                  depositPaid,
                  standardRoomRate,
                  monthlyRebate,
                  rebateReason,
                  effectiveMonthlyFee,
                  firstMonthCharge,
                  firstMonthNote,
                  status,
                }
              : null,
        };
      });
    }

    if (importType === 'tenancyHistory') {
      const studentById = new Map(students.map((s) => [s.studentId, s]));
      const roomById = new Map(rooms.map((r) => [r.roomId, r]));
      const openSegmentSeenInFile = new Set<string>();

      return rawRows.map(
        (raw, idx): ParsedPreviewRow<BulkImportTenancyHistoryItem> => {
          const rowNumber = idx + 2;
          const errors: string[] = [];

          const rawStudentId = trimCell(
            getCell(raw, 'studentId', 'residentId', 'Student ID')
          );
          const studentId = sanitizeIdSegment(rawStudentId);
          const roomId = trimCell(
            getCell(raw, 'roomId', 'assignedRoomId', 'Room ID')
          ).slice(0, FIELD_LIMITS.roomId.max);
          const rawLocation = trimCell(
            getCell(raw, 'hostelLocation', 'location', 'Hostel Location')
          );
          const rawOccupancyMode =
            trimCell(getCell(raw, 'occupancyMode', 'Occupancy Mode')) ||
            'Single Bed';
          const startDate = normalizeExcelDate(
            getCell(raw, 'startDate', 'checkInDate', 'Start Date')
          );
          const rawEndDateCell = getCell(raw, 'endDate', 'checkOutDate', 'End Date');
          const hasEndDateInput = trimCell(rawEndDateCell) !== '';
          const endDate = hasEndDateInput
            ? normalizeExcelDate(rawEndDateCell)
            : '';

          const stdRateRaw = getCell(
            raw,
            'standardRoomRate',
            'monthlyRate',
            'Standard Room Rate'
          );
          const rebateRaw = getCell(raw, 'monthlyRebate', 'Monthly Rebate');
          const firstMonthRaw = getCell(
            raw,
            'firstMonthCharge',
            'First Month Charge'
          );
          const reason = trimCell(getCell(raw, 'reason', 'Reason')).slice(0, 120);

          const student = studentId ? studentById.get(studentId) : undefined;
          if (!studentId) {
            errors.push('studentId is required');
          } else if (!student) {
            errors.push(`Student ID "${studentId}" not found`);
          }

          if (!roomId) {
            errors.push('roomId is required (historical/custom Room IDs allowed)');
          }

          const occupancyMode = matchEnum(rawOccupancyMode, OCCUPANCY_MODES);
          if (!occupancyMode) {
            errors.push(`Invalid occupancyMode "${rawOccupancyMode}"`);
          }

          const matchedRoom = roomId
            ? roomById.get(sanitizeIdSegment(roomId)) || roomById.get(roomId)
            : undefined;
          let hostelLocation: ResidentHostelLocation | null =
            matchedRoom?.location || student?.hostelLocation || 'Unassigned';
          if (rawLocation) {
            const parsedResLoc = matchResidentLocation(rawLocation);
            if (!parsedResLoc) {
              errors.push(`Invalid hostelLocation "${rawLocation}"`);
            } else {
              hostelLocation = parsedResLoc;
            }
          }

          if (!DATE_REGEX.test(startDate)) {
            errors.push('startDate must be valid YYYY-MM-DD (or Excel date)');
          }

          if (hasEndDateInput) {
            if (!DATE_REGEX.test(endDate)) {
              errors.push('endDate must be valid YYYY-MM-DD (or blank if active)');
            } else if (DATE_REGEX.test(startDate) && endDate < startDate) {
              errors.push('endDate cannot be earlier than startDate');
            }
          } else if (student) {
            if (student.status !== 'Active') {
              errors.push(
                `Resident ${student.studentId} is ${student.status}; blank endDate is only allowed for Active residents`
              );
            } else if (openSegmentSeenInFile.has(student.studentId)) {
              errors.push(
                `Duplicate blank endDate for ${student.studentId} in file (max 1 ongoing stay)`
              );
            } else if (
              tenancyImportMode === 'append' &&
              getNormalizedStayHistory(student).some((s) => !s.endDate)
            ) {
              errors.push(
                `${student.studentId} already has an ongoing stay; provide endDate or switch to Replace mode`
              );
            }
          }

          // Strict snapshot rate isolation: never auto-pull from current rooms collection
          const standardRoomRate =
            trimCell(stdRateRaw) === '' ? 250 : parseNumberCell(stdRateRaw);
          if (
            standardRoomRate === null ||
            standardRoomRate < 0 ||
            standardRoomRate > FIELD_LIMITS.monthlyFee.max
          ) {
            errors.push('standardRoomRate must be 0–10,000');
          }

          const monthlyRebate =
            trimCell(rebateRaw) === '' ? 0 : parseNumberCell(rebateRaw);
          if (
            monthlyRebate === null ||
            monthlyRebate < 0 ||
            monthlyRebate > FIELD_LIMITS.monthlyFee.max
          ) {
            errors.push('monthlyRebate must be 0–10,000');
          }

          const effectiveMonthlyFee =
            standardRoomRate !== null && monthlyRebate !== null
              ? Math.max(
                  0,
                  Math.round((standardRoomRate - monthlyRebate) * 100) / 100
                )
              : 0;

          let firstMonthCharge = calculateFirstMonthDefaults(
            startDate,
            effectiveMonthlyFee
          ).firstMonthCharge;
          if (trimCell(firstMonthRaw) !== '') {
            const parsedFirst = parseNumberCell(firstMonthRaw);
            if (
              parsedFirst === null ||
              parsedFirst < 0 ||
              parsedFirst > FIELD_LIMITS.monthlyFee.max
            ) {
              errors.push('firstMonthCharge must be blank or 0–10,000');
            } else {
              firstMonthCharge = Math.round(parsedFirst * 100) / 100;
            }
          }

          const valid = errors.length === 0;
          if (valid && student && !hasEndDateInput) {
            openSegmentSeenInFile.add(student.studentId);
          }

          return {
            rowNumber,
            valid,
            errors,
            summaryLabel: student
              ? `${student.studentId} · ${student.fullName}`
              : studentId || rawStudentId || '(missing ID)',
            detailLabel: `${roomId || '(missing room)'} · ${hostelLocation || 'Unassigned'} · ${
              startDate || 'invalid'
            } → ${hasEndDateInput ? endDate || 'invalid' : 'Present'} · 1st mo: ${formatRM(
              firstMonthCharge
            )}${reason ? ` · ${reason}` : ''}`,
            amountOrRateLabel: `${formatRM(effectiveMonthlyFee)}/mo`,
            statusLabel: hasEndDateInput ? 'Historical (Locked)' : 'Active Segment',
            payload:
              valid &&
              student &&
              hostelLocation &&
              occupancyMode &&
              standardRoomRate !== null &&
              monthlyRebate !== null
                ? {
                    studentId: student.studentId,
                    roomId,
                    hostelLocation,
                    occupancyMode,
                    startDate,
                    endDate: hasEndDateInput ? endDate : null,
                    standardRoomRate,
                    monthlyRebate,
                    effectiveMonthlyFee,
                    firstMonthCharge,
                    reason:
                      reason ||
                      (hasEndDateInput ? 'Historical Stay' : 'Active Placement'),
                  }
                : null,
          };
        }
      );
    }

    // Historical Payments validation
    const studentById = new Map(students.map((s) => [s.studentId, s]));

    return rawRows.map((raw, idx): ParsedPreviewRow<BulkImportPaymentItem> => {
      const rowNumber = idx + 2;
      const errors: string[] = [];

      const rawStudentId = trimCell(
        getCell(raw, 'studentId', 'residentId', 'Student ID')
      );
      const studentId = sanitizeIdSegment(rawStudentId);
      const billingMonth = normalizeBillingMonth(
        getCell(raw, 'billingMonth', 'month', 'Billing Month')
      );
      const rawPaymentType = trimCell(
        getCell(raw, 'paymentType', 'type', 'Payment Type')
      );
      const amount = parseNumberCell(getCell(raw, 'amount', 'Amount'));
      const rawPaymentMethod = trimCell(
        getCell(raw, 'paymentMethod', 'method', 'Payment Method')
      );
      const bankRefNo = trimCell(
        getCell(raw, 'bankRefNo', 'referenceNo', 'Bank Ref No')
      );
      const rawReceiptStatus =
        trimCell(
          getCell(
            raw,
            'physicalReceiptStatus',
            'receiptStatus',
            'Physical Receipt Status'
          )
        ) || 'Pending Issuance';
      const physicalReceiptNo = trimCell(
        getCell(raw, 'physicalReceiptNo', 'Physical Receipt No')
      );
      const notes = trimCell(getCell(raw, 'notes', 'remarks', 'Notes'));
      const rawPaymentDate = getCell(raw, 'paymentDate', 'date', 'Payment Date');
      const rawStatus = trimCell(getCell(raw, 'status', 'Status'));

      const student = studentId ? studentById.get(studentId) : undefined;
      if (!studentId) {
        errors.push('studentId is required');
      } else if (!student) {
        errors.push(`Student ID ${studentId} not found`);
      }

      if (!MONTH_REGEX.test(billingMonth)) {
        errors.push('billingMonth must be YYYY-MM');
      }

      const paymentType = matchEnum(rawPaymentType, PAYMENT_TYPES);
      if (!paymentType) {
        errors.push(
          `Invalid paymentType "${rawPaymentType}"`
        );
      }

      if (amount === null || amount <= 0 || amount > FIELD_LIMITS.amount.max) {
        errors.push('amount must be greater than 0 and up to 50,000');
      }

      const paymentMethod = matchEnum(rawPaymentMethod, PAYMENT_METHODS);
      if (!paymentMethod) {
        errors.push(`Invalid paymentMethod "${rawPaymentMethod}"`);
      }

      const physicalReceiptStatus = matchEnum(rawReceiptStatus, [
        'Issued',
        'Pending Issuance',
      ] as const);
      if (!physicalReceiptStatus) {
        errors.push(
          'physicalReceiptStatus must be "Issued" or "Pending Issuance"'
        );
      }

      let paymentDate = '';
      if (trimCell(rawPaymentDate) !== '') {
        paymentDate = normalizeExcelDate(rawPaymentDate);
        if (!DATE_REGEX.test(paymentDate)) {
          errors.push('paymentDate must be YYYY-MM-DD');
        }
      } else if (MONTH_REGEX.test(billingMonth)) {
        paymentDate =
          billingMonth === getCurrentMonthISO()
            ? getTodayISO()
            : `${billingMonth}-01`;
      }

      let status: PaymentStatus | null =
        paymentType === 'Rebate / Fee Waiver' ? 'Waived' : 'Paid';
      if (rawStatus) {
        const matched = matchEnum(rawStatus, PAYMENT_STATUSES);
        if (!matched) {
          errors.push(`Invalid status "${rawStatus}"`);
        } else {
          status = matched;
        }
      }

      const valid = errors.length === 0;

      return {
        rowNumber,
        valid,
        errors,
        summaryLabel: student
          ? `${student.studentId} · ${student.fullName}`
          : studentId || rawStudentId || '(missing ID)',
        detailLabel: `${billingMonth || 'invalid month'} · ${paymentType || rawPaymentType || '—'} · ${paymentMethod || rawPaymentMethod || '—'}${bankRefNo ? ` · Ref: ${bankRefNo}` : ''}`,
        amountOrRateLabel: amount !== null ? formatRM(amount) : '—',
        statusLabel: physicalReceiptStatus || rawReceiptStatus,
        payload:
          valid &&
          student &&
          paymentType &&
          amount !== null &&
          paymentMethod &&
          physicalReceiptStatus &&
          status
            ? {
                student,
                billingMonth,
                paymentType,
                amount,
                paymentMethod,
                bankRefNo,
                paymentDate,
                status,
                physicalReceiptStatus,
                physicalReceiptNo,
                notes,
              }
            : null,
      };
    });
  }, [
    rawRows,
    importType,
    rooms,
    students,
    tenancyImportMode,
    isMasterAdminRestricted,
  ]);

  if (!isOpen) return null;

  const validRows = validatedRows.filter((r) => r.valid && r.payload !== null);
  const invalidCount = validatedRows.length - validRows.length;
  const displayedRows =
    previewFilter === 'valid'
      ? validatedRows.filter((r) => r.valid)
      : previewFilter === 'errors'
        ? validatedRows.filter((r) => !r.valid)
        : validatedRows;

  const meta = MODAL_META[importType];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setParseError(null);
    setSelectedFileName(file.name);
    setPreviewFilter('all');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('The uploaded spreadsheet contains no worksheets.');
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
        raw: true,
      });

      const nonEmptyRows = jsonRows
        .map(toNormalizedRow)
        .filter((row) =>
          Object.values(row).some((val) => trimCell(val) !== '')
        );

      if (nonEmptyRows.length === 0) {
        throw new Error('No data rows were found in the uploaded file.');
      }

      setRawRows(nonEmptyRows);
    } catch (err) {
      setRawRows([]);
      setParseError(
        err instanceof Error
          ? err.message
          : 'Unable to parse spreadsheet. Ensure it is a valid .xlsx, .xls, or .csv file.'
      );
    }
  };

  const handleCommitImport = async () => {
    if (isMasterAdminRestricted || validRows.length === 0) return;
    setImporting(true);
    setParseError(null);
    setProgress({ done: 0, total: validRows.length });

    try {
      if (importType === 'rooms') {
        const payloads = validRows.map((r) => r.payload as BulkImportRoomItem);
        const res = await bulkImportRooms(payloads, staffEmail, (done, total) => {
          setProgress({ done, total });
        });
        onImportComplete(
          `Imported ${res.importedCount} room/bed record(s) from ${selectedFileName}.${
            invalidCount > 0 ? ` (${invalidCount} invalid row(s) skipped)` : ''
          }`
        );
      } else if (importType === 'students') {
        const payloads = validRows.map((r) => r.payload as BulkImportStudentItem);
        const unassignedCount = payloads.filter(
          (p) => p.status === 'Active' && !p.assignedRoomId
        ).length;
        const res = await bulkImportStudents(
          payloads,
          rooms,
          staffEmail,
          (done, total) => {
            setProgress({ done, total });
          }
        );
        onImportComplete(
          `Imported ${res.importedCount} resident(s) (${res.occupiedCount} bed(s) marked Occupied${
            res.blockedCount > 0 ? `, ${res.blockedCount} sibling bed(s) Reserved / Blocked` : ''
          }${
            unassignedCount > 0 ? `, ${unassignedCount} Room Unassigned` : ''
          }).${invalidCount > 0 ? ` (${invalidCount} invalid row(s) skipped)` : ''}`
        );
      } else if (importType === 'tenancyHistory') {
        const payloads = validRows.map(
          (r) => r.payload as BulkImportTenancyHistoryItem
        );
        const res = await bulkImportTenancyHistory(
          payloads,
          tenancyImportMode,
          students,
          payments,
          staffEmail,
          (done, total) => {
            setProgress({ done, total });
          }
        );
        onImportComplete(
          `Imported ${res.segmentsImportedCount} tenancy segment(s) across ${res.updatedStudentsCount} resident(s) (${
            tenancyImportMode === 'replace' ? 'Replaced matched histories' : 'Appended to histories'
          }). Recalculated Expected Rent: ${formatRM(res.totalRecalculatedRent)} · Outstanding: ${formatRM(
            res.totalRecalculatedOutstanding
          )}.${invalidCount > 0 ? ` (${invalidCount} invalid row(s) skipped)` : ''}`
        );
      } else {
        const payloads = validRows.map((r) => r.payload as BulkImportPaymentItem);
        const res = await bulkImportPayments(
          payloads,
          payments,
          staffEmail,
          (done, total) => {
            setProgress({ done, total });
          }
        );
        onImportComplete(
          `Imported ${res.importedCount} payment record(s) from ${selectedFileName}.${
            invalidCount > 0 ? ` (${invalidCount} invalid row(s) skipped)` : ''
          }`
        );
      }
      setRawRows([]);
      setSelectedFileName(null);
      onClose();
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Batch import failed.'
      );
    } finally {
      setImporting(false);
    }
  };

  const handleResetFile = () => {
    setRawRows([]);
    setSelectedFileName(null);
    setParseError(null);
    setPreviewFilter('all');
  };

  const progressPct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
        {/* Pinned Header */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {meta.title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={() => {
              handleResetFile();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer disabled:opacity-50"
            aria-label="Close bulk import modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-5">
          {isMasterAdminRestricted ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
              <p className="font-semibold">Master Admin Access Required</p>
              <p>
                {importType === 'payments'
                  ? 'Bulk Historical Payments Import is restricted strictly to Master Admin accounts. Staff and Admin users should use the standard Record Payment form (with AI Receipt Scanner).'
                  : 'Bulk Tenancy History Upload is restricted strictly to Master Admin accounts.'}{' '}
                Your current role ({staffRole}) cannot access this batch import tool.
              </p>
            </div>
          ) : (
            <>
              {importType === 'tenancyHistory' && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-blue-950">
                    Tenancy History Import Mode
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <label
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        tenancyImportMode === 'append'
                          ? 'bg-white border-blue-900 text-slate-900'
                          : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tenancyImportMode"
                        checked={tenancyImportMode === 'append'}
                        disabled={importing}
                        onChange={() => setTenancyImportMode('append')}
                        className="mt-0.5 text-blue-900"
                      />
                      <div>
                        <p className="font-semibold">Append to Existing History</p>
                        <p className="text-slate-500 mt-0.5">
                          Keeps existing stay segments and merges new rows chronologically by Start Date.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        tenancyImportMode === 'replace'
                          ? 'bg-white border-blue-900 text-slate-900'
                          : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tenancyImportMode"
                        checked={tenancyImportMode === 'replace'}
                        disabled={importing}
                        onChange={() => setTenancyImportMode('replace')}
                        className="mt-0.5 text-blue-900"
                      />
                      <div>
                        <p className="font-semibold">
                          Replace Existing History for Matched Students
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          Replaces stayHistory strictly for matched Student IDs in this upload.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 1: Template Download & Upload Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    1. Download official template or upload your spreadsheet
                  </p>
                  <p className="text-xs text-slate-500">
                    Supports <span className="font-mono">.xlsx</span>,{' '}
                    <span className="font-mono">.xls</span>, and{' '}
                    <span className="font-mono">.csv</span>. Excel serial dates convert automatically to{' '}
                    <span className="font-mono">YYYY-MM-DD</span>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => downloadTemplateWorkbook(importType)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {importType === 'tenancyHistory'
                        ? 'Download Tenancy History Template (.xlsx)'
                        : 'Download Excel Template (.xlsx)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{selectedFileName ? 'Choose Another File' : 'Upload Excel / CSV'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={(e) => void handleFileChange(e)}
                  />
                </div>
              </div>

              {parseError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </>
          )}

          {/* Step 2: Validation Summary & Preview Table */}
          {validatedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span className="text-slate-600">
                    File: <strong className="font-mono text-slate-900">{selectedFileName}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{validRows.length} valid rows ready</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      invalidCount > 0 ? 'text-red-700' : 'text-slate-500'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{invalidCount} errors skipped</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        previewFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({validatedRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('valid')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        previewFilter === 'valid'
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Valid ({validRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('errors')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        previewFilter === 'errors'
                          ? 'bg-white text-red-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Errors ({invalidCount})
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleResetFile}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-14">Row</th>
                      <th className="py-2.5 px-3">Identifier / Name</th>
                      <th className="py-2.5 px-3">Parsed Details</th>
                      <th className="py-2.5 px-3 text-right">RM</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={
                          row.valid
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                            : 'bg-red-50/60 hover:bg-red-50/90'
                        }
                      >
                        <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">
                          #{row.rowNumber}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900 max-w-[190px] truncate">
                          {row.summaryLabel}
                        </td>
                        <td className="py-2 px-3 text-slate-700 max-w-[260px]">
                          {row.detailLabel}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {row.amountOrRateLabel}
                        </td>
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                          {row.statusLabel}
                        </td>
                        <td className="py-2 px-3">
                          {row.valid ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <div className="text-red-700 font-medium space-y-0.5">
                              {row.errors.map((err, i) => (
                                <p key={i}>{err}</p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Batch Commit Progress */}
          {importing && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-blue-900 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Committing Firestore batches (max 400 ops/batch)...
                  </span>
                </span>
                <span className="font-mono">
                  {progress.done} / {progress.total} ({progressPct}%)
                </span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-900 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pinned Footer */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Audit trail: writes stamped with <span className="font-mono">{staffEmail}</span>
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={importing}
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importing || validRows.length === 0}
              onClick={() => void handleCommitImport()}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer whitespace-nowrap"
            >
              {importing
                ? `Importing ${progress.done}/${progress.total}...`
                : `Import ${validRows.length} Valid ${
                    validRows.length === 1 ? 'Row' : 'Rows'
                  }`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
