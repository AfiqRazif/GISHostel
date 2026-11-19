import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
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
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardTab } from './components/DashboardTab';
import { StudentsTab } from './components/StudentsTab';
import { PaymentsTab, type PaymentPrefillRequest } from './components/PaymentsTab';
import { RoomInventoryTab } from './components/RoomInventoryTab';
import { UserManagementTab } from './components/UserManagementTab';

function HostelPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [currentStaffUser, setCurrentStaffUser] = useState<StaffUser | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

    const unsubStaffUsers = onSnapshot(
      collection(db, 'staff_users'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StaffUser);
        setStaffUsers(list);
        setStaffUsersLoaded(true);
        const me = list.find((u) => u.uid === user.uid);
        if (me) {
          if (!me.active) {
            setAuthNotice(
              'Your staff account has been disabled by the Master Admin. Please contact GIS Nilai Hostel Administration.'
            );
            setCurrentStaffUser(null);
            void signOutStaff();
          } else {
            setCurrentStaffUser(me);
          }
        }
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
      unsubRooms();
      unsubStudents();
      unsubPayments();
      unsubStaffUsers();
    };
  }, [authReady, user?.uid, currentStaffUser?.active]);

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
      />

      <div className="flex-1 flex flex-col min-w-0">
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
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
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
              loading={dataLoading}
            />
          )}

          {effectiveTab === 'payments' && (
            <PaymentsTab
              payments={payments}
              students={students}
              staffEmail={staffEmail}
              loading={dataLoading}
              prefillRequest={paymentPrefill}
            />
          )}

          {effectiveTab === 'rooms' && (
            <RoomInventoryTab
              rooms={rooms}
              staffEmail={staffEmail}
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
