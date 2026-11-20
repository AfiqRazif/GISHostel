interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  Vacant: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Issued: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  'Receipt Issued': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Occupied: 'bg-blue-50 text-blue-900 border-blue-200',
  'Reserved / Blocked': 'bg-indigo-50 text-indigo-900 border-indigo-200',
  Maintenance: 'bg-amber-50 text-amber-800 border-amber-200',
  Pending: 'bg-amber-50 text-amber-800 border-amber-200',
  'Pending Issuance': 'bg-amber-50 text-amber-800 border-amber-200',
  'Receipt Pending': 'bg-amber-50 text-amber-800 border-amber-200',
  'Room Unassigned': 'bg-amber-50 text-amber-800 border-amber-200',
  Suspended: 'bg-amber-50 text-amber-800 border-amber-200',
  Overdue: 'bg-red-50 text-red-800 border-red-200',
  Disabled: 'bg-red-50 text-red-800 border-red-200',
  'Checked-Out': 'bg-slate-100 text-slate-700 border-slate-200',
  Waived: 'bg-slate-100 text-slate-700 border-slate-200',
  'Historical Rate (Locked to Period)':
    'bg-slate-100 text-slate-700 border-slate-300',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style =
    STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-md whitespace-nowrap shrink-0 ${style}`}
    >
      {status}
    </span>
  );
}
