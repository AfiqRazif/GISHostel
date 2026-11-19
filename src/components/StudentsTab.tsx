import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  FileSpreadsheet,
  FileText,
  LogOut,
  Pencil,
  Printer,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  calculateFirstMonthDefaults,
  calculateStudentBilling,
  formatRM,
  formatTimestamp,
  getPaymentBankRef,
  getPaymentReceiptNo,
  getPhysicalReceiptStatus,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  OCCUPANCY_MODES,
  OccupancyMode,
  Payment,
  PROGRAMS,
  ProgramType,
  REBATE_REASONS,
  RESIDENT_TYPES,
  ResidentHostelLocation,
  ResidentType,
  Room,
  STUDENT_STATUSES,
  Student,
  StudentStatus,
} from '../types/hostel';
import {
  registerStudent,
  transferStudentRoom,
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
  loading: boolean;
}

export function StudentsTab({
  students,
  rooms,
  payments,
  staffEmail,
  loading,
}: StudentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | ResidentHostelLocation>('All');
  const [residentTypeFilter, setResidentTypeFilter] = useState<'All' | ResidentType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | StudentStatus | 'Room Unassigned'>('All');

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
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
    setRegStatus(vacantRooms.length > 0 ? 'Active' : 'Checked-Out');
    setRegPhone('');
    setRegEmergency('');
    setRegProgram('Diploma');
    const initialRoom = vacantRooms[0] || allRoomsSorted[0];
    setRegRoomId(initialRoom ? initialRoom.roomId : '');
    const today = getTodayISO();
    const initialRate = initialRoom ? initialRoom.monthlyRate : 250;
    const fmDefaults = calculateFirstMonthDefaults(today, initialRate);
    setRegCheckInDate(today);
    setRegCheckOutDate(today);
    setRegDepositPaid(String(initialRate));
    setRegStandardRate(String(initialRate));
    setRegMonthlyRebate('0');
    setRegRebateReason('None');
    setRegFirstMonthCharge(String(fmDefaults.firstMonthCharge));
    setRegFirstMonthNote(fmDefaults.firstMonthNote);
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
    const choices = nextStatus === 'Checked-Out' ? allRoomsSorted : vacantRooms;
    if (!choices.some((r) => r.roomId === regRoomId)) {
      const fallback = choices[0];
      setRegRoomId(fallback ? fallback.roomId : '');
      if (fallback) {
        const nextStd = String(fallback.monthlyRate);
        setRegStandardRate(nextStd);
        setRegDepositPaid(nextStd);
        syncRegFirstMonth(regCheckInDate, nextStd, regMonthlyRebate);
      }
    }
  };

  const handleRoomSelectionChange = (roomId: string) => {
    setRegRoomId(roomId);
    const room = registerRoomChoices.find((r) => r.roomId === roomId);
    if (room) {
      const nextStd = String(room.monthlyRate);
      setRegStandardRate(nextStd);
      setRegDepositPaid(nextStd);
      syncRegFirstMonth(regCheckInDate, nextStd, regMonthlyRebate);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterRoom) {
      setFormError(
        regStatus === 'Active'
          ? 'Please select an available Vacant room.'
          : 'Please select a room for historical reference.'
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
          occupancyMode: regOccupancyMode,
          phone: regPhone,
          emergencyContact: regEmergency,
          program: regProgram,
          assignedRoomId: selectedRegisterRoom.roomId,
          status: regStatus,
          checkInDate: regCheckInDate,
          checkOutDate: regStatus === 'Checked-Out' ? regCheckOutDate : null,
          depositPaid: Number(regDepositPaid),
          standardRoomRate: Number(regStandardRate),
          monthlyRebate: Number(regMonthlyRebate),
          rebateReason: regRebateReason,
          firstMonthCharge: Number(regFirstMonthCharge),
          firstMonthNote: regFirstMonthNote,
        },
        selectedRegisterRoom,
        rooms,
        staffEmail
      );
      setShowRegisterModal(false);
      if (regStatus === 'Checked-Out') {
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
    setEditOccupancyMode(billing.occupancyMode);
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
    setTransferOccupancyMode(billing.occupancyMode);
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

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start xl:self-auto">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
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
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Resident ID</th>
                  <th className="py-3 px-4">Full Name &amp; Type</th>
                  <th className="py-3 px-4">Room / Hostel</th>
                  <th className="py-3 px-4">Tenancy Period</th>
                  <th className="py-3 px-4 text-right">Effective Rate</th>
                  <th className="py-3 px-4 text-right">Ledger Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map((st) => {
                  const billing = billingByStudentId.get(st.studentId)!;
                  return (
                    <tr key={st.studentId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {st.studentId}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{st.fullName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {billing.residentType} · {billing.occupancyMode} · {st.program}
                        </p>
                        {(st.phone || st.emergencyContact) && (
                          <p className="text-xs text-slate-400">
                            {[
                              st.phone,
                              st.emergencyContact ? `ICE: ${st.emergencyContact}` : '',
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
                          {billing.monthsBilled} {billing.monthsBilled === 1 ? 'month' : 'months'} billed
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
                            1st mo: {formatRM(billing.firstMonthCharge)} ({billing.firstMonthNote})
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
                          Paid {formatRM(billing.totalRentCredited)} / {formatRM(billing.totalExpectedRent)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setStatementStudent(st)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                            title="View room history & account statement"
                          >
                            <FileText className="w-3 h-3" />
                            <span>View Statement</span>
                          </button>
                          {st.status === 'Active' && (
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
                          <button
                            type="button"
                            onClick={() => openEditModal(st, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {st.status !== 'Checked-Out' && (
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
        )}
      </div>

      {/* Register New Resident Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
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

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            {allRoomsSorted.length === 0 ? (
              <div className="p-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
                <p className="font-semibold">No Rooms in Inventory</p>
                <p className="text-xs leading-relaxed">
                  Add rooms or beds in the Room Inventory tab before registering residents.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-3.5 py-1.5 text-xs font-medium bg-white border border-amber-300 rounded-md cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                {/* Status + Resident Type + Occupancy Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <option value="Active" disabled={vacantRooms.length === 0}>
                        Active (Occupy Bed){vacantRooms.length === 0 ? ' — No Vacant Beds' : ''}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Occupancy Mode
                    </label>
                    <select
                      value={regOccupancyMode}
                      onChange={(e) =>
                        setRegOccupancyMode(e.target.value as OccupancyMode)
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
                      ? 'Historical Room / Bed Occupied (All Rooms Shown)'
                      : 'Assign Vacant Room / Bed'}
                  </label>
                  <select
                    value={regRoomId}
                    onChange={(e) => handleRoomSelectionChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {registerRoomChoices.map((r) => (
                      <option key={r.roomId} value={r.roomId}>
                        {r.roomId} — {r.location} (Blk {r.block}, Unit {r.unitNo}, {r.bedSlot}) · {formatRM(r.monthlyRate)}/mo
                        {regStatus === 'Checked-Out' ? ` [${r.status}]` : ''}
                      </option>
                    ))}
                  </select>
                  {regStatus === 'Checked-Out' && (
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        syncRegFirstMonth(
                          e.target.value,
                          regStandardRate,
                          regMonthlyRebate
                        );
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
                      value={regDepositPaid}
                      onChange={(e) => setRegDepositPaid(e.target.value)}
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
                      Effective Monthly Fee: {formatRM(regEffectiveFee)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        value={regStandardRate}
                        onChange={(e) => {
                          setRegStandardRate(e.target.value);
                          syncRegFirstMonth(
                            regCheckInDate,
                            e.target.value,
                            regMonthlyRebate
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
                        value={regMonthlyRebate}
                        onChange={(e) => {
                          setRegMonthlyRebate(e.target.value);
                          syncRegFirstMonth(
                            regCheckInDate,
                            regStandardRate,
                            e.target.value
                          );
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rebate Reason
                      </label>
                      <select
                        value={regRebateReason}
                        onChange={(e) => setRegRebateReason(e.target.value)}
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
                          syncRegFirstMonth(
                            regCheckInDate,
                            regStandardRate,
                            regMonthlyRebate,
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
                          value={regFirstMonthCharge}
                          onChange={(e) => {
                            setRegFirstMonthCharge(e.target.value);
                            setRegFirstMonthManual(true);
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
                          value={regFirstMonthNote}
                          onChange={(e) => {
                            setRegFirstMonthNote(e.target.value);
                            setRegFirstMonthManual(true);
                          }}
                          placeholder="e.g. After 15th Half-Rate"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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
                        : 'Register & Occupy Bed'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit / Check-Out Resident Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
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

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Occupancy Mode
                  </label>
                  <select
                    value={editOccupancyMode}
                    onChange={(e) =>
                      setEditOccupancyMode(e.target.value as OccupancyMode)
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
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {editingStudent.status === 'Checked-Out'
                      ? 'Assign Vacant Room for Re-Check-In'
                      : !editingStudent.assignedRoomId
                        ? 'Assign Vacant Room / Bed'
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <div>
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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
        importType="students"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 overflow-y-auto print:hidden">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between gap-4">
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

            {transferVacantChoices.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <p className="font-semibold">No Vacant Beds Available</p>
                <p>
                  There are currently no other Vacant beds in Room Inventory to
                  transfer this resident into.
                </p>
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setTransferStudent(null)}
                    className="px-3.5 py-1.5 bg-white border border-amber-300 rounded-md font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleTransferSubmit} className="space-y-4">
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

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
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

      {/* View Statement Modal (Room & Rate History Timeline + Ledger) */}
      {liveStatementStudent && statementBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full p-6 sm:p-8 space-y-6 my-8 print:my-0 print:border-0 print:max-w-none print:p-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
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

            {/* Room & Rate History Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Room &amp; Rate History Timeline
                </h3>
                <span className="text-xs text-slate-500">
                  Chronological stay segments (multi-rate billing, no mid-month double charge)
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                {statementBilling.segments.map((sb, idx) => {
                  const seg = sb.segment;
                  const isCurrentOpen =
                    !seg.endDate && liveStatementStudent.status === 'Active';
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
                          {isCurrentOpen && <StatusBadge status="Active" />}
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
                          Reason: <span className="text-slate-700 font-medium">{seg.reason}</span> ·
                          Recorded by <span className="font-mono">{seg.recordedBy}</span>
                          {seg.recordedAt
                            ? ` on ${new Date(seg.recordedAt).toLocaleDateString('en-MY')}`
                            : ''}
                        </p>
                      </div>

                      <div className="md:text-right font-mono tabular-nums shrink-0 space-y-0.5">
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
                        {idx === 0 &&
                          typeof seg.firstMonthCharge === 'number' &&
                          Math.abs(seg.firstMonthCharge - seg.effectiveMonthlyFee) > 0.01 && (
                            <p className="text-blue-900">
                              1st month prorated: {formatRM(seg.firstMonthCharge)}
                            </p>
                          )}
                        <p className="text-slate-800 font-bold">
                          Segment Subtotal: {formatRM(sb.expectedRent)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Ledger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Payment &amp; Fee Waiver Ledger
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {statementPayments.length}{' '}
                  {statementPayments.length === 1 ? 'entry' : 'entries'}
                </span>
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
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
    </div>
  );
}
