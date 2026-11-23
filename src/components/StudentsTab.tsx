import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BedDouble,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BATCH_PAST_PAYMENT_METHODS,
  calculateFirstMonthDefaults,
  calculateMonthInstallmentStatus,
  calculateStudentBilling,
  enumerateMonthsISO,
  formatRM,
  formatTimestamp,
  getCurrentMonthISO,
  getNormalizedStayHistory,
  getPaymentBankRef,
  getPaymentReceiptNo,
  getPhysicalReceiptStatus,
  getTodayISO,
  HOSTEL_LOCATIONS,
  isRentCreditType,
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
  REBATE_REASONS,
  RESIDENT_TYPES,
  ResidentHostelLocation,
  ResidentType,
  Room,
  StaffRole,
  StayHistorySegment,
  STUDENT_STATUSES,
  Student,
  StudentStatus,
} from '../types/hostel';
import {
  assignRoomToStudent,
  batchCreatePastPayments,
  createPayment,
  deletePayment,
  registerStudent,
  saveStudentStayHistory,
  transferStudentRoom,
  updatePayment,
  updateStudentRecord,
} from '../lib/hostelService';
import { BulkImportModal } from './BulkImportModal';
import { StatusBadge } from './StatusBadge';

const TRANSFER_REASONS = [
  'Student Request',
  'Maintenance / Unit Upgrade',
  'Disciplinary / Admin Relocation',
  'Other',
] as const;

interface StudentsTabProps {
  students: Student[];
  rooms: Room[];
  payments: Payment[];
  staffEmail: string;
  staffRole: StaffRole;
  loading: boolean;
}

export function StudentsTab({
  students,
  rooms,
  payments,
  staffEmail,
  staffRole,
  loading,
}: StudentsTabProps) {
  const isMasterAdmin = staffRole === 'Master Admin';
  const isViewer = staffRole === 'Viewer';
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | ResidentHostelLocation>('All');
  const [residentTypeFilter, setResidentTypeFilter] = useState<'All' | ResidentType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | StudentStatus | 'Room Unassigned'>('All');

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalType, setImportModalType] = useState<'students' | 'tenancyHistory'>('students');
  const [regStudentId, setRegStudentId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regResidentType, setRegResidentType] = useState<ResidentType>('Student');
  const [regOccupancyMode, setRegOccupancyMode] = useState<OccupancyMode>('Single Bed');
  const [regStatus, setRegStatus] = useState<'Active' | 'Checked-Out'>('Active');
  const [regPhone, setRegPhone] = useState('');
  const [regEmergency, setRegEmergency] = useState('');
  const [regProgram, setRegProgram] = useState<ProgramType>('Diploma');
  const [regRoomId, setRegRoomId] = useState('');
  const [regCheckInDate, setRegCheckInDate] = useState(getTodayISO());
  const [regCheckOutDate, setRegCheckOutDate] = useState(getTodayISO());
  const [regDepositPaid, setRegDepositPaid] = useState('250');
  const [regStandardRate, setRegStandardRate] = useState('250');
  const [regMonthlyRebate, setRegMonthlyRebate] = useState('0');
  const [regRebateReason, setRegRebateReason] = useState('None');
  const [regFirstMonthCharge, setRegFirstMonthCharge] = useState('250');
  const [regFirstMonthNote, setRegFirstMonthNote] = useState('Standard Full Month');
  const [regFirstMonthManual, setRegFirstMonthManual] = useState(false);

  // Edit / Check-Out modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editResidentType, setEditResidentType] = useState<ResidentType>('Student');
  const [editOccupancyMode, setEditOccupancyMode] = useState<OccupancyMode>('Single Bed');
  const [editPhone, setEditPhone] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editProgram, setEditProgram] = useState<ProgramType>('Diploma');
  const [editStatus, setEditStatus] = useState<StudentStatus>('Active');
  const [editCheckInDate, setEditCheckInDate] = useState('');
  const [editCheckOutDate, setEditCheckOutDate] = useState('');
  const [editDepositPaid, setEditDepositPaid] = useState('0');
  const [editStandardRate, setEditStandardRate] = useState('250');
  const [editMonthlyRebate, setEditMonthlyRebate] = useState('0');
  const [editRebateReason, setEditRebateReason] = useState('None');
  const [editFirstMonthCharge, setEditFirstMonthCharge] = useState('250');
  const [editFirstMonthNote, setEditFirstMonthNote] = useState('Standard Full Month');
  const [editFirstMonthManual, setEditFirstMonthManual] = useState(false);
  const [editNewRoomId, setEditNewRoomId] = useState('');

  // Transfer Room modal state
  const [transferStudent, setTransferStudent] = useState<Student | null>(null);
  const [transferDate, setTransferDate] = useState(getTodayISO());
  const [transferNewRoomId, setTransferNewRoomId] = useState('');
  const [transferOccupancyMode, setTransferOccupancyMode] =
    useState<OccupancyMode>('Single Bed');
  const [transferStdRate, setTransferStdRate] = useState('250');
  const [keepExistingRebate, setKeepExistingRebate] = useState(true);
  const [transferMonthlyRebate, setTransferMonthlyRebate] = useState('0');
  const [transferRebateReason, setTransferRebateReason] = useState('None');
  const [transferReason, setTransferReason] = useState<string>('Student Request');
  const [transferCustomReason, setTransferCustomReason] = useState('');

  // View Statement modal state
  const [statementStudent, setStatementStudent] = useState<Student | null>(null);

  // Direct Assign Room modal state (for unassigned students)
  const [assigningStudent, setAssigningStudent] = useState<Student | null>(null);
  const [assignRoomId, setAssignRoomId] = useState('');
  const [assignPlacementDate, setAssignPlacementDate] = useState(getTodayISO());
  const [assignOccupancyMode, setAssignOccupancyMode] =
    useState<OccupancyMode>('Single Bed');
  const [assignStdRate, setAssignStdRate] = useState('250');
  const [assignRebate, setAssignRebate] = useState('0');
  const [assignRebateReason, setAssignRebateReason] = useState('None');

  // Statement: Add / Edit / Delete Stay History Segment state
  const [stayModalOpen, setStayModalOpen] = useState(false);
  const [editingStaySegment, setEditingStaySegment] =
    useState<StayHistorySegment | null>(null);
  const [stayRoomInputMode, setStayRoomInputMode] = useState<'select' | 'custom'>(
    'select'
  );
  const [stayRoomId, setStayRoomId] = useState('');
  const [stayLocation, setStayLocation] =
    useState<ResidentHostelLocation>('Apartment Desa Jati 2');
  const [stayOccupancyMode, setStayOccupancyMode] =
    useState<OccupancyMode>('Single Bed');
  const [stayStartDate, setStayStartDate] = useState(getTodayISO());
  const [stayIsOngoing, setStayIsOngoing] = useState(false);
  const [stayEndDate, setStayEndDate] = useState(getTodayISO());
  const [stayStdRate, setStayStdRate] = useState('250');
  const [stayRebate, setStayRebate] = useState('0');
  const [stayFirstMonthCharge, setStayFirstMonthCharge] = useState('250');
  const [stayFirstMonthManual, setStayFirstMonthManual] = useState(false);
  const [stayReason, setStayReason] = useState('Historical Stay');
  const [deletingStaySegment, setDeletingStaySegment] =
    useState<StayHistorySegment | null>(null);

  // Statement: Record / Backdate / Edit / Delete Payment state
  const [stmtPaymentModalOpen, setStmtPaymentModalOpen] = useState(false);
  const [stmtEditingPayment, setStmtEditingPayment] = useState<Payment | null>(
    null
  );
  const [stmtDeletingPayment, setStmtDeletingPayment] = useState<Payment | null>(
    null
  );
  const [stmtBillingMonth, setStmtBillingMonth] = useState(getCurrentMonthISO());
  const [stmtPaymentType, setStmtPaymentType] =
    useState<PaymentType>('Monthly Rent');
  const [stmtAmount, setStmtAmount] = useState('250');
  const [stmtMethod, setStmtMethod] = useState<PaymentMethod>('Online Transfer');
  const [stmtBankRefNo, setStmtBankRefNo] = useState('');
  const [stmtPaymentDate, setStmtPaymentDate] = useState(getTodayISO());
  const [stmtStatus, setStmtStatus] = useState<PaymentStatus>('Paid');
  const [stmtPhysStatus, setStmtPhysStatus] =
    useState<PhysicalReceiptStatus>('Issued');
  const [stmtPhysNo, setStmtPhysNo] = useState('');
  const [stmtNotes, setStmtNotes] = useState('');

  // Statement: Master-Admin Batch Add Past Payments & Settle Balance state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchSelectedMonths, setBatchSelectedMonths] = useState<
    Record<string, boolean>
  >({});
  const [batchAmounts, setBatchAmounts] = useState<Record<string, string>>({});
  const [batchPaymentMethod, setBatchPaymentMethod] = useState<PaymentMethod>(
    'Historical Migration'
  );
  const [batchBankRefNo, setBatchBankRefNo] = useState('HIST-MIGRATION');
  const [batchPhysStatus, setBatchPhysStatus] =
    useState<PhysicalReceiptStatus>('Issued');
  const [batchPhysNo, setBatchPhysNo] = useState('');
  const [batchNotes, setBatchNotes] = useState(
    'Historical monthly payment migration'
  );
  const [settleBalanceConfirmOpen, setSettleBalanceConfirmOpen] =
    useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const allRoomsSorted = useMemo(() => {
    return [...rooms].sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms]);

  const vacantRooms = useMemo(() => {
    return allRoomsSorted.filter((r) => r.status === 'Vacant');
  }, [allRoomsSorted]);

  const registerRoomChoices = useMemo(() => {
    return regStatus === 'Checked-Out' ? allRoomsSorted : vacantRooms;
  }, [regStatus, allRoomsSorted, vacantRooms]);

  const selectedRegisterRoom = useMemo(() => {
    return registerRoomChoices.find((r) => r.roomId === regRoomId) || null;
  }, [registerRoomChoices, regRoomId]);

  const regSiblingVacantBeds = useMemo(() => {
    if (
      !selectedRegisterRoom ||
      regStatus !== 'Active' ||
      regOccupancyMode !== 'Whole Unit Exclusive'
    ) {
      return [];
    }
    return rooms
      .filter(
        (r) =>
          r.roomId !== selectedRegisterRoom.roomId &&
          r.location === selectedRegisterRoom.location &&
          r.block === selectedRegisterRoom.block &&
          r.unitNo === selectedRegisterRoom.unitNo &&
          r.status === 'Vacant'
      )
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms, selectedRegisterRoom, regStatus, regOccupancyMode]);

  const regEffectiveFee = useMemo(() => {
    const std = Number(regStandardRate) || 0;
    const reb = Number(regMonthlyRebate) || 0;
    return Math.max(0, Math.round((std - reb) * 100) / 100);
  }, [regStandardRate, regMonthlyRebate]);

  const editEffectiveFee = useMemo(() => {
    const std = Number(editStandardRate) || 0;
    const reb = Number(editMonthlyRebate) || 0;
    return Math.max(0, Math.round((std - reb) * 100) / 100);
  }, [editStandardRate, editMonthlyRebate]);

  const billingByStudentId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateStudentBilling>>();
    for (const s of students) {
      map.set(s.studentId, calculateStudentBilling(s, payments));
    }
    return map;
  }, [students, payments]);

  const liveStatementStudent = useMemo(() => {
    if (!statementStudent) return null;
    return (
      students.find((s) => s.studentId === statementStudent.studentId) ||
      statementStudent
    );
  }, [statementStudent, students]);

  const statementBilling = useMemo(() => {
    if (!liveStatementStudent) return null;
    return (
      billingByStudentId.get(liveStatementStudent.studentId) ||
      calculateStudentBilling(liveStatementStudent, payments)
    );
  }, [liveStatementStudent, billingByStudentId, payments]);

  const statementPayments = useMemo(() => {
    if (!liveStatementStudent) return [];
    return payments
      .filter((p) => p.studentId === liveStatementStudent.studentId)
      .sort((a, b) => {
        const dCmp = (b.paymentDate || '').localeCompare(a.paymentDate || '');
        if (dCmp !== 0) return dCmp;
        return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0);
      });
  }, [liveStatementStudent, payments]);

  const transferVacantChoices = useMemo(() => {
    if (!transferStudent) return vacantRooms;
    return vacantRooms.filter((r) => r.roomId !== transferStudent.assignedRoomId);
  }, [vacantRooms, transferStudent]);

  const selectedTransferRoom = useMemo(() => {
    return (
      transferVacantChoices.find((r) => r.roomId === transferNewRoomId) || null
    );
  }, [transferVacantChoices, transferNewRoomId]);

  const transferExclusiveSiblings = useMemo(() => {
    if (
      !selectedTransferRoom ||
      transferOccupancyMode !== 'Whole Unit Exclusive'
    ) {
      return [];
    }
    return rooms
      .filter(
        (r) =>
          r.roomId !== selectedTransferRoom.roomId &&
          r.location === selectedTransferRoom.location &&
          r.block === selectedTransferRoom.block &&
          r.unitNo === selectedTransferRoom.unitNo &&
          r.status === 'Vacant'
      )
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms, selectedTransferRoom, transferOccupancyMode]);

  const transferEffectiveFee = useMemo(() => {
    if (!transferStudent) return 0;
    const std = Number(transferStdRate) || 0;
    const currentBilling = billingByStudentId.get(transferStudent.studentId);
    const reb = keepExistingRebate
      ? currentBilling?.monthlyRebate ?? 0
      : Number(transferMonthlyRebate) || 0;
    return Math.max(0, Math.round((std - reb) * 100) / 100);
  }, [
    transferStudent,
    transferStdRate,
    keepExistingRebate,
    transferMonthlyRebate,
    billingByStudentId,
  ]);

  const unassignedActiveCount = useMemo(() => {
    return students.filter(
      (s) => s.status === 'Active' && !(s.assignedRoomId || '').trim()
    ).length;
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) =>
        locationFilter === 'All' ? true : s.hostelLocation === locationFilter
      )
      .filter((s) =>
        residentTypeFilter === 'All'
          ? true
          : (s.residentType || 'Student') === residentTypeFilter
      )
      .filter((s) => {
        if (statusFilter === 'All') return true;
        if (statusFilter === 'Room Unassigned') {
          return s.status === 'Active' && !(s.assignedRoomId || '').trim();
        }
        return s.status === statusFilter;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q) ||
          s.assignedRoomId.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, locationFilter, residentTypeFilter, statusFilter, searchQuery]);

  const totalFilteredArrears = useMemo(() => {
    return filteredStudents.reduce((sum, s) => {
      const b = billingByStudentId.get(s.studentId);
      return sum + (b?.outstandingBalance ?? 0);
    }, 0);
  }, [filteredStudents, billingByStudentId]);

  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const tableElRef = useRef<HTMLTableElement | null>(null);
  const syncingScrollRef = useRef<'top' | 'table' | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  useEffect(() => {
    const scrollEl = tableScrollRef.current;
    const tableEl = tableElRef.current;
    if (!scrollEl || !tableEl) {
      setTableScrollWidth(0);
      setHasHorizontalOverflow(false);
      return;
    }

    const measure = () => {
      const sw = scrollEl.scrollWidth;
      const cw = scrollEl.clientWidth;
      setTableScrollWidth(sw);
      setHasHorizontalOverflow(sw > cw + 1);
      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = scrollEl.scrollLeft;
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollEl);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [filteredStudents.length, loading]);

  const handleTopScroll = () => {
    if (syncingScrollRef.current === 'table') {
      syncingScrollRef.current = null;
      return;
    }
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    syncingScrollRef.current = 'top';
    tableEl.scrollLeft = topEl.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingScrollRef.current === 'top') {
        syncingScrollRef.current = null;
      }
    });
  };

  const handleTableScroll = () => {
    if (syncingScrollRef.current === 'top') {
      syncingScrollRef.current = null;
      return;
    }
    const topEl = topScrollRef.current;
    const tableEl = tableScrollRef.current;
    if (!topEl || !tableEl) return;
    syncingScrollRef.current = 'table';
    topEl.scrollLeft = tableEl.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingScrollRef.current === 'table') {
        syncingScrollRef.current = null;
      }
    });
  };

  const syncRegFirstMonth = (
    nextDate: string,
    nextStd: string,
    nextRebate: string,
    forceReset = false
  ) => {
    if (regFirstMonthManual && !forceReset) return;
    const eff = Math.max(
      0,
      Math.round(((Number(nextStd) || 0) - (Number(nextRebate) || 0)) * 100) / 100
    );
    const defaults = calculateFirstMonthDefaults(nextDate, eff);
    setRegFirstMonthCharge(String(defaults.firstMonthCharge));
    setRegFirstMonthNote(defaults.firstMonthNote);
    if (forceReset) setRegFirstMonthManual(false);
  };

  const syncEditFirstMonth = (
    nextDate: string,
    nextStd: string,
    nextRebate: string,
    forceReset = false
  ) => {
    if (editFirstMonthManual && !forceReset) return;
    const eff = Math.max(
      0,
      Math.round(((Number(nextDate ? nextStd : nextStd) || 0) - (Number(nextRebate) || 0)) * 100) / 100
    );
    const defaults = calculateFirstMonthDefaults(nextDate, eff);
    setEditFirstMonthCharge(String(defaults.firstMonthCharge));
    setEditFirstMonthNote(defaults.firstMonthNote);
    if (forceReset) setEditFirstMonthManual(false);
  };

  const handleOpenRegisterModal = () => {
    setFormError(null);
    setRegStudentId('');
    setRegFullName('');
    setRegResidentType('Student');
    setRegOccupancyMode('Single Bed');
    setRegStatus('Active');
    setRegPhone('');
    setRegEmergency('');
    setRegProgram('Diploma');
    const initialRoom = vacantRooms[0] || null;
    setRegRoomId(initialRoom ? initialRoom.roomId : '');
    const today = getTodayISO();
    setRegCheckInDate(today);
    setRegCheckOutDate(today);
    if (initialRoom) {
      const initialRate = initialRoom.monthlyRate;
      const fmDefaults = calculateFirstMonthDefaults(today, initialRate);
      setRegDepositPaid(String(initialRate));
      setRegStandardRate(String(initialRate));
      setRegMonthlyRebate('0');
      setRegRebateReason('None');
      setRegFirstMonthCharge(String(fmDefaults.firstMonthCharge));
      setRegFirstMonthNote(fmDefaults.firstMonthNote);
    } else {
      setRegDepositPaid('0');
      setRegStandardRate('0');
      setRegMonthlyRebate('0');
      setRegRebateReason('None');
      setRegFirstMonthCharge('0');
      setRegFirstMonthNote('Unassigned — No Room Rent');
    }
    setRegFirstMonthManual(false);
    setShowRegisterModal(true);
  };

  const handleRegResidentTypeChange = (nextType: ResidentType) => {
    setRegResidentType(nextType);
    if (nextType === 'Lecturer / Staff') {
      setRegProgram('Other');
      if (regRebateReason === 'None') {
        setRegRebateReason('Staff Housing');
      }
    } else if (nextType === 'Guest') {
      setRegProgram('Other');
    }
  };

  const handleRegStatusChange = (nextStatus: 'Active' | 'Checked-Out') => {
    setRegStatus(nextStatus);
    if (!regRoomId) return;
    const choices = nextStatus === 'Checked-Out' ? allRoomsSorted : vacantRooms;
    if (!choices.some((r) => r.roomId === regRoomId)) {
      const fallback = choices[0] || null;
      setRegRoomId(fallback ? fallback.roomId : '');
      if (fallback) {
        const nextStd = String(fallback.monthlyRate);
        setRegStandardRate(nextStd);
        setRegDepositPaid(nextStd);
        syncRegFirstMonth(regCheckInDate, nextStd, regMonthlyRebate);
      } else {
        setRegStandardRate('0');
        setRegMonthlyRebate('0');
        setRegRebateReason('None');
        setRegFirstMonthCharge('0');
        setRegFirstMonthNote('Unassigned — No Room Rent');
        setRegFirstMonthManual(false);
      }
    }
  };

  const handleRoomSelectionChange = (roomId: string) => {
    const wasUnassigned = !regRoomId;
    setRegRoomId(roomId);
    if (!roomId) {
      setRegStandardRate('0');
      setRegMonthlyRebate('0');
      setRegRebateReason('None');
      setRegFirstMonthCharge('0');
      setRegFirstMonthNote('Unassigned — No Room Rent');
      setRegFirstMonthManual(false);
      return;
    }
    const room = registerRoomChoices.find((r) => r.roomId === roomId);
    if (room) {
      const nextStd = String(room.monthlyRate);
      setRegStandardRate(nextStd);
      setRegDepositPaid(nextStd);
      syncRegFirstMonth(regCheckInDate, nextStd, regMonthlyRebate, wasUnassigned);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regRoomId && !selectedRegisterRoom) {
      setFormError(
        'Selected room is no longer available. Please choose another Vacant room or select "Unassigned (Assign Room Later)".'
      );
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await registerStudent(
        {
          studentId: regStudentId,
          fullName: regFullName,
          residentType: regResidentType,
          occupancyMode: selectedRegisterRoom ? regOccupancyMode : 'Unassigned',
          phone: regPhone,
          emergencyContact: regEmergency,
          program: regProgram,
          assignedRoomId: selectedRegisterRoom ? selectedRegisterRoom.roomId : '',
          status: regStatus,
          checkInDate: regCheckInDate,
          checkOutDate: regStatus === 'Checked-Out' ? regCheckOutDate : null,
          depositPaid: Number(regDepositPaid),
          standardRoomRate: selectedRegisterRoom ? Number(regStandardRate) : 0,
          monthlyRebate: selectedRegisterRoom ? Number(regMonthlyRebate) : 0,
          rebateReason: selectedRegisterRoom ? regRebateReason : 'None',
          firstMonthCharge: selectedRegisterRoom ? Number(regFirstMonthCharge) : 0,
          firstMonthNote: selectedRegisterRoom
            ? regFirstMonthNote
            : 'Unassigned — No Room Rent',
        },
        selectedRegisterRoom,
        rooms,
        staffEmail
      );
      setShowRegisterModal(false);
      if (!selectedRegisterRoom) {
        setFeedbackBanner(
          regStatus === 'Checked-Out'
            ? `Imported past resident ${regFullName.trim()} (Checked-Out, Room Unassigned).`
            : `Registered ${regFullName.trim()} as Room Unassigned (RM 0.00/mo until a room is assigned).`
        );
      } else if (regStatus === 'Checked-Out') {
        setFeedbackBanner(
          `Imported past resident ${regFullName.trim()} (Checked-Out). Room ${selectedRegisterRoom.roomId} remains unchanged.`
        );
      } else if (result.blockedSiblings.length > 0) {
        setFeedbackBanner(
          `Registered ${regFullName.trim()} in ${selectedRegisterRoom.roomId} (Whole Unit Exclusive) and blocked ${result.blockedSiblings.length} sibling bed(s): ${result.blockedSiblings.join(', ')}.`
        );
      } else {
        setFeedbackBanner(
          `Registered ${regFullName.trim()} and marked room ${selectedRegisterRoom.roomId} as Occupied.`
        );
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to register resident.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (student: Student, presetCheckOut = false) => {
    setFormError(null);
    const billing = calculateStudentBilling(student, payments);
    const autoDefaults = calculateFirstMonthDefaults(
      student.checkInDate,
      billing.effectiveMonthlyFee
    );
    setEditingStudent(student);
    setEditFullName(student.fullName);
    setEditResidentType(billing.residentType);
    setEditOccupancyMode(
      billing.occupancyMode === 'Whole Unit Exclusive'
        ? 'Whole Unit Exclusive'
        : 'Single Bed'
    );
    setEditPhone(student.phone);
    setEditEmergency(student.emergencyContact);
    setEditProgram(student.program);
    setEditStatus(presetCheckOut ? 'Checked-Out' : student.status);
    setEditCheckInDate(student.checkInDate);
    setEditCheckOutDate(
      presetCheckOut ? getTodayISO() : student.checkOutDate || ''
    );
    setEditDepositPaid(String(student.depositPaid));
    setEditStandardRate(String(billing.standardRoomRate));
    setEditMonthlyRebate(String(billing.monthlyRebate));
    setEditRebateReason(billing.rebateReason || 'None');
    setEditFirstMonthCharge(String(billing.firstMonthCharge));
    setEditFirstMonthNote(billing.firstMonthNote);
    setEditFirstMonthManual(
      Math.abs(billing.firstMonthCharge - autoDefaults.firstMonthCharge) > 0.01
    );
    setEditNewRoomId('');
  };

  const handleEditStatusChange = (nextStatus: StudentStatus) => {
    setEditStatus(nextStatus);
    if (nextStatus === 'Checked-Out' && !editCheckOutDate) {
      setEditCheckOutDate(getTodayISO());
    }
    if (nextStatus !== 'Checked-Out') {
      setEditCheckOutDate('');
    }
    if (
      editingStudent?.status === 'Checked-Out' &&
      nextStatus === 'Active' &&
      !editNewRoomId &&
      vacantRooms.length > 0
    ) {
      const firstVacant = vacantRooms[0];
      const nextStd = String(firstVacant.monthlyRate);
      setEditNewRoomId(firstVacant.roomId);
      setEditStandardRate(nextStd);
      syncEditFirstMonth(editCheckInDate, nextStd, editMonthlyRebate);
    }
  };

  const editTargetRoom = useMemo(() => {
    if (!editingStudent) return null;
    const roomId = editNewRoomId || editingStudent.assignedRoomId;
    return rooms.find((r) => r.roomId === roomId) || null;
  }, [editingStudent, editNewRoomId, rooms]);

  const editExclusiveSiblingCount = useMemo(() => {
    if (
      !editingStudent ||
      !editTargetRoom ||
      editStatus !== 'Active' ||
      editOccupancyMode !== 'Whole Unit Exclusive'
    ) {
      return 0;
    }
    return rooms.filter(
      (r) =>
        r.roomId !== editTargetRoom.roomId &&
        r.location === editTargetRoom.location &&
        r.block === editTargetRoom.block &&
        r.unitNo === editTargetRoom.unitNo &&
        (r.status === 'Vacant' ||
          (r.status === 'Reserved / Blocked' &&
            r.exclusiveResidentId === editingStudent.studentId))
    ).length;
  }, [editingStudent, editTargetRoom, editStatus, editOccupancyMode, rooms]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSubmitting(true);
    setFormError(null);

    const chosenNewRoom = editNewRoomId
      ? vacantRooms.find((r) => r.roomId === editNewRoomId) || null
      : null;

    try {
      await updateStudentRecord(
        editingStudent,
        {
          fullName: editFullName,
          residentType: editResidentType,
          occupancyMode: editOccupancyMode,
          phone: editPhone,
          emergencyContact: editEmergency,
          program: editProgram,
          status: editStatus,
          checkInDate: editCheckInDate,
          checkOutDate: editStatus === 'Checked-Out' ? editCheckOutDate : null,
          depositPaid: Number(editDepositPaid),
          standardRoomRate: Number(editStandardRate),
          monthlyRebate: Number(editMonthlyRebate),
          rebateReason: editRebateReason,
          firstMonthCharge: Number(editFirstMonthCharge),
          firstMonthNote: editFirstMonthNote,
          newRoom: chosenNewRoom,
        },
        rooms,
        staffEmail
      );

      if (editingStudent.status !== 'Checked-Out' && editStatus === 'Checked-Out') {
        setFeedbackBanner(
          editingStudent.assignedRoomId
            ? `Checked out ${editingStudent.fullName} and released room ${editingStudent.assignedRoomId} (and any unit blocks) back to Vacant.`
            : `Checked out ${editingStudent.fullName}.`
        );
      } else if (!editingStudent.assignedRoomId && chosenNewRoom && editStatus === 'Active') {
        setFeedbackBanner(
          `Assigned ${editFullName.trim()} to room ${chosenNewRoom.roomId} and marked bed as Occupied.`
        );
      } else {
        setFeedbackBanner(`Updated resident record for ${editFullName.trim()}.`);
      }
      setEditingStudent(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update resident.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openTransferModal = (student: Student) => {
    setFormError(null);
    const billing =
      billingByStudentId.get(student.studentId) ||
      calculateStudentBilling(student, payments);
    const firstVacant =
      vacantRooms.find((r) => r.roomId !== student.assignedRoomId) || null;
    setTransferStudent(student);
    setTransferDate(getTodayISO());
    setTransferNewRoomId(firstVacant ? firstVacant.roomId : '');
    setTransferOccupancyMode(
      billing.occupancyMode === 'Whole Unit Exclusive'
        ? 'Whole Unit Exclusive'
        : 'Single Bed'
    );
    setTransferStdRate(
      firstVacant
        ? String(firstVacant.monthlyRate)
        : String(billing.standardRoomRate)
    );
    setKeepExistingRebate(true);
    setTransferMonthlyRebate(String(billing.monthlyRebate));
    setTransferRebateReason(billing.rebateReason || 'None');
    setTransferReason('Student Request');
    setTransferCustomReason('');
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferStudent) return;
    if (!selectedTransferRoom) {
      setFormError('Please select an available Vacant bed to transfer into.');
      return;
    }

    const currentBilling =
      billingByStudentId.get(transferStudent.studentId) ||
      calculateStudentBilling(transferStudent, payments);

    const resolvedReason =
      transferReason === 'Other'
        ? transferCustomReason.trim() || 'Other'
        : transferReason;

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await transferStudentRoom(
        transferStudent,
        {
          effectiveTransferDate: transferDate,
          newRoom: selectedTransferRoom,
          newOccupancyMode: transferOccupancyMode,
          newStandardRate: Number(transferStdRate),
          keepExistingRebate,
          newMonthlyRebate: keepExistingRebate
            ? currentBilling.monthlyRebate
            : Number(transferMonthlyRebate),
          newRebateReason: keepExistingRebate
            ? currentBilling.rebateReason
            : transferRebateReason,
          transferReason: resolvedReason,
        },
        rooms,
        staffEmail
      );

      setTransferStudent(null);
      const releasedNote = result.releasedRoomId
        ? ` Released ${result.releasedRoomId} back to Vacant.`
        : '';
      const blockedNote =
        result.blockedSiblings.length > 0
          ? ` Blocked ${result.blockedSiblings.length} sibling bed(s): ${result.blockedSiblings.join(', ')}.`
          : '';
      setFeedbackBanner(
        `Transferred ${transferStudent.fullName} to ${selectedTransferRoom.roomId} effective ${transferDate} (${formatRM(transferEffectiveFee)}/mo).${releasedNote}${blockedNote}`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to transfer room.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAssignRoom = useMemo(() => {
    return vacantRooms.find((r) => r.roomId === assignRoomId) || null;
  }, [vacantRooms, assignRoomId]);

  const assignSiblingBeds = useMemo(() => {
    if (!selectedAssignRoom || assignOccupancyMode !== 'Whole Unit Exclusive') {
      return [];
    }
    return rooms
      .filter(
        (r) =>
          r.roomId !== selectedAssignRoom.roomId &&
          r.location === selectedAssignRoom.location &&
          r.block === selectedAssignRoom.block &&
          r.unitNo === selectedAssignRoom.unitNo &&
          r.status === 'Vacant'
      )
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms, selectedAssignRoom, assignOccupancyMode]);

  const stmtInstallmentPreview = useMemo(() => {
    if (!liveStatementStudent || !isRentCreditType(stmtPaymentType)) return null;
    return calculateMonthInstallmentStatus(
      liveStatementStudent,
      payments,
      stmtBillingMonth,
      Number(stmtAmount) || 0,
      stmtEditingPayment?.paymentId
    );
  }, [
    liveStatementStudent,
    stmtPaymentType,
    payments,
    stmtBillingMonth,
    stmtAmount,
    stmtEditingPayment,
  ]);

  const openAssignRoomModal = (student: Student) => {
    setFormError(null);
    const firstVacant = vacantRooms[0] || null;
    setAssigningStudent(student);
    setAssignRoomId(firstVacant ? firstVacant.roomId : '');
    setAssignPlacementDate(student.checkInDate || getTodayISO());
    setAssignOccupancyMode(
      student.occupancyMode === 'Whole Unit Exclusive'
        ? 'Whole Unit Exclusive'
        : 'Single Bed'
    );
    setAssignStdRate(
      firstVacant
        ? String(firstVacant.monthlyRate)
        : String(student.standardRoomRate ?? student.monthlyFee ?? 250)
    );
    setAssignRebate(String(student.monthlyRebate ?? 0));
    setAssignRebateReason(student.rebateReason || 'None');
  };

  const handleAssignRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningStudent) return;
    if (!selectedAssignRoom) {
      setFormError('Please select an available Vacant room.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await assignRoomToStudent(
        assigningStudent,
        {
          room: selectedAssignRoom,
          occupancyMode: assignOccupancyMode,
          placementDate: assignPlacementDate,
          standardRoomRate: Number(assignStdRate),
          monthlyRebate: Number(assignRebate),
          rebateReason: assignRebateReason,
        },
        rooms,
        staffEmail
      );
      setAssigningStudent(null);
      setFeedbackBanner(
        res.blockedSiblings.length > 0
          ? `Assigned ${assigningStudent.fullName} to ${selectedAssignRoom.roomId} (Whole Unit Exclusive) and blocked ${res.blockedSiblings.join(', ')}.`
          : `Assigned ${assigningStudent.fullName} to room ${selectedAssignRoom.roomId} and marked bed as Occupied.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to assign room.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const syncStayFirstMonth = (
    nextDate: string,
    nextStd: string,
    nextReb: string,
    forceReset = false
  ) => {
    if (stayFirstMonthManual && !forceReset) return;
    const eff = Math.max(
      0,
      Math.round(((Number(nextStd) || 0) - (Number(nextReb) || 0)) * 100) / 100
    );
    const defaults = calculateFirstMonthDefaults(nextDate, eff);
    setStayFirstMonthCharge(String(defaults.firstMonthCharge));
    if (forceReset) setStayFirstMonthManual(false);
  };

  const openAddStaySegmentModal = () => {
    if (!isMasterAdmin || !liveStatementStudent) return;
    setFormError(null);
    setEditingStaySegment(null);
    const defaultStart = liveStatementStudent.checkInDate || getTodayISO();
    const defaultLocation: ResidentHostelLocation =
      liveStatementStudent.hostelLocation &&
      liveStatementStudent.hostelLocation !== 'Unassigned'
        ? liveStatementStudent.hostelLocation
        : 'Apartment Desa Jati 2';
    setStayRoomInputMode(allRoomsSorted.length > 0 ? 'select' : 'custom');
    setStayRoomId('');
    setStayLocation(defaultLocation);
    setStayOccupancyMode('Single Bed');
    setStayStartDate(defaultStart);
    setStayIsOngoing(false);
    setStayEndDate(getTodayISO());
    // Snapshot isolation: never derive a historical segment's rate from the current rooms collection
    setStayStdRate('250');
    setStayRebate('0');
    setStayFirstMonthCharge(
      String(calculateFirstMonthDefaults(defaultStart, 250).firstMonthCharge)
    );
    setStayFirstMonthManual(false);
    setStayReason('Historical Stay');
    setStayModalOpen(true);
  };

  const openEditStaySegmentModal = (seg: StayHistorySegment) => {
    if (!isMasterAdmin) return;
    setFormError(null);
    setEditingStaySegment(seg);
    const existsInRooms = allRoomsSorted.some((r) => r.roomId === seg.roomId);
    setStayRoomInputMode(existsInRooms ? 'select' : 'custom');
    setStayRoomId(seg.roomId);
    setStayLocation(seg.hostelLocation || 'Apartment Desa Jati 2');
    setStayOccupancyMode(seg.occupancyMode || 'Single Bed');
    setStayStartDate(seg.startDate);
    setStayIsOngoing(!seg.endDate);
    setStayEndDate(seg.endDate || getTodayISO());
    setStayStdRate(String(seg.standardRoomRate));
    setStayRebate(String(seg.monthlyRebate));
    const autoFirst = calculateFirstMonthDefaults(
      seg.startDate,
      seg.effectiveMonthlyFee
    ).firstMonthCharge;
    const resolvedFirst =
      typeof seg.firstMonthCharge === 'number' ? seg.firstMonthCharge : autoFirst;
    setStayFirstMonthCharge(String(resolvedFirst));
    setStayFirstMonthManual(Math.abs(resolvedFirst - autoFirst) > 0.01);
    setStayReason(seg.reason || 'Stay Record');
    setStayModalOpen(true);
  };

  const handleSaveStaySegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin || !liveStatementStudent) return;
    const trimmedRoom = stayRoomId.trim();
    if (!trimmedRoom) {
      setFormError('Please enter or select a Room / Bed ID.');
      return;
    }
    if (!stayIsOngoing && !stayEndDate) {
      setFormError('Please enter an End Date for past stays, or check "Currently Ongoing".');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const currentList = getNormalizedStayHistory(liveStatementStudent);
      const stdNum = Number(stayStdRate) || 0;
      const rebNum = Number(stayRebate) || 0;
      const effNum = Math.max(0, Math.round((stdNum - rebNum) * 100) / 100);
      const parsedFirst =
        stayFirstMonthCharge.trim() !== '' && !Number.isNaN(Number(stayFirstMonthCharge))
          ? Number(stayFirstMonthCharge)
          : calculateFirstMonthDefaults(stayStartDate, effNum).firstMonthCharge;

      const updatedSeg: StayHistorySegment = {
        id:
          editingStaySegment?.id ||
          `SEG-${Date.now().toString(36).toUpperCase()}`,
        roomId: trimmedRoom,
        hostelLocation: stayLocation,
        occupancyMode: stayOccupancyMode,
        startDate: stayStartDate,
        endDate: stayIsOngoing ? null : stayEndDate,
        standardRoomRate: stdNum,
        monthlyRebate: rebNum,
        effectiveMonthlyFee: effNum,
        firstMonthCharge: parsedFirst,
        reason: stayReason.trim() || 'Historical Stay',
        recordedBy: staffEmail,
        recordedAt: new Date().toISOString(),
      };

      const nextList = editingStaySegment
        ? currentList.map((s) => (s.id === editingStaySegment.id ? updatedSeg : s))
        : [...currentList, updatedSeg];

      await saveStudentStayHistory(
        liveStatementStudent,
        nextList,
        rooms,
        staffEmail
      );
      setStayModalOpen(false);
      setEditingStaySegment(null);
      setFeedbackBanner(
        updatedSeg.endDate !== null
          ? `${editingStaySegment ? 'Updated' : 'Added'} historical stay (${updatedSeg.roomId}) at ${formatRM(effNum)}/mo. Current active rate & room remain unchanged.`
          : `Updated active stay segment (${updatedSeg.roomId}) at ${formatRM(effNum)}/mo.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save stay segment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteStaySegment = async () => {
    if (!isMasterAdmin || !liveStatementStudent || !deletingStaySegment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const currentList = getNormalizedStayHistory(liveStatementStudent);
      const nextList = currentList.filter((s) => s.id !== deletingStaySegment.id);
      await saveStudentStayHistory(
        liveStatementStudent,
        nextList,
        rooms,
        staffEmail
      );
      setFeedbackBanner(
        `Removed stay segment (${deletingStaySegment.roomId || 'Unassigned'}) from ${liveStatementStudent.fullName}.`
      );
      setDeletingStaySegment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete stay segment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openStmtRecordPaymentModal = () => {
    if (!liveStatementStudent || !statementBilling) return;
    setFormError(null);
    setStmtEditingPayment(null);
    const defaultMonth = getCurrentMonthISO();
    setStmtBillingMonth(defaultMonth);
    setStmtPaymentType('Monthly Rent');
    const monthStatus = calculateMonthInstallmentStatus(
      liveStatementStudent,
      payments,
      defaultMonth,
      0
    );
    const suggestedAmt =
      monthStatus.remainingBeforeEntry > 0
        ? monthStatus.remainingBeforeEntry
        : statementBilling.effectiveMonthlyFee;
    setStmtAmount(suggestedAmt.toFixed(2));
    setStmtMethod('Online Transfer');
    setStmtBankRefNo('');
    setStmtPaymentDate(getTodayISO());
    setStmtStatus('Paid');
    setStmtPhysStatus('Issued');
    setStmtPhysNo('');
    setStmtNotes('');
    setStmtPaymentModalOpen(true);
  };

  const openStmtEditPaymentModal = (p: Payment) => {
    setFormError(null);
    setStmtEditingPayment(p);
    setStmtBillingMonth(p.billingMonth);
    setStmtPaymentType(
      (PAYMENT_TYPES.includes(p.paymentType as PaymentType)
        ? p.paymentType
        : 'Monthly Rent') as PaymentType
    );
    setStmtAmount(String(p.amount));
    setStmtMethod(
      (PAYMENT_METHODS.includes(p.paymentMethod as PaymentMethod)
        ? p.paymentMethod
        : 'Online Transfer') as PaymentMethod
    );
    setStmtBankRefNo(getPaymentBankRef(p));
    setStmtPaymentDate(p.paymentDate);
    setStmtStatus(p.status);
    setStmtPhysStatus(getPhysicalReceiptStatus(p));
    setStmtPhysNo(p.physicalReceiptNo || '');
    setStmtNotes(p.notes || '');
    setStmtPaymentModalOpen(true);
  };

  const handleSaveStmtPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveStatementStudent) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (stmtEditingPayment) {
        await updatePayment(
          stmtEditingPayment.paymentId,
          {
            billingMonth: stmtBillingMonth,
            paymentType: stmtPaymentType,
            amount: Number(stmtAmount),
            paymentMethod: stmtMethod,
            bankRefNo: stmtBankRefNo,
            paymentDate: stmtPaymentDate,
            status: stmtStatus,
            notes: stmtNotes,
            physicalReceiptStatus: stmtPhysStatus,
            physicalReceiptNo: stmtPhysNo,
          },
          staffEmail
        );
        setFeedbackBanner(
          `Updated payment ${getPaymentReceiptNo(stmtEditingPayment)} for ${liveStatementStudent.fullName}.`
        );
      } else {
        const res = await createPayment(
          {
            student: liveStatementStudent,
            billingMonth: stmtBillingMonth,
            paymentType: stmtPaymentType,
            amount: Number(stmtAmount),
            paymentMethod: stmtMethod,
            bankRefNo: stmtBankRefNo,
            paymentDate: stmtPaymentDate,
            status: stmtStatus,
            notes: stmtNotes,
            physicalReceiptStatus: stmtPhysStatus,
            physicalReceiptNo: stmtPhysNo,
          },
          payments,
          staffEmail
        );
        setFeedbackBanner(
          `Recorded ${res.receiptNo} (${formatRM(Number(stmtAmount))} for ${stmtBillingMonth}) on ${liveStatementStudent.fullName}'s ledger.`
        );
      }
      setStmtPaymentModalOpen(false);
      setStmtEditingPayment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteStmtPayment = async () => {
    if (!stmtDeletingPayment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await deletePayment(stmtDeletingPayment.paymentId);
      setFeedbackBanner(
        `Deleted payment ${getPaymentReceiptNo(stmtDeletingPayment)} (${formatRM(stmtDeletingPayment.amount)}).`
      );
      setStmtDeletingPayment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const batchMonthRows = useMemo(() => {
    if (!liveStatementStudent || !statementBilling) return [];
    const segStarts = statementBilling.segments
      .map((sb) => sb.segment.startDate.slice(0, 7))
      .filter((ym) => /^\d{4}-\d{2}$/.test(ym));
    const checkInYM = liveStatementStudent.checkInDate.slice(0, 7);
    const startYM =
      segStarts.length > 0 && segStarts[0] < checkInYM
        ? segStarts[0]
        : checkInYM;

    const rawEnd =
      liveStatementStudent.status === 'Checked-Out' &&
      liveStatementStudent.checkOutDate
        ? liveStatementStudent.checkOutDate
        : getTodayISO();
    const endYM = rawEnd.slice(0, 7);
    const months = enumerateMonthsISO(startYM, endYM);

    return months.map((ym) => {
      const info = calculateMonthInstallmentStatus(
        liveStatementStudent,
        payments,
        ym,
        0
      );
      const ownerSeg =
        statementBilling.segments.find((sb) => sb.billedMonths.includes(ym))
          ?.segment ||
        [...statementBilling.segments]
          .reverse()
          .find((sb) => sb.segment.startDate.slice(0, 7) <= ym)?.segment;

      const expectedRate = info.monthTargetCharge;
      const alreadyPaid = info.alreadyCreditedForMonth;
      const remaining = info.remainingBeforeEntry;
      const monthStatus: 'Paid' | 'Partial' | 'Unpaid' =
        remaining <= 0.009 ? 'Paid' : alreadyPaid > 0 ? 'Partial' : 'Unpaid';

      return {
        billingMonth: ym,
        expectedRate,
        alreadyPaid,
        remaining,
        monthStatus,
        roomId: ownerSeg?.roomId || liveStatementStudent.assignedRoomId || '',
        hostelLocation:
          ownerSeg?.hostelLocation ||
          liveStatementStudent.hostelLocation ||
          'Unassigned',
      };
    });
  }, [liveStatementStudent, statementBilling, payments]);

  const batchSelectedTotals = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const row of batchMonthRows) {
      if (!batchSelectedMonths[row.billingMonth]) continue;
      count += 1;
      const amt = Math.max(0, Number(batchAmounts[row.billingMonth]) || 0);
      total = Math.round((total + amt) * 100) / 100;
    }
    return { count, total };
  }, [batchMonthRows, batchSelectedMonths, batchAmounts]);

  const openBatchPastPaymentsModal = () => {
    if (!isMasterAdmin || !liveStatementStudent) return;
    setFormError(null);
    const initialSelected: Record<string, boolean> = {};
    const initialAmounts: Record<string, string> = {};
    for (const row of batchMonthRows) {
      const isUnpaidOrPartial = row.remaining > 0.009;
      initialSelected[row.billingMonth] = isUnpaidOrPartial;
      initialAmounts[row.billingMonth] = (
        isUnpaidOrPartial ? row.remaining : row.expectedRate
      ).toFixed(2);
    }
    setBatchSelectedMonths(initialSelected);
    setBatchAmounts(initialAmounts);
    setBatchPaymentMethod('Historical Migration');
    setBatchBankRefNo('HIST-MIGRATION');
    setBatchPhysStatus('Issued');
    setBatchPhysNo('');
    setBatchNotes('Historical monthly payment migration');
    setBatchModalOpen(true);
  };

  const handleSelectAllUnpaidMonths = () => {
    const nextSelected: Record<string, boolean> = {};
    const nextAmounts = { ...batchAmounts };
    for (const row of batchMonthRows) {
      if (row.remaining > 0.009) {
        nextSelected[row.billingMonth] = true;
        nextAmounts[row.billingMonth] = row.remaining.toFixed(2);
      } else {
        nextSelected[row.billingMonth] = false;
      }
    }
    setBatchSelectedMonths(nextSelected);
    setBatchAmounts(nextAmounts);
  };

  const handleSaveBatchPastPayments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin || !liveStatementStudent) return;

    const entries = batchMonthRows
      .filter((row) => batchSelectedMonths[row.billingMonth])
      .map((row) => ({
        billingMonth: row.billingMonth,
        amount: Number(batchAmounts[row.billingMonth]) || 0,
        roomId: row.roomId,
        hostelLocation: row.hostelLocation,
      }));

    if (entries.length === 0) {
      setFormError('Please check at least one month to save.');
      return;
    }

    const invalidAmt = entries.find((entry) => entry.amount <= 0);
    if (invalidAmt) {
      setFormError(
        `Amount for ${invalidAmt.billingMonth} must be greater than RM 0.00.`
      );
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await batchCreatePastPayments(
        liveStatementStudent,
        entries,
        {
          paymentMethod: batchPaymentMethod,
          bankRefNo: batchBankRefNo,
          physicalReceiptStatus: batchPhysStatus,
          physicalReceiptNo: batchPhysNo,
          notes: batchNotes,
          paymentType: 'Monthly Rent',
        },
        payments,
        staffEmail
      );
      setBatchModalOpen(false);
      setFeedbackBanner(
        `Batch saved ${res.createdCount} past payment${
          res.createdCount === 1 ? '' : 's'
        } (${formatRM(res.totalAmount)}) for ${liveStatementStudent.fullName}. Receipts: ${res.receiptNumbers[0]}${
          res.receiptNumbers.length > 1
            ? ` … ${res.receiptNumbers[res.receiptNumbers.length - 1]}`
            : ''
        }.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to save batch past payments.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSettleHistoricalBalance = async () => {
    if (
      !isMasterAdmin ||
      !liveStatementStudent ||
      !statementBilling ||
      liveStatementStudent.status !== 'Checked-Out' ||
      statementBilling.outstandingBalance <= 0.009
    ) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const settleDate = liveStatementStudent.checkOutDate || getTodayISO();
      const settleMonth = settleDate.slice(0, 7);
      const exactBalance = statementBilling.outstandingBalance;
      const res = await createPayment(
        {
          student: liveStatementStudent,
          billingMonth: settleMonth,
          paymentType: 'Monthly Rent',
          amount: exactBalance,
          paymentMethod: 'Historical Migration',
          bankRefNo: 'HIST-MIGRATION',
          paymentDate: settleDate,
          status: 'Paid',
          physicalReceiptStatus: 'Issued',
          physicalReceiptNo: '',
          notes: 'Historical ledger balance settled during system migration',
        },
        payments,
        staffEmail
      );
      setSettleBalanceConfirmOpen(false);
      setFeedbackBanner(
        `Settled full historical balance (${formatRM(exactBalance)}) for ${liveStatementStudent.fullName} via receipt ${res.receiptNo}. Outstanding balance is now RM 0.00.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Failed to settle full historical balance.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className={statementStudent ? 'print:hidden space-y-5' : 'space-y-5'}>
      {feedbackBanner && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-4">
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-blue-900 hover:text-blue-700 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Name, Matrix/IC, Room..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-900"
            />
          </div>

          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value as 'All' | ResidentHostelLocation)
            }
            aria-label="Filter residents by hostel location"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Locations</option>
            {HOSTEL_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            <option value="Unassigned">Unassigned</option>
          </select>

          <select
            value={residentTypeFilter}
            onChange={(e) =>
              setResidentTypeFilter(e.target.value as 'All' | ResidentType)
            }
            aria-label="Filter by resident type"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Resident Types</option>
            {RESIDENT_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as 'All' | StudentStatus | 'Room Unassigned'
              )
            }
            aria-label="Filter residents by residency status"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Statuses</option>
            <option value="Room Unassigned">Room Unassigned</option>
            {STUDENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {!isViewer && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start xl:self-auto">
            {isMasterAdmin && (
              <button
                type="button"
                onClick={() => {
                  setImportModalType('tenancyHistory');
                  setShowImportModal(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-900" />
                <span>Bulk Tenancy History</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setImportModalType('students');
                setShowImportModal(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={handleOpenRegisterModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Resident</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary Counts */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 px-1 tabular-nums">
        <span>
          Showing <strong className="text-slate-900">{filteredStudents.length}</strong> residents
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-emerald-700">{vacantRooms.length}</strong> vacant beds available
        </span>
        {unassignedActiveCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                setStatusFilter(
                  statusFilter === 'Room Unassigned' ? 'All' : 'Room Unassigned'
                )
              }
              className="inline-flex items-center gap-1.5 text-amber-800 hover:text-amber-950 font-semibold cursor-pointer"
            >
              <span>{unassignedActiveCount} room unassigned</span>
              <span className="underline font-normal">
                {statusFilter === 'Room Unassigned' ? '(Show all)' : '(Filter)'}
              </span>
            </button>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>
          Cumulative Arrears:{' '}
          <strong className={totalFilteredArrears > 0 ? 'text-red-700' : 'text-slate-900'}>
            {formatRM(totalFilteredArrears)}
          </strong>
        </span>
      </div>

      {/* Residents Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading resident records...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              No resident records match your current search or filters.
            </p>
            <p className="text-xs text-slate-500">
              Use &ldquo;Register Resident&rdquo; to assign a student, staff, or guest, or import historical records.
            </p>
          </div>
        ) : (
          <>
            {/* Synchronized Top Horizontal Scrollbar */}
            <div
              ref={topScrollRef}
              onScroll={handleTopScroll}
              aria-label="Horizontal table scroll bar"
              className={`overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-slate-50/80 ${
                hasHorizontalOverflow ? 'block' : 'hidden'
              }`}
            >
              <div className="h-3.5" style={{ width: `${tableScrollWidth}px` }} />
            </div>

            <div
              ref={tableScrollRef}
              onScroll={handleTableScroll}
              className="max-h-[72vh] overflow-auto"
            >
              <table ref={tableElRef} className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4 sticky left-0 top-0 z-30 bg-slate-50 min-w-[220px] shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] border-r border-slate-200">
                      Student Name &amp; ID
                    </th>
                    <th className="py-3 px-4 min-w-[150px] whitespace-nowrap">
                      Room / Hostel
                    </th>
                    <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                      Tenancy Period
                    </th>
                    <th className="py-3 px-4 text-right min-w-[155px] whitespace-nowrap">
                      Effective Rate
                    </th>
                    <th className="py-3 px-4 text-right min-w-[155px] whitespace-nowrap">
                      Ledger Balance
                    </th>
                    <th className="py-3 px-4 min-w-[110px] whitespace-nowrap">
                      Status
                    </th>
                    <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                      Updated By
                    </th>
                    <th className="py-3 px-4 text-right sticky right-0 top-0 z-30 bg-slate-50 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] border-l border-slate-200 whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredStudents.map((st) => {
                    const billing = billingByStudentId.get(st.studentId)!;
                    return (
                      <tr key={st.studentId} className="group hover:bg-slate-50">
                        <td className="py-3 px-4 sticky left-0 z-10 bg-white group-hover:bg-slate-50 min-w-[220px] shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] border-r border-slate-100">
                          <p className="font-medium text-slate-900">{st.fullName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono font-semibold text-blue-900">
                              {st.studentId}
                            </span>{' '}
                            · {billing.residentType} · {billing.occupancyMode} ·{' '}
                            {st.program}
                          </p>
                          {(st.phone || st.emergencyContact) && (
                            <p className="text-xs text-slate-400">
                              {[
                                st.phone,
                                st.emergencyContact
                                  ? `ICE: ${st.emergencyContact}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {(st.assignedRoomId || '').trim() ? (
                            <p className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                              {st.assignedRoomId}
                            </p>
                          ) : st.status === 'Active' ? (
                            <StatusBadge status="Room Unassigned" />
                          ) : (
                            <p className="font-mono text-xs text-slate-400 whitespace-nowrap">
                              No Room Assigned
                            </p>
                          )}
                          <p className="text-xs text-slate-500 whitespace-nowrap mt-0.5">
                            {st.hostelLocation || 'Unassigned'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                          <p>In: {st.checkInDate}</p>
                          {st.checkOutDate && (
                            <p className="text-slate-500">Out: {st.checkOutDate}</p>
                          )}
                          <p className="text-slate-400">
                            {billing.monthsBilled}{' '}
                            {billing.monthsBilled === 1 ? 'month' : 'months'} billed
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          <p className="font-semibold text-slate-900">
                            {formatRM(billing.effectiveMonthlyFee)}/mo
                          </p>
                          {billing.monthlyRebate > 0 && (
                            <p className="text-emerald-700">
                              -{formatRM(billing.monthlyRebate)} ({billing.rebateReason})
                            </p>
                          )}
                          {(billing.firstMonthCharge !== billing.effectiveMonthlyFee ||
                            billing.firstMonthNote !== 'Standard Full Month') && (
                            <p className="text-blue-900">
                              1st mo: {formatRM(billing.firstMonthCharge)} (
                              {billing.firstMonthNote})
                            </p>
                          )}
                          <p className="text-slate-500">
                            Dep: {formatRM(st.depositPaid)}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          <p
                            className={`font-semibold ${
                              billing.outstandingBalance > 0
                                ? 'text-red-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {billing.outstandingBalance > 0
                              ? `Due ${formatRM(billing.outstandingBalance)}`
                              : 'Settled'}
                          </p>
                          <p className="text-slate-500">
                            Paid {formatRM(billing.totalRentCredited)} /{' '}
                            {formatRM(billing.totalExpectedRent)}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <StatusBadge status={st.status} />
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs text-slate-700 truncate max-w-[140px]">
                            {st.updatedBy}
                          </p>
                          <p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                            {formatTimestamp(st.updatedAt)}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap sticky right-0 z-10 bg-white group-hover:bg-slate-50 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] border-l border-slate-100">
                          <div className="inline-flex items-center gap-1.5">
                            {!isViewer && !(st.assignedRoomId || '').trim() && (
                              <button
                                type="button"
                                onClick={() => openAssignRoomModal(st)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md cursor-pointer"
                                title="Assign a Vacant room directly to this resident"
                              >
                                <BedDouble className="w-3 h-3" />
                                <span>Assign Room</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setStatementStudent(st)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                              title={
                                isViewer
                                  ? 'View stay history and resident statement (Read-Only)'
                                  : 'View & edit stay history, statement, and past payments'
                              }
                            >
                              <FileText className="w-3 h-3" />
                              <span>View Statement</span>
                            </button>
                            {!isViewer &&
                              st.status === 'Active' &&
                              Boolean((st.assignedRoomId || '').trim()) && (
                                <button
                                  type="button"
                                  onClick={() => openTransferModal(st)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md cursor-pointer"
                                  title="Transfer resident to another bed/room"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                  <span>Transfer Room</span>
                                </button>
                              )}
                            {!isViewer && (
                              <button
                                type="button"
                                onClick={() => openEditModal(st, false)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            )}
                            {!isViewer && st.status !== 'Checked-Out' && (
                              <button
                                type="button"
                                onClick={() => openEditModal(st, true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md cursor-pointer"
                              >
                                <LogOut className="w-3 h-3" />
                                <span>Check Out</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Register New Resident Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Register Resident / Import Past Record
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register an Active resident (locks bed/unit) or import a Checked-Out past resident for arrears tracking
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleRegisterSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

                {/* Status + Resident Type + Occupancy Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Registration Mode
                    </label>
                    <select
                      value={regStatus}
                      onChange={(e) =>
                        handleRegStatusChange(e.target.value as 'Active' | 'Checked-Out')
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      <option value="Active">
                        Active ({vacantRooms.length === 0 ? 'Room Unassigned' : 'Occupy Bed or Leave Unassigned'})
                      </option>
                      <option value="Checked-Out">
                        Checked-Out (Past Record Import)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resident Type
                    </label>
                    <select
                      value={regResidentType}
                      onChange={(e) =>
                        handleRegResidentTypeChange(e.target.value as ResidentType)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {RESIDENT_TYPES.map((rt) => (
                        <option key={rt} value={rt}>
                          {rt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Occupancy Mode
                    </label>
                    <select
                      value={!regRoomId ? '' : regOccupancyMode}
                      disabled={!regRoomId}
                      onChange={(e) =>
                        setRegOccupancyMode(e.target.value as OccupancyMode)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      {!regRoomId && (
                        <option value="">Unassigned (Disabled until room assigned)</option>
                      )}
                      {OCCUPANCY_MODES.map((om) => (
                        <option key={om} value={om}>
                          {om}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resident ID (Matrix / IC / Staff No.)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={64}
                      value={regStudentId}
                      onChange={(e) => setRegStudentId(e.target.value)}
                      placeholder="e.g. GIS250301 or STF-GIS-020"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Program / Category
                    </label>
                    <select
                      value={regProgram}
                      onChange={(e) => setRegProgram(e.target.value as ProgramType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PROGRAMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name (as per IC / Passport)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="e.g. Aisyah binti Mohd Farid"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      maxLength={32}
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="e.g. 012-345 6789"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      maxLength={120}
                      value={regEmergency}
                      onChange={(e) => setRegEmergency(e.target.value)}
                      placeholder="e.g. Farid (Father) 019-221 8810"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {regStatus === 'Checked-Out'
                      ? 'Historical Room / Bed Occupied (Optional)'
                      : 'Assign Vacant Room / Bed (Optional)'}
                  </label>
                  <select
                    value={regRoomId}
                    onChange={(e) => handleRoomSelectionChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    <option value="">Unassigned (Assign Room Later)</option>
                    {registerRoomChoices.map((r) => (
                      <option key={r.roomId} value={r.roomId}>
                        {r.roomId} — {r.location} (Blk {r.block}, Unit {r.unitNo}, {r.bedSlot}) · {formatRM(r.monthlyRate)}/mo
                        {regStatus === 'Checked-Out' ? ` [${r.status}]` : ''}
                      </option>
                    ))}
                  </select>
                  {!regRoomId && (
                    <p className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Student will be registered without a room. Monthly rent will remain RM 0 until a room is assigned via &apos;Assign Room&apos;.
                    </p>
                  )}
                  {regStatus === 'Checked-Out' && regRoomId && (
                    <p className="text-xs text-slate-600 mt-1">
                      Historical import: the selected room&apos;s current live status will <strong>not</strong> be changed.
                    </p>
                  )}
                  {regStatus === 'Active' && regOccupancyMode === 'Whole Unit Exclusive' && selectedRegisterRoom && (
                    <div className="mt-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                      {regSiblingVacantBeds.length > 0 ? (
                        <p>
                          <strong>Whole Unit Exclusive:</strong> Registering in{' '}
                          <span className="font-mono">{selectedRegisterRoom.roomId}</span> will also mark{' '}
                          <strong className="font-mono">
                            {regSiblingVacantBeds.map((b) => b.roomId).join(', ')}
                          </strong>{' '}
                          as <strong>Reserved / Blocked</strong>.
                        </p>
                      ) : (
                        <p>
                          <strong>Whole Unit Exclusive:</strong> No other Vacant beds remain in Block{' '}
                          {selectedRegisterRoom.block} Unit {selectedRegisterRoom.unitNo}.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Check-In Date
                    </label>
                    <input
                      type="date"
                      required
                      value={regCheckInDate}
                      onChange={(e) => {
                        setRegCheckInDate(e.target.value);
                        if (regRoomId) {
                          syncRegFirstMonth(
                            e.target.value,
                            regStandardRate,
                            regMonthlyRebate
                          );
                        }
                      }}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  {regStatus === 'Checked-Out' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Check-Out Date
                      </label>
                      <input
                        type="date"
                        required
                        value={regCheckOutDate}
                        onChange={(e) => setRegCheckOutDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  )}
                  <div className={regStatus === 'Checked-Out' ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Deposit Paid (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={50000}
                      step="0.01"
                      value={regDepositPaid}
                      onChange={(e) => setRegDepositPaid(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                {/* Pricing, Monthly Rebates & First-Month Proration */}
                <div className={`border border-slate-200 rounded-lg p-3.5 space-y-3 ${!regRoomId ? 'bg-slate-100/80 opacity-80' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">
                      Monthly Rate, Concession &amp; First-Month Proration
                      {!regRoomId && (
                        <span className="ml-1.5 font-normal text-amber-800">
                          (RM 0.00 until room assigned)
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-mono font-semibold text-blue-900 tabular-nums">
                      Effective Monthly Fee: {formatRM(!regRoomId ? 0 : regEffectiveFee)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Standard Room Rate (RM)
                      </label>
                      <input
                        type="number"
                        required={!regRoomId ? false : true}
                        disabled={!regRoomId}
                        min={0}
                        max={10000}
                        step="0.01"
                        value={!regRoomId ? '0' : regStandardRate}
                        onChange={(e) => {
                          setRegStandardRate(e.target.value);
                          syncRegFirstMonth(
                            regCheckInDate,
                            e.target.value,
                            regMonthlyRebate
                          );
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Monthly Rebate (RM)
                      </label>
                      <input
                        type="number"
                        required={!regRoomId ? false : true}
                        disabled={!regRoomId}
                        min={0}
                        max={10000}
                        step="0.01"
                        value={!regRoomId ? '0' : regMonthlyRebate}
                        onChange={(e) => {
                          setRegMonthlyRebate(e.target.value);
                          syncRegFirstMonth(
                            regCheckInDate,
                            regStandardRate,
                            e.target.value
                          );
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rebate Reason
                      </label>
                      <select
                        value={!regRoomId ? 'None' : regRebateReason}
                        disabled={!regRoomId}
                        onChange={(e) => setRegRebateReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                      >
                        {REBATE_REASONS.map((rr) => (
                          <option key={rr} value={rr}>
                            {rr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-700">
                        First Month Rule (Day &gt; 15 = 50% Half-Rate)
                      </span>
                      <button
                        type="button"
                        disabled={!regRoomId}
                        onClick={() =>
                          syncRegFirstMonth(
                            regCheckInDate,
                            regStandardRate,
                            regMonthlyRebate,
                            true
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-900 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Apply Auto-Rule</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          First Month Charge (RM)
                        </label>
                        <input
                          type="number"
                          required={!regRoomId ? false : true}
                          disabled={!regRoomId}
                          min={0}
                          max={10000}
                          step="0.01"
                          value={!regRoomId ? '0' : regFirstMonthCharge}
                          onChange={(e) => {
                            setRegFirstMonthCharge(e.target.value);
                            setRegFirstMonthManual(true);
                          }}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          First Month Proration Note
                        </label>
                        <input
                          type="text"
                          disabled={!regRoomId}
                          maxLength={64}
                          value={!regRoomId ? 'Unassigned — No Room Rent' : regFirstMonthNote}
                          onChange={(e) => {
                            setRegFirstMonthNote(e.target.value);
                            setRegFirstMonthManual(true);
                          }}
                          placeholder="e.g. After 15th Half-Rate"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : regStatus === 'Checked-Out'
                      ? 'Import Past Resident'
                      : !regRoomId
                        ? 'Register (Room Unassigned)'
                        : 'Register & Occupy Bed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Check-Out Resident Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Manage Resident · {editingStudent.studentId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Room: {editingStudent.assignedRoomId || 'Room Unassigned'} ({editingStudent.hostelLocation || 'Unassigned'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Residency Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) =>
                        handleEditStatusChange(e.target.value as StudentStatus)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {STUDENT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Resident Type
                    </label>
                    <select
                      value={editResidentType}
                      onChange={(e) =>
                        setEditResidentType(e.target.value as ResidentType)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {RESIDENT_TYPES.map((rt) => (
                        <option key={rt} value={rt}>
                          {rt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Occupancy Mode
                    </label>
                    <select
                      value={
                        !(editingStudent.assignedRoomId || '').trim() && !editNewRoomId
                          ? ''
                          : editOccupancyMode
                      }
                      disabled={
                        !(editingStudent.assignedRoomId || '').trim() && !editNewRoomId
                      }
                      onChange={(e) =>
                        setEditOccupancyMode(e.target.value as OccupancyMode)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      {!(editingStudent.assignedRoomId || '').trim() && !editNewRoomId && (
                        <option value="">Unassigned (Select a Vacant Room below first)</option>
                      )}
                      {OCCUPANCY_MODES.map((om) => (
                        <option key={om} value={om}>
                          {om}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {editingStudent.status !== 'Checked-Out' &&
                  editStatus === 'Checked-Out' && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      {editingStudent.assignedRoomId ? (
                        <>
                          Saving with status <strong>Checked-Out</strong> will
                          automatically release room{' '}
                          <span className="font-mono font-semibold">
                            {editingStudent.assignedRoomId}
                          </span>{' '}
                          and any exclusive-unit blocked beds back to <strong>Vacant</strong>.
                        </>
                      ) : (
                        <>
                          Saving with status <strong>Checked-Out</strong> will mark this
                          unassigned resident as checked out.
                        </>
                      )}
                    </div>
                  )}

                {editStatus === 'Active' &&
                  editOccupancyMode === 'Whole Unit Exclusive' && (
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                      <strong>Whole Unit Exclusive:</strong>{' '}
                      {editExclusiveSiblingCount > 0
                        ? `${editExclusiveSiblingCount} sibling bed(s) in the same unit will be held as Reserved / Blocked.`
                        : 'All sibling beds in this unit are already occupied or none exist.'}
                    </div>
                  )}

                {editStatus === 'Checked-Out' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Check-Out Date (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      required
                      value={editCheckOutDate}
                      onChange={(e) => setEditCheckOutDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                )}

                {editStatus !== 'Checked-Out' && (
                  <div
                    className={
                      !(editingStudent.assignedRoomId || '').trim()
                        ? 'p-3.5 rounded-lg bg-amber-50/70 border border-amber-200'
                        : ''
                    }
                  >
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      {editingStudent.status === 'Checked-Out'
                        ? 'Assign Vacant Room for Re-Check-In'
                        : !(editingStudent.assignedRoomId || '').trim()
                          ? 'Assign Vacant Room / Bed (Currently Unassigned)'
                          : 'Transfer Room (Optional — Vacant Beds Only)'}
                    </label>
                    <select
                      value={editNewRoomId}
                      onChange={(e) => {
                        setEditNewRoomId(e.target.value);
                        const rm = vacantRooms.find((r) => r.roomId === e.target.value);
                        if (rm) {
                          const nextStd = String(rm.monthlyRate);
                          setEditStandardRate(nextStd);
                          syncEditFirstMonth(editCheckInDate, nextStd, editMonthlyRebate);
                        }
                      }}
                      required={editingStudent.status === 'Checked-Out'}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {editingStudent.status !== 'Checked-Out' && (
                        <option value="">
                          {editingStudent.assignedRoomId
                            ? `Keep current room (${editingStudent.assignedRoomId})`
                            : 'Keep Unassigned (Select a Vacant Room to assign)'}
                        </option>
                      )}
                      {vacantRooms.map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.roomId} — {r.location} ({formatRM(r.monthlyRate)}/mo)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Program / Category
                    </label>
                    <select
                      value={editProgram}
                      onChange={(e) => setEditProgram(e.target.value as ProgramType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PROGRAMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      maxLength={32}
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Optional — e.g. 012-345 6789"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={editEmergency}
                      onChange={(e) => setEditEmergency(e.target.value)}
                      placeholder="Optional — e.g. Parent / Guardian contact"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Check-In Date
                    </label>
                    <input
                      type="date"
                      required
                      value={editCheckInDate}
                      onChange={(e) => {
                        setEditCheckInDate(e.target.value);
                        syncEditFirstMonth(
                          e.target.value,
                          editStandardRate,
                          editMonthlyRebate
                        );
                      }}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Deposit Paid (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={50000}
                      step="0.01"
                      value={editDepositPaid}
                      onChange={(e) => setEditDepositPaid(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                {/* Pricing, Monthly Rebates & First-Month Proration */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">
                      Monthly Rate, Concession &amp; First-Month Proration
                    </span>
                    <span className="text-xs font-mono font-semibold text-blue-900 tabular-nums">
                      Effective Monthly Fee: {formatRM(editEffectiveFee)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Standard Room Rate (RM)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={10000}
                        step="0.01"
                        value={editStandardRate}
                        onChange={(e) => {
                          setEditStandardRate(e.target.value);
                          syncEditFirstMonth(
                            editCheckInDate,
                            e.target.value,
                            editMonthlyRebate
                          );
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Monthly Rebate (RM)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={10000}
                        step="0.01"
                        value={editMonthlyRebate}
                        onChange={(e) => {
                          setEditMonthlyRebate(e.target.value);
                          syncEditFirstMonth(
                            editCheckInDate,
                            editStandardRate,
                            e.target.value
                          );
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rebate Reason
                      </label>
                      <select
                        value={editRebateReason}
                        onChange={(e) => setEditRebateReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {REBATE_REASONS.map((rr) => (
                          <option key={rr} value={rr}>
                            {rr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-700">
                        First Month Rule (Day &gt; 15 = 50% Half-Rate)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          syncEditFirstMonth(
                            editCheckInDate,
                            editStandardRate,
                            editMonthlyRebate,
                            true
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Apply Auto-Rule</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          First Month Charge (RM)
                        </label>
                        <input
                          type="number"
                          required
                          min={0}
                          max={10000}
                          step="0.01"
                          value={editFirstMonthCharge}
                          onChange={(e) => {
                            setEditFirstMonthCharge(e.target.value);
                            setEditFirstMonthManual(true);
                          }}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          First Month Proration Note
                        </label>
                        <input
                          type="text"
                          maxLength={64}
                          value={editFirstMonthNote}
                          onChange={(e) => {
                            setEditFirstMonthNote(e.target.value);
                            setEditFirstMonthManual(true);
                          }}
                          placeholder="e.g. After 15th Half-Rate"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting
                    ? 'Saving...'
                    : editStatus === 'Checked-Out' &&
                        editingStudent.status !== 'Checked-Out'
                      ? 'Confirm Check-Out & Vacate Bed'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        importType={importModalType}
        staffRole={staffRole}
        rooms={rooms}
        students={students}
        payments={payments}
        staffEmail={staffEmail}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(msg) => setFeedbackBanner(msg)}
      />
      </div>

      {/* Transfer Room Modal */}
      {transferStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Transfer Room · {transferStudent.fullName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {transferStudent.studentId} · Check-In: {transferStudent.checkInDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferStudent(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close transfer room modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {transferVacantChoices.length === 0 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                  {(() => {
                    const curr =
                      billingByStudentId.get(transferStudent.studentId) ||
                      calculateStudentBilling(transferStudent, payments);
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="text-slate-500 font-medium">Current Room &amp; Mode</p>
                          <p className="font-mono font-semibold text-slate-900 mt-0.5">
                            {transferStudent.assignedRoomId || 'Room Unassigned'} ·{' '}
                            {transferStudent.hostelLocation || 'Unassigned'}
                          </p>
                          <p className="text-slate-600 mt-0.5">{curr.occupancyMode}</p>
                        </div>
                        <div className="sm:text-right font-mono tabular-nums">
                          <p className="font-sans text-slate-500 font-medium">Current Rate</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">
                            {formatRM(curr.effectiveMonthlyFee)}/mo
                          </p>
                          {curr.monthlyRebate > 0 && (
                            <p className="text-emerald-700">
                              Std {formatRM(curr.standardRoomRate)} - Rebate{' '}
                              {formatRM(curr.monthlyRebate)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {formError}
                    </div>
                  )}
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold">No Vacant Beds Available</p>
                    <p>
                      There are currently no other Vacant beds in Room Inventory to
                      transfer this resident into.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setTransferStudent(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={handleTransferSubmit}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                  {(() => {
                    const curr =
                      billingByStudentId.get(transferStudent.studentId) ||
                      calculateStudentBilling(transferStudent, payments);
                    return (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="text-slate-500 font-medium">Current Room &amp; Mode</p>
                          <p className="font-mono font-semibold text-slate-900 mt-0.5">
                            {transferStudent.assignedRoomId || 'Room Unassigned'} ·{' '}
                            {transferStudent.hostelLocation || 'Unassigned'}
                          </p>
                          <p className="text-slate-600 mt-0.5">{curr.occupancyMode}</p>
                        </div>
                        <div className="sm:text-right font-mono tabular-nums">
                          <p className="font-sans text-slate-500 font-medium">Current Rate</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">
                            {formatRM(curr.effectiveMonthlyFee)}/mo
                          </p>
                          {curr.monthlyRebate > 0 && (
                            <p className="text-emerald-700">
                              Std {formatRM(curr.standardRoomRate)} - Rebate{' '}
                              {formatRM(curr.monthlyRebate)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {formError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Effective Transfer Date
                      </label>
                      <input
                        type="date"
                        required
                        min={transferStudent.checkInDate}
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        New Occupancy Mode
                      </label>
                      <select
                        value={transferOccupancyMode}
                        onChange={(e) =>
                          setTransferOccupancyMode(e.target.value as OccupancyMode)
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {OCCUPANCY_MODES.map((om) => (
                          <option key={om} value={om}>
                            {om}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Select Destination Vacant Bed
                    </label>
                    <select
                      required
                      value={transferNewRoomId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setTransferNewRoomId(nextId);
                        const rm = transferVacantChoices.find(
                          (r) => r.roomId === nextId
                        );
                        if (rm) {
                          setTransferStdRate(String(rm.monthlyRate));
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {transferVacantChoices.map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.roomId} — {r.location} (Blk {r.block}, Unit {r.unitNo},{' '}
                          {r.bedSlot}) · {formatRM(r.monthlyRate)}/mo
                        </option>
                      ))}
                    </select>
                  </div>

                  {transferOccupancyMode === 'Whole Unit Exclusive' &&
                    selectedTransferRoom && (
                      <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                        {transferExclusiveSiblings.length > 0 ? (
                          <p>
                            <strong>Whole Unit Exclusive:</strong> Transferring into{' '}
                            <span className="font-mono">{selectedTransferRoom.roomId}</span>{' '}
                            will automatically block{' '}
                            <strong className="font-mono">
                              {transferExclusiveSiblings.map((b) => b.roomId).join(', ')}
                            </strong>{' '}
                            as <strong>Reserved / Blocked</strong>.
                          </p>
                        ) : (
                          <p>
                            <strong>Whole Unit Exclusive:</strong> No other Vacant beds
                            remain in Block {selectedTransferRoom.block} Unit{' '}
                            {selectedTransferRoom.unitNo}.
                          </p>
                        )}
                      </div>
                    )}

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">
                        New Segment Pricing &amp; Rebate
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-900 tabular-nums">
                        New Effective Rate: {formatRM(transferEffectiveFee)}/mo
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          New Standard Room Rate (RM)
                        </label>
                        <input
                          type="number"
                          required
                          min={0}
                          max={10000}
                          step="0.01"
                          value={transferStdRate}
                          onChange={(e) => setTransferStdRate(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                        />
                      </div>
                      <label className="flex items-center gap-2 py-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={keepExistingRebate}
                          onChange={(e) => setKeepExistingRebate(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                        />
                        <span>
                          Keep existing rebate (
                          <span className="font-mono">
                            {formatRM(
                              billingByStudentId.get(transferStudent.studentId)
                                ?.monthlyRebate ?? 0
                            )}
                          </span>
                          )
                        </span>
                      </label>
                    </div>

                    {!keepExistingRebate && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Adjusted Monthly Rebate (RM)
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            max={10000}
                            step="0.01"
                            value={transferMonthlyRebate}
                            onChange={(e) => setTransferMonthlyRebate(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Rebate Reason
                          </label>
                          <select
                            value={transferRebateReason}
                            onChange={(e) => setTransferRebateReason(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                          >
                            {REBATE_REASONS.map((rr) => (
                              <option key={rr} value={rr}>
                                {rr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={transferReason === 'Other' ? '' : 'sm:col-span-2'}>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Transfer Reason
                      </label>
                      <select
                        value={transferReason}
                        onChange={(e) => setTransferReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {TRANSFER_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </div>
                    {transferReason === 'Other' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Specify Reason
                        </label>
                        <input
                          type="text"
                          maxLength={120}
                          value={transferCustomReason}
                          onChange={(e) => setTransferCustomReason(e.target.value)}
                          placeholder="Describe reason for relocation..."
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                    {transferStudent.assignedRoomId ? (
                      <>
                        Saving will close the current stay segment in{' '}
                        <span className="font-mono font-semibold">
                          {transferStudent.assignedRoomId}
                        </span>{' '}
                        (releasing it to <strong>Vacant</strong>) and lock{' '}
                        <span className="font-mono font-semibold">
                          {selectedTransferRoom?.roomId}
                        </span>{' '}
                        as <strong>Occupied</strong> starting{' '}
                        <span className="font-mono">{transferDate}</span>.
                      </>
                    ) : (
                      <>
                        Saving will assign{' '}
                        <span className="font-mono font-semibold">
                          {selectedTransferRoom?.roomId}
                        </span>{' '}
                        as the initial stay segment and mark the bed as{' '}
                        <strong>Occupied</strong>.
                      </>
                    )}
                  </div>
                </div>

                {/* Pinned Footer */}
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setTransferStudent(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {submitting ? 'Transferring...' : 'Confirm Room Transfer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Direct Assign Room Modal (for Room Unassigned students) */}
      {assigningStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Assign Room · {assigningStudent.fullName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {assigningStudent.studentId} · Check-In: {assigningStudent.checkInDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningStudent(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close assign room modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {vacantRooms.length === 0 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {formError}
                    </div>
                  )}
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <p className="font-semibold">No Vacant Beds Available</p>
                    <p>
                      There are currently no Vacant beds in Room Inventory. Add or free a bed
                      first.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setAssigningStudent(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={handleAssignRoomSubmit}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {formError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Select Vacant Room / Bed
                    </label>
                    <select
                      required
                      value={assignRoomId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setAssignRoomId(nextId);
                        const rm = vacantRooms.find((r) => r.roomId === nextId);
                        if (rm) {
                          setAssignStdRate(String(rm.monthlyRate));
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {vacantRooms.map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.roomId} — {r.location} (Blk {r.block}, Unit {r.unitNo},{' '}
                          {r.bedSlot}) · {formatRM(r.monthlyRate)}/mo
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Placement / Start Date
                      </label>
                      <input
                        type="date"
                        required
                        value={assignPlacementDate}
                        onChange={(e) => setAssignPlacementDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Occupancy Mode
                      </label>
                      <select
                        value={assignOccupancyMode}
                        onChange={(e) =>
                          setAssignOccupancyMode(e.target.value as OccupancyMode)
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {OCCUPANCY_MODES.map((om) => (
                          <option key={om} value={om}>
                            {om}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {assignOccupancyMode === 'Whole Unit Exclusive' && selectedAssignRoom && (
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                      {assignSiblingBeds.length > 0 ? (
                        <p>
                          <strong>Whole Unit Exclusive:</strong> Will also mark{' '}
                          <strong className="font-mono">
                            {assignSiblingBeds.map((b) => b.roomId).join(', ')}
                          </strong>{' '}
                          as <strong>Reserved / Blocked</strong>.
                        </p>
                      ) : (
                        <p>
                          <strong>Whole Unit Exclusive:</strong> No other Vacant beds remain in
                          Block {selectedAssignRoom.block} Unit {selectedAssignRoom.unitNo}.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Standard Rate (RM)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={10000}
                        step="0.01"
                        value={assignStdRate}
                        onChange={(e) => setAssignStdRate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Monthly Rebate (RM)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={10000}
                        step="0.01"
                        value={assignRebate}
                        onChange={(e) => setAssignRebate(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rebate Reason
                      </label>
                      <select
                        value={assignRebateReason}
                        onChange={(e) => setAssignRebateReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {REBATE_REASONS.map((rr) => (
                          <option key={rr} value={rr}>
                            {rr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Pinned Footer */}
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAssigningStudent(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {submitting ? 'Assigning...' : 'Assign Room & Occupy Bed'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* View Statement / Profile Modal (Editable Room & Tenancy History + Inline Payment Ledger) */}
      {liveStatementStudent && statementBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:static print:bg-white print:p-0 print:block">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200 print:max-h-none print:overflow-visible print:shadow-none print:border-0 print:rounded-none print:max-w-none">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 print:px-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Global Institute of Studies (GIS) Nilai · Resident Statement
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    <span className="font-semibold text-slate-900">
                      {liveStatementStudent.fullName}
                    </span>{' '}
                    · <span className="font-mono">{liveStatementStudent.studentId}</span>{' '}
                    · {statementBilling.residentType} ({liveStatementStudent.program})
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Current Room:{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {liveStatementStudent.assignedRoomId || 'Room Unassigned'}
                    </span>{' '}
                    ({liveStatementStudent.hostelLocation || 'Unassigned'}) · Check-In:{' '}
                    <span className="font-mono">{liveStatementStudent.checkInDate}</span>
                    {liveStatementStudent.checkOutDate
                      ? ` · Check-Out: ${liveStatementStudent.checkOutDate}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 print:hidden shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Statement</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatementStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Close statement modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-6 print:overflow-visible print:p-4">
              {feedbackBanner && (
                <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg px-3.5 py-2 text-xs font-medium flex items-center justify-between gap-3 print:hidden">
                  <span>{feedbackBanner}</span>
                  <button
                    type="button"
                    onClick={() => setFeedbackBanner(null)}
                    className="text-blue-900 hover:text-blue-700 cursor-pointer"
                    aria-label="Dismiss message"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Financial KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Current Rate</p>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRM(statementBilling.effectiveMonthlyFee)}/mo
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Dep: {formatRM(liveStatementStudent.depositPaid)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">
                    Expected Rent ({statementBilling.monthsBilled} mo)
                  </p>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRM(statementBilling.totalExpectedRent)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Across {statementBilling.segments.length}{' '}
                    {statementBilling.segments.length === 1 ? 'stay segment' : 'stay segments'}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Rent &amp; Waivers Credited</p>
                  <p className="font-mono text-base font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRM(statementBilling.totalRentCredited)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Settled entries</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Outstanding Balance</p>
                  <p
                    className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                      statementBilling.outstandingBalance > 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatRM(statementBilling.outstandingBalance)}
                  </p>
                  <div className="mt-1">
                    <StatusBadge status={liveStatementStudent.status} />
                  </div>
                </div>
              </div>

              {/* Editable Room & Tenancy History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Room &amp; Tenancy History
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isMasterAdmin
                        ? 'Chronological stay segments (Master Admin can add historical stays or edit rates without changing live bed occupancy)'
                        : isViewer
                          ? 'Chronological stay segments (read-only view)'
                          : 'Chronological stay segments (historical stay editing is restricted to Master Admin)'}
                    </p>
                  </div>
                  {isMasterAdmin && (
                    <button
                      type="button"
                      onClick={openAddStaySegmentModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap print:hidden"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Past Stay Record</span>
                    </button>
                  )}
                </div>

                {statementBilling.segments.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 space-y-2">
                    <p>No room stay segments recorded yet.</p>
                    <p>
                      {isMasterAdmin
                        ? 'Click “Add Past Stay Record” above for historical stays or assign a live Vacant room from the resident’s row.'
                        : 'Assign a live Vacant room from the resident’s row, or ask a Master Admin to import historical stays.'}
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                    {statementBilling.segments.map((sb, idx) => {
                      const seg = sb.segment;
                      const isClosedSegment = seg.endDate !== null;
                      const isCurrentOpen =
                        !isClosedSegment && liveStatementStudent.status === 'Active';
                      return (
                        <div
                          key={seg.id}
                          className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                            isCurrentOpen ? 'bg-blue-50/40' : 'bg-white'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-500">
                                #{idx + 1}
                              </span>
                              <span className="font-mono font-bold text-slate-900">
                                {seg.roomId || 'Room Unassigned'}
                              </span>
                              <span className="text-slate-500">
                                · {seg.hostelLocation || 'Unassigned'} · {seg.occupancyMode}
                              </span>
                              {isClosedSegment ? (
                                <StatusBadge status="Historical Rate (Locked to Period)" />
                              ) : isCurrentOpen ? (
                                <StatusBadge status="Active" />
                              ) : null}
                            </div>
                            <p className="text-slate-700 font-mono tabular-nums">
                              {seg.startDate} →{' '}
                              {seg.endDate ||
                                (liveStatementStudent.status === 'Checked-Out'
                                  ? liveStatementStudent.checkOutDate || 'Checked-Out'
                                  : 'Present')}
                              {sb.billedMonths.length > 0 && (
                                <span className="font-sans text-slate-500 ml-2">
                                  (Billed months: {sb.billedMonths.join(', ')})
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500">
                              Reason:{' '}
                              <span className="text-slate-700 font-medium">{seg.reason}</span> ·
                              Recorded by <span className="font-mono">{seg.recordedBy}</span>
                              {seg.recordedAt
                                ? ` on ${new Date(seg.recordedAt).toLocaleDateString('en-MY')}`
                                : ''}
                            </p>
                          </div>

                          <div className="flex flex-col md:items-end gap-2 shrink-0">
                            <div className="md:text-right font-mono tabular-nums space-y-0.5">
                              <p className="font-semibold text-slate-900">
                                {formatRM(seg.effectiveMonthlyFee)}/mo
                                <span className="font-sans font-normal text-slate-500 ml-1.5">
                                  × {sb.monthsBilled} {sb.monthsBilled === 1 ? 'mo' : 'mos'}
                                </span>
                              </p>
                              {seg.monthlyRebate > 0 && (
                                <p className="text-emerald-700">
                                  Std {formatRM(seg.standardRoomRate)} · Rebate -
                                  {formatRM(seg.monthlyRebate)}
                                </p>
                              )}
                              {sb.billedMonths[0] === seg.startDate.slice(0, 7) &&
                                typeof seg.firstMonthCharge === 'number' &&
                                Math.abs(seg.firstMonthCharge - seg.effectiveMonthlyFee) >
                                  0.01 && (
                                  <p className="text-blue-900">
                                    1st month prorated: {formatRM(seg.firstMonthCharge)}
                                  </p>
                                )}
                              <p className="text-slate-800 font-bold">
                                Segment Subtotal: {formatRM(sb.expectedRent)}
                              </p>
                            </div>

                            {isMasterAdmin && (
                              <div className="inline-flex items-center gap-1.5 print:hidden">
                                <button
                                  type="button"
                                  onClick={() => openEditStaySegmentModal(seg)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormError(null);
                                    setDeletingStaySegment(seg);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Payment Ledger with Inline Record / Backdate / Edit / Delete */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Payment &amp; Fee Waiver Ledger
                    </h3>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {statementPayments.length}{' '}
                      {statementPayments.length === 1 ? 'entry' : 'entries'} recorded
                    </p>
                  </div>
                  {!isViewer && (
                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                      {isMasterAdmin &&
                        liveStatementStudent.status === 'Checked-Out' &&
                        statementBilling.outstandingBalance > 0.009 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormError(null);
                              setSettleBalanceConfirmOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Settle Full Historical Balance</span>
                          </button>
                        )}
                      {isMasterAdmin && (
                        <button
                          type="button"
                          onClick={openBatchPastPaymentsModal}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <CalendarCheck2 className="w-3.5 h-3.5" />
                          <span>Batch Add Past Payments</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={openStmtRecordPaymentModal}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Record / Backdate Payment</span>
                      </button>
                    </div>
                  )}
                </div>

                {statementPayments.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                    No payment or fee waiver entries recorded for this resident yet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                          <th className="py-2.5 px-3">Receipt No.</th>
                          <th className="py-2.5 px-3">Month / Type</th>
                          <th className="py-2.5 px-3">Method &amp; Ref</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3">Physical Receipt</th>
                          <th className="py-2.5 px-3">Status</th>
                          {!isViewer && (
                            <th className="py-2.5 px-3 text-right print:hidden">Actions</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {statementPayments.map((p) => {
                          const physStatus = getPhysicalReceiptStatus(p);
                          return (
                            <tr key={p.paymentId}>
                              <td className="py-2.5 px-3 font-mono font-semibold text-blue-900 whitespace-nowrap">
                                {getPaymentReceiptNo(p)}
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-mono font-semibold text-slate-900">
                                  {p.billingMonth}
                                </p>
                                <p className="text-slate-500">{p.paymentType}</p>
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="text-slate-800">{p.paymentMethod}</p>
                                {getPaymentBankRef(p) && (
                                  <p className="font-mono text-slate-500">
                                    {getPaymentBankRef(p)}
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                                {p.paymentDate}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap text-slate-900">
                                {formatRM(p.amount)}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <StatusBadge status={physStatus} />
                                {p.physicalReceiptNo && (
                                  <p className="font-mono text-slate-500 mt-0.5">
                                    #{p.physicalReceiptNo}
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <StatusBadge status={p.status} />
                              </td>
                              {!isViewer && (
                                <td className="py-2.5 px-3 text-right whitespace-nowrap print:hidden">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openStmtEditPaymentModal(p)}
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                                      title="Edit payment entry"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormError(null);
                                        setStmtDeletingPayment(p);
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                                      title="Delete payment entry"
                                      aria-label={`Delete ${getPaymentReceiptNo(p)}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Pinned Footer */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 text-xs text-slate-500 print:px-4 print:bg-white">
              <span>GIS Nilai Hostel Management System</span>
              <button
                type="button"
                onClick={() => setStatementStudent(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer print:hidden"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Stay Segment Sub-Modal (Master Admin Only) */}
      {isMasterAdmin && liveStatementStudent && stayModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {editingStaySegment ? 'Edit Stay Segment' : 'Add Past Stay Record'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {liveStatementStudent.fullName} ({liveStatementStudent.studentId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStayModalOpen(false);
                  setEditingStaySegment(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label="Close stay segment modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveStaySegment}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-700">
                      Room / Bed ID
                    </label>
                    {allRoomsSorted.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setStayRoomInputMode(
                            stayRoomInputMode === 'select' ? 'custom' : 'select'
                          )
                        }
                        className="text-xs font-medium text-blue-900 hover:underline cursor-pointer"
                      >
                        {stayRoomInputMode === 'select'
                          ? 'Enter custom Room ID text'
                          : 'Pick from Room Inventory'}
                      </button>
                    )}
                  </div>

                  {stayRoomInputMode === 'select' && allRoomsSorted.length > 0 ? (
                    <select
                      value={stayRoomId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setStayRoomId(nextId);
                        const rm = allRoomsSorted.find((r) => r.roomId === nextId);
                        if (rm) {
                          setStayLocation(rm.location);
                        }
                      }}
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      <option value="">Select Room / Bed...</option>
                      {allRoomsSorted.map((r) => (
                        <option key={r.roomId} value={r.roomId}>
                          {r.roomId} — {r.location} [{r.status}]
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      maxLength={64}
                      value={stayRoomId}
                      onChange={(e) => setStayRoomId(e.target.value)}
                      placeholder="e.g. DJ2-A-02-B1"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Hostel Location
                    </label>
                    <select
                      value={stayLocation}
                      onChange={(e) =>
                        setStayLocation(e.target.value as ResidentHostelLocation)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {HOSTEL_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                      <option value="Unassigned">Unassigned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Occupancy Mode
                    </label>
                    <select
                      value={stayOccupancyMode}
                      onChange={(e) =>
                        setStayOccupancyMode(e.target.value as OccupancyMode)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {OCCUPANCY_MODES.map((om) => (
                        <option key={om} value={om}>
                          {om}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={stayStartDate}
                      onChange={(e) => {
                        setStayStartDate(e.target.value);
                        syncStayFirstMonth(e.target.value, stayStdRate, stayRebate);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-700">
                        End Date
                      </label>
                      <label
                        className={`inline-flex items-center gap-1.5 text-xs ${
                          liveStatementStudent.status !== 'Active'
                            ? 'text-slate-400 cursor-not-allowed'
                            : 'text-slate-600 cursor-pointer'
                        }`}
                        title={
                          liveStatementStudent.status !== 'Active'
                            ? 'Checked-Out residents must specify a past End Date'
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={stayIsOngoing}
                          disabled={liveStatementStudent.status !== 'Active'}
                          onChange={(e) => setStayIsOngoing(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-900"
                        />
                        <span>Present (Ongoing)</span>
                      </label>
                    </div>
                    <input
                      type="date"
                      required={!stayIsOngoing}
                      disabled={stayIsOngoing}
                      value={stayIsOngoing ? '' : stayEndDate}
                      onChange={(e) => setStayEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Standard Rate (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      step="0.01"
                      value={stayStdRate}
                      onChange={(e) => {
                        setStayStdRate(e.target.value);
                        syncStayFirstMonth(stayStartDate, e.target.value, stayRebate);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Monthly Rebate (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      step="0.01"
                      value={stayRebate}
                      onChange={(e) => {
                        setStayRebate(e.target.value);
                        syncStayFirstMonth(stayStartDate, stayStdRate, e.target.value);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="text-xs font-medium text-slate-700">
                        1st Month Charge (RM)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          syncStayFirstMonth(stayStartDate, stayStdRate, stayRebate, true)
                        }
                        className="text-[11px] font-medium text-blue-900 hover:underline cursor-pointer"
                      >
                        Auto
                      </button>
                    </div>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      step="0.01"
                      value={stayFirstMonthCharge}
                      onChange={(e) => {
                        setStayFirstMonthCharge(e.target.value);
                        setStayFirstMonthManual(true);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reason / Segment Note
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={stayReason}
                    onChange={(e) => setStayReason(e.target.value)}
                    placeholder="e.g. Historical Stay, Initial Check-In, Room Transfer"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                {!stayIsOngoing ? (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                    <p className="font-semibold text-slate-900">
                      Historical Rate (Locked to Period)
                    </p>
                    <p>
                      This period stores its own independent rate snapshot and will{' '}
                      <strong>not</strong> overwrite the resident&apos;s current room, active
                      monthly fee, or live Room Inventory occupancy.
                    </p>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                    <strong>Active Open Segment:</strong> Because End Date is Present
                    (ongoing), saving will sync this resident&apos;s current room and active
                    monthly billing rate.
                  </div>
                )}
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStayModalOpen(false);
                    setEditingStaySegment(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {submitting ? 'Saving...' : 'Save Stay Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Stay Segment Confirmation Sub-Modal (Master Admin Only) */}
      {isMasterAdmin && liveStatementStudent && deletingStaySegment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Delete Stay Segment ({deletingStaySegment.roomId || 'Unassigned'})?
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {liveStatementStudent.fullName} ({liveStatementStudent.studentId})
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDeletingStaySegment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label="Close delete stay segment dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600">
                This will remove the{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {deletingStaySegment.startDate} →{' '}
                  {deletingStaySegment.endDate || 'Present'}
                </span>{' '}
                segment at{' '}
                <span className="font-mono">
                  {formatRM(deletingStaySegment.effectiveMonthlyFee)}/mo
                </span>{' '}
                and automatically recalculate {liveStatementStudent.fullName}&apos;s expected
                rent and outstanding balance.
              </p>
              {deletingStaySegment.endDate !== null && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  <strong>Historical Rate (Locked to Period):</strong> Removing this past
                  stay leaves the resident&apos;s current assigned room and active monthly rate
                  untouched.
                </div>
              )}
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDeletingStaySegment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStaySegment}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'Deleting...' : 'Delete Stay Segment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record / Backdate / Edit Payment Sub-Modal inside Statement */}
      {liveStatementStudent && stmtPaymentModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {stmtEditingPayment
                    ? `Edit Payment · ${getPaymentReceiptNo(stmtEditingPayment)}`
                    : 'Record / Backdate Payment'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {liveStatementStudent.fullName} (
                  <span className="font-mono">{liveStatementStudent.studentId}</span>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStmtPaymentModalOpen(false);
                  setStmtEditingPayment(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label="Close payment modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveStmtPayment}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Billing Month
                    </label>
                    <input
                      type="month"
                      required
                      value={stmtBillingMonth}
                      onChange={(e) => {
                        const m = e.target.value;
                        setStmtBillingMonth(m);
                        if (!stmtEditingPayment && stmtPaymentType === 'Monthly Rent') {
                          const info = calculateMonthInstallmentStatus(
                            liveStatementStudent,
                            payments,
                            m,
                            0
                          );
                          setStmtAmount(
                            (info.remainingBeforeEntry > 0
                              ? info.remainingBeforeEntry
                              : info.monthTargetCharge
                            ).toFixed(2)
                          );
                        }
                      }}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Type
                    </label>
                    <select
                      value={stmtPaymentType}
                      onChange={(e) => {
                        const next = e.target.value as PaymentType;
                        setStmtPaymentType(next);
                        if (next === 'Rebate / Fee Waiver') {
                          setStmtMethod('Internal Adjustment');
                          setStmtStatus('Waived');
                        } else if (stmtStatus === 'Waived') {
                          setStmtStatus('Paid');
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PAYMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Amount (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={50000}
                      step="0.01"
                      value={stmtAmount}
                      onChange={(e) => setStmtAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={stmtStatus}
                      onChange={(e) => setStmtStatus(e.target.value as PaymentStatus)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PAYMENT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {stmtInstallmentPreview && (
                  <div
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      stmtInstallmentPreview.isFullSettlement
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {stmtInstallmentPreview.remainingBeforeEntry <= 0.009
                          ? `${stmtBillingMonth} Already Settled`
                          : stmtInstallmentPreview.isFullSettlement
                            ? `Full Settlement for ${stmtBillingMonth}`
                            : `Partial Payment (${formatRM(stmtInstallmentPreview.remainingAfterEntry)} remaining)`}
                      </span>
                      <span className="font-mono tabular-nums">
                        Target: {formatRM(stmtInstallmentPreview.monthTargetCharge)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={stmtMethod}
                      onChange={(e) => setStmtMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Transaction Date
                    </label>
                    <input
                      type="date"
                      required
                      value={stmtPaymentDate}
                      onChange={(e) => setStmtPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bank Reference No.
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={stmtBankRefNo}
                    onChange={(e) => setStmtBankRefNo(e.target.value)}
                    placeholder="e.g. DUITNOW-20260915-01"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Physical Receipt Status
                    </label>
                    <select
                      value={stmtPhysStatus}
                      onChange={(e) =>
                        setStmtPhysStatus(e.target.value as PhysicalReceiptStatus)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      <option value="Issued">Issued</option>
                      <option value="Pending Issuance">Pending Issuance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Physical Receipt Book No.
                    </label>
                    <input
                      type="text"
                      maxLength={64}
                      value={stmtPhysNo}
                      onChange={(e) => setStmtPhysNo(e.target.value)}
                      placeholder="e.g. BK-DJ2-0042"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    maxLength={240}
                    value={stmtNotes}
                    onChange={(e) => setStmtNotes(e.target.value)}
                    placeholder="Optional backdated payment note"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStmtPaymentModalOpen(false);
                    setStmtEditingPayment(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {submitting
                    ? 'Saving...'
                    : stmtEditingPayment
                      ? 'Update Payment'
                      : 'Save Payment Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Payment Confirmation Sub-Modal inside Statement */}
      {liveStatementStudent && stmtDeletingPayment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Delete Payment {getPaymentReceiptNo(stmtDeletingPayment)}?
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {liveStatementStudent.fullName} ({liveStatementStudent.studentId})
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStmtDeletingPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label="Close delete payment dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600">
                This will permanently remove the{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {formatRM(stmtDeletingPayment.amount)}
                </span>{' '}
                ({stmtDeletingPayment.paymentType} · {stmtDeletingPayment.billingMonth})
                entry from {liveStatementStudent.fullName}&apos;s ledger.
              </p>
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setStmtDeletingPayment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteStmtPayment}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'Deleting...' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Month Batch Past Payments Modal (Master Admin Only) */}
      {isMasterAdmin && liveStatementStudent && batchModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Batch Add Past Payments · {liveStatementStudent.fullName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {liveStatementStudent.studentId} · Check-In: {liveStatementStudent.checkInDate}
                  {liveStatementStudent.checkOutDate
                    ? ` · Check-Out: ${liveStatementStudent.checkOutDate}`
                    : ' · Active'}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setBatchModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                aria-label="Close batch past payments modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveBatchPastPayments}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

                {/* Shared Payment Settings */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                  <p className="text-xs font-semibold text-slate-800">
                    Shared Payment Settings (Applied to All Checked Months)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Payment Method
                      </label>
                      <select
                        value={batchPaymentMethod}
                        onChange={(e) =>
                          setBatchPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {BATCH_PAST_PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Bank / Migration Ref No.
                      </label>
                      <input
                        type="text"
                        maxLength={64}
                        value={batchBankRefNo}
                        onChange={(e) => setBatchBankRefNo(e.target.value)}
                        placeholder="HIST-MIGRATION"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Physical Receipt Status
                      </label>
                      <select
                        value={batchPhysStatus}
                        onChange={(e) =>
                          setBatchPhysStatus(e.target.value as PhysicalReceiptStatus)
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        <option value="Issued">Issued</option>
                        <option value="Pending Issuance">Pending Issuance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Physical Receipt Book No. (Optional)
                      </label>
                      <input
                        type="text"
                        maxLength={64}
                        value={batchPhysNo}
                        onChange={(e) => setBatchPhysNo(e.target.value)}
                        placeholder="e.g. BK-HIST-2026"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Notes / Remarks
                      </label>
                      <input
                        type="text"
                        maxLength={240}
                        value={batchNotes}
                        onChange={(e) => setBatchNotes(e.target.value)}
                        placeholder="Historical monthly payment migration"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Monthly Checklist Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-600">
                    Showing <strong className="text-slate-900">{batchMonthRows.length}</strong>{' '}
                    calendar {batchMonthRows.length === 1 ? 'month' : 'months'} (rates sourced from stay history).
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllUnpaidMonths}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Select All Unpaid Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchSelectedMonths({})}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {/* Monthly Checklist Table */}
                {batchMonthRows.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                    No calendar months fall between this resident&apos;s Check-In Date and end date.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-10">Select</th>
                          <th className="py-2.5 px-3">Month &amp; Room</th>
                          <th className="py-2.5 px-3 text-right">Expected Rate</th>
                          <th className="py-2.5 px-3 text-right">Credited</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Payment Amount (RM)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {batchMonthRows.map((row) => {
                          const checked = !!batchSelectedMonths[row.billingMonth];
                          return (
                            <tr
                              key={row.billingMonth}
                              className={
                                checked
                                  ? 'bg-blue-50/50'
                                  : row.monthStatus === 'Paid'
                                    ? 'bg-emerald-50/30'
                                    : 'bg-white hover:bg-slate-50'
                              }
                            >
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  aria-label={`Select ${row.billingMonth}`}
                                  onChange={(e) => {
                                    const nextChecked = e.target.checked;
                                    setBatchSelectedMonths((prev) => ({
                                      ...prev,
                                      [row.billingMonth]: nextChecked,
                                    }));
                                    if (nextChecked && !batchAmounts[row.billingMonth]) {
                                      setBatchAmounts((prev) => ({
                                        ...prev,
                                        [row.billingMonth]: (
                                          row.remaining > 0.009
                                            ? row.remaining
                                            : row.expectedRate
                                        ).toFixed(2),
                                      }));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-900 cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <p className="font-mono font-semibold text-slate-900">
                                  {row.billingMonth}
                                </p>
                                <p className="font-mono text-slate-500">
                                  {row.roomId || 'Unassigned'}
                                </p>
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                                {formatRM(row.expectedRate)}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                {formatRM(row.alreadyPaid)}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <StatusBadge
                                  status={
                                    row.monthStatus === 'Paid'
                                      ? 'Paid'
                                      : row.monthStatus === 'Partial'
                                        ? 'Pending'
                                        : 'Overdue'
                                  }
                                />
                                {row.monthStatus === 'Partial' && (
                                  <p className="text-[11px] font-mono text-amber-800 mt-0.5">
                                    Rem {formatRM(row.remaining)}
                                  </p>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={50000}
                                  disabled={!checked}
                                  value={batchAmounts[row.billingMonth] ?? ''}
                                  aria-label={`Payment amount for ${row.billingMonth}`}
                                  onChange={(e) =>
                                    setBatchAmounts((prev) => ({
                                      ...prev,
                                      [row.billingMonth]: e.target.value,
                                    }))
                                  }
                                  className="w-28 px-2.5 py-1 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-600 tabular-nums">
                  Selected:{' '}
                  <strong className="text-slate-900">
                    {batchSelectedTotals.count}{' '}
                    {batchSelectedTotals.count === 1 ? 'month' : 'months'}
                  </strong>{' '}
                  · Total:{' '}
                  <strong className="font-mono text-blue-900">
                    {formatRM(batchSelectedTotals.total)}
                  </strong>
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setBatchModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || batchSelectedTotals.count === 0}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {submitting
                      ? 'Saving Batch...'
                      : `Save Selected Payments (${batchSelectedTotals.count})`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Full Historical Balance Confirmation Modal (Master Admin Only) */}
      {isMasterAdmin &&
        liveStatementStudent &&
        statementBilling &&
        settleBalanceConfirmOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
            <div className="w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
              {/* Pinned Header */}
              <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Settle Full Historical Balance?
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {liveStatementStudent.fullName} ({liveStatementStudent.studentId})
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setSettleBalanceConfirmOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                  aria-label="Close settle balance modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                  <p>
                    This will record a single{' '}
                    <strong>Monthly Rent</strong> ledger entry of{' '}
                    <strong className="font-mono">
                      {formatRM(statementBilling.outstandingBalance)}
                    </strong>{' '}
                    for this Checked-Out resident, bringing their outstanding balance to{' '}
                    <strong className="font-mono">RM 0.00</strong>.
                  </p>
                  <p className="text-emerald-800 font-mono">
                    Method: Historical Migration · Receipt: Issued · Ref: HIST-MIGRATION
                  </p>
                  <p className="text-emerald-800">
                    Notes: Historical ledger balance settled during system migration
                  </p>
                </div>

                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setSettleBalanceConfirmOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleConfirmSettleHistoricalBalance()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {submitting
                    ? 'Settling Balance...'
                    : `Confirm Settlement (${formatRM(statementBilling.outstandingBalance)})`}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
