import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  LogOut,
  Pencil,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  calculateFirstMonthDefaults,
  calculateResidentBilling,
  formatRM,
  formatTimestamp,
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
  ResidentType,
  Room,
  STUDENT_STATUSES,
  Student,
  StudentStatus,
} from '../types/hostel';
import { registerStudent, updateStudentRecord } from '../lib/hostelService';
import { BulkImportModal } from './BulkImportModal';
import { StatusBadge } from './StatusBadge';

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
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [residentTypeFilter, setResidentTypeFilter] = useState<'All' | ResidentType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | StudentStatus>('All');

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
    const map = new Map<string, ReturnType<typeof calculateResidentBilling>>();
    for (const s of students) {
      map.set(s.studentId, calculateResidentBilling(s, payments));
    }
    return map;
  }, [students, payments]);

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
      .filter((s) => (statusFilter === 'All' ? true : s.status === statusFilter))
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
    const billing = calculateResidentBilling(student, payments);
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
          `Checked out ${editingStudent.fullName} and released room ${editingStudent.assignedRoomId} (and any unit blocks) back to Vacant.`
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

  return (
    <div className="space-y-5">
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
              setLocationFilter(e.target.value as 'All' | HostelLocation)
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
              setStatusFilter(e.target.value as 'All' | StudentStatus)
            }
            aria-label="Filter residents by residency status"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Statuses</option>
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
                        <p className="text-xs text-slate-400">
                          {st.phone} · ICE: {st.emergencyContact}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {st.assignedRoomId}
                        </p>
                        <p className="text-xs text-slate-500 whitespace-nowrap">
                          {st.hostelLocation}
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
                  Room: {editingStudent.assignedRoomId} ({editingStudent.hostelLocation})
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
                    Saving with status <strong>Checked-Out</strong> will
                    automatically release room{' '}
                    <span className="font-mono font-semibold">
                      {editingStudent.assignedRoomId}
                    </span>{' '}
                    and any exclusive-unit blocked beds back to <strong>Vacant</strong>.
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
                        Keep current room ({editingStudent.assignedRoomId})
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
                    required
                    minLength={6}
                    maxLength={32}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
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
                    value={editEmergency}
                    onChange={(e) => setEditEmergency(e.target.value)}
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
  );
}
