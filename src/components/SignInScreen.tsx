import { useState } from 'react';
import { Building2, ShieldCheck, LogIn } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';

export function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to complete Google Sign-In. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
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

      <main className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto py-12">
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
            authorized staff Google account to view bed availability, register
            students, and track monthly RM rent collections.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-lg">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-900">
                Apartment Desa Jati 2
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Block &amp; unit bed allocation with real-time vacancy sync
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-900">
                Nilai Square
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Resident check-in, check-out, and RM payment ledger
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-900">
                <ShieldCheck className="w-4 h-4" />
                <span>Staff Authentication Required</span>
              </div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                Sign in to continue
              </h2>
              <p className="text-sm text-slate-600">
                Every room, student, and payment update is automatically logged
                with your staff email and server timestamp.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Signing in with Google...' : 'Sign in with Google'}
            </button>

            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
              Access is restricted to verified Google accounts. Contact GIS
              Nilai Hostel Administration if you require assistance.
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
