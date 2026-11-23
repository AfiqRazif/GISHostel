import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signOutStaff,
  testConnection,
} from './lib/firebase';
import {
  loadSampleGisData,
  syncStaffProfile,
  syncStaffUserRecord,
} from './lib/hostelService';
import type { Payment, Room, StaffUser, Student, TabKey } from './types/hostel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInScreen } from './components/SignInScreen';
import { Sidebar, type SidebarMode } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardTab } from './components/DashboardTab';
import { StudentsTab } from './components/StudentsTab';
import { PaymentsTab, type PaymentPrefillRequest } from './components/PaymentsTab';
import { RoomInventoryTab } from './components/RoomInventoryTab';
import { UserManagementTab } from './components/UserManagementTab';

const SIDEBAR_MODE_STORAGE_KEY = 'gis_hostel_sidebar_mode';

function readStoredSidebarMode(): SidebarMode {
  try {
    const val = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    if (val === 'expanded' || val === 'collapsed' || val === 'hidden') {
      return val;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'expanded';
}

function HostelPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [currentStaffUser, setCurrentStaffUser] = useState<StaffUser | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(readStoredSidebarMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, sidebarMode);
    } catch {
      // Ignore storage access errors
    }
  }, [sidebarMode]);

  const handleToggleCollapse = () => {
    setSidebarMode((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
  };

  const handleCycleDesktopSidebar = () => {
    setSidebarMode((prev) =>
      prev === 'expanded' ? 'collapsed' : prev === 'collapsed' ? 'hidden' : 'expanded'
    );
  };

  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [staffUsersLoaded, setStaffUsersLoaded] = useState(false);

  const [seedingData, setSeedingData] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [paymentPrefill, setPaymentPrefill] =
    useState<PaymentPrefillRequest | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  useEffect(() => {
    void testConnection();
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (!currentUser) {
        setCurrentStaffUser(null);
        setCheckingAccount(false);
        setRooms([]);
        setStudents([]);
        setPayments([]);
        setStaffUsers([]);
        setRoomsLoaded(false);
        setStudentsLoaded(false);
        setPaymentsLoaded(false);
        setStaffUsersLoaded(false);
        setActiveTab('dashboard');
        return;
      }

      setCheckingAccount(true);
      setAuthNotice(null);

      void (async () => {
        try {
          void syncStaffProfile(currentUser).catch((err) => {
            console.error('Staff profile sync error:', err);
          });
          const staffRecord = await syncStaffUserRecord(currentUser);
          if (cancelled) return;

          if (!staffRecord.active) {
            setAuthNotice(
              'Your staff account has been disabled by the Master Admin. Please contact GIS Nilai Hostel Administration.'
            );
            setCurrentStaffUser(null);
            setCheckingAccount(false);
            await signOutStaff();
            return;
          }

          setCurrentStaffUser(staffRecord);
          setCheckingAccount(false);
        } catch (err) {
          if (cancelled) return;
          setCheckingAccount(false);
          if (
            err instanceof Error &&
            err.message.startsWith('NOT_PROVISIONED:')
          ) {
            setAuthNotice(err.message.replace(/^NOT_PROVISIONED:\s*/, ''));
            setCurrentStaffUser(null);
            await signOutStaff();
            return;
          }
          setFatalError(
            err instanceof Error ? err : new Error('Failed to verify staff account.')
          );
        }
      })();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || !currentStaffUser?.active) return;

    const unsubRooms = onSnapshot(
      collection(db, 'rooms'),
      (snap) => {
        setRooms(snap.docs.map((d) => d.data() as Room));
        setRoomsLoaded(true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'rooms');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map((d) => d.data() as Student));
        setStudentsLoaded(true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'students');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    const unsubPayments = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        setPayments(snap.docs.map((d) => d.data() as Payment));
        setPaymentsLoaded(true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'payments');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    const unsubOwnStaffDoc = onSnapshot(
      doc(db, 'staff_users', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const me = snap.data() as StaffUser;
        if (!me.active) {
          setAuthNotice(
            'Your staff account has been disabled by the Master Admin. Please contact GIS Nilai Hostel Administration.'
          );
          setCurrentStaffUser(null);
          void signOutStaff();
        } else {
          setCurrentStaffUser((prev) => {
            if (
              prev &&
              prev.uid === me.uid &&
              prev.role === me.role &&
              prev.active === me.active &&
              prev.fullName === me.fullName &&
              prev.email === me.email
            ) {
              return prev;
            }
            return me;
          });
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, `staff_users/${user.uid}`);
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    return () => {
      unsubRooms();
      unsubStudents();
      unsubPayments();
      unsubOwnStaffDoc();
    };
  }, [authReady, user?.uid, currentStaffUser?.active]);

  useEffect(() => {
    if (
      !authReady ||
      !user ||
      !currentStaffUser?.active ||
      currentStaffUser.role !== 'Master Admin'
    ) {
      setStaffUsers([]);
      setStaffUsersLoaded(true);
      return;
    }

    setStaffUsersLoaded(false);
    const unsubStaffUsers = onSnapshot(
      collection(db, 'staff_users'),
      (snap) => {
        setStaffUsers(snap.docs.map((d) => d.data() as StaffUser));
        setStaffUsersLoaded(true);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'staff_users');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    return () => {
      unsubStaffUsers();
    };
  }, [authReady, user?.uid, currentStaffUser?.active, currentStaffUser?.role]);

  const dataLoading = !roomsLoaded || !studentsLoaded || !paymentsLoaded;
  const isDatabaseEmpty =
    !dataLoading &&
    rooms.length === 0 &&
    students.length === 0 &&
    payments.length === 0;

  const sidebarCounts = useMemo(
    () => ({
      vacantBeds: rooms.filter((r) => r.status === 'Vacant').length,
      totalBeds: rooms.length,
      activeStudents: students.filter((s) => s.status === 'Active').length,
      pendingPayments: payments.filter(
        (p) => p.status === 'Pending' || p.status === 'Overdue'
      ).length,
      staffUsers: staffUsers.length,
    }),
    [rooms, students, payments, staffUsers]
  );

  const handleLoadSampleData = async () => {
    const actorEmail = currentStaffUser?.email || user?.email;
    if (!actorEmail) return;
    setSeedingData(true);
    setSeedError(null);
    try {
      await loadSampleGisData(actorEmail);
    } catch (err) {
      setSeedError(
        err instanceof Error ? err.message : 'Failed to load sample GIS data.'
      );
    } finally {
      setSeedingData(false);
    }
  };

  const handleRecordPaymentFromDashboard = (
    studentId: string,
    amount: number
  ) => {
    setPaymentPrefill({ studentId, amount, nonce: Date.now() });
    setActiveTab('payments');
  };

  if (!authReady || (user && checkingAccount)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 font-medium">
          {user
            ? 'Verifying GIS Nilai staff account permissions...'
            : 'Initializing GIS Nilai Hostel Portal...'}
        </div>
      </div>
    );
  }

  if (!user || !currentStaffUser) {
    return <SignInScreen authNotice={authNotice} />;
  }

  const staffEmail = currentStaffUser.email || user.email || '';
  const effectiveTab: TabKey =
    activeTab === 'users' && currentStaffUser.role !== 'Master Admin'
      ? 'dashboard'
      : activeTab;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activeTab={effectiveTab}
        onSelectTab={setActiveTab}
        staffRole={currentStaffUser.role}
        counts={sidebarCounts}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        sidebarMode={sidebarMode}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200 ease-in-out">
        <TopBar
          activeTab={effectiveTab}
          user={user}
          staffUser={currentStaffUser}
          isDatabaseEmpty={isDatabaseEmpty}
          seedingData={seedingData}
          onLoadSampleData={handleLoadSampleData}
          onSignOut={() => {
            setAuthNotice(null);
            void signOutStaff();
          }}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          sidebarMode={sidebarMode}
          onCycleDesktopSidebar={handleCycleDesktopSidebar}
        />

        <main className="flex-1 min-w-0 w-full p-4 sm:p-6 lg:p-8 print:p-0">
          {seedError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 print:hidden">
              {seedError}
            </div>
          )}

          {effectiveTab === 'dashboard' && (
            <DashboardTab
              rooms={rooms}
              students={students}
              payments={payments}
              staffRole={currentStaffUser.role}
              loading={dataLoading}
              onNavigate={setActiveTab}
              onRecordPayment={handleRecordPaymentFromDashboard}
              onLoadSampleData={handleLoadSampleData}
              seedingData={seedingData}
            />
          )}

          {effectiveTab === 'students' && (
            <StudentsTab
              students={students}
              rooms={rooms}
              payments={payments}
              staffEmail={staffEmail}
              staffRole={currentStaffUser.role}
              loading={dataLoading}
            />
          )}

          {effectiveTab === 'payments' && (
            <PaymentsTab
              payments={payments}
              students={students}
              staffEmail={staffEmail}
              staffRole={currentStaffUser.role}
              loading={dataLoading}
              prefillRequest={paymentPrefill}
            />
          )}

          {effectiveTab === 'rooms' && (
            <RoomInventoryTab
              rooms={rooms}
              students={students}
              staffEmail={staffEmail}
              staffRole={currentStaffUser.role}
              loading={dataLoading}
            />
          )}

          {effectiveTab === 'users' && currentStaffUser.role === 'Master Admin' && (
            <UserManagementTab
              staffUsers={staffUsers}
              currentUserUid={user.uid}
              staffEmail={staffEmail}
              loading={!staffUsersLoaded}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HostelPortal />
    </ErrorBoundary>
  );
}
