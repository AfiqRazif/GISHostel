import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  FileCheck2,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  calculateMonthInstallmentStatus,
  calculateResidentBilling,
  formatRM,
  formatTimestamp,
  getCurrentMonthISO,
  getPaymentBankRef,
  getPaymentReceiptNo,
  getPaymentRecordedBy,
  getPhysicalReceiptStatus,
  getTodayISO,
  HOSTEL_LOCATIONS,
  HostelLocation,
  isCashPaymentType,
  isRentCreditType,
  Payment,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PhysicalReceiptStatus,
  Student,
} from '../types/hostel';
import {
  createPayment,
  markPhysicalReceiptIssued,
  updatePayment,
} from '../lib/hostelService';
import { BulkImportModal } from './BulkImportModal';
import { StatusBadge } from './StatusBadge';

interface ScannedReceiptResult {
  amount: number;
  transactionDate: string;
  billingMonth: string;
  paymentMethod: 'DuitNow QR' | 'Online Transfer' | 'Cash';
  bankRefNo: string;
  payerName: string;
}

function compressReceiptImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
      img.onload = () => {
        const maxWidth = 900;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetWidth = Math.max(1, Math.round(img.width * scale));
        const targetHeight = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable for image compression.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export interface PaymentPrefillRequest {
  studentId: string;
  amount: number;
  nonce: number;
}

interface PaymentsTabProps {
  payments: Payment[];
  students: Student[];
  staffEmail: string;
  loading: boolean;
  prefillRequest?: PaymentPrefillRequest | null;
}

export function PaymentsTab({
  payments,
  students,
  staffEmail,
  loading,
  prefillRequest,
}: PaymentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | HostelLocation>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | PaymentStatus>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | PaymentType>('All');
  const [receiptFilter, setReceiptFilter] = useState<'All' | PhysicalReceiptStatus>('All');

  // Record Payment modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [billingMonth, setBillingMonth] = useState(getCurrentMonthISO());
  const [paymentType, setPaymentType] = useState<PaymentType>('Monthly Rent');
  const [amount, setAmount] = useState('250');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('DuitNow QR');
  const [bankRefNo, setBankRefNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [status, setStatus] = useState<PaymentStatus>('Paid');
  const [notes, setNotes] = useState('');
  const [proofImageData, setProofImageData] = useState<string | null>(null);
  const [scanningProof, setScanningProof] = useState(false);
  const [aiScanInfo, setAiScanInfo] = useState<{
    status: 'verified' | 'warning';
    payerName?: string;
    message: string;
  } | null>(null);

  // Edit Payment modal
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  // View Proof lightbox modal
  const [viewingProofPayment, setViewingProofPayment] = useState<Payment | null>(null);

  // Mark Physical Receipt Issued modal
  const [issuingReceiptPayment, setIssuingReceiptPayment] = useState<Payment | null>(null);
  const [physicalReceiptNoInput, setPhysicalReceiptNoInput] = useState('');

  // Printable Official Receipt modal
  const [printingPayment, setPrintingPayment] = useState<Payment | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      if (a.status === 'Active' && b.status !== 'Active') return -1;
      if (a.status !== 'Active' && b.status === 'Active') return 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [students]);

  useEffect(() => {
    if (!prefillRequest) return;
    const st = students.find((s) => s.studentId === prefillRequest.studentId);
    setFormError(null);
    setEditingPayment(null);
    setPrintingPayment(null);
    setSelectedStudentId(prefillRequest.studentId);
    setBillingMonth(getCurrentMonthISO());
    setPaymentType('Monthly Rent');
    setAmount(
      prefillRequest.amount > 0
        ? prefillRequest.amount.toFixed(2)
        : st
          ? String(calculateResidentBilling(st, payments).effectiveMonthlyFee)
          : '250'
    );
    setPaymentMethod('DuitNow QR');
    setBankRefNo('');
    setPaymentDate(getTodayISO());
    setStatus('Paid');
    setNotes('Arrears settlement');
    setProofImageData(null);
    setAiScanInfo(null);
    setShowAddModal(true);
  }, [prefillRequest]);

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
      .filter((p) => (typeFilter === 'All' ? true : p.paymentType === typeFilter))
      .filter((p) =>
        receiptFilter === 'All' ? true : getPhysicalReceiptStatus(p) === receiptFilter
      )
      .filter((p) => {
        if (!q) return true;
        const receipt = getPaymentReceiptNo(p).toLowerCase();
        const bankRef = getPaymentBankRef(p).toLowerCase();
        const physNo = (p.physicalReceiptNo || '').toLowerCase();
        return (
          p.studentName.toLowerCase().includes(q) ||
          p.studentId.toLowerCase().includes(q) ||
          p.roomId.toLowerCase().includes(q) ||
          receipt.includes(q) ||
          bankRef.includes(q) ||
          physNo.includes(q) ||
          p.paymentId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const tA = a.updatedAt?.toMillis?.() ?? 0;
        const tB = b.updatedAt?.toMillis?.() ?? 0;
        return tB - tA;
      });
  }, [
    payments,
    locationFilter,
    statusFilter,
    monthFilter,
    typeFilter,
    receiptFilter,
    searchQuery,
  ]);

  const activeModalStudent = useMemo(() => {
    const id = editingPayment ? editingPayment.studentId : selectedStudentId;
    return students.find((s) => s.studentId === id) || null;
  }, [editingPayment, selectedStudentId, students]);

  const installmentPreview = useMemo(() => {
    if (!activeModalStudent || !isRentCreditType(paymentType)) return null;
    return calculateMonthInstallmentStatus(
      activeModalStudent,
      payments,
      billingMonth,
      Number(amount) || 0,
      editingPayment?.paymentId
    );
  }, [activeModalStudent, paymentType, payments, billingMonth, amount, editingPayment]);

  const totals = useMemo(() => {
    const cashCollected = filteredPayments
      .filter((p) => p.status === 'Paid' && isCashPaymentType(p.paymentType))
      .reduce((sum, p) => sum + p.amount, 0);
    const waiversGranted = filteredPayments
      .filter(
        (p) =>
          p.paymentType === 'Rebate / Fee Waiver' &&
          (p.status === 'Paid' || p.status === 'Waived')
      )
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingOrOverdue = filteredPayments
      .filter((p) => p.status === 'Pending' || p.status === 'Overdue')
      .reduce((sum, p) => sum + p.amount, 0);
    return { cashCollected, waiversGranted, pendingOrOverdue };
  }, [filteredPayments]);

  const handleOpenAddModal = () => {
    setFormError(null);
    const first = sortedStudents[0];
    setSelectedStudentId(first ? first.studentId : '');
    setBillingMonth(getCurrentMonthISO());
    setPaymentType('Monthly Rent');
    setAmount(
      first
        ? String(calculateResidentBilling(first, payments).effectiveMonthlyFee)
        : '250'
    );
    setPaymentMethod('DuitNow QR');
    setBankRefNo('');
    setPaymentDate(getTodayISO());
    setStatus('Paid');
    setNotes('');
    setProofImageData(null);
    setAiScanInfo(null);
    setShowAddModal(true);
  };

  const handleProofFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
    autoScan: boolean
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFormError(null);
    setAiScanInfo(null);
    setScanningProof(true);

    try {
      const compressedDataUrl = await compressReceiptImage(file);
      setProofImageData(compressedDataUrl);

      if (!autoScan) {
        setScanningProof(false);
        return;
      }

      const resp = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: compressedDataUrl }),
      });

      if (!resp.ok) {
        const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || 'AI receipt scan failed.');
      }

      const extracted = (await resp.json()) as ScannedReceiptResult;
      if (extracted.amount > 0) {
        setAmount(extracted.amount.toFixed(2));
      }
      if (extracted.transactionDate) {
        setPaymentDate(extracted.transactionDate);
      }
      if (extracted.billingMonth) {
        setBillingMonth(extracted.billingMonth);
      }
      if (
        extracted.paymentMethod === 'DuitNow QR' ||
        extracted.paymentMethod === 'Online Transfer' ||
        extracted.paymentMethod === 'Cash'
      ) {
        setPaymentMethod(extracted.paymentMethod);
      }
      if (extracted.bankRefNo) {
        setBankRefNo(extracted.bankRefNo);
      }

      setAiScanInfo({
        status: 'verified',
        payerName: extracted.payerName,
        message: extracted.payerName
          ? `AI Extracted — Please Verify (Payer: ${extracted.payerName})`
          : 'AI Extracted — Please Verify all auto-filled fields before saving.',
      });
    } catch (err) {
      setAiScanInfo({
        status: 'warning',
        message:
          err instanceof Error
            ? `Proof attached, but auto-scan could not extract fields: ${err.message}`
            : 'Proof attached, but auto-scan was unavailable. Please enter details manually.',
      });
    } finally {
      setScanningProof(false);
    }
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    const st = students.find((s) => s.studentId === studentId);
    if (st && paymentType === 'Monthly Rent') {
      const billing = calculateResidentBilling(st, payments);
      setAmount(String(billing.effectiveMonthlyFee));
    }
  };

  const handlePaymentTypeChange = (nextType: PaymentType) => {
    setPaymentType(nextType);
    if (nextType === 'Rebate / Fee Waiver') {
      setPaymentMethod('Internal Adjustment');
      setStatus('Waived');
    } else if (nextType === 'Monthly Rent') {
      if (paymentMethod === 'Internal Adjustment') {
        setPaymentMethod('DuitNow QR');
      }
      if (status === 'Waived') {
        setStatus('Paid');
      }
      const st = students.find((s) => s.studentId === selectedStudentId);
      if (st) {
        const billing = calculateResidentBilling(st, payments);
        setAmount(String(billing.effectiveMonthlyFee));
      }
    } else if (status === 'Waived') {
      setStatus('Paid');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.studentId === selectedStudentId);
    if (!st) {
      setFormError('Please select a registered resident.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await createPayment(
        {
          student: st,
          billingMonth,
          paymentType,
          amount: Number(amount),
          paymentMethod,
          bankRefNo,
          paymentDate,
          status,
          notes,
          proofImageData,
        },
        payments,
        staffEmail
      );
      setShowAddModal(false);
      setFeedbackBanner(
        `Recorded ${result.receiptNo} · ${formatRM(Number(amount))} (${paymentType}) for ${st.fullName}.`
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
    setAiScanInfo(null);
    setEditingPayment(p);
    setBillingMonth(p.billingMonth);
    setPaymentType(
      (PAYMENT_TYPES.includes(p.paymentType as PaymentType)
        ? p.paymentType
        : 'Monthly Rent') as PaymentType
    );
    setAmount(String(p.amount));
    setPaymentMethod(
      (PAYMENT_METHODS.includes(p.paymentMethod as PaymentMethod)
        ? p.paymentMethod
        : 'Online Transfer') as PaymentMethod
    );
    setBankRefNo(getPaymentBankRef(p));
    setPaymentDate(p.paymentDate);
    setStatus(p.status);
    setNotes(p.notes);
    setProofImageData(p.proofImageData ?? null);
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
          bankRefNo,
          paymentDate,
          status,
          notes,
          proofImageData,
        },
        staffEmail
      );
      setFeedbackBanner(
        `Updated ledger entry ${getPaymentReceiptNo(editingPayment)}.`
      );
      setEditingPayment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPhysicalReceiptIssued = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuingReceiptPayment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await markPhysicalReceiptIssued(
        issuingReceiptPayment.paymentId,
        physicalReceiptNoInput,
        staffEmail
      );
      setFeedbackBanner(
        `Marked physical receipt as Issued for ${getPaymentReceiptNo(issuingReceiptPayment)}${
          physicalReceiptNoInput.trim() ? ` (Book No: ${physicalReceiptNoInput.trim()})` : ''
        }.`
      );
      setIssuingReceiptPayment(null);
      setPhysicalReceiptNoInput('');
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update physical receipt status.'
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
          paymentType: (PAYMENT_TYPES.includes(p.paymentType as PaymentType)
            ? p.paymentType
            : 'Monthly Rent') as PaymentType,
          amount: p.amount,
          paymentMethod: (PAYMENT_METHODS.includes(p.paymentMethod as PaymentMethod)
            ? p.paymentMethod
            : 'Online Transfer') as PaymentMethod,
          bankRefNo: getPaymentBankRef(p),
          paymentDate: getTodayISO(),
          status: 'Paid',
          notes: p.notes,
        },
        staffEmail
      );
      setFeedbackBanner(
        `Marked ${getPaymentReceiptNo(p)} (${p.studentName} · ${formatRM(p.amount)}) as Paid.`
      );
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to mark payment as Paid.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className={printingPayment ? 'print:hidden space-y-5' : 'space-y-5'}>
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
              Cash / Bank Collected (Excl. Waivers)
            </p>
            <p className="font-display text-xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.cashCollected)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Fee Waivers / Rebates Credited
            </p>
            <p className="font-display text-xl font-bold text-indigo-900 mt-1 font-mono tabular-nums">
              {formatRM(totals.waiversGranted)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Pending &amp; Overdue Entries
            </p>
            <p className="font-display text-xl font-bold text-red-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.pendingOrOverdue)}
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
                placeholder="Search Receipt No., Name, Bank Ref..."
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
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'All' | PaymentType)
              }
              aria-label="Filter payments by type"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
            >
              <option value="All">All Types</option>
              {PAYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
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

            <select
              value={receiptFilter}
              onChange={(e) =>
                setReceiptFilter(e.target.value as 'All' | PhysicalReceiptStatus)
              }
              aria-label="Filter by physical receipt issuance"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
            >
              <option value="All">All Physical Receipts</option>
              <option value="Pending Issuance">Receipt Pending</option>
              <option value="Issued">Receipt Issued</option>
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
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </button>
          </div>
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
                Use &ldquo;Record Payment&rdquo; to log rent, deposit, or fee waiver entries.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Receipt No.</th>
                    <th className="py-3 px-4">Resident</th>
                    <th className="py-3 px-4">Room / Hostel</th>
                    <th className="py-3 px-4">Month &amp; Type</th>
                    <th className="py-3 px-4">Method &amp; Bank Ref</th>
                    <th className="py-3 px-4 text-right">Amount (RM)</th>
                    <th className="py-3 px-4">Ledger &amp; Physical Receipt</th>
                    <th className="py-3 px-4">Recorded By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredPayments.map((p) => {
                    const receiptNo = getPaymentReceiptNo(p);
                    const bankRef = getPaymentBankRef(p);
                    const recordedBy = getPaymentRecordedBy(p);
                    const isWaiver = p.paymentType === 'Rebate / Fee Waiver';
                    const physStatus = getPhysicalReceiptStatus(p);
                    return (
                      <tr key={p.paymentId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-900 whitespace-nowrap">
                          {receiptNo}
                        </td>
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
                          <p
                            className={`text-xs whitespace-nowrap ${
                              isWaiver ? 'text-indigo-800 font-medium' : 'text-slate-500'
                            }`}
                          >
                            {p.paymentType}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs text-slate-800 whitespace-nowrap">
                            {p.paymentMethod}
                          </p>
                          <p className="text-xs font-mono text-slate-500">
                            {bankRef || 'No bank ref'} · {p.paymentDate}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatRM(p.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={p.status} />
                              <StatusBadge
                                status={
                                  physStatus === 'Issued'
                                    ? 'Receipt Issued'
                                    : 'Receipt Pending'
                                }
                              />
                            </div>
                            {p.physicalReceiptNo && (
                              <span className="text-xs font-mono text-slate-500">
                                Book: {p.physicalReceiptNo}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs text-slate-700 truncate max-w-[140px]">
                            {recordedBy}
                          </p>
                          <p className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                            {formatTimestamp(p.recordedAt || p.updatedAt)}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {p.proofImageData && (
                              <button
                                type="button"
                                onClick={() => setViewingProofPayment(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                                title="View uploaded payment proof image"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>View Proof</span>
                              </button>
                            )}
                            {physStatus === 'Pending Issuance' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormError(null);
                                  setIssuingReceiptPayment(p);
                                  setPhysicalReceiptNoInput(p.physicalReceiptNo || '');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md cursor-pointer"
                              >
                                <FileCheck2 className="w-3 h-3" />
                                <span>Mark Receipt Issued</span>
                              </button>
                            )}
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
                              onClick={() => setPrintingPayment(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-900 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md cursor-pointer"
                              title="Open printable Official Receipt"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print Receipt</span>
                            </button>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto print:hidden">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Record Hostel Transaction
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
                Register at least one resident in the Students tab before recording payments.
              </div>
            ) : (
              <form onSubmit={handleRecordPayment} className="space-y-4">
                {/* AI Proof of Payment Upload & Scanner */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Sparkles className="w-3.5 h-3.5 text-blue-900" />
                      <span>Upload Proof of Payment (AI Auto-Fill)</span>
                    </span>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 rounded-md cursor-pointer whitespace-nowrap">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{proofImageData ? 'Replace Slip' : 'Upload Slip Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={scanningProof}
                        onChange={(e) => void handleProofFileSelected(e, true)}
                      />
                    </label>
                  </div>

                  {scanningProof && (
                    <div className="flex items-center gap-2 text-xs text-blue-900 font-medium py-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Compressing slip &amp; extracting receipt details with AI...</span>
                    </div>
                  )}

                  {aiScanInfo && (
                    <div
                      className={`p-2.5 rounded-md border text-xs ${
                        aiScanInfo.status === 'verified'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      {aiScanInfo.message}
                    </div>
                  )}

                  {proofImageData && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={proofImageData}
                          alt="Uploaded payment proof preview"
                          className="w-12 h-12 object-cover rounded border border-slate-200 bg-white shrink-0"
                        />
                        <div className="text-xs text-slate-600 min-w-0">
                          <p className="font-medium text-slate-800">
                            Compressed JPEG attached
                          </p>
                          <p className="truncate text-slate-500">
                            Saved securely with ledger record
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProofImageData(null);
                          setAiScanInfo(null);
                        }}
                        className="text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Resident
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
                      onChange={(e) =>
                        handlePaymentTypeChange(e.target.value as PaymentType)
                      }
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

                {paymentType === 'Rebate / Fee Waiver' && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                    One-time waiver credits the resident&apos;s rent balance without adding to Cash/Bank collected totals.
                  </div>
                )}

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

                {installmentPreview && (
                  <div
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      installmentPreview.isFullSettlement
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {installmentPreview.remainingBeforeEntry <= 0.009
                          ? `${billingMonth} Already Settled`
                          : installmentPreview.isFullSettlement
                            ? `Full Settlement for ${billingMonth}`
                            : `Partial / Installment Payment (${formatRM(installmentPreview.remainingAfterEntry)} remaining)`}
                      </span>
                      <span className="font-mono tabular-nums">
                        Target: {formatRM(installmentPreview.monthTargetCharge)}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 tabular-nums">
                      Prior credited for {billingMonth}:{' '}
                      <strong className="font-mono">
                        {formatRM(installmentPreview.alreadyCreditedForMonth)}
                      </strong>{' '}
                      ({installmentPreview.existingInstallmentsCount} prior{' '}
                      {installmentPreview.existingInstallmentsCount === 1
                        ? 'entry'
                        : 'entries'}
                      )
                    </p>
                  </div>
                )}

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
                      Transaction Date
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
                    Bank Reference No.
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={bankRefNo}
                    onChange={(e) => setBankRefNo(e.target.value)}
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
                    placeholder="Optional receipt notes or waiver justification"
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
                    {submitting ? 'Recording...' : 'Issue Receipt & Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto print:hidden">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Edit Transaction · {getPaymentReceiptNo(editingPayment)}
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
                    Transaction Date
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
                  Bank Reference No.
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={bankRefNo}
                  onChange={(e) => setBankRefNo(e.target.value)}
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

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600">
                  {proofImageData ? 'Payment proof image attached' : 'No payment proof attached'}
                </span>
                <div className="flex items-center gap-2">
                  {proofImageData && (
                    <button
                      type="button"
                      onClick={() => setProofImageData(null)}
                      className="text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                  <label className="px-2.5 py-1 text-xs font-semibold text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 rounded-md cursor-pointer whitespace-nowrap">
                    <span>{proofImageData ? 'Replace Image' : 'Attach Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={scanningProof}
                      onChange={(e) => void handleProofFileSelected(e, false)}
                    />
                  </label>
                </div>
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

      {/* View Proof Lightbox Modal */}
      {viewingProofPayment && viewingProofPayment.proofImageData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto print:hidden">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-5 space-y-4 my-8">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Payment Proof · {getPaymentReceiptNo(viewingProofPayment)}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {viewingProofPayment.studentName} ({viewingProofPayment.roomId}) ·{' '}
                  {formatRM(viewingProofPayment.amount)} ·{' '}
                  {getPaymentBankRef(viewingProofPayment) || viewingProofPayment.paymentMethod}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingProofPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close proof preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-100 rounded-lg p-3 flex items-center justify-center max-h-[70vh] overflow-auto">
              <img
                src={viewingProofPayment.proofImageData}
                alt={`Payment proof for ${getPaymentReceiptNo(viewingProofPayment)}`}
                className="max-w-full max-h-[65vh] object-contain rounded"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setViewingProofPayment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Physical Receipt Issued Modal */}
      {issuingReceiptPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto print:hidden">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Mark Physical Receipt Issued
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {getPaymentReceiptNo(issuingReceiptPayment)} · {issuingReceiptPayment.studentName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIssuingReceiptPayment(null)}
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

            <form onSubmit={handleConfirmPhysicalReceiptIssued} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Physical Receipt Book No. (Optional)
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={physicalReceiptNoInput}
                  onChange={(e) => setPhysicalReceiptNoInput(e.target.value)}
                  placeholder="e.g. BK-DJ2-0148"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Confirm that the hardcopy GIS official receipt has been written and handed to the resident.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIssuingReceiptPayment(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Confirm Receipt Issued'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Official Receipt Modal */}
      {printingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto print:static print:bg-white print:p-0 print:block">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-8 space-y-6 my-8 print:my-0 print:border-0 print:rounded-none print:max-w-none print:p-6">
            {/* Modal Action Bar (hidden when printing) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Official Receipt Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingPayment(null)}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Institutional Receipt Sheet */}
            <div className="space-y-6 text-slate-900">
              <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight text-slate-900">
                      GLOBAL INSTITUTE OF STUDIES (GIS) NILAI
                    </h2>
                    <p className="text-xs text-slate-600">
                      Hostel Management &amp; Student Finance Office · Nilai, Negeri Sembilan
                    </p>
                    <p className="text-xs text-slate-500">
                      Properties: Apartment Desa Jati 2 · Nilai Square
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-900">
                    {printingPayment.paymentType === 'Rebate / Fee Waiver'
                      ? 'Official Waiver Credit Note'
                      : 'Official Payment Receipt'}
                  </p>
                  <p className="font-mono text-sm font-bold text-slate-900 mt-1">
                    {getPaymentReceiptNo(printingPayment)}
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Date: {printingPayment.paymentDate}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 text-xs">
                <div className="space-y-1.5">
                  <p className="font-semibold uppercase tracking-wider text-slate-500">
                    Received From / Resident
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {printingPayment.studentName}
                  </p>
                  <p className="font-mono text-slate-700">
                    ID: {printingPayment.studentId}
                  </p>
                  <p className="text-slate-700">
                    Hostel: {printingPayment.hostelLocation}
                  </p>
                  <p className="font-mono text-slate-700">
                    Room / Bed: {printingPayment.roomId}
                  </p>
                </div>
                <div className="space-y-1.5 text-right">
                  <p className="font-semibold uppercase tracking-wider text-slate-500">
                    Transaction Metadata
                  </p>
                  <p className="text-slate-700">
                    Billing Month:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {printingPayment.billingMonth}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    Method:{' '}
                    <span className="font-medium text-slate-900">
                      {printingPayment.paymentMethod}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    Bank Ref:{' '}
                    <span className="font-mono text-slate-900">
                      {getPaymentBankRef(printingPayment) || '—'}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    Ledger Status:{' '}
                    <span className="font-semibold text-slate-900">
                      {printingPayment.status}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    Physical Receipt:{' '}
                    <span className="font-mono text-slate-900">
                      {getPhysicalReceiptStatus(printingPayment)}
                      {printingPayment.physicalReceiptNo
                        ? ` (${printingPayment.physicalReceiptNo})`
                        : ''}
                    </span>
                  </p>
                </div>
              </div>

              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-4">Item Description</th>
                    <th className="py-2.5 px-4">Billing Period</th>
                    <th className="py-2.5 px-4 text-right">Amount (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">
                        {printingPayment.paymentType}
                      </p>
                      {printingPayment.notes && (
                        <p className="text-slate-600 mt-0.5">
                          {printingPayment.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {printingPayment.billingMonth}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatRM(printingPayment.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-xs text-slate-600">
                  {isCashPaymentType(printingPayment.paymentType) ? (
                    <span>
                      Cash / Bank Settlement Amount ({printingPayment.paymentMethod})
                    </span>
                  ) : (
                    <span>
                      Non-cash internal rebate / fee waiver applied to rent balance (excluded from cash collection totals).
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Total Cash Received
                  </p>
                  <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {isCashPaymentType(printingPayment.paymentType) &&
                    printingPayment.status === 'Paid'
                      ? formatRM(printingPayment.amount)
                      : formatRM(0)}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <div>
                  <p>
                    Recorded By:{' '}
                    <span className="font-medium text-slate-700">
                      {getPaymentRecordedBy(printingPayment)}
                    </span>
                  </p>
                  <p className="tabular-nums">
                    Timestamp:{' '}
                    {formatTimestamp(
                      printingPayment.recordedAt || printingPayment.updatedAt
                    )}
                  </p>
                </div>
                <p className="italic text-slate-400">
                  Computer-generated official receipt · GIS Nilai Hostel System
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        importType="payments"
        rooms={[]}
        students={students}
        payments={payments}
        staffEmail={staffEmail}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(msg) => setFeedbackBanner(msg)}
      />
    </div>
  );
}
