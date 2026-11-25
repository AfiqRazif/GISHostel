import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Trash2,
  Upload,
  UserCheck,
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
  getRentRefundWaivedAmount,
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
  StaffRole,
  Student,
} from '../types/hostel';
import {
  createPayment,
  deletePayment,
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
  staffRole: StaffRole;
  loading: boolean;
  prefillRequest?: PaymentPrefillRequest | null;
}

export function PaymentsTab({
  payments,
  students,
  staffEmail,
  staffRole,
  loading,
  prefillRequest,
}: PaymentsTabProps) {
  const isMasterAdmin = staffRole === 'Master Admin';
  const isViewer = staffRole === 'Viewer';
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
  const [residentSearchQuery, setResidentSearchQuery] = useState('');
  const [residentDropdownOpen, setResidentDropdownOpen] = useState(false);
  const residentSearchInputRef = useRef<HTMLInputElement | null>(null);
  const residentComboboxRef = useRef<HTMLDivElement | null>(null);
  const [billingMonth, setBillingMonth] = useState(getCurrentMonthISO());
  const [paymentType, setPaymentType] = useState<PaymentType>('Monthly Rent');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('DuitNow QR');
  const [bankRefNo, setBankRefNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [status, setStatus] = useState<PaymentStatus>('Paid');
  const [notes, setNotes] = useState('');
  const [applyLeniencyWaiver, setApplyLeniencyWaiver] = useState(true);
  const [proofImageData, setProofImageData] = useState<string | null>(null);
  const [scanningProof, setScanningProof] = useState(false);
  const [aiScanInfo, setAiScanInfo] = useState<{
    status: 'verified' | 'warning';
    payerName?: string;
    message: string;
  } | null>(null);

  // Edit Payment modal
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPhysStatus, setEditPhysStatus] =
    useState<PhysicalReceiptStatus>('Pending Issuance');
  const [editPhysNo, setEditPhysNo] = useState('');

  // Delete Payment modal
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);

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

  const studentBillingMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateResidentBilling>>();
    for (const s of sortedStudents) {
      map.set(s.studentId, calculateResidentBilling(s, payments));
    }
    return map;
  }, [sortedStudents, payments]);

  const filteredResidentsForModal = useMemo(() => {
    const q = residentSearchQuery.trim().toLowerCase();
    if (!q) return sortedStudents;
    return sortedStudents.filter((s) => {
      const name = s.fullName.toLowerCase();
      const id = s.studentId.toLowerCase();
      const ic = (s.icNumber || '').toLowerCase();
      const room = (s.assignedRoomId || 'unassigned').toLowerCase();
      return (
        name.includes(q) ||
        id.includes(q) ||
        ic.includes(q) ||
        room.includes(q)
      );
    });
  }, [sortedStudents, residentSearchQuery]);

  useEffect(() => {
    if (!showAddModal || selectedStudentId) return;
    const timer = window.setTimeout(() => {
      residentSearchInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [showAddModal, selectedStudentId]);

  useEffect(() => {
    if (!residentDropdownOpen) return;
    const handleMouseDownOutside = (e: MouseEvent) => {
      if (
        residentComboboxRef.current &&
        !residentComboboxRef.current.contains(e.target as Node)
      ) {
        setResidentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDownOutside);
    return () => document.removeEventListener('mousedown', handleMouseDownOutside);
  }, [residentDropdownOpen]);

  useEffect(() => {
    if (!prefillRequest) return;
    const st = students.find((s) => s.studentId === prefillRequest.studentId);
    setFormError(null);
    setEditingPayment(null);
    setPrintingPayment(null);
    setSelectedStudentId(prefillRequest.studentId);
    setResidentSearchQuery('');
    setResidentDropdownOpen(false);
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
    setApplyLeniencyWaiver(true);
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
    const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
    const grossRentCollected = round2(
      filteredPayments
        .filter((p) => p.status === 'Paid' && p.paymentType === 'Monthly Rent')
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const rentRefundsTotal = round2(
      filteredPayments
        .filter((p) => p.status === 'Paid' && p.paymentType === 'Rent Refund')
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const monthlyRentCollected = Math.max(
      0,
      round2(grossRentCollected - rentRefundsTotal)
    );

    const q = searchQuery.trim().toLowerCase();
    const scopedStudents = students
      .filter((s) =>
        locationFilter === 'All' ? true : s.hostelLocation === locationFilter
      )
      .filter((s) => {
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q) ||
          (s.assignedRoomId || '').toLowerCase().includes(q)
        );
      });

    let refundableDepositsHeld = 0;
    let forfeitedDeposits = 0;
    let refundedDeposits = 0;

    for (const s of scopedStudents) {
      const billing =
        studentBillingMap.get(s.studentId) ||
        calculateResidentBilling(s, payments);
      if (billing.depositDisposition === 'Forfeited') {
        forfeitedDeposits += billing.depositPaid;
      } else if (billing.depositDisposition === 'Refunded') {
        refundedDeposits += billing.depositPaid;
      } else {
        refundableDepositsHeld += billing.depositPaid;
      }
    }

    refundableDepositsHeld = round2(refundableDepositsHeld);
    forfeitedDeposits = round2(forfeitedDeposits);
    refundedDeposits = round2(refundedDeposits);

    const registrationFeesCollected = round2(
      filteredPayments
        .filter((p) => p.status === 'Paid' && p.paymentType === 'Registration Fee')
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const waiversGranted = round2(
      filteredPayments
        .filter(
          (p) =>
            p.paymentType === 'Rebate / Fee Waiver' &&
            (p.status === 'Paid' || p.status === 'Waived')
        )
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const pendingOrOverdue = round2(
      filteredPayments
        .filter((p) => p.status === 'Pending' || p.status === 'Overdue')
        .reduce((sum, p) => sum + p.amount, 0)
    );
    const nonRefundableGisFunds = round2(
      registrationFeesCollected + forfeitedDeposits
    );

    return {
      grossRentCollected,
      rentRefundsTotal,
      monthlyRentCollected,
      refundableDepositsHeld,
      forfeitedDeposits,
      refundedDeposits,
      registrationFeesCollected,
      nonRefundableGisFunds,
      waiversGranted,
      pendingOrOverdue,
    };
  }, [
    filteredPayments,
    students,
    studentBillingMap,
    payments,
    locationFilter,
    searchQuery,
  ]);

  const handleOpenAddModal = () => {
    setFormError(null);
    setSelectedStudentId('');
    setResidentSearchQuery('');
    setResidentDropdownOpen(true);
    setBillingMonth(getCurrentMonthISO());
    setPaymentType('Monthly Rent');
    setAmount('');
    setPaymentMethod('DuitNow QR');
    setBankRefNo('');
    setPaymentDate(getTodayISO());
    setStatus('Paid');
    setNotes('');
    setApplyLeniencyWaiver(true);
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

  const getSuggestedAmountForResident = (
    st: Student,
    targetType: PaymentType
  ): string | null => {
    const billing =
      studentBillingMap.get(st.studentId) || calculateResidentBilling(st, payments);
    if (targetType === 'Monthly Rent' || targetType === 'Rent Refund') {
      return billing.effectiveMonthlyFee > 0
        ? String(billing.effectiveMonthlyFee)
        : '';
    }
    if (targetType === 'Deposit') {
      const remaining = Math.max(
        0,
        Math.round((billing.expectedDeposit - billing.depositPaid) * 100) / 100
      );
      return String(remaining);
    }
    if (targetType === 'Registration Fee') {
      const remaining = Math.max(
        0,
        Math.round(
          (billing.expectedRegistrationFee - billing.registrationFeePaid) * 100
        ) / 100
      );
      return String(remaining);
    }
    if (targetType === 'Deposit Refund') {
      return billing.depositPaid > 0 ? String(billing.depositPaid) : '';
    }
    return null;
  };

  const handleSelectResident = (st: Student) => {
    setSelectedStudentId(st.studentId);
    setResidentSearchQuery('');
    setResidentDropdownOpen(false);
    setFormError(null);
    const suggested = getSuggestedAmountForResident(st, paymentType);
    if (suggested !== null) {
      setAmount(suggested);
    }
  };

  const handleClearSelectedResident = () => {
    setSelectedStudentId('');
    setResidentSearchQuery('');
    setResidentDropdownOpen(true);
    window.requestAnimationFrame(() => {
      residentSearchInputRef.current?.focus();
    });
  };

  const handlePaymentTypeChange = (nextType: PaymentType) => {
    setPaymentType(nextType);
    if (nextType === 'Rent Refund') {
      setApplyLeniencyWaiver(true);
    }
    const st = students.find((s) => s.studentId === selectedStudentId);
    if (nextType === 'Rebate / Fee Waiver') {
      setPaymentMethod('Internal Adjustment');
      setStatus('Waived');
      return;
    }

    if (paymentMethod === 'Internal Adjustment') {
      setPaymentMethod('DuitNow QR');
    }
    if (status === 'Waived') {
      setStatus('Paid');
    }

    if (!st) return;
    const suggested = getSuggestedAmountForResident(st, nextType);
    if (suggested !== null) {
      setAmount(suggested);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = students.find((s) => s.studentId === selectedStudentId);
    if (!st) {
      setFormError('Please search and select a registered resident first.');
      setResidentDropdownOpen(true);
      residentSearchInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const parsedAmount = Number(amount);
      const result = await createPayment(
        {
          student: st,
          billingMonth,
          paymentType,
          amount: parsedAmount,
          waivedAmount:
            paymentType === 'Rent Refund' && applyLeniencyWaiver ? parsedAmount : 0,
          applyLeniencyWaiver:
            paymentType === 'Rent Refund' ? applyLeniencyWaiver : false,
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
        `Recorded ${result.receiptNo} · ${formatRM(parsedAmount)} (${paymentType}) for ${st.fullName}.`
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
    setApplyLeniencyWaiver(
      typeof p.applyLeniencyWaiver === 'boolean'
        ? p.applyLeniencyWaiver
        : getRentRefundWaivedAmount(p) > 0
    );
    setProofImageData(p.proofImageData ?? null);
    setEditPhysStatus(getPhysicalReceiptStatus(p));
    setEditPhysNo(p.physicalReceiptNo || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const parsedAmount = Number(amount);
      await updatePayment(
        editingPayment.paymentId,
        {
          billingMonth,
          paymentType,
          amount: parsedAmount,
          waivedAmount:
            paymentType === 'Rent Refund' && applyLeniencyWaiver ? parsedAmount : 0,
          applyLeniencyWaiver:
            paymentType === 'Rent Refund' ? applyLeniencyWaiver : false,
          paymentMethod,
          bankRefNo,
          paymentDate,
          status,
          notes,
          proofImageData,
          physicalReceiptStatus: editPhysStatus,
          physicalReceiptNo: editPhysNo,
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

  const handleConfirmDeletePayment = async () => {
    if (!deletingPayment) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await deletePayment(deletingPayment.paymentId, staffEmail);
      setFeedbackBanner(
        `Deleted payment ${getPaymentReceiptNo(deletingPayment)} (${deletingPayment.studentName} · ${formatRM(deletingPayment.amount)}).`
      );
      setDeletingPayment(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to delete payment.'
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
          waivedAmount:
            p.paymentType === 'Rent Refund' ? getRentRefundWaivedAmount(p) : 0,
          applyLeniencyWaiver:
            p.paymentType === 'Rent Refund'
              ? typeof p.applyLeniencyWaiver === 'boolean'
                ? p.applyLeniencyWaiver
                : getRentRefundWaivedAmount(p) > 0
              : false,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Monthly Rent Collected (Net)
            </p>
            <p className="font-display text-xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.monthlyRentCollected)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
              {totals.rentRefundsTotal > 0
                ? `Gross ${formatRM(totals.grossRentCollected)} − ${formatRM(totals.rentRefundsTotal)} refunded`
                : 'Settled rent receipts'}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Registration Fees Collected
            </p>
            <p className="font-display text-xl font-bold text-teal-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.registrationFeesCollected)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Non-refundable reg. receipts
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Fee Waivers / Rebates
            </p>
            <p className="font-display text-xl font-bold text-indigo-900 mt-1 font-mono tabular-nums">
              {formatRM(totals.waiversGranted)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Internal rent adjustments
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Pending &amp; Overdue Entries
            </p>
            <p className="font-display text-xl font-bold text-red-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.pendingOrOverdue)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Awaiting settlement
            </p>
          </div>

          <div className="bg-white border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-900">
              Refundable Deposits Held (Liability)
            </p>
            <p className="font-display text-xl font-bold text-blue-900 mt-1 font-mono tabular-nums">
              {formatRM(totals.refundableDepositsHeld)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Refundable upon resident checkout
            </p>
          </div>
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-medium text-amber-900">
              Forfeited Deposits (Usable by GIS)
            </p>
            <p className="font-display text-xl font-bold text-amber-800 mt-1 font-mono tabular-nums">
              {formatRM(totals.forfeitedDeposits)}
            </p>
            <p className="text-[11px] text-amber-800/80 mt-0.5">
              Rejected refunds retained as GIS fund
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">
              Refunded Deposits (Returned)
            </p>
            <p className="font-display text-xl font-bold text-slate-700 mt-1 font-mono tabular-nums">
              {formatRM(totals.refundedDeposits)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Returned to checked-out residents
            </p>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-emerald-900">
              Total Non-Refundable Funds (GIS Usable)
            </p>
            <p className="font-display text-xl font-bold text-emerald-800 mt-1 font-mono tabular-nums">
              {formatRM(totals.nonRefundableGisFunds)}
            </p>
            <p className="text-[11px] text-emerald-800/80 mt-0.5">
              Reg. Fees + Forfeited Deposits
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
                  {t === 'Registration/Deposit'
                    ? 'Registration/Deposit (Legacy)'
                    : t}
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

          {!isViewer && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start xl:self-auto">
              {isMasterAdmin && (
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Import Excel / CSV</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            </div>
          )}
        </div>

        {/* Ledger Table */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
            Loading hostel payment ledger...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-900">
              No payment records match the current filter.
            </p>
            <p className="text-xs text-slate-500">
              Use &ldquo;Record Payment&rdquo; to log rent, deposit, or fee waiver entries.
            </p>
          </div>
        ) : (
          <div className="max-h-[72vh] overflow-auto border border-slate-200 rounded-lg bg-white">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]">
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 sticky left-0 top-0 z-30 bg-slate-50 whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] border-r border-slate-200">
                    Receipt No.
                  </th>
                  <th className="py-3 px-4 min-w-[170px] whitespace-nowrap">
                    Resident
                  </th>
                  <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                    Room / Hostel
                  </th>
                  <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                    Month &amp; Type
                  </th>
                  <th className="py-3 px-4 min-w-[170px] whitespace-nowrap">
                    Method &amp; Bank Ref
                  </th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">
                    Amount (RM)
                  </th>
                  <th className="py-3 px-4 min-w-[190px] whitespace-nowrap">
                    Ledger &amp; Physical Receipt
                  </th>
                  <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                    Recorded By
                  </th>
                  <th className="py-3 px-4 text-right sticky right-0 top-0 z-30 bg-slate-50 whitespace-nowrap shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] border-l border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredPayments.map((p) => {
                  const receiptNo = getPaymentReceiptNo(p);
                  const bankRef = getPaymentBankRef(p);
                  const recordedBy = getPaymentRecordedBy(p);
                  const isWaiver = p.paymentType === 'Rebate / Fee Waiver';
                  const isRentRefund = p.paymentType === 'Rent Refund';
                  const isDepositRefund = p.paymentType === 'Deposit Refund';
                  const rentRefundWaived = isRentRefund
                    ? getRentRefundWaivedAmount(p)
                    : 0;
                  const physStatus = getPhysicalReceiptStatus(p);
                  return (
                    <tr key={p.paymentId} className="group hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-900 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] border-r border-slate-100">
                        {receiptNo}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 whitespace-nowrap">
                          {p.studentName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 whitespace-nowrap">
                          {p.studentId}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {p.roomId || 'Room Unassigned'}
                        </p>
                        <p className="text-xs text-slate-500 whitespace-nowrap">
                          {p.hostelLocation || 'Unassigned'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {p.billingMonth}
                        </p>
                        <p
                          className={`text-xs whitespace-nowrap ${
                            isRentRefund
                              ? 'text-rose-700 font-semibold'
                              : isDepositRefund
                                ? 'text-teal-800 font-semibold'
                                : isWaiver
                                  ? 'text-indigo-800 font-medium'
                                  : p.paymentType === 'Deposit'
                                    ? 'text-blue-800 font-medium'
                                    : p.paymentType === 'Registration Fee'
                                      ? 'text-teal-800 font-medium'
                                      : 'text-slate-500'
                          }`}
                        >
                          {p.paymentType}
                        </p>
                        {isRentRefund && rentRefundWaived > 0 && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[10px] font-medium text-rose-800 whitespace-nowrap">
                            Leniency Waiver: {formatRM(rentRefundWaived)}
                          </span>
                        )}
                        {isDepositRefund && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[10px] font-medium text-teal-800 whitespace-nowrap">
                            Non-Rent
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs text-slate-800 whitespace-nowrap">
                          {p.paymentMethod}
                        </p>
                        <p className="text-xs font-mono text-slate-500 whitespace-nowrap">
                          {bankRef || 'No bank ref'} · {p.paymentDate}
                        </p>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                          isRentRefund
                            ? 'text-rose-700'
                            : isDepositRefund
                              ? 'text-teal-800'
                              : 'text-slate-900'
                        }`}
                      >
                        {isRentRefund || isDepositRefund
                          ? `-${formatRM(p.amount)}`
                          : formatRM(p.amount)}
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
                            <span className="text-xs font-mono text-slate-500 whitespace-nowrap">
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
                      <td className="py-3 px-4 text-right whitespace-nowrap sticky right-0 z-10 bg-white group-hover:bg-slate-50 shadow-[-4px_0_8px_-4px_rgba(15,23,42,0.08)] border-l border-slate-100">
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
                          {!isViewer && physStatus === 'Pending Issuance' && (
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
                          {!isViewer && (p.status === 'Pending' || p.status === 'Overdue') && (
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
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          {!isViewer && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormError(null);
                                setDeletingPayment(p);
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                              title="Delete payment entry"
                              aria-label={`Delete ${receiptNo}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
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

            {students.length === 0 ? (
              <>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
                  <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    Register at least one resident in the Students tab before recording payments.
                  </div>
                </div>
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={handleRecordPayment}
                className="flex flex-col flex-1 min-h-0 overflow-hidden"
              >
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                  {formError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                      {formError}
                    </div>
                  )}

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
                      Resident <span className="text-red-600">*</span>
                    </label>

                    {activeModalStudent ? (
                      (() => {
                        const selBilling =
                          studentBillingMap.get(activeModalStudent.studentId) ||
                          calculateResidentBilling(activeModalStudent, payments);
                        const depRemaining = Math.max(
                          0,
                          Math.round(
                            (selBilling.expectedDeposit - selBilling.depositPaid) *
                              100
                          ) / 100
                        );
                        const regRemaining = Math.max(
                          0,
                          Math.round(
                            (selBilling.expectedRegistrationFee -
                              selBilling.registrationFeePaid) *
                              100
                          ) / 100
                        );

                        return (
                          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                                  <UserCheck className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                      {activeModalStudent.fullName}
                                    </p>
                                    <span
                                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                                        activeModalStudent.status === 'Active'
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : activeModalStudent.status === 'Checked-Out'
                                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                                            : 'bg-red-50 text-red-700 border-red-200'
                                      }`}
                                    >
                                      {activeModalStudent.status}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600 font-mono mt-0.5">
                                    {activeModalStudent.studentId}
                                    {activeModalStudent.icNumber
                                      ? ` · IC: ${activeModalStudent.icNumber}`
                                      : ''}{' '}
                                    ·{' '}
                                    <span className="font-semibold text-blue-900">
                                      {activeModalStudent.assignedRoomId || 'Unassigned'}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={handleClearSelectedResident}
                                className="px-2.5 py-1 text-xs font-semibold text-blue-900 bg-white border border-blue-200 hover:bg-blue-50 rounded-md transition-colors cursor-pointer shrink-0"
                              >
                                Change
                              </button>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-200/70 text-xs">
                              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-blue-100">
                                <p className="text-[10px] font-medium text-slate-500 uppercase">
                                  Monthly Rate
                                </p>
                                <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                                  {formatRM(selBilling.effectiveMonthlyFee)}
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-blue-100">
                                <p className="text-[10px] font-medium text-slate-500 uppercase">
                                  Rent O/S
                                </p>
                                <p
                                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                                    selBilling.outstandingBalance > 0.009
                                      ? 'text-red-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {formatRM(selBilling.outstandingBalance)}
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-blue-100">
                                <p className="text-[10px] font-medium text-slate-500 uppercase">
                                  Deposit O/S
                                </p>
                                <p
                                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                                    depRemaining > 0.009
                                      ? 'text-amber-800'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {formatRM(depRemaining)}
                                </p>
                              </div>
                              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-blue-100">
                                <p className="text-[10px] font-medium text-slate-500 uppercase">
                                  Reg. Fee O/S
                                </p>
                                <p
                                  className={`font-mono font-semibold tabular-nums mt-0.5 ${
                                    regRemaining > 0.009
                                      ? 'text-amber-800'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {formatRM(regRemaining)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div ref={residentComboboxRef} className="relative z-30">
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            ref={residentSearchInputRef}
                            type="text"
                            value={residentSearchQuery}
                            onFocus={() => setResidentDropdownOpen(true)}
                            onChange={(e) => {
                              setResidentSearchQuery(e.target.value);
                              setResidentDropdownOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setResidentDropdownOpen(false);
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredResidentsForModal.length > 0) {
                                  handleSelectResident(filteredResidentsForModal[0]);
                                }
                              }
                            }}
                            placeholder="Search resident by name, Student ID, IC, or room (e.g. 5A-2-17)..."
                            aria-label="Search resident by name, Student ID, IC, or room"
                            aria-expanded={residentDropdownOpen}
                            autoComplete="off"
                            className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-900/10"
                          />
                          {residentSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setResidentSearchQuery('');
                                setResidentDropdownOpen(true);
                                residentSearchInputRef.current?.focus();
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                              aria-label="Clear resident search"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {residentDropdownOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                            {filteredResidentsForModal.length === 0 ? (
                              <div className="px-4 py-5 text-center text-xs text-slate-500">
                                No matching residents found for &ldquo;{residentSearchQuery}&rdquo;.
                              </div>
                            ) : (
                              filteredResidentsForModal.map((s) => {
                                const b =
                                  studentBillingMap.get(s.studentId) ||
                                  calculateResidentBilling(s, payments);
                                const depOS = Math.max(
                                  0,
                                  Math.round((b.expectedDeposit - b.depositPaid) * 100) /
                                    100
                                );
                                const regOS = Math.max(
                                  0,
                                  Math.round(
                                    (b.expectedRegistrationFee - b.registrationFeePaid) *
                                      100
                                  ) / 100
                                );

                                return (
                                  <button
                                    key={s.studentId}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelectResident(s)}
                                    className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm font-semibold text-slate-900 truncate">
                                          {s.fullName}
                                        </span>
                                        <span className="text-xs font-mono text-slate-500">
                                          {s.studentId}
                                        </span>
                                        {s.icNumber && (
                                          <span className="text-[11px] font-mono text-slate-400">
                                            · {s.icNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">
                                          {s.assignedRoomId || 'Unassigned'}
                                        </span>
                                        <span
                                          className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                                            s.status === 'Active'
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                              : s.status === 'Checked-Out'
                                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                                : 'bg-red-50 text-red-700 border-red-200'
                                          }`}
                                        >
                                          {s.status}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0 font-mono text-[11px] tabular-nums space-y-0.5">
                                      <div
                                        className={
                                          b.outstandingBalance > 0.009
                                            ? 'font-semibold text-red-700'
                                            : 'text-slate-500'
                                        }
                                      >
                                        Rent O/S: {formatRM(b.outstandingBalance)}
                                      </div>
                                      <div className="text-[10px] flex items-center justify-end gap-2">
                                        <span
                                          className={
                                            depOS > 0.009
                                              ? 'font-semibold text-amber-800'
                                              : 'text-slate-400'
                                          }
                                        >
                                          Dep. O/S: {formatRM(depOS)}
                                        </span>
                                        <span
                                          className={
                                            regOS > 0.009
                                              ? 'font-semibold text-amber-800'
                                              : 'text-slate-400'
                                          }
                                        >
                                          Reg. O/S: {formatRM(regOS)}
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {paymentType === 'Rent Refund' ||
                        paymentType === 'Deposit Refund'
                          ? 'Refunded Month (YYYY-MM)'
                          : 'Billing Month'}
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
                            {t === 'Registration/Deposit'
                              ? 'Registration/Deposit (Legacy)'
                              : t}
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

                  {paymentType === 'Rent Refund' && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-2 text-xs text-rose-900">
                      <p className="font-medium">
                        Management-approved Monthly Rent Refund deducts the refunded amount from collected rent totals and monthly reports.
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyLeniencyWaiver}
                          onChange={(e) => setApplyLeniencyWaiver(e.target.checked)}
                          className="mt-0.5 rounded border-rose-300 text-blue-900 focus:ring-blue-900"
                        />
                        <span>
                          <strong>Apply Leniency Waiver</strong> (Reduce student&apos;s expected rent by refunded amount so they are not flagged as overdue)
                        </span>
                      </label>
                    </div>
                  )}

                  {(paymentType === 'Deposit' ||
                    paymentType === 'Registration Fee') && (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                      Settled <strong>{paymentType}</strong> receipts automatically update the resident&apos;s upfront fee balance without counting toward Monthly Rent arrears.
                    </div>
                  )}

                  {paymentType === 'Deposit Refund' && (
                    <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
                      Deposit Refund records the return of security deposit and does not alter Monthly Rent Paid or Rent Outstanding Balance.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        {paymentType === 'Rent Refund' ||
                        paymentType === 'Deposit Refund'
                          ? 'Refund Amount (RM)'
                          : 'Amount (RM)'}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        {paymentType === 'Rent Refund' ||
                        paymentType === 'Deposit Refund'
                          ? 'Refund Date'
                          : 'Transaction Date'}
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
                      {paymentType === 'Rent Refund' ||
                      paymentType === 'Deposit Refund'
                        ? 'Voucher / Reference No.'
                        : 'Bank Reference No.'}
                    </label>
                    <input
                      type="text"
                      maxLength={64}
                      value={bankRefNo}
                      onChange={(e) => setBankRefNo(e.target.value)}
                      placeholder={
                        paymentType === 'Rent Refund'
                          ? 'e.g. PV-REFUND-202611'
                          : paymentType === 'Deposit Refund'
                            ? 'e.g. PV-DEP-202611'
                            : 'e.g. DUITNOW-20261118-01'
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {paymentType === 'Rent Refund'
                        ? 'Management Approval Notes'
                        : paymentType === 'Deposit Refund'
                          ? 'Refund / Voucher Notes'
                          : 'Remarks / Notes'}
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={
                        paymentType === 'Rent Refund'
                          ? 'e.g. Early checkout pro-rata refund approved by Management'
                          : paymentType === 'Deposit Refund'
                            ? 'e.g. Security deposit refunded via bank transfer upon check-out'
                            : 'Optional receipt notes or waiver justification'
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                {/* Pinned Footer */}
                <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
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
                    {submitting
                      ? 'Recording...'
                      : paymentType === 'Rent Refund'
                        ? 'Record Rent Refund'
                        : paymentType === 'Deposit Refund'
                          ? 'Record Deposit Refund'
                          : 'Issue Receipt & Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            {/* Pinned Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
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

            <form
              onSubmit={handleSaveEdit}
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
                      {paymentType === 'Rent Refund' ||
                      paymentType === 'Deposit Refund'
                        ? 'Refunded Month (YYYY-MM)'
                        : 'Billing Month'}
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
                      onChange={(e) => {
                        const next = e.target.value as PaymentType;
                        setPaymentType(next);
                        if (next === 'Rent Refund') {
                          setApplyLeniencyWaiver(true);
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {PAYMENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === 'Registration/Deposit'
                            ? 'Registration/Deposit (Legacy)'
                            : t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {paymentType === 'Rent Refund' && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-2 text-xs text-rose-900">
                    <p className="font-medium">
                      Management-approved Monthly Rent Refund deducts the refunded amount from collected rent totals and monthly reports.
                    </p>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyLeniencyWaiver}
                        onChange={(e) => setApplyLeniencyWaiver(e.target.checked)}
                        className="mt-0.5 rounded border-rose-300 text-blue-900 focus:ring-blue-900"
                      />
                      <span>
                        <strong>Apply Leniency Waiver</strong> (Reduce student&apos;s expected rent by refunded amount so they are not flagged as overdue)
                      </span>
                    </label>
                  </div>
                )}

                {paymentType === 'Deposit Refund' && (
                  <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900">
                    Deposit Refund records the return of security deposit and does not alter Monthly Rent Paid or Rent Outstanding Balance.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {paymentType === 'Rent Refund' ||
                      paymentType === 'Deposit Refund'
                        ? 'Refund Amount (RM)'
                        : 'Amount (RM)'}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      {paymentType === 'Rent Refund' ||
                      paymentType === 'Deposit Refund'
                        ? 'Refund Date'
                        : 'Transaction Date'}
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
                    {paymentType === 'Rent Refund' ||
                    paymentType === 'Deposit Refund'
                      ? 'Voucher / Reference No.'
                      : 'Bank Reference No.'}
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
                    {paymentType === 'Rent Refund'
                      ? 'Management Approval Notes'
                      : paymentType === 'Deposit Refund'
                        ? 'Refund / Voucher Notes'
                        : 'Notes'}
                  </label>
                  <input
                    type="text"
                    maxLength={240}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Physical Receipt Status
                    </label>
                    <select
                      value={editPhysStatus}
                      onChange={(e) =>
                        setEditPhysStatus(e.target.value as PhysicalReceiptStatus)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      <option value="Pending Issuance">Pending Issuance</option>
                      <option value="Issued">Issued</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Physical Receipt Book No.
                    </label>
                    <input
                      type="text"
                      maxLength={64}
                      value={editPhysNo}
                      onChange={(e) => setEditPhysNo(e.target.value)}
                      placeholder="e.g. BK-DJ2-0148"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
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
              </div>

              {/* Pinned Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
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

      {/* Delete Payment Confirmation Modal */}
      {deletingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Delete Payment {getPaymentReceiptNo(deletingPayment)}?
              </h2>
              <button
                type="button"
                onClick={() => setDeletingPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600">
                This will permanently remove the{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {formatRM(deletingPayment.amount)}
                </span>{' '}
                ({deletingPayment.paymentType} · {deletingPayment.billingMonth}) entry for{' '}
                <strong>{deletingPayment.studentName}</strong> and recalculate their ledger
                balance.
              </p>
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {formError}
                </div>
              )}
            </div>

            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingPayment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePayment}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {submitting ? 'Deleting...' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Proof Lightbox Modal */}
      {viewingProofPayment && viewingProofPayment.proofImageData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
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

            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
              <div className="bg-slate-100 rounded-lg p-3 flex items-center justify-center">
                <img
                  src={viewingProofPayment.proofImageData}
                  alt={`Payment proof for ${getPaymentReceiptNo(viewingProofPayment)}`}
                  className="max-w-full max-h-[65vh] object-contain rounded"
                />
              </div>
            </div>

            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:hidden">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
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

            <form
              onSubmit={handleConfirmPhysicalReceiptIssued}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {formError}
                  </div>
                )}

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
              </div>

              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 print:static print:bg-white print:p-0 print:block">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200 print:max-h-none print:overflow-visible print:shadow-none print:border-0 print:rounded-none print:max-w-none">
            {/* Pinned Header (hidden when printing) */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 print:hidden">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Official Receipt Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingPayment(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Close receipt preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Institutional Receipt Sheet */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 print:overflow-visible print:p-4">
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
                        : printingPayment.paymentType === 'Rent Refund'
                          ? 'Official Rent Refund Voucher'
                          : printingPayment.paymentType === 'Deposit Refund'
                            ? 'Official Deposit Refund Voucher'
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
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
                  <div className="space-y-1.5 sm:text-right">
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
                    {printingPayment.paymentType === 'Rent Refund' ? (
                      <span>
                        Management-approved rent refund disbursed ({printingPayment.paymentMethod})
                        {getRentRefundWaivedAmount(printingPayment) > 0
                          ? ` · Leniency Waiver of ${formatRM(getRentRefundWaivedAmount(printingPayment))} applied`
                          : ''}
                      </span>
                    ) : printingPayment.paymentType === 'Deposit Refund' ? (
                      <span>
                        Security deposit refund disbursed ({printingPayment.paymentMethod}) · Non-rent deposit return
                      </span>
                    ) : isCashPaymentType(printingPayment.paymentType) ? (
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
                      {printingPayment.paymentType === 'Rent Refund'
                        ? 'Total Cash Refunded'
                        : printingPayment.paymentType === 'Deposit Refund'
                          ? 'Total Deposit Refunded'
                          : 'Total Cash Received'}
                    </p>
                    <p
                      className={`font-mono text-xl font-bold tabular-nums ${
                        printingPayment.paymentType === 'Rent Refund'
                          ? 'text-rose-700'
                          : printingPayment.paymentType === 'Deposit Refund'
                            ? 'text-teal-800'
                            : 'text-slate-900'
                      }`}
                    >
                      {printingPayment.paymentType === 'Rent Refund' ||
                      printingPayment.paymentType === 'Deposit Refund'
                        ? printingPayment.status === 'Paid'
                          ? `-${formatRM(printingPayment.amount)}`
                          : formatRM(0)
                        : isCashPaymentType(printingPayment.paymentType) &&
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

            {/* Pinned Footer (hidden when printing) */}
            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={() => setPrintingPayment(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        importType="payments"
        staffRole={staffRole}
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
