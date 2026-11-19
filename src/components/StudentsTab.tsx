import React, { useMemo, useState } from 'react';
import { LogOut, Pencil, Search, UserPlus, X } from 'lucide-react';
import {
  formatRM,
  formatTimestamp,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  PROGRAMS,
  ProgramType,
  Room,
  STUDENT_STATUSES,
  Student,
  StudentStatus,
} from '../types/hostel';
import { registerStudent, updateStudentRecord } from '../lib/hostelService';
import { StatusBadge } from './StatusBadge';

interface StudentsTabProps {
  students: Student[];
  rooms: Room[];
  staffEmail: string;
  loading: boolean;
}

export function StudentsTab({
  students,
  rooms,
  staffEmail,
  loading,
}: StudentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | StudentStatus>('All');

  // Register modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regStudentId, setRegStudentId] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmergency, setRegEmergency] = useState('');
  const [regProgram, setRegProgram] = useState<ProgramType>('Diploma');
  const [regRoomId, setRegRoomId] = useState('');
  const [regCheckInDate, setRegCheckInDate] = useState(getTodayISO());
  const [regDepositPaid, setRegDepositPaid] = useState('250');
  const [regMonthlyFee, setRegMonthlyFee] = useState('250');

  // Edit / Check-Out modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editProgram, setEditProgram] = useState<ProgramType>('Diploma');
  const [editStatus, setEditStatus] = useState<StudentStatus>('Active');
  const [editCheckInDate, setEditCheckInDate] = useState('');
  const [editCheckOutDate, setEditCheckOutDate] = useState('');
  const [editDepositPaid, setEditDepositPaid] = useState('0');
  const [editMonthlyFee, setEditMonthlyFee] = useState('250');
  const [editNewRoomId, setEditNewRoomId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const vacantRooms = useMemo(() => {
    return rooms
      .filter((r) => r.status === 'Vacant')
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms]);

  const selectedRegisterRoom = useMemo(() => {
    return vacantRooms.find((r) => r.roomId === regRoomId) || null;
  }, [vacantRooms, regRoomId]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) =>
        locationFilter === 'All' ? true : s.hostelLocation === locationFilter
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
  }, [students, locationFilter, statusFilter, searchQuery]);

  const handleOpenRegisterModal = () => {
    setFormError(null);
    setRegStudentId('');
    setRegFullName('');
    setRegPhone('');
    setRegEmergency('');
    setRegProgram('Diploma');
    const firstVacant = vacantRooms[0];
    setRegRoomId(firstVacant ? firstVacant.roomId : '');
    setRegCheckInDate(getTodayISO());
    setRegDepositPaid(firstVacant ? String(firstVacant.monthlyRate) : '250');
    setRegMonthlyFee(firstVacant ? String(firstVacant.monthlyRate) : '250');
    setShowRegisterModal(true);
  };

  const handleRoomSelectionChange = (roomId: string) => {
    setRegRoomId(roomId);
    const room = vacantRooms.find((r) => r.roomId === roomId);
    if (room) {
      setRegMonthlyFee(String(room.monthlyRate));
      setRegDepositPaid(String(room.monthlyRate));
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegisterRoom) {
      setFormError('Please select an available Vacant room.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await registerStudent(
        {
          studentId: regStudentId,
          fullName: regFullName,
          phone: regPhone,
          emergencyContact: regEmergency,
          program: regProgram,
          assignedRoomId: selectedRegisterRoom.roomId,
          checkInDate: regCheckInDate,
          depositPaid: Number(regDepositPaid),
          monthlyFee: Number(regMonthlyFee),
        },
        selectedRegisterRoom,
        staffEmail
      );
      setShowRegisterModal(false);
      setFeedbackBanner(
        `Registered ${regFullName.trim()} and marked room ${selectedRegisterRoom.roomId} as Occupied.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to register student.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (student: Student, presetCheckOut = false) => {
    setFormError(null);
    setEditingStudent(student);
    setEditFullName(student.fullName);
    setEditPhone(student.phone);
    setEditEmergency(student.emergencyContact);
    setEditProgram(student.program);
    setEditStatus(presetCheckOut ? 'Checked-Out' : student.status);
    setEditCheckInDate(student.checkInDate);
    setEditCheckOutDate(
      presetCheckOut
        ? getTodayISO()
        : student.checkOutDate || ''
    );
    setEditDepositPaid(String(student.depositPaid));
    setEditMonthlyFee(String(student.monthlyFee));
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
      setEditNewRoomId(firstVacant.roomId);
      setEditMonthlyFee(String(firstVacant.monthlyRate));
    }
  };

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
          phone: editPhone,
          emergencyContact: editEmergency,
          program: editProgram,
          status: editStatus,
          checkInDate: editCheckInDate,
          checkOutDate: editStatus === 'Checked-Out' ? editCheckOutDate : null,
          depositPaid: Number(editDepositPaid),
          monthlyFee: Number(editMonthlyFee),
          newRoom: chosenNewRoom,
        },
        staffEmail
      );

      if (editingStudent.status !== 'Checked-Out' && editStatus === 'Checked-Out') {
        setFeedbackBanner(
          `Checked out ${editingStudent.fullName} and released room ${editingStudent.assignedRoomId} back to Vacant.`
        );
      } else {
        setFeedbackBanner(`Updated student record for ${editFullName.trim()}.`);
      }
      setEditingStudent(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update student.'
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
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
            aria-label="Filter students by hostel location"
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
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'All' | StudentStatus)
            }
            aria-label="Filter students by residency status"
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

        <button
          type="button"
          onClick={handleOpenRegisterModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start lg:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Register New Student</span>
        </button>
      </div>

      {/* Summary Counts */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 px-1 tabular-nums">
        <span>
          Showing <strong className="text-slate-900">{filteredStudents.length}</strong> students
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-emerald-700">{vacantRooms.length}</strong> vacant beds available for assignment
        </span>
      </div>

      {/* Students Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading student residency records...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              No student records match your current search or filters.
            </p>
            <p className="text-xs text-slate-500">
              Use &ldquo;Register New Student&rdquo; to assign a resident to a vacant bed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Full Name &amp; Contact</th>
                  <th className="py-3 px-4">Program</th>
                  <th className="py-3 px-4">Room / Hostel</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Monthly Fee / Deposit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map((st) => (
                  <tr key={st.studentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {st.studentId}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{st.fullName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {st.phone} · ICE: {st.emergencyContact}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {st.program}
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
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                      <p className="font-semibold text-slate-900">
                        {formatRM(st.monthlyFee)}/mo
                      </p>
                      <p className="text-slate-500">
                        Dep: {formatRM(st.depositPaid)}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={st.status} />
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-slate-700 truncate max-w-[150px]">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register New Student Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Register New Student
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assigns a Vacant bed and automatically updates room inventory to Occupied
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

            {vacantRooms.length === 0 ? (
              <div className="p-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
                <p className="font-semibold">No Vacant Beds Available</p>
                <p className="text-xs leading-relaxed">
                  All beds in Room Inventory are currently Occupied or under
                  Maintenance. Add new beds in the Room Inventory tab before
                  registering a student.
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Student ID (Matrix / IC No.)
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={64}
                      value={regStudentId}
                      onChange={(e) => setRegStudentId(e.target.value)}
                      placeholder="e.g. GIS250301 or 040512-05-0123"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Program
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
                    Assign Vacant Room / Bed
                  </label>
                  <select
                    value={regRoomId}
                    onChange={(e) => handleRoomSelectionChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {vacantRooms.map((r) => (
                      <option key={r.roomId} value={r.roomId}>
                        {r.roomId} — {r.location} (Blk {r.block}, Unit {r.unitNo}, {r.bedSlot}) · {formatRM(r.monthlyRate)}/mo
                      </option>
                    ))}
                  </select>
                  {selectedRegisterRoom && (
                    <p className="text-xs text-slate-500 mt-1">
                      Hostel Location:{' '}
                      <strong className="text-slate-700">
                        {selectedRegisterRoom.location}
                      </strong>
                    </p>
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
                      onChange={(e) => setRegCheckInDate(e.target.value)}
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
                      value={regDepositPaid}
                      onChange={(e) => setRegDepositPaid(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Monthly Fee (RM)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      step="0.01"
                      value={regMonthlyFee}
                      onChange={(e) => setRegMonthlyFee(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
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
                    {submitting ? 'Registering...' : 'Register & Occupy Bed'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit / Check-Out Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Manage Student · {editingStudent.studentId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current Room: {editingStudent.assignedRoomId} ({editingStudent.hostelLocation})
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
                    Program
                  </label>
                  <select
                    value={editProgram}
                    onChange={(e) => setEditProgram(e.target.value as ProgramType)}
                    disabled={editStatus === 'Checked-Out'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
                  >
                    {PROGRAMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
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
                    back to <strong>Vacant</strong>.
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
                      if (rm) setEditMonthlyFee(String(rm.monthlyRate));
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
                  disabled={editStatus === 'Checked-Out'}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
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
                    value={editPhone}
                    disabled={editStatus === 'Checked-Out'}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
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
                    disabled={editStatus === 'Checked-Out'}
                    onChange={(e) => setEditEmergency(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Check-In Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editCheckInDate}
                    disabled={editStatus === 'Checked-Out'}
                    onChange={(e) => setEditCheckInDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
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
                    disabled={editStatus === 'Checked-Out'}
                    onChange={(e) => setEditDepositPaid(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Fee (RM)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={10000}
                    step="0.01"
                    value={editMonthlyFee}
                    disabled={editStatus === 'Checked-Out'}
                    onChange={(e) => setEditMonthlyFee(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-50"
                  />
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
    </div>
  );
}
