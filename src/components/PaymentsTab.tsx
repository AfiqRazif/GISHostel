import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import {
  formatRM,
  formatTimestamp,
  getCurrentMonthISO,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  Payment,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Student,
} from '../types/hostel';
import { createPayment, updatePayment } from '../lib/hostelService';
import { StatusBadge } from './StatusBadge';

interface PaymentsTabProps {
  payments: Payment[];
  students: Student[];
  staffEmail: string;
  loading: boolean;
}

export function PaymentsTab({
  payments,
  students,
  staffEmail,
  loading,
}: PaymentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');

  // Record Payment modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [billingMonth, setBillingMonth] = useState(getCurrentMonthISO());
  const [paymentType, setPaymentType] = useState<PaymentType>('Monthly Rent');
  const [amount, setAmount] = useState('250');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    'Online Transfer (FPX/DuitNow)'
  );
  const [referenceNo, setReferenceNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [status, setStatus] = useState<PaymentStatus>('Paid');
  const [notes, setNotes] = useState('');

  // Edit Payment modal
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const availableMonths = useMemo(() => {
    const set = new Set<string>([getCurrentMonthISO()]);
    payments.forEach((p) => set.add(p.billingMonth));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments
      .filter((p) =>
        locationFilter === 'All' ? true : p.hostelLocation === locationFilter
      )
      .filter((p) => (statusFilter === 'All' ? true : p.status === statusFilter))
      .filter((p) => (monthFilter === 'All' ? true : p.billingMonth === monthFilter))
      .filter((p) => {
        if (!q) return true;
        return (
          p.studentName.toLowerCase().includes(q) ||
          p.studentId.toLowerCase().includes(q) ||
          p.roomId.toLowerCase().includes(q) ||
          p.referenceNo.toLowerCase().includes(q) ||
          p.paymentId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
  }, [payments, locationFilter, statusFilter, monthFilter, searchQuery]);

  const totals = useMemo(() => {
    const paid = filteredPayments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const pending = filteredPayments
      .filter((p) => p.status === 'Pending')
      .reduce((sum, p) => sum + p.amount, 0);
    const overdue = filteredPayments
      .filter((p) => p.status === 'Overdue')
      .reduce((sum, p) => sum + p.amount, 0);
    return { paid, pending, overdue };
  }, [filteredPayments]);

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      if (a.status === 'Active' && b.status !== 'Active') return -1;
      if (a.status !== 'Active' && b.status === 'Active') return 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [students]);

  const handleOpenAddModal = () => {
    setFormError(null);
    const first = sortedStudents[0];
    setSelectedStudentId(first ? first.studentId : '');
    setBillingMonth(getCurrentMonthISO());
    setPaymentType('Monthly Rent');
    setAmount(first ? String(first.monthlyFee) : '250');
    setPaymentMethod('Online Transfer (FPX/DuitNow)');
    setReferenceNo('');
    setPaymentDate(getTodayISO());
    setStatus('Paid');
    setNotes('');
    setShowAddModal(true);
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    const st = students.find((s) => s.studentId === studentId);
    if (st && paymentType === 'Monthly Rent') {
      setAmount(String(st.monthlyFee));
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.studentId === selectedStudentId);
    if (!st) {
      setFormError('Please select a registered student.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createPayment(
        {
          student: st,
          billingMonth,
          paymentType,
          amount: Number(amount),
          paymentMethod,
          referenceNo,
          paymentDate,
          status,
          notes,
        },
        staffEmail
      );
      setShowAddModal(false);
      setFeedbackBanner(
        `Recorded ${formatRM(Number(amount))} (${status}) for ${st.fullName}.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to record payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (p: Payment) => {
    setFormError(null);
    setEditingPayment(p);
    setBillingMonth(p.billingMonth);
    setPaymentType(p.paymentType);
    setAmount(String(p.amount));
    setPaymentMethod(p.paymentMethod);
    setReferenceNo(p.referenceNo);
    setPaymentDate(p.paymentDate);
    setStatus(p.status);
    setNotes(p.notes);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await updatePayment(
        editingPayment.paymentId,
        {
          billingMonth,
          paymentType,
          amount: Number(amount),
          paymentMethod,
          referenceNo,
          paymentDate,
          status,
          notes,
        },
        staffEmail
      );
      setFeedbackBanner(`Updated payment ${editingPayment.paymentId}.`);
      setEditingPayment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickMarkPaid = async (p: Payment) => {
    try {
      await updatePayment(
        p.paymentId,
        {
          billingMonth: p.billingMonth,
          paymentType: p.paymentType,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          referenceNo: p.referenceNo,
          paymentDate: getTodayISO(),
          status: 'Paid',
          notes: p.notes,
        },
        staffEmail
      );
      setFeedbackBanner(
        `Marked ${p.studentName} (${formatRM(p.amount)}) as Paid.`
      );
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to mark payment as Paid.'
      );
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

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            Collected (Filtered Paid)
          </p>
          <p className="font-display text-xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
            {formatRM(totals.paid)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Pending Verification</p>
          <p className="font-display text-xl font-bold text-amber-700 mt-1 font-mono tabular-nums">
            {formatRM(totals.pending)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Overdue Balance</p>
          <p className="font-display text-xl font-bold text-red-700 mt-1 font-mono tabular-nums">
            {formatRM(totals.overdue)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Student, Ref No., Room..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-900"
            />
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filter by billing month"
            className="px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={locationFilter}
            onChange={(e) =>
              setLocationFilter(e.target.value as 'All' | HostelLocation)
            }
            aria-label="Filter payments by location"
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
              setStatusFilter(e.target.value as 'All' | PaymentStatus)
            }
            aria-label="Filter payments by status"
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
          >
            <option value="All">All Statuses</option>
            {PAYMENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start xl:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record Payment</span>
        </button>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading hostel payment ledger...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              No payment records match the current filter.
            </p>
            <p className="text-xs text-slate-500">
              Use &ldquo;Record Payment&rdquo; to log a student rent or deposit transaction.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Room / Hostel</th>
                  <th className="py-3 px-4">Month &amp; Type</th>
                  <th className="py-3 px-4">Method &amp; Ref</th>
                  <th className="py-3 px-4 text-right">Amount (RM)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPayments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{p.studentName}</p>
                      <p className="text-xs font-mono text-slate-500">
                        {p.studentId}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {p.roomId}
                      </p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">
                        {p.hostelLocation}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {p.billingMonth}
                      </p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">
                        {p.paymentType}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-slate-800 whitespace-nowrap">
                        {p.paymentMethod}
                      </p>
                      <p className="text-xs font-mono text-slate-500">
                        {p.referenceNo || 'No ref'} · {p.paymentDate}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRM(p.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-slate-700 truncate max-w-[150px]">
                        {p.updatedBy}
                      </p>
                      <p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        {formatTimestamp(p.updatedAt)}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {(p.status === 'Pending' || p.status === 'Overdue') && (
                          <button
                            type="button"
                            onClick={() => handleQuickMarkPaid(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mark Paid</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Record Hostel Payment
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

            {students.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Register at least one student in the Students tab before recording payments.
              </div>
            ) : (
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Student
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => handleStudentChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  >
                    {sortedStudents.map((s) => (
                      <option key={s.studentId} value={s.studentId}>
                        {s.fullName} ({s.studentId} · {s.assignedRoomId}) [{s.status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Billing Month
                    </label>
                    <input
                      type="month"
                      required
                      value={billingMonth}
                      onChange={(e) => setBillingMonth(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Type
                    </label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value as PaymentType)}
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

                <div className="grid grid-cols-2 gap-3">
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
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as PaymentStatus)}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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
                      Payment Date
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bank / Receipt Reference No.
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="e.g. DUITNOW-20261118-01"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Remarks / Notes
                  </label>
                  <input
                    type="text"
                    maxLength={240}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional verification notes"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
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
                    {submitting ? 'Recording...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Edit Payment · {editingPayment.paymentId}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingPayment.studentName} ({editingPayment.roomId})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Billing Month
                  </label>
                  <input
                    type="month"
                    required
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Type
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
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

              <div className="grid grid-cols-2 gap-3">
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PaymentStatus)}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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
                    Payment Date
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reference No.
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Update Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
