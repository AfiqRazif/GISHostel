import type { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  buildRoomId,
  DATE_REGEX,
  FIELD_LIMITS,
  generateBulkBedSlots,
  getCurrentMonthISO,
  getTodayISO,
  HostelLocation,
  ID_REGEX,
  MONTH_REGEX,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ProgramType,
  Room,
  RoomStatus,
  sanitizeIdSegment,
  Student,
  StudentStatus,
} from '../types/hostel';

function assertStaffEmail(staffEmail: string): string {
  const email = staffEmail.trim();
  if (!email || email.length < FIELD_LIMITS.email.min || email.length > FIELD_LIMITS.email.max) {
    throw new Error('Authenticated staff email is missing or invalid.');
  }
  return email;
}

function clampNumber(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.min(max, Math.max(min, Math.round(val * 100) / 100));
}

export async function syncStaffProfile(user: User): Promise<void> {
  if (!user.email) return;
  const path = `staff/${user.uid}`;
  try {
    const ref = doc(db, 'staff', user.uid);
    const snap = await getDoc(ref);
    const displayName = (user.displayName || user.email.split('@')[0] || 'GIS Staff')
      .trim()
      .slice(0, 120);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email.slice(0, FIELD_LIMITS.email.max),
        displayName,
        role: user.email === 'afiqjacksonmusic@gmail.com' ? 'admin' : 'staff',
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface CreateRoomInput {
  roomId?: string;
  location: HostelLocation;
  block: string;
  unitNo: string;
  bedSlot: string;
  monthlyRate: number;
  status: 'Vacant' | 'Maintenance';
}

export async function createRoom(input: CreateRoomInput, staffEmail: string): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const block = input.block.trim().slice(0, FIELD_LIMITS.block.max);
  const unitNo = input.unitNo.trim().slice(0, FIELD_LIMITS.unitNo.max);
  const bedSlot = input.bedSlot.trim().slice(0, FIELD_LIMITS.bedSlot.max);
  const rawId = input.roomId?.trim() || buildRoomId(input.location, block, unitNo, bedSlot);
  const roomId = sanitizeIdSegment(rawId).slice(0, FIELD_LIMITS.roomId.max);

  if (!ID_REGEX.test(roomId) || roomId.length < FIELD_LIMITS.roomId.min) {
    throw new Error('Room ID must be 3–64 characters using letters, numbers, hyphens, or underscores.');
  }
  if (!block || !unitNo || !bedSlot) {
    throw new Error('Block, Unit No., and Bed Slot are required.');
  }

  const path = `rooms/${roomId}`;
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const existing = await getDoc(roomRef);
    if (existing.exists()) {
      throw new Error(`Room ID "${roomId}" already exists in inventory.`);
    }
    await setDoc(roomRef, {
      roomId,
      location: input.location,
      block,
      unitNo,
      bedSlot,
      monthlyRate: clampNumber(input.monthlyRate, FIELD_LIMITS.monthlyRate.min, FIELD_LIMITS.monthlyRate.max),
      status: input.status,
      currentStudentId: null,
      currentStudentName: null,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface BulkCreateBedsInput {
  location: HostelLocation;
  block: string;
  unitNo: string;
  monthlyRate: number;
  bedCount: number;
  bedPrefix?: string;
  startNumber?: number;
}

export async function bulkCreateBeds(
  input: BulkCreateBedsInput,
  staffEmail: string
): Promise<{ createdIds: string[]; skippedIds: string[] }> {
  const email = assertStaffEmail(staffEmail);
  const block = input.block.trim().slice(0, FIELD_LIMITS.block.max);
  const unitNo = input.unitNo.trim().slice(0, FIELD_LIMITS.unitNo.max);
  const count = Math.min(8, Math.max(1, Math.floor(input.bedCount)));
  const monthlyRate = clampNumber(
    input.monthlyRate,
    FIELD_LIMITS.monthlyRate.min,
    FIELD_LIMITS.monthlyRate.max
  );

  if (!block || !unitNo) {
    throw new Error('Block and Unit No. are required.');
  }

  const bedSlots = generateBulkBedSlots(count, input.bedPrefix, input.startNumber);
  const batch = writeBatch(db);
  const createdIds: string[] = [];
  const skippedIds: string[] = [];

  try {
    for (const rawSlot of bedSlots) {
      const bedSlot = rawSlot.slice(0, FIELD_LIMITS.bedSlot.max);
      const roomId = buildRoomId(input.location, block, unitNo, bedSlot);
      if (!ID_REGEX.test(roomId) || roomId.length < FIELD_LIMITS.roomId.min) {
        throw new Error(`Generated Room ID "${roomId}" is invalid.`);
      }
      const ref = doc(db, 'rooms', roomId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        skippedIds.push(roomId);
        continue;
      }
      batch.set(ref, {
        roomId,
        location: input.location,
        block,
        unitNo,
        bedSlot,
        monthlyRate,
        status: 'Vacant',
        currentStudentId: null,
        currentStudentName: null,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      createdIds.push(roomId);
    }

    if (createdIds.length > 0) {
      await batch.commit();
    }
    return { createdIds, skippedIds };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Generated Room ID')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'rooms');
  }
}

export interface UpdateRoomDetailsInput {
  location: HostelLocation;
  block: string;
  unitNo: string;
  bedSlot: string;
  monthlyRate: number;
  status: RoomStatus;
}

export async function updateRoomDetails(
  room: Room,
  input: UpdateRoomDetailsInput,
  staffEmail: string
): Promise<{ roomId: string; renamed: boolean }> {
  const email = assertStaffEmail(staffEmail);
  const block = input.block.trim().slice(0, FIELD_LIMITS.block.max);
  const unitNo = input.unitNo.trim().slice(0, FIELD_LIMITS.unitNo.max);
  const bedSlot = input.bedSlot.trim().slice(0, FIELD_LIMITS.bedSlot.max);
  const cleanRate = clampNumber(
    input.monthlyRate,
    FIELD_LIMITS.monthlyRate.min,
    FIELD_LIMITS.monthlyRate.max
  );

  if (!block || !unitNo || !bedSlot) {
    throw new Error('Block, Unit No., and Bed Designation are required.');
  }

  const hasAssignedStudent =
    room.status === 'Occupied' || Boolean(room.currentStudentId);
  if (hasAssignedStudent && input.status !== 'Occupied') {
    throw new Error(
      'Check out or unassign the current student in the Students tab before changing status to Vacant or Maintenance.'
    );
  }
  if (!hasAssignedStudent && input.status === 'Occupied') {
    throw new Error('Register or assign a student to mark a bed as Occupied.');
  }

  const nextRoomId = buildRoomId(input.location, block, unitNo, bedSlot);
  if (!ID_REGEX.test(nextRoomId) || nextRoomId.length < FIELD_LIMITS.roomId.min) {
    throw new Error(
      'Resulting Room ID must be 3–64 characters using letters, numbers, hyphens, or underscores.'
    );
  }

  const path = `rooms/${room.roomId}`;

  try {
    if (nextRoomId === room.roomId) {
      await updateDoc(doc(db, 'rooms', room.roomId), {
        location: input.location,
        block,
        unitNo,
        bedSlot,
        monthlyRate: cleanRate,
        status: input.status,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      return { roomId: nextRoomId, renamed: false };
    }

    const nextRoomRef = doc(db, 'rooms', nextRoomId);
    const existingNext = await getDoc(nextRoomRef);
    if (existingNext.exists()) {
      throw new Error(`Room ID "${nextRoomId}" already exists in inventory.`);
    }

    const batch = writeBatch(db);
    batch.set(nextRoomRef, {
      roomId: nextRoomId,
      location: input.location,
      block,
      unitNo,
      bedSlot,
      monthlyRate: cleanRate,
      status: input.status,
      currentStudentId: room.currentStudentId ?? null,
      currentStudentName: room.currentStudentName ?? null,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'rooms', room.roomId));

    if (room.currentStudentId) {
      const studentRef = doc(db, 'students', room.currentStudentId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        batch.update(studentRef, {
          assignedRoomId: nextRoomId,
          hostelLocation: input.location,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return { roomId: nextRoomId, renamed: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVacantRoom(room: Room): Promise<void> {
  if (room.status === 'Occupied') {
    throw new Error('Cannot delete an occupied bed. Check out the resident first.');
  }
  const path = `rooms/${room.roomId}`;
  try {
    await deleteDoc(doc(db, 'rooms', room.roomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface RegisterStudentInput {
  studentId: string;
  fullName: string;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  assignedRoomId: string;
  checkInDate: string;
  depositPaid: number;
  monthlyFee: number;
}

export async function registerStudent(
  input: RegisterStudentInput,
  selectedRoom: Room,
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const studentId = sanitizeIdSegment(input.studentId).slice(0, FIELD_LIMITS.studentId.max);
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
  const phone = input.phone.trim().slice(0, FIELD_LIMITS.phone.max);
  const emergencyContact = input.emergencyContact.trim().slice(0, FIELD_LIMITS.emergencyContact.max);

  if (!ID_REGEX.test(studentId) || studentId.length < FIELD_LIMITS.studentId.min) {
    throw new Error('Student ID (Matrix / IC) must be 3–64 characters (letters, numbers, hyphens, underscores).');
  }
  if (fullName.length < FIELD_LIMITS.fullName.min) {
    throw new Error('Full Name must be at least 2 characters.');
  }
  if (phone.length < FIELD_LIMITS.phone.min || emergencyContact.length < FIELD_LIMITS.emergencyContact.min) {
    throw new Error('Phone and Emergency Contact must each be at least 6 characters.');
  }
  if (!DATE_REGEX.test(input.checkInDate)) {
    throw new Error('Check-In Date must be in YYYY-MM-DD format.');
  }
  if (selectedRoom.status !== 'Vacant') {
    throw new Error('Selected room is no longer Vacant. Please choose another available bed.');
  }

  const studentRef = doc(db, 'students', studentId);
  const roomRef = doc(db, 'rooms', selectedRoom.roomId);

  try {
    const existingStudent = await getDoc(studentRef);
    if (existingStudent.exists()) {
      throw new Error(`Student ID "${studentId}" is already registered.`);
    }
    const freshRoom = await getDoc(roomRef);
    if (!freshRoom.exists() || freshRoom.data()?.status !== 'Vacant') {
      throw new Error(`Room "${selectedRoom.roomId}" is not currently Vacant.`);
    }

    const batch = writeBatch(db);
    batch.set(studentRef, {
      studentId,
      fullName,
      phone,
      emergencyContact,
      program: input.program,
      assignedRoomId: selectedRoom.roomId,
      hostelLocation: selectedRoom.location,
      checkInDate: input.checkInDate,
      checkOutDate: null,
      depositPaid: clampNumber(input.depositPaid, FIELD_LIMITS.depositPaid.min, FIELD_LIMITS.depositPaid.max),
      monthlyFee: clampNumber(input.monthlyFee, FIELD_LIMITS.monthlyFee.min, FIELD_LIMITS.monthlyFee.max),
      status: 'Active',
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    batch.update(roomRef, {
      status: 'Occupied',
      currentStudentId: studentId,
      currentStudentName: fullName,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already registered') || error.message.includes('Vacant'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `students/${studentId}`);
  }
}

export interface UpdateStudentInput {
  fullName: string;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  status: StudentStatus;
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  monthlyFee: number;
  newRoom?: Room | null;
}

export async function updateStudentRecord(
  currentStudent: Student,
  input: UpdateStudentInput,
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
  const phone = input.phone.trim().slice(0, FIELD_LIMITS.phone.max);
  const emergencyContact = input.emergencyContact.trim().slice(0, FIELD_LIMITS.emergencyContact.max);

  if (fullName.length < FIELD_LIMITS.fullName.min) {
    throw new Error('Full Name must be at least 2 characters.');
  }
  if (phone.length < FIELD_LIMITS.phone.min || emergencyContact.length < FIELD_LIMITS.emergencyContact.min) {
    throw new Error('Phone and Emergency Contact must each be at least 6 characters.');
  }
  if (!DATE_REGEX.test(input.checkInDate)) {
    throw new Error('Check-In Date must be in YYYY-MM-DD format.');
  }
  if (input.status === 'Checked-Out' && (!input.checkOutDate || !DATE_REGEX.test(input.checkOutDate))) {
    throw new Error('A valid Check-Out Date (YYYY-MM-DD) is required when checking out a student.');
  }

  const studentRef = doc(db, 'students', currentStudent.studentId);
  const batch = writeBatch(db);

  try {
    // Case 1: Transitioning to Checked-Out from Active/Suspended -> vacate assigned room atomically
    if (currentStudent.status !== 'Checked-Out' && input.status === 'Checked-Out') {
      const assignedRoomRef = doc(db, 'rooms', currentStudent.assignedRoomId);
      const roomSnap = await getDoc(assignedRoomRef);

      if (roomSnap.exists() && roomSnap.data()?.currentStudentId === currentStudent.studentId) {
        batch.update(assignedRoomRef, {
          status: 'Vacant',
          currentStudentId: null,
          currentStudentName: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }

      batch.update(studentRef, {
        status: 'Checked-Out',
        checkOutDate: input.checkOutDate,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return;
    }

    // Case 2: Re-activating a Checked-Out student into a Vacant room
    if (currentStudent.status === 'Checked-Out' && input.status === 'Active') {
      if (!input.newRoom || input.newRoom.status !== 'Vacant') {
        throw new Error('Select an available Vacant room to re-activate this student.');
      }
      const newRoomRef = doc(db, 'rooms', input.newRoom.roomId);
      batch.update(newRoomRef, {
        status: 'Occupied',
        currentStudentId: currentStudent.studentId,
        currentStudentName: fullName,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      batch.update(studentRef, {
        status: 'Active',
        checkOutDate: null,
        checkInDate: input.checkInDate,
        assignedRoomId: input.newRoom.roomId,
        hostelLocation: input.newRoom.location,
        monthlyFee: clampNumber(input.monthlyFee, FIELD_LIMITS.monthlyFee.min, FIELD_LIMITS.monthlyFee.max),
        depositPaid: clampNumber(input.depositPaid, FIELD_LIMITS.depositPaid.min, FIELD_LIMITS.depositPaid.max),
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    // Case 3: Active/Suspended student transferring to a different Vacant room
    let targetRoomId = currentStudent.assignedRoomId;
    let targetLocation = currentStudent.hostelLocation;
    if (input.newRoom && input.newRoom.roomId !== currentStudent.assignedRoomId) {
      if (input.newRoom.status !== 'Vacant') {
        throw new Error('Target room must be Vacant for a room transfer.');
      }
      const oldRoomRef = doc(db, 'rooms', currentStudent.assignedRoomId);
      const oldSnap = await getDoc(oldRoomRef);
      if (oldSnap.exists() && oldSnap.data()?.currentStudentId === currentStudent.studentId) {
        batch.update(oldRoomRef, {
          status: 'Vacant',
          currentStudentId: null,
          currentStudentName: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
      const newRoomRef = doc(db, 'rooms', input.newRoom.roomId);
      batch.update(newRoomRef, {
        status: 'Occupied',
        currentStudentId: currentStudent.studentId,
        currentStudentName: fullName,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      targetRoomId = input.newRoom.roomId;
      targetLocation = input.newRoom.location;
    }

    batch.update(studentRef, {
      fullName,
      phone,
      emergencyContact,
      program: input.program,
      status: input.status,
      checkInDate: input.checkInDate,
      checkOutDate: input.status === 'Checked-Out' ? input.checkOutDate : null,
      assignedRoomId: targetRoomId,
      hostelLocation: targetLocation,
      depositPaid: clampNumber(input.depositPaid, FIELD_LIMITS.depositPaid.min, FIELD_LIMITS.depositPaid.max),
      monthlyFee: clampNumber(input.monthlyFee, FIELD_LIMITS.monthlyFee.min, FIELD_LIMITS.monthlyFee.max),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Vacant') || error.message.includes('Check-Out Date'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `students/${currentStudent.studentId}`);
  }
}

export interface CreatePaymentInput {
  student: Student;
  billingMonth: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
}

export async function createPayment(input: CreatePaymentInput, staffEmail: string): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  if (!MONTH_REGEX.test(input.billingMonth)) {
    throw new Error('Billing Month must be in YYYY-MM format.');
  }
  if (!DATE_REGEX.test(input.paymentDate)) {
    throw new Error('Payment Date must be in YYYY-MM-DD format.');
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const paymentId = `PAY-${input.billingMonth.replace('-', '')}-${stamp}${rand}`.slice(
    0,
    FIELD_LIMITS.paymentId.max
  );

  const path = `payments/${paymentId}`;
  try {
    await setDoc(doc(db, 'payments', paymentId), {
      paymentId,
      studentId: input.student.studentId,
      studentName: input.student.fullName.slice(0, FIELD_LIMITS.fullName.max),
      roomId: input.student.assignedRoomId,
      hostelLocation: input.student.hostelLocation,
      billingMonth: input.billingMonth,
      paymentType: input.paymentType,
      amount: clampNumber(input.amount, FIELD_LIMITS.amount.min, FIELD_LIMITS.amount.max),
      paymentMethod: input.paymentMethod,
      referenceNo: input.referenceNo.trim().slice(0, FIELD_LIMITS.referenceNo.max),
      paymentDate: input.paymentDate,
      status: input.status,
      notes: input.notes.trim().slice(0, FIELD_LIMITS.notes.max),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface UpdatePaymentInput {
  billingMonth: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
}

export async function updatePayment(
  paymentId: string,
  input: UpdatePaymentInput,
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  if (!MONTH_REGEX.test(input.billingMonth)) {
    throw new Error('Billing Month must be in YYYY-MM format.');
  }
  if (!DATE_REGEX.test(input.paymentDate)) {
    throw new Error('Payment Date must be in YYYY-MM-DD format.');
  }

  const path = `payments/${paymentId}`;
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      billingMonth: input.billingMonth,
      paymentType: input.paymentType,
      amount: clampNumber(input.amount, FIELD_LIMITS.amount.min, FIELD_LIMITS.amount.max),
      paymentMethod: input.paymentMethod,
      referenceNo: input.referenceNo.trim().slice(0, FIELD_LIMITS.referenceNo.max),
      paymentDate: input.paymentDate,
      status: input.status,
      notes: input.notes.trim().slice(0, FIELD_LIMITS.notes.max),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function loadSampleGisData(staffEmail: string): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const today = getTodayISO();
  const month = getCurrentMonthISO();

  const sampleStudents = [
    {
      studentId: 'GIS250101',
      fullName: 'Muhammad Amirul Hakim bin Razak',
      phone: '011-2345 6789',
      emergencyContact: 'Razak bin Osman (Father) · 019-332 1140',
      program: 'Diploma' as ProgramType,
      assignedRoomId: 'DJ2-A-04-B1',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-09-01',
      checkOutDate: null,
      depositPaid: 250,
      monthlyFee: 250,
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250102',
      fullName: 'Nurul Aina Syafiqah binti Mohd Noor',
      phone: '013-887 4512',
      emergencyContact: 'Zaiton binti Karim (Mother) · 012-774 8890',
      program: 'SKM' as ProgramType,
      assignedRoomId: 'DJ2-A-04-B2',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-09-01',
      checkOutDate: null,
      depositPaid: 250,
      monthlyFee: 250,
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250103',
      fullName: 'Kavinesh A/L Subramaniam',
      phone: '016-445 9910',
      emergencyContact: 'Subramaniam A/L Muthu · 016-221 3309',
      program: 'DiFFER' as ProgramType,
      assignedRoomId: 'DJ2-B-02-B1',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-10-05',
      checkOutDate: null,
      depositPaid: 250,
      monthlyFee: 250,
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250201',
      fullName: 'Tan Wei Ming',
      phone: '017-654 2210',
      emergencyContact: 'Tan Boon Hock (Father) · 012-301 9981',
      program: 'Diploma' as ProgramType,
      assignedRoomId: 'NSQ-C-12-B1',
      hostelLocation: 'Nilai Square' as HostelLocation,
      checkInDate: '2026-08-15',
      checkOutDate: null,
      depositPaid: 280,
      monthlyFee: 280,
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250202',
      fullName: 'Siti Khadijah binti Ismail',
      phone: '014-909 1134',
      emergencyContact: 'Ismail bin Hamid · 019-665 0042',
      program: 'SKM' as ProgramType,
      assignedRoomId: 'NSQ-C-12-B2',
      hostelLocation: 'Nilai Square' as HostelLocation,
      checkInDate: '2026-09-12',
      checkOutDate: null,
      depositPaid: 280,
      monthlyFee: 280,
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS240089',
      fullName: 'Ahmad Faiz bin Zulkifli',
      phone: '018-321 7745',
      emergencyContact: 'Zulkifli bin Ali · 019-412 5531',
      program: 'Other' as ProgramType,
      assignedRoomId: 'DJ2-B-02-B4',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-02-01',
      checkOutDate: '2026-10-31',
      depositPaid: 250,
      monthlyFee: 250,
      status: 'Checked-Out' as StudentStatus,
    },
  ];

  const activeByRoom = new Map(
    sampleStudents
      .filter((s) => s.status === 'Active')
      .map((s) => [s.assignedRoomId, s])
  );

  const roomBlueprints: Array<{
    location: HostelLocation;
    block: string;
    unitNo: string;
    beds: number;
    monthlyRate: number;
    maintenanceBed?: string;
  }> = [
    { location: 'Apartment Desa Jati 2', block: 'A', unitNo: '04', beds: 4, monthlyRate: 250 },
    {
      location: 'Apartment Desa Jati 2',
      block: 'B',
      unitNo: '02',
      beds: 4,
      monthlyRate: 250,
      maintenanceBed: 'B3',
    },
    { location: 'Nilai Square', block: 'C', unitNo: '12', beds: 4, monthlyRate: 280 },
    { location: 'Nilai Square', block: 'D', unitNo: '05', beds: 2, monthlyRate: 300 },
  ];

  const batch = writeBatch(db);

  try {
    for (const grp of roomBlueprints) {
      for (let b = 1; b <= grp.beds; b++) {
        const bedSlot = `B${b}`;
        const roomId = buildRoomId(grp.location, grp.block, grp.unitNo, bedSlot);
        const resident = activeByRoom.get(roomId);
        const status: RoomStatus = resident
          ? 'Occupied'
          : grp.maintenanceBed === bedSlot
            ? 'Maintenance'
            : 'Vacant';

        batch.set(doc(db, 'rooms', roomId), {
          roomId,
          location: grp.location,
          block: grp.block,
          unitNo: grp.unitNo,
          bedSlot,
          monthlyRate: grp.monthlyRate,
          status,
          currentStudentId: resident ? resident.studentId : null,
          currentStudentName: resident ? resident.fullName : null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const st of sampleStudents) {
      batch.set(doc(db, 'students', st.studentId), {
        ...st,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
    }

    const samplePayments = [
      {
        paymentId: `PAY-${month.replace('-', '')}-101`,
        studentId: 'GIS250101',
        studentName: 'Muhammad Amirul Hakim bin Razak',
        roomId: 'DJ2-A-04-B1',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 250,
        paymentMethod: 'Online Transfer (FPX/DuitNow)' as PaymentMethod,
        referenceNo: 'DUITNOW-984120',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'November hostel rent settled via DuitNow QR.',
      },
      {
        paymentId: `PAY-${month.replace('-', '')}-102`,
        studentId: 'GIS250102',
        studentName: 'Nurul Aina Syafiqah binti Mohd Noor',
        roomId: 'DJ2-A-04-B2',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 250,
        paymentMethod: 'JomPAY' as PaymentMethod,
        referenceNo: 'JP-772104',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'Verified by hostel finance counter.',
      },
      {
        paymentId: `PAY-${month.replace('-', '')}-103`,
        studentId: 'GIS250103',
        studentName: 'Kavinesh A/L Subramaniam',
        roomId: 'DJ2-B-02-B1',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 250,
        paymentMethod: 'Cash' as PaymentMethod,
        referenceNo: 'INV-DJ2-003',
        paymentDate: today,
        status: 'Pending' as PaymentStatus,
        notes: 'Awaiting transfer slip from student.',
      },
      {
        paymentId: `PAY-${month.replace('-', '')}-201`,
        studentId: 'GIS250201',
        studentName: 'Tan Wei Ming',
        roomId: 'NSQ-C-12-B1',
        hostelLocation: 'Nilai Square' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 280,
        paymentMethod: 'Online Transfer (FPX/DuitNow)' as PaymentMethod,
        referenceNo: 'FPX-550192',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'Nilai Square single bed monthly fee.',
      },
      {
        paymentId: `PAY-${month.replace('-', '')}-202`,
        studentId: 'GIS250202',
        studentName: 'Siti Khadijah binti Ismail',
        roomId: 'NSQ-C-12-B2',
        hostelLocation: 'Nilai Square' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 280,
        paymentMethod: 'Online Transfer (FPX/DuitNow)' as PaymentMethod,
        referenceNo: 'REM-NSQ-019',
        paymentDate: today,
        status: 'Overdue' as PaymentStatus,
        notes: 'Reminder sent via WhatsApp on 10th.',
      },
    ];

    for (const p of samplePayments) {
      batch.set(doc(db, 'payments', p.paymentId), {
        ...p,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sample-seed');
  }
}
