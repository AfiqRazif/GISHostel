import React, { useMemo, useState } from 'react';
import { Shield, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import {
  formatTimestamp,
  normalizeStaffLoginEmail,
  STAFF_ROLES,
  StaffRole,
  StaffUser,
} from '../types/hostel';
import {
  createManagedStaffAccount,
  updateStaffUserAccount,
} from '../lib/hostelService';
import { StatusBadge } from './StatusBadge';

interface UserManagementTabProps {
  staffUsers: StaffUser[];
  currentUserUid: string;
  staffEmail: string;
  loading: boolean;
}

export function UserManagementTab({
  staffUsers,
  currentUserUid,
  staffEmail,
  loading,
}: UserManagementTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('Staff');

  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    target: StaffUser;
    nextRole: StaffRole;
  } | null>(null);

  const sortedUsers = useMemo(() => {
    const rank: Record<StaffRole, number> = {
      'Master Admin': 0,
      Admin: 1,
      Staff: 2,
      Viewer: 3,
    };
    return [...staffUsers].sort((a, b) => {
      if ((rank[a.role] ?? 9) !== (rank[b.role] ?? 9)) {
        return (rank[a.role] ?? 9) - (rank[b.role] ?? 9);
      }
      return a.fullName.localeCompare(b.fullName);
    });
  }, [staffUsers]);

  const counts = useMemo(() => {
    const active = staffUsers.filter((u) => u.active).length;
    const disabled = staffUsers.filter((u) => !u.active).length;
    const masterAdmins = staffUsers.filter(
      (u) => u.role === 'Master Admin' && u.active
    ).length;
    const viewers = staffUsers.filter(
      (u) => u.role === 'Viewer' && u.active
    ).length;
    return { total: staffUsers.length, active, disabled, masterAdmins, viewers };
  }, [staffUsers]);

  const previewEmail = customEmail.trim()
    ? customEmail.trim().toLowerCase()
    : username.trim()
      ? normalizeStaffLoginEmail(
          username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
        )
      : 'username@gis-hostel.local';

  const handleOpenCreate = () => {
    setFormError(null);
    setFullName('');
    setUsername('');
    setCustomEmail('');
    setPassword('');
    setRole('Staff');
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createManagedStaffAccount(
        {
          username,
          customEmail: customEmail.trim() || undefined,
          fullName,
          password,
          role,
        },
        staffEmail
      );
      setShowCreateModal(false);
      setFeedbackBanner(
        `Created ${role} account for ${fullName.trim()} (${created.email}). Your Master Admin session remains active.`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to create staff account.';
      if (msg.includes('auth/email-already-in-use')) {
        setFormError('That username or email already has a registered account.');
      } else if (msg.includes('auth/operation-not-allowed')) {
        setFormError(
          'Enable Email/Password sign-in in Firebase Console → Authentication → Sign-in method first.'
        );
      } else {
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const commitRoleChange = async (target: StaffUser, nextRole: StaffRole) => {
    setBusyUid(target.uid);
    try {
      await updateStaffUserAccount(target.uid, { role: nextRole }, staffEmail);
      setFeedbackBanner(`Updated ${target.fullName}'s role to ${nextRole}.`);
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to update role.'
      );
    } finally {
      setBusyUid(null);
      setPendingRoleChange(null);
    }
  };

  const handleRoleChange = (target: StaffUser, nextRole: StaffRole) => {
    if (target.role === nextRole) return;
    const isSoleActiveMasterAdmin =
      target.role === 'Master Admin' && target.active && counts.masterAdmins <= 1;

    if (isSoleActiveMasterAdmin && nextRole !== 'Master Admin') {
      setFeedbackBanner(
        'Lockout Protection: You cannot demote the sole remaining active Master Admin. Promote another active user to Master Admin first.'
      );
      return;
    }

    if (
      nextRole === 'Master Admin' ||
      (target.uid === currentUserUid && target.role === 'Master Admin')
    ) {
      setPendingRoleChange({ target, nextRole });
      return;
    }

    void commitRoleChange(target, nextRole);
  };

  const handleToggleActive = async (target: StaffUser) => {
    const isSoleActiveMasterAdmin =
      target.role === 'Master Admin' && target.active && counts.masterAdmins <= 1;
    if (isSoleActiveMasterAdmin) {
      setFeedbackBanner(
        'Lockout Protection: You cannot disable the sole remaining active Master Admin account.'
      );
      return;
    }
    if (target.uid === currentUserUid && target.active) {
      setFeedbackBanner('You cannot disable your own currently signed-in account.');
      return;
    }
    setBusyUid(target.uid);
    try {
      await updateStaffUserAccount(
        target.uid,
        { active: !target.active },
        staffEmail
      );
      setFeedbackBanner(
        `${target.fullName} has been ${target.active ? 'disabled' : 're-enabled'}.`
      );
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Failed to toggle user status.'
      );
    } finally {
      setBusyUid(null);
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

      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-900 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Master Admin Staff User Manager
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provision staff login credentials, assign roles, or disable portal access immediately
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Create Staff Account</span>
        </button>
      </div>

      {/* Summary Counts */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 px-1 tabular-nums">
        <span>
          Total Accounts: <strong className="text-slate-900">{counts.total}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-emerald-700">{counts.active}</strong> Active
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-red-700">{counts.disabled}</strong> Disabled
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-blue-900">{counts.masterAdmins}</strong> Master Admin
        </span>
        {counts.viewers > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-amber-700">{counts.viewers}</strong> Read-Only Viewer
            </span>
          </>
        )}
      </div>

      {/* Staff Accounts Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading staff accounts...
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No staff user records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Login Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedUsers.map((u) => {
                  const isSelf = u.uid === currentUserUid;
                  const isSoleActiveMasterAdmin =
                    u.role === 'Master Admin' && u.active && counts.masterAdmins <= 1;
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">
                          {u.fullName}
                          {isSelf && (
                            <span className="ml-1.5 text-xs font-normal text-blue-900">
                              (You)
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                          {u.uid.slice(0, 12)}...
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {u.username}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {u.email}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <select
                            value={u.role}
                            disabled={busyUid === u.uid || isSoleActiveMasterAdmin}
                            onChange={(e) =>
                              handleRoleChange(u, e.target.value as StaffRole)
                            }
                            aria-label={`Role for ${u.fullName}`}
                            title={
                              isSoleActiveMasterAdmin
                                ? 'Sole active Master Admin — promote another active user first'
                                : undefined
                            }
                            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-900 disabled:bg-slate-50 disabled:text-slate-600"
                          >
                            {STAFF_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          {isSoleActiveMasterAdmin && (
                            <p className="text-[11px] text-amber-700 font-medium">
                              Protected (last Master Admin)
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={u.active ? 'Active' : 'Disabled'} />
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                        {formatTimestamp(u.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={
                            busyUid === u.uid ||
                            isSoleActiveMasterAdmin ||
                            (isSelf && u.active)
                          }
                          onClick={() => void handleToggleActive(u)}
                          title={
                            isSoleActiveMasterAdmin
                              ? 'Cannot disable the only active Master Admin'
                              : isSelf && u.active
                                ? 'Cannot disable your own active session'
                                : undefined
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                            u.active
                              ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
                              : 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {u.active ? (
                            <>
                              <UserX className="w-3 h-3" />
                              <span>Disable</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3 h-3" />
                              <span>Enable</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Staff Account Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Create Staff Account
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provisions a Firebase Auth login via secondary app without signing you out
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateUser}
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
                    Staff Full Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Puan Noraini binti Kassim"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={64}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. warden1"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as StaffRole)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Custom Email (Optional — leave blank to use @gis-hostel.local)
                  </label>
                  <input
                    type="email"
                    maxLength={160}
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder={previewEmail}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Staff can sign in using username{' '}
                    <span className="font-mono font-semibold">
                      {username.trim().toLowerCase() || 'username'}
                    </span>{' '}
                    or email <span className="font-mono">{previewEmail}</span>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Initial Password (minimum 6 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter initial login password"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                  />
                </div>
              </div>

              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Creating Account...' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Governance Confirmation Modal */}
      {pendingRoleChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl bg-white shadow-xl border border-slate-200">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  {pendingRoleChange.nextRole === 'Master Admin'
                    ? 'Grant Master Admin Privileges?'
                    : 'Confirm Master Admin Role Change'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {pendingRoleChange.target.fullName} ({pendingRoleChange.target.email})
                </p>
              </div>
              <button
                type="button"
                disabled={busyUid === pendingRoleChange.target.uid}
                onClick={() => setPendingRoleChange(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close confirmation modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
              {pendingRoleChange.nextRole === 'Master Admin' ? (
                <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
                  <p className="font-semibold">
                    Master Admin grants full governance access:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Create, enable/disable, and assign roles in User Accounts</li>
                    <li>Upload Bulk Tenancy History and edit/delete past stay segments</li>
                  </ul>
                  {!pendingRoleChange.target.active && (
                    <p className="text-amber-800 font-medium pt-1">
                      Note: This account is currently Disabled and must be re-enabled before signing in.
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-semibold">Self-Demotion Warning</p>
                  <p>
                    Changing your own role to <strong>{pendingRoleChange.nextRole}</strong> will
                    immediately remove your access to User Accounts and Bulk Tenancy History.
                    Another active Master Admin remains in control.
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={busyUid === pendingRoleChange.target.uid}
                onClick={() => setPendingRoleChange(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyUid === pendingRoleChange.target.uid}
                onClick={() =>
                  void commitRoleChange(
                    pendingRoleChange.target,
                    pendingRoleChange.nextRole
                  )
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {busyUid === pendingRoleChange.target.uid
                  ? 'Updating...'
                  : `Confirm ${pendingRoleChange.nextRole}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
