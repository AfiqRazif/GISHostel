import React, { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  History,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  buildRoomId,
  calculateFirstMonthDefaults,
  formatRM,
  formatTimestamp,
  generateBulkBedSlots,
  getNormalizedStayHistory,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  OCCUPANCY_MODES,
  OccupancyMode,
  PROGRAMS,
  ProgramType,
  REBATE_REASONS,
  RESIDENT_TYPES,
  ResidentType,
  Room,
  ROOM_STATUSES,
  RoomStatus,
  StayHistorySegment,
  Student,
} from '../types/hostel';
import {
  assignRoomToStudent,
  bulkCreateBeds,
  createRoom,
  deleteVacantRoom,
  registerStudent,
  updateRoomDetails,
} from '../lib/hostelService';
import { BulkImportModal } from './BulkImportModal';
import { StatusBadge } from './StatusBadge';

interface RoomInventoryTabProps {
  rooms: Room[];
  students?: Student[];
  staffEmail: string;
  loading: boolean;
}

export function RoomInventoryTab({
  rooms,
  students = [],
  staffEmail,
  loading,
}: RoomInventoryTabProps) {
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | RoomStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);
  const [historyRoom, setHistoryRoom] = useState<Room | null>(null);
  const [assigningRoom, setAssigningRoom] = useState<Room | null>(null);

  // Assign Resident to Vacant Bed modal state
  const [assignMode, setAssignMode] = useState<'existing' | 'new'>('existing');
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignPlacementDate, setAssignPlacementDate] = useState(getTodayISO());
  const [assignOccupancyMode, setAssignOccupancyMode] =
    useState<OccupancyMode>('Single Bed');
  const [assignUseRoomRate, setAssignUseRoomRate] = useState(true);
  const [assignCustomRate, setAssignCustomRate] = useState('250');

  // Inline New Resident into Bed state
  const [newResId, setNewResId] = useState('');
  const [newResName, setNewResName] = useState('');
  const [newResType, setNewResType] = useState<ResidentType>('Student');
  const [newResOccupancy, setNewResOccupancy] =
    useState<OccupancyMode>('Single Bed');
  const [newResProgram, setNewResProgram] = useState<ProgramType>('Diploma');
  const [newResPhone, setNewResPhone] = useState('');
  const [newResEmergency, setNewResEmergency] = useState('');
  const [newResCheckIn, setNewResCheckIn] = useState(getTodayISO());
  const [newResDeposit, setNewResDeposit] = useState('250');
  const [newResStdRate, setNewResStdRate] = useState('250');
  const [newResRebate, setNewResRebate] = useState('0');
  const [newResRebateReason, setNewResRebateReason] = useState('None');
  const [newResFirstCharge, setNewResFirstCharge] = useState('250');
  const [newResFirstNote, setNewResFirstNote] = useState('Standard Full Month');

  // Add Single Room form
  const [singleLocation, setSingleLocation] = useState<HostelLocation>('Apartment Desa Jati 2');
  const [singleBlock, setSingleBlock] = useState('A');
  const [singleUnitNo, setSingleUnitNo] = useState('01');
  const [singleBedSlot, setSingleBedSlot] = useState('B1');
  const [singleCustomId, setSingleCustomId] = useState('');
  const [singleMonthlyRate, setSingleMonthlyRate] = useState('250');
  const [singleStatus, setSingleStatus] = useState<'Vacant' | 'Maintenance'>('Vacant');

  // Bulk Add Beds form
  const [bulkLocation, setBulkLocation] = useState<HostelLocation>('Apartment Desa Jati 2');
  const [bulkBlock, setBulkBlock] = useState('A');
  const [bulkUnitNo, setBulkUnitNo] = useState('01');
  const [bulkMonthlyRate, setBulkMonthlyRate] = useState('250');
  const [bulkBedCount, setBulkBedCount] = useState(4);
  const [bulkPrefixPattern, setBulkPrefixPattern] = useState<string>('B');
  const [bulkCustomPrefix, setBulkCustomPrefix] = useState('Slot-');
  const [bulkStartNumber, setBulkStartNumber] = useState(1);

  // Edit Room form
  const [editLocation, setEditLocation] = useState<HostelLocation>('Apartment Desa Jati 2');
  const [editBlock, setEditBlock] = useState('A');
  const [editUnitNo, setEditUnitNo] = useState('01');
  const [editBedSlot, setEditBedSlot] = useState('B1');
  const [editRate, setEditRate] = useState('250');
  const [editStatus, setEditStatus] = useState<RoomStatus>('Vacant');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms
      .filter((r) => (locationFilter === 'All' ? true : r.location === locationFilter))
      .filter((r) => (statusFilter === 'All' ? true : r.status === statusFilter))
      .filter((r) => {
        if (!q) return true;
        return (
          r.roomId.toLowerCase().includes(q) ||
          r.block.toLowerCase().includes(q) ||
          r.unitNo.toLowerCase().includes(q) ||
          r.bedSlot.toLowerCase().includes(q) ||
          (r.currentStudentName && r.currentStudentName.toLowerCase().includes(q)) ||
          (r.currentStudentId && r.currentStudentId.toLowerCase().includes(q)) ||
          (r.statusNote && r.statusNote.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms, locationFilter, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const vacant = filteredRooms.filter((r) => r.status === 'Vacant').length;
    const occupied = filteredRooms.filter((r) => r.status === 'Occupied').length;
    const reserved = filteredRooms.filter((r) => r.status === 'Reserved / Blocked').length;
    const maintenance = filteredRooms.filter((r) => r.status === 'Maintenance').length;
    return { total: filteredRooms.length, vacant, occupied, reserved, maintenance };
  }, [filteredRooms]);

  const unassignedStudents = useMemo(() => {
    return students
      .filter((s) => !(s.assignedRoomId || '').trim())
      .sort((a, b) => {
        if (a.status === 'Active' && b.status !== 'Active') return -1;
        if (a.status !== 'Active' && b.status === 'Active') return 1;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [students]);

  const assignSiblingVacantBeds = useMemo(() => {
    if (!assigningRoom) return [];
    const activeMode = assignMode === 'existing' ? assignOccupancyMode : newResOccupancy;
    if (activeMode !== 'Whole Unit Exclusive') return [];
    return rooms
      .filter(
        (r) =>
          r.roomId !== assigningRoom.roomId &&
          r.location === assigningRoom.location &&
          r.block === assigningRoom.block &&
          r.unitNo === assigningRoom.unitNo &&
          r.status === 'Vacant'
      )
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [assigningRoom, assignMode, assignOccupancyMode, newResOccupancy, rooms]);

  const roomHistoryEntries = useMemo(() => {
    if (!historyRoom) return [];
    const list: Array<{ student: Student; segment: StayHistorySegment }> = [];
    for (const st of students) {
      const segs = getNormalizedStayHistory(st);
      for (const seg of segs) {
        if (seg.roomId === historyRoom.roomId) {
          list.push({ student: st, segment: seg });
        }
      }
    }
    return list.sort((a, b) =>
      b.segment.startDate.localeCompare(a.segment.startDate)
    );
  }, [historyRoom, students]);

  const generatedSingleId =
    singleCustomId.trim() ||
    buildRoomId(singleLocation, singleBlock, singleUnitNo, singleBedSlot);

  const activeBulkPrefix =
    bulkPrefixPattern === 'CUSTOM' ? bulkCustomPrefix : bulkPrefixPattern;

  const bulkBedSlots = useMemo(() => {
    return generateBulkBedSlots(bulkBedCount, activeBulkPrefix, bulkStartNumber);
  }, [bulkBedCount, activeBulkPrefix, bulkStartNumber]);

  const bulkPreviewIds = useMemo(() => {
    return bulkBedSlots.map((slot) =>
      buildRoomId(bulkLocation, bulkBlock, bulkUnitNo, slot)
    );
  }, [bulkLocation, bulkBlock, bulkUnitNo, bulkBedSlots]);

  const editPreviewRoomId = editingRoom
    ? buildRoomId(editLocation, editBlock, editUnitNo, editBedSlot)
    : '';

  const editHasDuplicateId = Boolean(
    editingRoom &&
      editPreviewRoomId !== editingRoom.roomId &&
      rooms.some((r) => r.roomId === editPreviewRoomId)
  );

  const handleOpenAddModal = () => {
    setFormError(null);
    setSingleCustomId('');
    setSingleMonthlyRate('250');
    setSingleStatus('Vacant');
    setShowAddModal(true);
  };

  const handleOpenBulkModal = () => {
    setFormError(null);
    setBulkMonthlyRate('250');
    setBulkBedCount(4);
    setBulkPrefixPattern('B');
    setBulkStartNumber(1);
    setShowBulkModal(true);
  };

  const handleOpenEditModal = (room: Room) => {
    setFormError(null);
    setEditingRoom(room);
    setEditLocation(room.location);
    setEditBlock(room.block);
    setEditUnitNo(room.unitNo);
    setEditBedSlot(room.bedSlot);
    setEditRate(String(room.monthlyRate));
    setEditStatus(room.status);
  };

  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createRoom(
        {
          roomId: singleCustomId.trim() || undefined,
          location: singleLocation,
          block: singleBlock,
          unitNo: singleUnitNo,
          bedSlot: singleBedSlot,
          monthlyRate: Number(singleMonthlyRate),
          status: singleStatus,
        },
        staffEmail
      );
      setShowAddModal(false);
      setFeedbackBanner(`Added room/bed ${generatedSingleId} to inventory.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create room.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await bulkCreateBeds(
        {
          location: bulkLocation,
          block: bulkBlock,
          unitNo: bulkUnitNo,
          monthlyRate: Number(bulkMonthlyRate),
          bedCount: bulkBedCount,
          bedPrefix: activeBulkPrefix,
          startNumber: bulkStartNumber,
        },
        staffEmail
      );
      setShowBulkModal(false);
      if (result.createdIds.length === 0) {
        setFeedbackBanner(
          `All ${result.skippedIds.length} bed slots already existed and were skipped.`
        );
      } else if (result.skippedIds.length > 0) {
        setFeedbackBanner(
          `Created ${result.createdIds.length} beds (${result.createdIds.join(', ')}). Skipped ${result.skippedIds.length} existing.`
        );
      } else {
        setFeedbackBanner(
          `Created ${result.createdIds.length} beds: ${result.createdIds.join(', ')}.`
        );
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Bulk add failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    if (editHasDuplicateId) {
      setFormError(`Room ID "${editPreviewRoomId}" already exists in inventory.`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await updateRoomDetails(
        editingRoom,
        {
          location: editLocation,
          block: editBlock,
          unitNo: editUnitNo,
          bedSlot: editBedSlot,
          monthlyRate: Number(editRate),
          status: editStatus,
        },
        staffEmail
      );
      setFeedbackBanner(
        result.renamed
          ? `Updated room ${editingRoom.roomId} to ${result.roomId}.`
          : `Updated room ${result.roomId}.`
      );
      setEditingRoom(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update room.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAssignModal = (room: Room) => {
    setFormError(null);
    setAssigningRoom(room);
    const firstUnassigned = unassignedStudents[0] || null;
    setAssignMode(firstUnassigned ? 'existing' : 'new');
    setAssignStudentId(firstUnassigned ? firstUnassigned.studentId : '');
    setAssignPlacementDate(
      firstUnassigned?.checkInDate || getTodayISO()
    );
    setAssignOccupancyMode(firstUnassigned?.occupancyMode || 'Single Bed');
    setAssignUseRoomRate(true);
    setAssignCustomRate(String(room.monthlyRate));

    const today = getTodayISO();
    const defaults = calculateFirstMonthDefaults(today, room.monthlyRate);
    setNewResId('');
    setNewResName('');
    setNewResType('Student');
    setNewResOccupancy('Single Bed');
    setNewResProgram('Diploma');
    setNewResPhone('');
    setNewResEmergency('');
    setNewResCheckIn(today);
    setNewResDeposit(String(room.monthlyRate));
    setNewResStdRate(String(room.monthlyRate));
    setNewResRebate('0');
    setNewResRebateReason('None');
    setNewResFirstCharge(String(defaults.firstMonthCharge));
    setNewResFirstNote(defaults.firstMonthNote);
  };

  const handleAssignResidentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningRoom) return;
    setSubmitting(true);
    setFormError(null);

    try {
      if (assignMode === 'existing') {
        const chosenStudent = unassignedStudents.find(
          (s) => s.studentId === assignStudentId
        );
        if (!chosenStudent) {
          setFormError('Please select a Room Unassigned resident.');
          setSubmitting(false);
          return;
        }
        const stdRate = assignUseRoomRate
          ? assigningRoom.monthlyRate
          : Number(assignCustomRate) || assigningRoom.monthlyRate;
        const result = await assignRoomToStudent(
          chosenStudent,
          {
            room: assigningRoom,
            occupancyMode: assignOccupancyMode,
            placementDate: assignPlacementDate,
            standardRoomRate: stdRate,
            monthlyRebate: chosenStudent.monthlyRebate ?? 0,
            rebateReason: chosenStudent.rebateReason || 'None',
          },
          rooms,
          staffEmail
        );
        setAssigningRoom(null);
        setFeedbackBanner(
          result.blockedSiblings.length > 0
            ? `Assigned ${chosenStudent.fullName} to ${assigningRoom.roomId} (Whole Unit Exclusive) and blocked ${result.blockedSiblings.join(', ')}.`
            : `Assigned ${chosenStudent.fullName} (${chosenStudent.studentId}) to ${assigningRoom.roomId}.`
        );
      } else {
        const result = await registerStudent(
          {
            studentId: newResId,
            fullName: newResName,
            residentType: newResType,
            occupancyMode: newResOccupancy,
            phone: newResPhone,
            emergencyContact: newResEmergency,
            program: newResProgram,
            assignedRoomId: assigningRoom.roomId,
            status: 'Active',
            checkInDate: newResCheckIn,
            checkOutDate: null,
            depositPaid: Number(newResDeposit),
            standardRoomRate: Number(newResStdRate),
            monthlyRebate: Number(newResRebate),
            rebateReason: newResRebateReason,
            firstMonthCharge: Number(newResFirstCharge),
            firstMonthNote: newResFirstNote,
          },
          assigningRoom,
          rooms,
          staffEmail
        );
        setAssigningRoom(null);
        setFeedbackBanner(
          result.blockedSiblings.length > 0
            ? `Registered ${newResName.trim()} into ${assigningRoom.roomId} (Whole Unit Exclusive) and blocked ${result.blockedSiblings.join(', ')}.`
            : `Registered ${newResName.trim()} into ${assigningRoom.roomId} and marked bed as Occupied.`
        );
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to assign resident to bed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRoom) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await deleteVacantRoom(deletingRoom);
      setFeedbackBanner(`Removed ${deletingRoom.roomId} from inventory.`);
      setDeletingRoom(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete room.');
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
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Room ID, Unit, Resident..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-900"
            />
          </div>

          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value as 'All' | HostelLocation)
            }
            aria-label="Filter by hostel location"
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
              setStatusFilter(e.target.value as 'All' | RoomStatus)
            }
            aria-label="Filter by room status"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Statuses</option>
            {ROOM_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
            onClick={handleOpenBulkModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Bulk Add Beds</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Room/Bed</span>
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 px-1 tabular-nums">
        <span>
          Showing <strong className="text-slate-900">{summary.total}</strong> bed slots
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-emerald-700">{summary.vacant}</strong> Vacant
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-blue-900">{summary.occupied}</strong> Occupied
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-indigo-900">{summary.reserved}</strong> Reserved / Blocked
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-amber-700">{summary.maintenance}</strong> Maintenance
        </span>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading hostel room inventory...
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">
              No room or bed slots match the current filter.
            </p>
            <p className="text-xs text-slate-500">
              Adjust your filters or add beds using &ldquo;Add Room/Bed&rdquo; or &ldquo;Bulk Add Beds&rdquo;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Room ID</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Block / Unit / Bed</th>
                  <th className="py-3 px-4 text-right">Monthly Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Resident</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRooms.map((room) => (
                  <tr key={room.roomId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {room.roomId}
                    </td>
                    <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                      {room.location}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      Blk {room.block} · Unit {room.unitNo} · {room.bedSlot}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRM(room.monthlyRate)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={room.status} />
                    </td>
                    <td className="py-3 px-4">
                      {room.currentStudentName ? (
                        <div>
                          <p className="text-xs font-medium text-slate-900">
                            {room.currentStudentName}
                          </p>
                          <p className="text-xs font-mono text-slate-500">
                            {room.currentStudentId}
                          </p>
                        </div>
                      ) : room.status === 'Reserved / Blocked' || room.statusNote ? (
                        <div>
                          <p className="text-xs font-medium text-indigo-900">
                            {room.statusNote || 'Exclusive Unit Blocked'}
                          </p>
                          {room.exclusiveResidentId && (
                            <p className="text-xs font-mono text-slate-500">
                              Holder: {room.exclusiveResidentId}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-slate-700 truncate max-w-[160px]">
                        {room.updatedBy}
                      </p>
                      <p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {formatTimestamp(room.updatedAt)}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {room.status === 'Vacant' && (
                          <button
                            type="button"
                            onClick={() => handleOpenAssignModal(room)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md cursor-pointer"
                            title="Assign an unassigned resident or register a new resident into this bed"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Assign Resident</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setHistoryRoom(room)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                          title="View room stay & transfer history"
                        >
                          <History className="w-3 h-3" />
                          <span>History</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(room)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                          title="Edit room rate or status"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {room.status !== 'Occupied' &&
                          room.status !== 'Reserved / Blocked' && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setDeletingRoom(room);
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                              title="Delete unoccupied bed"
                              aria-label={`Delete ${room.roomId}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add Single Room/Bed Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Add Room / Bed Slot
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
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

            <form onSubmit={handleCreateSingle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hostel Location
                </label>
                <select
                  value={singleLocation}
                  onChange={(e) => setSingleLocation(e.target.value as HostelLocation)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  {HOSTEL_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Block
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={singleBlock}
                    onChange={(e) => setSingleBlock(e.target.value)}
                    placeholder="e.g. A"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit No.
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={singleUnitNo}
                    onChange={(e) => setSingleUnitNo(e.target.value)}
                    placeholder="e.g. 04"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bed Slot
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={singleBedSlot}
                    onChange={(e) => setSingleBedSlot(e.target.value)}
                    placeholder="e.g. B1"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Room ID (Auto-generated if left blank)
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={singleCustomId}
                  onChange={(e) => setSingleCustomId(e.target.value)}
                  placeholder={generatedSingleId}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Resulting ID: <span className="font-mono font-medium">{generatedSingleId}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Rate (RM)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={10000}
                    step="0.01"
                    value={singleMonthlyRate}
                    onChange={(e) => setSingleMonthlyRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={singleStatus}
                    onChange={(e) =>
                      setSingleStatus(e.target.value as 'Vacant' | 'Maintenance')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    <option value="Vacant">Vacant</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Room/Bed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Add Beds Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Bulk Add Beds ({bulkBedSlots[0]}–{bulkBedSlots[bulkBedSlots.length - 1]})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically generate 1–8 bed slots for an apartment unit
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
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

            <form onSubmit={handleBulkCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hostel Location
                </label>
                <select
                  value={bulkLocation}
                  onChange={(e) => setBulkLocation(e.target.value as HostelLocation)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  {HOSTEL_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Block
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={bulkBlock}
                    onChange={(e) => setBulkBlock(e.target.value)}
                    placeholder="e.g. A"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit No.
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={bulkUnitNo}
                    onChange={(e) => setBulkUnitNo(e.target.value)}
                    placeholder="e.g. 04"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Rate per Bed (RM)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={10000}
                    step="0.01"
                    value={bulkMonthlyRate}
                    onChange={(e) => setBulkMonthlyRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Number of Beds (1–8)
                  </label>
                  <select
                    value={bulkBedCount}
                    onChange={(e) => setBulkBedCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Bed' : 'Beds'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bed Prefix / Naming Pattern
                  </label>
                  <select
                    value={bulkPrefixPattern}
                    onChange={(e) => setBulkPrefixPattern(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    <option value="B">Standard (B1, B2 ... B8)</option>
                    <option value="Bed-">Labeled (Bed-1, Bed-2 ...)</option>
                    <option value="Upper-">Upper Bunk (Upper-1, Upper-2 ...)</option>
                    <option value="Lower-">Lower Bunk (Lower-1, Lower-2 ...)</option>
                    <option value="CUSTOM">Custom Prefix...</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Starting No.
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={99}
                    value={bulkStartNumber}
                    onChange={(e) =>
                      setBulkStartNumber(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              {bulkPrefixPattern === 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Custom Bed Prefix
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={bulkCustomPrefix}
                    onChange={(e) => setBulkCustomPrefix(e.target.value)}
                    placeholder="e.g. M- or Window-"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-medium text-slate-700">
                  Live Preview ({bulkPreviewIds.length} Room IDs ·{' '}
                  {formatRM(Number(bulkMonthlyRate) || 0)}/mo each):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {bulkPreviewIds.map((id) => {
                    const exists = rooms.some((r) => r.roomId === id);
                    return (
                      <span
                        key={id}
                        className={`text-xs font-mono px-2 py-0.5 rounded border ${
                          exists
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                        title={exists ? 'Already exists (will be skipped)' : 'New bed slot'}
                      >
                        {id}
                        {exists ? ' (exists)' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
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
                    ? 'Generating Beds...'
                    : `Create ${bulkBedCount} ${bulkBedCount === 1 ? 'Bed' : 'Beds'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room / Bed Modal */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Edit Room / Bed · {editingRoom.roomId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update bed designation, unit details, monthly RM rate, or maintenance status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
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

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hostel Location
                </label>
                <select
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value as HostelLocation)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  {HOSTEL_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Block
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={editBlock}
                    onChange={(e) => setEditBlock(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit No.
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={editUnitNo}
                    onChange={(e) => setEditUnitNo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bed Designation
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={editBedSlot}
                    onChange={(e) => setEditBedSlot(e.target.value)}
                    placeholder="e.g. B1-Window"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border text-xs ${
                  editHasDuplicateId
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>Auto-formatted Room ID:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {editPreviewRoomId}
                  </span>
                </div>
                {editHasDuplicateId && (
                  <p className="mt-1 font-medium text-red-700">
                    Duplicate Room ID detected — choose a unique Block, Unit, or Bed Designation.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Rate (RM)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={10000}
                    step="0.01"
                    value={editRate}
                    onChange={(e) => setEditRate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Room Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as RoomStatus)}
                    disabled={
                      editingRoom.status === 'Occupied' ||
                      editingRoom.status === 'Reserved / Blocked' ||
                      Boolean(editingRoom.currentStudentId)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900 disabled:bg-slate-100 disabled:text-slate-600"
                  >
                    <option value="Vacant">Vacant</option>
                    <option value="Occupied" disabled>
                      Occupied
                    </option>
                    <option value="Reserved / Blocked" disabled>
                      Reserved / Blocked
                    </option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              {(editingRoom.status === 'Occupied' ||
                Boolean(editingRoom.currentStudentId)) && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  Assigned to{' '}
                  <strong>
                    {editingRoom.currentStudentName || editingRoom.currentStudentId}
                  </strong>
                  . Status cannot be switched to Vacant or Maintenance until the
                  resident is checked out or transferred in the Students tab.
                </div>
              )}

              {editingRoom.status === 'Reserved / Blocked' && (
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                  <strong>{editingRoom.statusNote || 'Exclusive Unit Blocked'}</strong>.
                  This bed is blocked for Whole Unit Exclusive occupancy and cannot
                  be manually switched until that resident checks out or changes to
                  Single Bed.
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || editHasDuplicateId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Room Confirmation */}
      {deletingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Delete Room {deletingRoom.roomId}?
            </h2>
            <p className="text-sm text-slate-600">
              This will permanently remove bed slot{' '}
              <span className="font-mono font-semibold">{deletingRoom.roomId}</span>{' '}
              ({deletingRoom.location}) from inventory.
            </p>
            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRoom(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {submitting ? 'Deleting...' : 'Delete Room'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Stay &amp; Transfer History · {historyRoom.roomId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {historyRoom.location} · Blk {historyRoom.block}, Unit {historyRoom.unitNo},{' '}
                  {historyRoom.bedSlot} · Current Rate {formatRM(historyRoom.monthlyRate)}/mo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryRoom(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close room history modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {roomHistoryEntries.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                No stay or transfer segments recorded for bed slot{' '}
                <span className="font-mono font-semibold text-slate-700">
                  {historyRoom.roomId}
                </span>{' '}
                yet.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Resident</th>
                      <th className="py-2.5 px-3">Date Range</th>
                      <th className="py-2.5 px-3 text-right">Monthly Rate</th>
                      <th className="py-2.5 px-3">Reason / Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {roomHistoryEntries.map(({ student, segment }) => (
                      <tr key={`${student.studentId}-${segment.id}`}>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-900">
                            {student.fullName}
                          </p>
                          <p className="font-mono text-slate-500">
                            {student.studentId} · {segment.occupancyMode}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {segment.startDate} →{' '}
                          {segment.endDate || (
                            <span className="font-sans font-semibold text-emerald-700">
                              Present
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <p className="font-semibold text-slate-900">
                            {formatRM(segment.effectiveMonthlyFee)}/mo
                          </p>
                          {segment.monthlyRebate > 0 && (
                            <p className="text-emerald-700">
                              Rebate -{formatRM(segment.monthlyRebate)}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <p className="font-medium text-slate-800">{segment.reason}</p>
                          <p className="text-slate-400 truncate max-w-[180px]">
                            By {segment.recordedBy}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryRoom(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Resident to Vacant Bed Modal */}
      {assigningRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Assign Resident · {assigningRoom.roomId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {assigningRoom.location} · Blk {assigningRoom.block}, Unit{' '}
                  {assigningRoom.unitNo}, {assigningRoom.bedSlot} ·{' '}
                  <span className="font-mono font-semibold text-slate-700">
                    {formatRM(assigningRoom.monthlyRate)}/mo
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningRoom(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close assign resident modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setAssignMode('existing');
                }}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  assignMode === 'existing'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pick Unassigned Resident ({unassignedStudents.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setAssignMode('new');
                }}
                className={`flex-1 px-3 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  assignMode === 'new'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Register New Resident Into Bed
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleAssignResidentSubmit} className="space-y-4">
              {assignMode === 'existing' ? (
                unassignedStudents.length === 0 ? (
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                    <p className="font-semibold">No Room-Unassigned Residents Found</p>
                    <p>
                      All current residents already have a bed assigned. Switch to{' '}
                      <strong>Register New Resident Into Bed</strong> above to add someone new directly into{' '}
                      <span className="font-mono">{assigningRoom.roomId}</span>.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Select Room-Unassigned Resident
                      </label>
                      <select
                        required
                        value={assignStudentId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setAssignStudentId(id);
                          const st = unassignedStudents.find((s) => s.studentId === id);
                          if (st) {
                            setAssignPlacementDate(st.checkInDate || getTodayISO());
                            setAssignOccupancyMode(st.occupancyMode || 'Single Bed');
                          }
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {unassignedStudents.map((st) => (
                          <option key={st.studentId} value={st.studentId}>
                            {st.fullName} ({st.studentId}) · Check-In: {st.checkInDate} [{st.status}]
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

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assignUseRoomRate}
                          onChange={(e) => setAssignUseRoomRate(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-900"
                        />
                        <span>
                          Use bed standard rate ({formatRM(assigningRoom.monthlyRate)}/mo)
                        </span>
                      </label>
                      {!assignUseRoomRate && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Custom Standard Monthly Rate (RM)
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            max={10000}
                            step="0.01"
                            value={assignCustomRate}
                            onChange={(e) => setAssignCustomRate(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Resident Type
                      </label>
                      <select
                        value={newResType}
                        onChange={(e) => setNewResType(e.target.value as ResidentType)}
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
                        value={newResOccupancy}
                        onChange={(e) => setNewResOccupancy(e.target.value as OccupancyMode)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {OCCUPANCY_MODES.map((om) => (
                          <option key={om} value={om}>
                            {om}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Program
                      </label>
                      <select
                        value={newResProgram}
                        onChange={(e) => setNewResProgram(e.target.value as ProgramType)}
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
                        Resident ID (Matrix / IC)
                      </label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={64}
                        value={newResId}
                        onChange={(e) => setNewResId(e.target.value)}
                        placeholder="e.g. GIS250401"
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={120}
                        value={newResName}
                        onChange={(e) => setNewResName(e.target.value)}
                        placeholder="e.g. Nurul Huda binti Azman"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
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
                        value={newResPhone}
                        onChange={(e) => setNewResPhone(e.target.value)}
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
                        value={newResEmergency}
                        onChange={(e) => setNewResEmergency(e.target.value)}
                        placeholder="e.g. Azman (Father) 019-111 2233"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
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
                        value={newResCheckIn}
                        onChange={(e) => {
                          const d = e.target.value;
                          setNewResCheckIn(d);
                          const eff = Math.max(
                            0,
                            (Number(newResStdRate) || 0) - (Number(newResRebate) || 0)
                          );
                          const fm = calculateFirstMonthDefaults(d, eff);
                          setNewResFirstCharge(String(fm.firstMonthCharge));
                          setNewResFirstNote(fm.firstMonthNote);
                        }}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
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
                        value={newResStdRate}
                        onChange={(e) => {
                          const r = e.target.value;
                          setNewResStdRate(r);
                          const eff = Math.max(
                            0,
                            (Number(r) || 0) - (Number(newResRebate) || 0)
                          );
                          const fm = calculateFirstMonthDefaults(newResCheckIn, eff);
                          setNewResFirstCharge(String(fm.firstMonthCharge));
                          setNewResFirstNote(fm.firstMonthNote);
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
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
                        value={newResDeposit}
                        onChange={(e) => setNewResDeposit(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                        value={newResRebate}
                        onChange={(e) => {
                          const reb = e.target.value;
                          setNewResRebate(reb);
                          const eff = Math.max(
                            0,
                            (Number(newResStdRate) || 0) - (Number(reb) || 0)
                          );
                          const fm = calculateFirstMonthDefaults(newResCheckIn, eff);
                          setNewResFirstCharge(String(fm.firstMonthCharge));
                          setNewResFirstNote(fm.firstMonthNote);
                        }}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Rebate Reason
                      </label>
                      <select
                        value={newResRebateReason}
                        onChange={(e) => setNewResRebateReason(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      >
                        {REBATE_REASONS.map((rr) => (
                          <option key={rr} value={rr}>
                            {rr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        1st Month Charge (RM)
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={10000}
                        step="0.01"
                        value={newResFirstCharge}
                        onChange={(e) => setNewResFirstCharge(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  </div>
                </>
              )}

              {((assignMode === 'existing' && assignOccupancyMode === 'Whole Unit Exclusive') ||
                (assignMode === 'new' && newResOccupancy === 'Whole Unit Exclusive')) && (
                <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                  {assignSiblingVacantBeds.length > 0 ? (
                    <p>
                      <strong>Whole Unit Exclusive:</strong> Assigning{' '}
                      <span className="font-mono">{assigningRoom.roomId}</span> will also
                      block{' '}
                      <strong className="font-mono">
                        {assignSiblingVacantBeds.map((b) => b.roomId).join(', ')}
                      </strong>{' '}
                      as <strong>Reserved / Blocked</strong>.
                    </p>
                  ) : (
                    <p>
                      <strong>Whole Unit Exclusive:</strong> No other Vacant beds remain in
                      Block {assigningRoom.block} Unit {assigningRoom.unitNo}.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssigningRoom(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                {(assignMode === 'new' || unassignedStudents.length > 0) && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    {submitting
                      ? 'Assigning...'
                      : assignMode === 'existing'
                        ? 'Confirm Room Assignment'
                        : 'Register & Occupy Bed'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        importType="rooms"
        rooms={rooms}
        students={[]}
        payments={[]}
        staffEmail={staffEmail}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(msg) => setFeedbackBanner(msg)}
      />
    </div>
  );
}
