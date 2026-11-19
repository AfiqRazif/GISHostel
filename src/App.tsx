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
import { loadSampleGisData, syncStaffProfile } from './lib/hostelService';
import type { Payment, Room, Student, TabKey } from './types/hostel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInScreen } from './components/SignInScreen';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardTab } from './components/DashboardTab';
import { StudentsTab } from './components/StudentsTab';
import { PaymentsTab } from './components/PaymentsTab';
import { RoomInventoryTab } from './components/RoomInventoryTab';

function HostelPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);

  const [seedingData, setSeedingData] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  useEffect(() => {
    void testConnection();
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        syncStaffProfile(currentUser).catch((err) => {
          console.error('Staff profile sync error:', err);
        });
      } else {
        setRooms([]);
        setStudents([]);
        setPayments([]);
        setRoomsLoaded(false);
        setStudentsLoaded(false);
        setPaymentsLoaded(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

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

    return () => {
      unsubRooms();
      unsubStudents();
      unsubPayments();
    };
  }, [authReady, user]);

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
    }),
    [rooms, students, payments]
  );

  const handleLoadSampleData = async () => {
    if (!user?.email) return;
    setSeedingData(true);
    setSeedError(null);
    try {
      await loadSampleGisData(user.email);
    } catch (err) {
      setSeedError(
        err instanceof Error ? err.message : 'Failed to load sample GIS data.'
      );
    } finally {
      setSeedingData(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600 font-medium">
          Initializing GIS Nilai Hostel Portal...
        </div>
      </div>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  const staffEmail = user.email || '';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        counts={sidebarCounts}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          user={user}
          isDatabaseEmpty={isDatabaseEmpty}
          seedingData={seedingData}
          onLoadSampleData={handleLoadSampleData}
          onSignOut={() => void signOutStaff()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {seedError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {seedError}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardTab
              rooms={rooms}
              students={students}
              payments={payments}
              loading={dataLoading}
              onNavigate={setActiveTab}
              onLoadSampleData={handleLoadSampleData}
              seedingData={seedingData}
            />
          )}

          {activeTab === 'students' && (
            <StudentsTab
              students={students}
              rooms={rooms}
              staffEmail={staffEmail}
              loading={dataLoading}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsTab
              payments={payments}
              students={students}
              staffEmail={staffEmail}
              loading={dataLoading}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomInventoryTab
              rooms={rooms}
              staffEmail={staffEmail}
              loading={dataLoading}
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
