import React, { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  buildRoomId,
  formatRM,
  formatTimestamp,
  HOSTEL_LOCATIONS,
  HostelLocation,
  Room,
  ROOM_STATUSES,
  RoomStatus,
} from '../types/hostel';
import {
  bulkCreateBeds,
  createRoom,
  deleteVacantRoom,
  updateRoomRateAndStatus,
} from '../lib/hostelService';
import { StatusBadge } from './StatusBadge';

interface RoomInventoryTabProps {
  rooms: Room[];
  staffEmail: string;
  loading: boolean;
}

export function RoomInventoryTab({
  rooms,
  staffEmail,
  loading,
}: RoomInventoryTabProps) {
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | RoomStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);

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

  // Edit Room form
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
          (r.currentStudentName && r.currentStudentName.toLowerCase().includes(q)) ||
          (r.currentStudentId && r.currentStudentId.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
  }, [rooms, locationFilter, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const vacant = filteredRooms.filter((r) => r.status === 'Vacant').length;
    const occupied = filteredRooms.filter((r) => r.status === 'Occupied').length;
    const maintenance = filteredRooms.filter((r) => r.status === 'Maintenance').length;
    return { total: filteredRooms.length, vacant, occupied, maintenance };
  }, [filteredRooms]);

  const generatedSingleId =
    singleCustomId.trim() ||
    buildRoomId(singleLocation, singleBlock, singleUnitNo, singleBedSlot);

  const bulkPreviewIds = useMemo(() => {
    return Array.from({ length: bulkBedCount }, (_, idx) =>
      buildRoomId(bulkLocation, bulkBlock, bulkUnitNo, `B${idx + 1}`)
    );
  }, [bulkLocation, bulkBlock, bulkUnitNo, bulkBedCount]);

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
    setShowBulkModal(true);
  };

  const handleOpenEditModal = (room: Room) => {
    setFormError(null);
    setEditingRoom(room);
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
    setSubmitting(true);
    setFormError(null);
    try {
      await updateRoomRateAndStatus(
        editingRoom,
        Number(editRate),
        editStatus,
        staffEmail
      );
      setFeedbackBanner(`Updated ${editingRoom.roomId}.`);
      setEditingRoom(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update room.');
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
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(room)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                          title="Edit room rate or status"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {room.status !== 'Occupied' && (
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
                    maxLength={16}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Bulk Add Beds (B1–B{bulkBedCount})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically generate 1–6 bed slots for an apartment unit
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
                    Number of Beds (1–6)
                  </label>
                  <select
                    value={bulkBedCount}
                    onChange={(e) => setBulkBedCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Bed (B1)' : `Beds (B1–B${n})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-medium text-slate-700 mb-1.5">
                  Room IDs to generate ({formatRM(Number(bulkMonthlyRate) || 0)}/mo each):
                </p>
                <p className="text-xs font-mono text-slate-600 leading-relaxed">
                  {bulkPreviewIds.join(' · ')}
                </p>
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
                  {submitting ? 'Generating Beds...' : `Create ${bulkBedCount} Beds`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Edit Room {editingRoom.roomId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingRoom.location} · Blk {editingRoom.block} Unit {editingRoom.unitNo}
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
                {editingRoom.status === 'Occupied' ? (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    Currently Occupied by{' '}
                    <strong className="text-slate-900">
                      {editingRoom.currentStudentName}
                    </strong>
                    . Check out the student in the Students tab to mark this bed Vacant.
                  </div>
                ) : (
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as RoomStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    <option value="Vacant">Vacant</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                )}
              </div>

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
                  disabled={submitting}
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
    </div>
  );
}
