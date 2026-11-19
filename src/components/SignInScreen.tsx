import React, { useState } from 'react';
import { Building2, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { signInWithGoogle, signInWithUsernameOrEmail } from '../lib/firebase';
import { normalizeStaffLoginEmail } from '../types/hostel';

interface SignInScreenProps {
  authNotice?: string | null;
}

function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password') || raw.includes('auth/user-not-found')) {
    return 'Invalid username/email or password. Please verify your credentials with the Master Admin.';
  }
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not yet enabled in Firebase Console → Authentication → Sign-in method.';
  }
  if (raw.includes('auth/too-many-requests')) {
    return 'Too many failed attempts. Please wait a moment before trying again.';
  }
  return raw || 'Unable to sign in. Please try again.';
}

export function SignInScreen({ authNotice }: SignInScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loadingMode, setLoadingMode] = useState<'credentials' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedPreview =
    identifier.trim() && !identifier.includes('@')
      ? normalizeStaffLoginEmail(identifier)
      : null;

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingMode('credentials');
    setError(null);
    try {
      await signInWithUsernameOrEmail(identifier, password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoadingMode(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoadingMode('google');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6 md:p-10">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-900 text-white flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            GIS Nilai Hostel Portal
          </span>
        </div>
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
          Global Institute of Studies
        </span>
      </header>

      <main className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto py-10">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-900">
            Student Affairs &amp; Accommodation Unit
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight max-w-xl [text-wrap:balance]">
            Multi-staff hostel inventory, residency, and fee management.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-lg">
            Centralized operations for Global Institute of Studies (GIS) Nilai
            across Apartment Desa Jati 2 and Nilai Square. Sign in with your
            staff username or Google account to manage rooms, residents,
            installments, and official receipts.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-lg">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-900">
                Apartment Desa Jati 2
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Block &amp; unit bed allocation with exclusive unit lock support
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-900">
                Nilai Square
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Prorated billing, AI slip scanning, and physical receipt tracking
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-xl p-7 sm:p-8 space-y-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-900">
                <ShieldCheck className="w-4 h-4" />
                <span>Authorized Staff Access</span>
              </div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                Sign in to continue
              </h2>
              <p className="text-xs text-slate-500">
                First account to sign in is automatically assigned Master Admin.
              </p>
            </div>

            {(authNotice || error) && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {error || authNotice}
              </div>
            )}

            <form onSubmit={handleCredentialsSignIn} className="space-y-3.5">
              <div>
                <label
                  htmlFor="staff-identifier"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Staff Username or Email
                </label>
                <input
                  id="staff-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. warden1 or staff@gis.edu.my"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
                {normalizedPreview && (
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    Resolves to: {normalizedPreview}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter staff password"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-900"
                />
              </div>

              <button
                type="submit"
                disabled={loadingMode !== null}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {loadingMode === 'credentials'
                    ? 'Signing in...'
                    : 'Sign in with Username / Email'}
                </span>
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="flex-shrink mx-3 text-xs text-slate-400">or</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loadingMode !== null}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4 text-blue-900" />
              <span>
                {loadingMode === 'google'
                  ? 'Signing in with Google...'
                  : 'Sign in with Google'}
              </span>
            </button>

            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              Every room, resident, and payment update logs your staff email and
              timestamp. Contact the GIS Nilai Master Admin for account setup.
            </p>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4">
        <span>Global Institute of Studies (GIS) Nilai</span>
        <span>Hostel Operations Portal</span>
      </footer>
    </div>
  );
}
