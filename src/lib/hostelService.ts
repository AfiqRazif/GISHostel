import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  createStaffAuthAccount,
  db,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  buildRoomId,
  calculateFirstMonthDefaults,
  calculateStudentBilling,
  DATE_REGEX,
  extractUsernameFromEmail,
  FIELD_LIMITS,
  generateBulkBedSlots,
  generateReceiptNumber,
  getCurrentMonthISO,
  getNormalizedStayHistory,
  getTodayISO,
  HostelLocation,
  ID_REGEX,
  MONTH_REGEX,
  normalizeStaffLoginEmail,
  OccupancyMode,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PhysicalReceiptStatus,
  ProgramType,
  ResidentHostelLocation,
  ResidentType,
  Room,
  RoomStatus,
  sanitizeIdSegment,
  StaffRole,
  StaffUser,
  StayHistorySegment,
  Student,
  StudentStatus,
  subtractOneDayISO,
} from '../types/hostel';

export { calculateStudentBilling };

function createStaySegmentId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SEG-${stamp}-${rand}`;
}

function computeClosedEndDate(startDate: string, effectiveTransferDate: string): string {
  const dayBefore = subtractOneDayISO(effectiveTransferDate);
  if (
    startDate.slice(0, 7) === effectiveTransferDate.slice(0, 7) ||
    dayBefore < startDate
  ) {
    return effectiveTransferDate;
  }
  return dayBefore;
}

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

export async function syncStaffUserRecord(user: User): Promise<StaffUser> {
  const email = (user.email || `${user.uid}@gis-hostel.local`)
    .trim()
    .slice(0, FIELD_LIMITS.email.max);
  const path = `staff_users/${user.uid}`;

  try {
    const ref = doc(db, 'staff_users', user.uid);
    const existingSnap = await getDoc(ref);

    if (existingSnap.exists()) {
      return existingSnap.data() as StaffUser;
    }

    const firstCheckSnap = await getDocs(
      query(collection(db, 'staff_users'), limit(1))
    );
    const isFirstUser = firstCheckSnap.empty;

    const fullName = (
      user.displayName ||
      extractUsernameFromEmail(email) ||
      'GIS Staff'
    )
      .trim()
      .slice(0, FIELD_LIMITS.fullName.max);
    const username = extractUsernameFromEmail(email).slice(0, 64);
    const role: StaffRole = isFirstUser ? 'Master Admin' : 'Staff';

    const newRecord = {
      uid: user.uid,
      username,
      email,
      fullName,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, newRecord);
    const createdSnap = await getDoc(ref);
    return (createdSnap.data() as StaffUser) || {
      uid: user.uid,
      username,
      email,
      fullName,
      role,
      active: true,
      createdAt: null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface CreateManagedStaffInput {
  username: string;
  customEmail?: string;
  fullName: string;
  password: string;
  role: StaffRole;
}

export async function createManagedStaffAccount(
  input: CreateManagedStaffInput,
  masterAdminEmail: string
): Promise<{ email: string; uid: string }> {
  const adminEmail = assertStaffEmail(masterAdminEmail);
  const cleanUsername = input.username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._-]/g, '');
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);

  if (cleanUsername.length < 2) {
    throw new Error('Username must be at least 2 alphanumeric characters.');
  }
  if (fullName.length < 2) {
    throw new Error('Full Name must be at least 2 characters.');
  }
  if (input.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const loginEmail = input.customEmail?.trim()
    ? input.customEmail.trim().toLowerCase()
    : normalizeStaffLoginEmail(cleanUsername);

  if (!loginEmail.includes('@')) {
    throw new Error('Login email must be a valid email address.');
  }

  const { uid } = await createStaffAuthAccount(loginEmail, input.password);
  const path = `staff_users/${uid}`;

  try {
    await setDoc(doc(db, 'staff_users', uid), {
      uid,
      username: cleanUsername.slice(0, 64),
      email: loginEmail.slice(0, FIELD_LIMITS.email.max),
      fullName,
      role: input.role,
      active: true,
      createdAt: serverTimestamp(),
      updatedBy: adminEmail,
      updatedAt: serverTimestamp(),
    });
    return { email: loginEmail, uid };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStaffUserAccount(
  uid: string,
  updates: { role?: StaffRole; active?: boolean; fullName?: string },
  masterAdminEmail: string
): Promise<void> {
  const adminEmail = assertStaffEmail(masterAdminEmail);
  const path = `staff_users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      updatedBy: adminEmail,
      updatedAt: serverTimestamp(),
    };
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.fullName !== undefined) {
      payload.fullName = updates.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
    }
    await updateDoc(doc(db, 'staff_users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
      statusNote: null,
      exclusiveResidentId: null,
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
        statusNote: null,
        exclusiveResidentId: null,
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
      'Check out or unassign the current resident in the Students tab before changing status.'
    );
  }
  if (!hasAssignedStudent && input.status === 'Occupied') {
    throw new Error('Register or assign a resident to mark a bed as Occupied.');
  }
  if (room.status === 'Reserved / Blocked' && input.status !== 'Reserved / Blocked') {
    throw new Error(
      'This bed is blocked by a Whole Unit Exclusive occupancy. Check out or switch the resident to Single Bed first.'
    );
  }
  if (room.status !== 'Reserved / Blocked' && input.status === 'Reserved / Blocked') {
    throw new Error(
      'Reserved / Blocked status is automatically managed by Whole Unit Exclusive residency.'
    );
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
      statusNote: room.statusNote ?? null,
      exclusiveResidentId: room.exclusiveResidentId ?? null,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'rooms', room.roomId));

    if (room.currentStudentId) {
      const studentRef = doc(db, 'students', room.currentStudentId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const sData = studentSnap.data() as Student;
        const existingHistory = Array.isArray(sData.stayHistory)
          ? sData.stayHistory.map((seg) =>
              !seg.endDate && seg.roomId === room.roomId
                ? { ...seg, roomId: nextRoomId, hostelLocation: input.location }
                : seg
            )
          : undefined;
        const studentUpdate: Record<string, unknown> = {
          assignedRoomId: nextRoomId,
          hostelLocation: input.location,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        };
        if (existingHistory) {
          studentUpdate.stayHistory = existingHistory;
        }
        batch.update(studentRef, studentUpdate);
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
  if (room.status === 'Occupied' || room.status === 'Reserved / Blocked') {
    throw new Error(
      'Cannot delete an occupied or exclusive-unit blocked bed. Check out the resident first.'
    );
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
  residentType: ResidentType;
  occupancyMode: OccupancyMode;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  assignedRoomId: string;
  status: 'Active' | 'Checked-Out';
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  standardRoomRate: number;
  monthlyRebate: number;
  rebateReason: string;
  firstMonthCharge: number;
  firstMonthNote: string;
}

export async function registerStudent(
  input: RegisterStudentInput,
  selectedRoom: Room,
  allRooms: Room[],
  staffEmail: string
): Promise<{ blockedSiblings: string[] }> {
  const email = assertStaffEmail(staffEmail);
  const studentId = sanitizeIdSegment(input.studentId).slice(0, FIELD_LIMITS.studentId.max);
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
  const phone = input.phone.trim().slice(0, FIELD_LIMITS.phone.max);
  const emergencyContact = input.emergencyContact.trim().slice(0, FIELD_LIMITS.emergencyContact.max);
  const standardRoomRate = clampNumber(
    input.standardRoomRate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const monthlyRebate = clampNumber(
    input.monthlyRebate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const effectiveMonthlyFee = Math.max(
    0,
    Math.round((standardRoomRate - monthlyRebate) * 100) / 100
  );
  const firstMonthDefaults = calculateFirstMonthDefaults(
    input.checkInDate,
    effectiveMonthlyFee
  );
  const firstMonthCharge = clampNumber(
    typeof input.firstMonthCharge === 'number' && !Number.isNaN(input.firstMonthCharge)
      ? input.firstMonthCharge
      : firstMonthDefaults.firstMonthCharge,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const firstMonthNote = (
    input.firstMonthNote?.trim() || firstMonthDefaults.firstMonthNote
  ).slice(0, 64);

  const rebateReason = (input.rebateReason || 'None').trim().slice(0, FIELD_LIMITS.rebateReason.max);
  const depositPaid = clampNumber(
    input.depositPaid,
    FIELD_LIMITS.depositPaid.min,
    FIELD_LIMITS.depositPaid.max
  );

  if (!ID_REGEX.test(studentId) || studentId.length < FIELD_LIMITS.studentId.min) {
    throw new Error('Resident ID (Matrix / IC) must be 3–64 characters (letters, numbers, hyphens, underscores).');
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
  if (input.status === 'Checked-Out') {
    if (!input.checkOutDate || !DATE_REGEX.test(input.checkOutDate)) {
      throw new Error('Check-Out Date (YYYY-MM-DD) is required when importing a historical Checked-Out resident.');
    }
    if (input.checkOutDate < input.checkInDate) {
      throw new Error('Check-Out Date cannot be earlier than Check-In Date.');
    }
  } else if (selectedRoom.status !== 'Vacant') {
    throw new Error('Selected room is no longer Vacant. Please choose another available bed.');
  }

  const studentRef = doc(db, 'students', studentId);
  const roomRef = doc(db, 'rooms', selectedRoom.roomId);
  const blockedSiblings: string[] = [];

  try {
    const existingStudent = await getDoc(studentRef);
    if (existingStudent.exists()) {
      throw new Error(`Resident ID "${studentId}" is already registered.`);
    }

    const batch = writeBatch(db);

    if (input.status === 'Active') {
      const freshRoom = await getDoc(roomRef);
      if (!freshRoom.exists() || freshRoom.data()?.status !== 'Vacant') {
        throw new Error(`Room "${selectedRoom.roomId}" is not currently Vacant.`);
      }

      batch.update(roomRef, {
        status: 'Occupied',
        currentStudentId: studentId,
        currentStudentName: fullName,
        statusNote: null,
        exclusiveResidentId: null,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      if (input.occupancyMode === 'Whole Unit Exclusive') {
        const siblings = allRooms.filter(
          (r) =>
            r.roomId !== selectedRoom.roomId &&
            r.location === selectedRoom.location &&
            r.block === selectedRoom.block &&
            r.unitNo === selectedRoom.unitNo &&
            r.status === 'Vacant'
        );
        const note = `Exclusive Unit: ${fullName}`.slice(0, FIELD_LIMITS.statusNote.max);
        for (const sib of siblings) {
          const sibRef = doc(db, 'rooms', sib.roomId);
          const sibSnap = await getDoc(sibRef);
          if (sibSnap.exists() && sibSnap.data()?.status === 'Vacant') {
            batch.update(sibRef, {
              status: 'Reserved / Blocked',
              currentStudentId: null,
              currentStudentName: null,
              statusNote: note,
              exclusiveResidentId: studentId,
              updatedBy: email,
              updatedAt: serverTimestamp(),
            });
            blockedSiblings.push(sib.roomId);
          }
        }
      }
    }

    const initialSegment: StayHistorySegment = {
      id: createStaySegmentId(),
      roomId: selectedRoom.roomId,
      hostelLocation: selectedRoom.location,
      occupancyMode: input.occupancyMode,
      startDate: input.checkInDate,
      endDate: input.status === 'Checked-Out' ? input.checkOutDate : null,
      standardRoomRate,
      monthlyRebate,
      effectiveMonthlyFee,
      firstMonthCharge,
      reason:
        input.status === 'Checked-Out'
          ? 'Historical Record Import'
          : 'Initial Check-In',
      recordedBy: email,
      recordedAt: new Date().toISOString(),
    };

    batch.set(studentRef, {
      studentId,
      fullName,
      residentType: input.residentType,
      occupancyMode: input.occupancyMode,
      phone,
      emergencyContact,
      program: input.program,
      assignedRoomId: selectedRoom.roomId,
      hostelLocation: selectedRoom.location,
      checkInDate: input.checkInDate,
      checkOutDate: input.status === 'Checked-Out' ? input.checkOutDate : null,
      depositPaid,
      standardRoomRate,
      monthlyRebate,
      rebateReason,
      effectiveMonthlyFee,
      monthlyFee: effectiveMonthlyFee,
      firstMonthCharge,
      firstMonthNote,
      stayHistory: [initialSegment],
      status: input.status,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return { blockedSiblings };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already registered') ||
        error.message.includes('Vacant') ||
        error.message.includes('Check-Out'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `students/${studentId}`);
  }
}

export interface UpdateStudentInput {
  fullName: string;
  residentType: ResidentType;
  occupancyMode: OccupancyMode;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  status: StudentStatus;
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  standardRoomRate: number;
  monthlyRebate: number;
  rebateReason: string;
  firstMonthCharge: number;
  firstMonthNote: string;
  newRoom?: Room | null;
}

export async function updateStudentRecord(
  currentStudent: Student,
  input: UpdateStudentInput,
  allRooms: Room[],
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
  const phone = input.phone.trim().slice(0, FIELD_LIMITS.phone.max);
  const emergencyContact = input.emergencyContact.trim().slice(0, FIELD_LIMITS.emergencyContact.max);
  const standardRoomRate = clampNumber(
    input.standardRoomRate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const monthlyRebate = clampNumber(
    input.monthlyRebate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const effectiveMonthlyFee = Math.max(
    0,
    Math.round((standardRoomRate - monthlyRebate) * 100) / 100
  );
  const firstMonthDefaults = calculateFirstMonthDefaults(
    input.checkInDate,
    effectiveMonthlyFee
  );
  const firstMonthCharge = clampNumber(
    typeof input.firstMonthCharge === 'number' && !Number.isNaN(input.firstMonthCharge)
      ? input.firstMonthCharge
      : firstMonthDefaults.firstMonthCharge,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const firstMonthNote = (
    input.firstMonthNote?.trim() || firstMonthDefaults.firstMonthNote
  ).slice(0, 64);

  const rebateReason = (input.rebateReason || 'None').trim().slice(0, FIELD_LIMITS.rebateReason.max);
  const depositPaid = clampNumber(
    input.depositPaid,
    FIELD_LIMITS.depositPaid.min,
    FIELD_LIMITS.depositPaid.max
  );

  if (fullName.length < FIELD_LIMITS.fullName.min) {
    throw new Error('Full Name must be at least 2 characters.');
  }
  if (!DATE_REGEX.test(input.checkInDate)) {
    throw new Error('Check-In Date must be in YYYY-MM-DD format.');
  }
  if (input.status === 'Checked-Out') {
    if (!input.checkOutDate || !DATE_REGEX.test(input.checkOutDate)) {
      throw new Error('A valid Check-Out Date (YYYY-MM-DD) is required when checking out a resident.');
    }
    if (input.checkOutDate < input.checkInDate) {
      throw new Error('Check-Out Date cannot be earlier than Check-In Date.');
    }
  }

  const studentRef = doc(db, 'students', currentStudent.studentId);
  const batch = writeBatch(db);
  const exclusiveNote = `Exclusive Unit: ${fullName}`.slice(0, FIELD_LIMITS.statusNote.max);

  const releaseUnitExclusiveBlocks = (anchorRoom: Room | undefined) => {
    for (const r of allRooms) {
      if (r.status !== 'Reserved / Blocked') continue;
      const matchesResident = r.exclusiveResidentId === currentStudent.studentId;
      const matchesUnit =
        anchorRoom &&
        r.location === anchorRoom.location &&
        r.block === anchorRoom.block &&
        r.unitNo === anchorRoom.unitNo;
      if (matchesResident || matchesUnit) {
        batch.update(doc(db, 'rooms', r.roomId), {
          status: 'Vacant',
          currentStudentId: null,
          currentStudentName: null,
          statusNote: null,
          exclusiveResidentId: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }
  };

  const applyUnitExclusiveBlocks = async (targetRoom: Room) => {
    const siblings = allRooms.filter(
      (r) =>
        r.roomId !== targetRoom.roomId &&
        r.location === targetRoom.location &&
        r.block === targetRoom.block &&
        r.unitNo === targetRoom.unitNo &&
        r.status === 'Vacant'
    );
    for (const sib of siblings) {
      const sibRef = doc(db, 'rooms', sib.roomId);
      const sibSnap = await getDoc(sibRef);
      if (sibSnap.exists() && sibSnap.data()?.status === 'Vacant') {
        batch.update(sibRef, {
          status: 'Reserved / Blocked',
          currentStudentId: null,
          currentStudentName: null,
          statusNote: exclusiveNote,
          exclusiveResidentId: currentStudent.studentId,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }
  };

  try {
    const existingStayHistory: StayHistorySegment[] =
      Array.isArray(currentStudent.stayHistory) && currentStudent.stayHistory.length > 0
        ? currentStudent.stayHistory.map((seg) => ({ ...seg }))
        : currentStudent.assignedRoomId
          ? getNormalizedStayHistory(currentStudent)
          : [];

    const currentRoomObj = currentStudent.assignedRoomId
      ? allRooms.find((r) => r.roomId === currentStudent.assignedRoomId)
      : undefined;

    if (currentStudent.status !== 'Checked-Out' && input.status === 'Checked-Out') {
      if (currentStudent.assignedRoomId) {
        const assignedRoomRef = doc(db, 'rooms', currentStudent.assignedRoomId);
        const roomSnap = await getDoc(assignedRoomRef);

        if (roomSnap.exists() && roomSnap.data()?.currentStudentId === currentStudent.studentId) {
          batch.update(assignedRoomRef, {
            status: 'Vacant',
            currentStudentId: null,
            currentStudentName: null,
            statusNote: null,
            exclusiveResidentId: null,
            updatedBy: email,
            updatedAt: serverTimestamp(),
          });
        }
      }

      releaseUnitExclusiveBlocks(currentRoomObj);

      const closedHistory = existingStayHistory.map((seg, idx) => {
        if (!seg.endDate || idx === existingStayHistory.length - 1) {
          return {
            ...seg,
            endDate: seg.endDate || input.checkOutDate,
          };
        }
        return seg;
      });

      batch.update(studentRef, {
        fullName,
        residentType: input.residentType,
        occupancyMode: input.occupancyMode,
        phone,
        emergencyContact,
        program: input.program,
        status: 'Checked-Out',
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        depositPaid,
        standardRoomRate,
        monthlyRebate,
        rebateReason,
        effectiveMonthlyFee,
        monthlyFee: effectiveMonthlyFee,
        firstMonthCharge,
        firstMonthNote,
        stayHistory: closedHistory,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return;
    }

    if (currentStudent.status === 'Checked-Out' && input.status === 'Active') {
      if (!input.newRoom || input.newRoom.status !== 'Vacant') {
        throw new Error('Select an available Vacant room to re-activate this resident.');
      }
      const newRoomRef = doc(db, 'rooms', input.newRoom.roomId);
      const freshNewRoom = await getDoc(newRoomRef);
      if (!freshNewRoom.exists() || freshNewRoom.data()?.status !== 'Vacant') {
        throw new Error(`Room "${input.newRoom.roomId}" is no longer Vacant.`);
      }

      batch.update(newRoomRef, {
        status: 'Occupied',
        currentStudentId: currentStudent.studentId,
        currentStudentName: fullName,
        statusNote: null,
        exclusiveResidentId: null,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      if (input.occupancyMode === 'Whole Unit Exclusive') {
        await applyUnitExclusiveBlocks(input.newRoom);
      }

      const lastSeg = existingStayHistory[existingStayHistory.length - 1];
      const restartDate =
        lastSeg?.endDate && input.checkInDate <= lastSeg.endDate
          ? getTodayISO()
          : input.checkInDate;
      const recheckSegment: StayHistorySegment = {
        id: createStaySegmentId(),
        roomId: input.newRoom.roomId,
        hostelLocation: input.newRoom.location,
        occupancyMode: input.occupancyMode,
        startDate: restartDate,
        endDate: null,
        standardRoomRate,
        monthlyRebate,
        effectiveMonthlyFee,
        reason: 'Re-Check-In',
        recordedBy: email,
        recordedAt: new Date().toISOString(),
      };
      if (existingStayHistory.length === 0) {
        recheckSegment.firstMonthCharge = firstMonthCharge;
      }

      batch.update(studentRef, {
        fullName,
        residentType: input.residentType,
        occupancyMode: input.occupancyMode,
        phone,
        emergencyContact,
        program: input.program,
        status: 'Active',
        checkOutDate: null,
        checkInDate: input.checkInDate,
        assignedRoomId: input.newRoom.roomId,
        hostelLocation: input.newRoom.location,
        depositPaid,
        standardRoomRate,
        monthlyRebate,
        rebateReason,
        effectiveMonthlyFee,
        monthlyFee: effectiveMonthlyFee,
        firstMonthCharge,
        firstMonthNote,
        stayHistory: [...existingStayHistory, recheckSegment],
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    let targetRoomId = currentStudent.assignedRoomId;
    let targetLocation = currentStudent.hostelLocation;
    let nextStayHistory = existingStayHistory;

    if (input.status !== 'Checked-Out') {
      if (input.newRoom && input.newRoom.roomId !== currentStudent.assignedRoomId) {
        if (input.newRoom.status !== 'Vacant') {
          throw new Error('Target room must be Vacant for a room assignment.');
        }
        const newRoomRef = doc(db, 'rooms', input.newRoom.roomId);
        const freshNewRoom = await getDoc(newRoomRef);
        if (!freshNewRoom.exists() || freshNewRoom.data()?.status !== 'Vacant') {
          throw new Error(`Room "${input.newRoom.roomId}" is no longer Vacant.`);
        }

        if (currentStudent.assignedRoomId) {
          const oldRoomRef = doc(db, 'rooms', currentStudent.assignedRoomId);
          const oldSnap = await getDoc(oldRoomRef);
          if (oldSnap.exists() && oldSnap.data()?.currentStudentId === currentStudent.studentId) {
            batch.update(oldRoomRef, {
              status: 'Vacant',
              currentStudentId: null,
              currentStudentName: null,
              statusNote: null,
              exclusiveResidentId: null,
              updatedBy: email,
              updatedAt: serverTimestamp(),
            });
          }
        }
        releaseUnitExclusiveBlocks(currentRoomObj);

        batch.update(newRoomRef, {
          status: 'Occupied',
          currentStudentId: currentStudent.studentId,
          currentStudentName: fullName,
          statusNote: null,
          exclusiveResidentId: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });

        if (input.status === 'Active' && input.occupancyMode === 'Whole Unit Exclusive') {
          await applyUnitExclusiveBlocks(input.newRoom);
        }

        targetRoomId = input.newRoom.roomId;
        targetLocation = input.newRoom.location;

        if (!currentStudent.assignedRoomId && existingStayHistory.length === 0) {
          nextStayHistory = [
            {
              id: createStaySegmentId(),
              roomId: input.newRoom.roomId,
              hostelLocation: input.newRoom.location,
              occupancyMode: input.occupancyMode,
              startDate: input.checkInDate,
              endDate: null,
              standardRoomRate,
              monthlyRebate,
              effectiveMonthlyFee,
              firstMonthCharge,
              reason: 'Initial Room Assignment',
              recordedBy: email,
              recordedAt: new Date().toISOString(),
            },
          ];
        } else {
          const today = getTodayISO();
          const closedPrev = existingStayHistory.map((seg, idx) => {
            if (!seg.endDate || idx === existingStayHistory.length - 1) {
              return {
                ...seg,
                endDate: seg.endDate || computeClosedEndDate(seg.startDate, today),
              };
            }
            return seg;
          });
          nextStayHistory = [
            ...closedPrev,
            {
              id: createStaySegmentId(),
              roomId: input.newRoom.roomId,
              hostelLocation: input.newRoom.location,
              occupancyMode: input.occupancyMode,
              startDate: today,
              endDate: null,
              standardRoomRate,
              monthlyRebate,
              effectiveMonthlyFee,
              reason: 'Room Transfer (Profile Edit)',
              recordedBy: email,
              recordedAt: new Date().toISOString(),
            },
          ];
        }
      } else if (currentRoomObj) {
        if (currentRoomObj.currentStudentId === currentStudent.studentId) {
          batch.update(doc(db, 'rooms', currentRoomObj.roomId), {
            currentStudentName: fullName,
            updatedBy: email,
            updatedAt: serverTimestamp(),
          });
        }
        if (input.status === 'Active' && input.occupancyMode === 'Whole Unit Exclusive') {
          for (const r of allRooms) {
            if (
              r.status === 'Reserved / Blocked' &&
              (r.exclusiveResidentId === currentStudent.studentId ||
                (r.location === currentRoomObj.location &&
                  r.block === currentRoomObj.block &&
                  r.unitNo === currentRoomObj.unitNo))
            ) {
              batch.update(doc(db, 'rooms', r.roomId), {
                statusNote: exclusiveNote,
                exclusiveResidentId: currentStudent.studentId,
                updatedBy: email,
                updatedAt: serverTimestamp(),
              });
            }
          }
          await applyUnitExclusiveBlocks(currentRoomObj);
        } else {
          releaseUnitExclusiveBlocks(currentRoomObj);
        }

        if (nextStayHistory.length > 0) {
          const lastIdx = nextStayHistory.length - 1;
          nextStayHistory = nextStayHistory.map((seg, idx) => {
            if (idx !== lastIdx || seg.endDate) return seg;
            const updatedSeg: StayHistorySegment = {
              ...seg,
              occupancyMode: input.occupancyMode,
              standardRoomRate,
              monthlyRebate,
              effectiveMonthlyFee,
              startDate: idx === 0 ? input.checkInDate : seg.startDate,
            };
            if (idx === 0) {
              updatedSeg.firstMonthCharge = firstMonthCharge;
            }
            return updatedSeg;
          });
        }
      }
    }

    batch.update(studentRef, {
      fullName,
      residentType: input.residentType,
      occupancyMode: input.occupancyMode,
      phone,
      emergencyContact,
      program: input.program,
      status: input.status,
      checkInDate: input.checkInDate,
      checkOutDate: input.status === 'Checked-Out' ? input.checkOutDate : null,
      assignedRoomId: targetRoomId,
      hostelLocation: targetLocation,
      depositPaid,
      standardRoomRate,
      monthlyRebate,
      rebateReason,
      effectiveMonthlyFee,
      monthlyFee: effectiveMonthlyFee,
      firstMonthCharge,
      firstMonthNote,
      stayHistory: nextStayHistory,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Vacant') || error.message.includes('Check-Out'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `students/${currentStudent.studentId}`);
  }
}

export interface TransferStudentRoomInput {
  effectiveTransferDate: string;
  newRoom: Room;
  newOccupancyMode: OccupancyMode;
  newStandardRate: number;
  keepExistingRebate: boolean;
  newMonthlyRebate: number;
  newRebateReason: string;
  transferReason: string;
}

export async function transferStudentRoom(
  currentStudent: Student,
  input: TransferStudentRoomInput,
  allRooms: Room[],
  staffEmail: string
): Promise<{ blockedSiblings: string[]; releasedRoomId: string | null }> {
  const email = assertStaffEmail(staffEmail);

  if (currentStudent.status !== 'Active') {
    throw new Error('Only Active residents can be transferred to another room.');
  }
  if (!DATE_REGEX.test(input.effectiveTransferDate)) {
    throw new Error('Effective Transfer Date must be in YYYY-MM-DD format.');
  }
  if (
    DATE_REGEX.test(currentStudent.checkInDate) &&
    input.effectiveTransferDate < currentStudent.checkInDate
  ) {
    throw new Error('Transfer date cannot be earlier than the resident check-in date.');
  }
  if (input.newRoom.roomId === currentStudent.assignedRoomId) {
    throw new Error('Please choose a different Vacant bed to transfer this resident.');
  }
  if (input.newRoom.status !== 'Vacant') {
    throw new Error(`Target room "${input.newRoom.roomId}" is not Vacant.`);
  }

  const newStandardRate = clampNumber(
    input.newStandardRate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const baseExistingRebate =
    typeof currentStudent.monthlyRebate === 'number'
      ? currentStudent.monthlyRebate
      : 0;
  const newMonthlyRebate = clampNumber(
    input.keepExistingRebate ? baseExistingRebate : input.newMonthlyRebate,
    FIELD_LIMITS.monthlyFee.min,
    FIELD_LIMITS.monthlyFee.max
  );
  const newEffectiveMonthlyFee = Math.max(
    0,
    Math.round((newStandardRate - newMonthlyRebate) * 100) / 100
  );
  const newRebateReason = (
    input.keepExistingRebate
      ? currentStudent.rebateReason || 'None'
      : input.newRebateReason || 'None'
  )
    .trim()
    .slice(0, FIELD_LIMITS.rebateReason.max);
  const transferReason = (input.transferReason || 'Student Request')
    .trim()
    .slice(0, 120);

  const studentRef = doc(db, 'students', currentStudent.studentId);
  const newRoomRef = doc(db, 'rooms', input.newRoom.roomId);
  const blockedSiblings: string[] = [];

  try {
    const freshNewRoom = await getDoc(newRoomRef);
    if (!freshNewRoom.exists() || freshNewRoom.data()?.status !== 'Vacant') {
      throw new Error(`Room "${input.newRoom.roomId}" is no longer Vacant.`);
    }

    const batch = writeBatch(db);
    const currentRoomObj = currentStudent.assignedRoomId
      ? allRooms.find((r) => r.roomId === currentStudent.assignedRoomId)
      : undefined;

    if (currentStudent.assignedRoomId) {
      const oldRoomRef = doc(db, 'rooms', currentStudent.assignedRoomId);
      const oldSnap = await getDoc(oldRoomRef);
      if (
        oldSnap.exists() &&
        oldSnap.data()?.currentStudentId === currentStudent.studentId
      ) {
        batch.update(oldRoomRef, {
          status: 'Vacant',
          currentStudentId: null,
          currentStudentName: null,
          statusNote: null,
          exclusiveResidentId: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Release any old unit-exclusive blocks held by this resident
    for (const r of allRooms) {
      if (r.status !== 'Reserved / Blocked') continue;
      const matchesResident = r.exclusiveResidentId === currentStudent.studentId;
      const matchesOldUnit =
        currentRoomObj &&
        r.location === currentRoomObj.location &&
        r.block === currentRoomObj.block &&
        r.unitNo === currentRoomObj.unitNo;
      if (matchesResident || matchesOldUnit) {
        batch.update(doc(db, 'rooms', r.roomId), {
          status: 'Vacant',
          currentStudentId: null,
          currentStudentName: null,
          statusNote: null,
          exclusiveResidentId: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Lock the newly selected room as Occupied
    batch.update(newRoomRef, {
      status: 'Occupied',
      currentStudentId: currentStudent.studentId,
      currentStudentName: currentStudent.fullName,
      statusNote: null,
      exclusiveResidentId: null,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    // Lock sibling vacant beds if Whole Unit Exclusive
    if (input.newOccupancyMode === 'Whole Unit Exclusive') {
      const exclusiveNote = `Exclusive Unit: ${currentStudent.fullName}`.slice(
        0,
        FIELD_LIMITS.statusNote.max
      );
      const siblings = allRooms.filter(
        (r) =>
          r.roomId !== input.newRoom.roomId &&
          r.location === input.newRoom.location &&
          r.block === input.newRoom.block &&
          r.unitNo === input.newRoom.unitNo &&
          r.status === 'Vacant'
      );
      for (const sib of siblings) {
        const sibRef = doc(db, 'rooms', sib.roomId);
        const sibSnap = await getDoc(sibRef);
        if (sibSnap.exists() && sibSnap.data()?.status === 'Vacant') {
          batch.update(sibRef, {
            status: 'Reserved / Blocked',
            currentStudentId: null,
            currentStudentName: null,
            statusNote: exclusiveNote,
            exclusiveResidentId: currentStudent.studentId,
            updatedBy: email,
            updatedAt: serverTimestamp(),
          });
          blockedSiblings.push(sib.roomId);
        }
      }
    }

    const existingStayHistory: StayHistorySegment[] =
      Array.isArray(currentStudent.stayHistory) && currentStudent.stayHistory.length > 0
        ? currentStudent.stayHistory.map((seg) => ({ ...seg }))
        : currentStudent.assignedRoomId
          ? getNormalizedStayHistory(currentStudent)
          : [];

    const closedHistory: StayHistorySegment[] = existingStayHistory.map((seg, idx) => {
      if (!seg.endDate || idx === existingStayHistory.length - 1) {
        return {
          ...seg,
          endDate:
            seg.endDate ||
            computeClosedEndDate(seg.startDate, input.effectiveTransferDate),
        };
      }
      return seg;
    });

    const isFirstAssignedSegment = closedHistory.length === 0;
    const newSegment: StayHistorySegment = {
      id: createStaySegmentId(),
      roomId: input.newRoom.roomId,
      hostelLocation: input.newRoom.location,
      occupancyMode: input.newOccupancyMode,
      startDate: isFirstAssignedSegment
        ? currentStudent.checkInDate || input.effectiveTransferDate
        : input.effectiveTransferDate,
      endDate: null,
      standardRoomRate: newStandardRate,
      monthlyRebate: newMonthlyRebate,
      effectiveMonthlyFee: newEffectiveMonthlyFee,
      reason: isFirstAssignedSegment ? 'Initial Room Assignment' : transferReason,
      recordedBy: email,
      recordedAt: new Date().toISOString(),
    };
    if (isFirstAssignedSegment) {
      newSegment.firstMonthCharge =
        typeof currentStudent.firstMonthCharge === 'number'
          ? currentStudent.firstMonthCharge
          : calculateFirstMonthDefaults(
              newSegment.startDate,
              newEffectiveMonthlyFee
            ).firstMonthCharge;
    }

    batch.update(studentRef, {
      assignedRoomId: input.newRoom.roomId,
      hostelLocation: input.newRoom.location,
      occupancyMode: input.newOccupancyMode,
      standardRoomRate: newStandardRate,
      monthlyRebate: newMonthlyRebate,
      rebateReason: newRebateReason,
      effectiveMonthlyFee: newEffectiveMonthlyFee,
      monthlyFee: newEffectiveMonthlyFee,
      stayHistory: [...closedHistory, newSegment],
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return {
      blockedSiblings,
      releasedRoomId: currentStudent.assignedRoomId || null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Vacant') ||
        error.message.includes('Transfer') ||
        error.message.includes('Active'))
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
  bankRefNo: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
  proofImageData?: string | null;
}

export async function createPayment(
  input: CreatePaymentInput,
  existingPayments: Payment[],
  staffEmail: string
): Promise<{ receiptNo: string }> {
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
  const receiptNo = generateReceiptNumber(input.billingMonth, existingPayments);
  const bankRefNo = input.bankRefNo.trim().slice(0, FIELD_LIMITS.bankRefNo.max);

  const path = `payments/${paymentId}`;
  try {
    await setDoc(doc(db, 'payments', paymentId), {
      paymentId,
      receiptNo,
      studentId: input.student.studentId,
      studentName: input.student.fullName.slice(0, FIELD_LIMITS.fullName.max),
      roomId: input.student.assignedRoomId,
      hostelLocation: input.student.hostelLocation,
      billingMonth: input.billingMonth,
      paymentType: input.paymentType,
      amount: clampNumber(input.amount, FIELD_LIMITS.amount.min, FIELD_LIMITS.amount.max),
      paymentMethod: input.paymentMethod,
      bankRefNo,
      referenceNo: bankRefNo,
      paymentDate: input.paymentDate,
      status: input.status,
      notes: input.notes.trim().slice(0, FIELD_LIMITS.notes.max),
      proofImageData: input.proofImageData || null,
      physicalReceiptStatus: 'Pending Issuance' as PhysicalReceiptStatus,
      physicalReceiptNo: '',
      receiptIssuedBy: null,
      receiptIssuedAt: null,
      recordedBy: email,
      recordedAt: serverTimestamp(),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
    return { receiptNo };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface UpdatePaymentInput {
  billingMonth: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  bankRefNo: string;
  paymentDate: string;
  status: PaymentStatus;
  notes: string;
  proofImageData?: string | null;
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

  const bankRefNo = input.bankRefNo.trim().slice(0, FIELD_LIMITS.bankRefNo.max);
  const path = `payments/${paymentId}`;
  try {
    const payload: Record<string, unknown> = {
      billingMonth: input.billingMonth,
      paymentType: input.paymentType,
      amount: clampNumber(input.amount, FIELD_LIMITS.amount.min, FIELD_LIMITS.amount.max),
      paymentMethod: input.paymentMethod,
      bankRefNo,
      referenceNo: bankRefNo,
      paymentDate: input.paymentDate,
      status: input.status,
      notes: input.notes.trim().slice(0, FIELD_LIMITS.notes.max),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    };
    if (input.proofImageData !== undefined) {
      payload.proofImageData = input.proofImageData;
    }
    await updateDoc(doc(db, 'payments', paymentId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markPhysicalReceiptIssued(
  paymentId: string,
  physicalReceiptNo: string,
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);
  const path = `payments/${paymentId}`;
  try {
    await updateDoc(doc(db, 'payments', paymentId), {
      physicalReceiptStatus: 'Issued' as PhysicalReceiptStatus,
      physicalReceiptNo: physicalReceiptNo.trim().slice(0, 64),
      receiptIssuedBy: email,
      receiptIssuedAt: serverTimestamp(),
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
  const ym = month.replace('-', '');

  const sampleStudents = [
    {
      studentId: 'GIS250101',
      fullName: 'Muhammad Amirul Hakim bin Razak',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '011-2345 6789',
      emergencyContact: 'Razak bin Osman (Father) · 019-332 1140',
      program: 'Diploma' as ProgramType,
      assignedRoomId: 'DJ2-A-04-B1',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-09-01',
      checkOutDate: null,
      depositPaid: 250,
      standardRoomRate: 250,
      monthlyRebate: 0,
      rebateReason: 'None',
      effectiveMonthlyFee: 250,
      monthlyFee: 250,
      firstMonthCharge: 250,
      firstMonthNote: 'Standard Full Month',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250102',
      fullName: 'Nurul Aina Syafiqah binti Mohd Noor',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '013-887 4512',
      emergencyContact: 'Zaiton binti Karim (Mother) · 012-774 8890',
      program: 'SKM' as ProgramType,
      assignedRoomId: 'DJ2-A-04-B2',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-09-01',
      checkOutDate: null,
      depositPaid: 250,
      standardRoomRate: 250,
      monthlyRebate: 0,
      rebateReason: 'None',
      effectiveMonthlyFee: 250,
      monthlyFee: 250,
      firstMonthCharge: 250,
      firstMonthNote: 'Standard Full Month',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250103',
      fullName: 'Kavinesh A/L Subramaniam',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '016-445 9910',
      emergencyContact: 'Subramaniam A/L Muthu · 016-221 3309',
      program: 'DiFFER' as ProgramType,
      assignedRoomId: 'DJ2-B-02-B1',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-10-05',
      checkOutDate: null,
      depositPaid: 250,
      standardRoomRate: 250,
      monthlyRebate: 50,
      rebateReason: 'Management Rebate',
      effectiveMonthlyFee: 200,
      monthlyFee: 200,
      firstMonthCharge: 200,
      firstMonthNote: 'Standard Full Month',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250201',
      fullName: 'Tan Wei Ming',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '017-654 2210',
      emergencyContact: 'Tan Boon Hock (Father) · 012-301 9981',
      program: 'Diploma' as ProgramType,
      assignedRoomId: 'NSQ-C-12-B1',
      hostelLocation: 'Nilai Square' as HostelLocation,
      checkInDate: '2026-08-15',
      checkOutDate: null,
      depositPaid: 280,
      standardRoomRate: 280,
      monthlyRebate: 0,
      rebateReason: 'None',
      effectiveMonthlyFee: 280,
      monthlyFee: 280,
      firstMonthCharge: 280,
      firstMonthNote: 'Standard Full Month',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS250202',
      fullName: 'Siti Khadijah binti Ismail',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '014-909 1134',
      emergencyContact: 'Ismail bin Hamid · 019-665 0042',
      program: 'SKM' as ProgramType,
      assignedRoomId: 'NSQ-C-12-B2',
      hostelLocation: 'Nilai Square' as HostelLocation,
      checkInDate: '2026-09-18',
      checkOutDate: null,
      depositPaid: 280,
      standardRoomRate: 280,
      monthlyRebate: 0,
      rebateReason: 'None',
      effectiveMonthlyFee: 280,
      monthlyFee: 280,
      firstMonthCharge: 140,
      firstMonthNote: 'After 15th Half-Rate',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'STF-GIS-014',
      fullName: 'Encik Haziq bin Mansor',
      residentType: 'Lecturer / Staff' as ResidentType,
      occupancyMode: 'Whole Unit Exclusive' as OccupancyMode,
      phone: '019-778 2310',
      emergencyContact: 'Puan Nadia binti Aziz (Spouse) · 019-778 2311',
      program: 'Other' as ProgramType,
      assignedRoomId: 'NSQ-D-05-B1',
      hostelLocation: 'Nilai Square' as HostelLocation,
      checkInDate: '2026-09-01',
      checkOutDate: null,
      depositPaid: 300,
      standardRoomRate: 300,
      monthlyRebate: 150,
      rebateReason: 'Staff Housing',
      effectiveMonthlyFee: 150,
      monthlyFee: 150,
      firstMonthCharge: 150,
      firstMonthNote: 'Standard Full Month',
      status: 'Active' as StudentStatus,
    },
    {
      studentId: 'GIS240089',
      fullName: 'Ahmad Faiz bin Zulkifli',
      residentType: 'Student' as ResidentType,
      occupancyMode: 'Single Bed' as OccupancyMode,
      phone: '018-321 7745',
      emergencyContact: 'Zulkifli bin Ali · 019-412 5531',
      program: 'Other' as ProgramType,
      assignedRoomId: 'DJ2-B-02-B4',
      hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
      checkInDate: '2026-02-01',
      checkOutDate: '2026-10-31',
      depositPaid: 250,
      standardRoomRate: 250,
      monthlyRebate: 0,
      rebateReason: 'None',
      effectiveMonthlyFee: 250,
      monthlyFee: 250,
      firstMonthCharge: 250,
      firstMonthNote: 'Standard Full Month',
      status: 'Checked-Out' as StudentStatus,
    },
  ];

  const activeByRoom = new Map(
    sampleStudents
      .filter((s) => s.status === 'Active')
      .map((s) => [s.assignedRoomId, s])
  );

  const exclusiveUnits = sampleStudents
    .filter((s) => s.status === 'Active' && s.occupancyMode === 'Whole Unit Exclusive')
    .map((s) => ({
      resident: s,
      location: s.hostelLocation,
      block: 'D',
      unitNo: '05',
    }));

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
        const exclusiveHolder = !resident
          ? exclusiveUnits.find(
              (u) =>
                u.location === grp.location &&
                u.block === grp.block &&
                u.unitNo === grp.unitNo
            )
          : undefined;

        const status: RoomStatus = resident
          ? 'Occupied'
          : grp.maintenanceBed === bedSlot
            ? 'Maintenance'
            : exclusiveHolder
              ? 'Reserved / Blocked'
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
          statusNote: exclusiveHolder
            ? `Exclusive Unit: ${exclusiveHolder.resident.fullName}`
            : null,
          exclusiveResidentId: exclusiveHolder
            ? exclusiveHolder.resident.studentId
            : null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
      }
    }

    const seedIso = new Date().toISOString();
    for (const st of sampleStudents) {
      const initialSegment: StayHistorySegment = {
        id: `SEG-SEED-${st.studentId}`,
        roomId: st.assignedRoomId,
        hostelLocation: st.hostelLocation,
        occupancyMode: st.occupancyMode,
        startDate: st.checkInDate,
        endDate: st.status === 'Checked-Out' ? st.checkOutDate : null,
        standardRoomRate: st.standardRoomRate,
        monthlyRebate: st.monthlyRebate,
        effectiveMonthlyFee: st.effectiveMonthlyFee,
        firstMonthCharge: st.firstMonthCharge,
        reason:
          st.status === 'Checked-Out'
            ? 'Historical Record Import'
            : 'Initial Check-In',
        recordedBy: email,
        recordedAt: seedIso,
      };
      batch.set(doc(db, 'students', st.studentId), {
        ...st,
        stayHistory: [initialSegment],
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
    }

    const samplePayments = [
      {
        paymentId: `PAY-${ym}-101`,
        receiptNo: `GIS-${ym}-0001`,
        studentId: 'GIS250101',
        studentName: 'Muhammad Amirul Hakim bin Razak',
        roomId: 'DJ2-A-04-B1',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 250,
        paymentMethod: 'DuitNow QR' as PaymentMethod,
        bankRefNo: 'DUITNOW-984120',
        referenceNo: 'DUITNOW-984120',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'Hostel rent settled via DuitNow QR.',
        proofImageData: null,
        physicalReceiptStatus: 'Issued' as PhysicalReceiptStatus,
        physicalReceiptNo: 'BK-DJ2-0101',
        receiptIssuedBy: email,
        receiptIssuedAt: serverTimestamp(),
      },
      {
        paymentId: `PAY-${ym}-102`,
        receiptNo: `GIS-${ym}-0002`,
        studentId: 'GIS250102',
        studentName: 'Nurul Aina Syafiqah binti Mohd Noor',
        roomId: 'DJ2-A-04-B2',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 150,
        paymentMethod: 'Online Transfer' as PaymentMethod,
        bankRefNo: 'MBB-772104',
        referenceNo: 'MBB-772104',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'First installment payment (RM 100 remaining).',
        proofImageData: null,
        physicalReceiptStatus: 'Pending Issuance' as PhysicalReceiptStatus,
        physicalReceiptNo: '',
        receiptIssuedBy: null,
        receiptIssuedAt: null,
      },
      {
        paymentId: `PAY-${ym}-103`,
        receiptNo: `GIS-${ym}-0003`,
        studentId: 'GIS250103',
        studentName: 'Kavinesh A/L Subramaniam',
        roomId: 'DJ2-B-02-B1',
        hostelLocation: 'Apartment Desa Jati 2' as HostelLocation,
        billingMonth: month,
        paymentType: 'Rebate / Fee Waiver' as PaymentType,
        amount: 50,
        paymentMethod: 'Internal Adjustment' as PaymentMethod,
        bankRefNo: 'WAIVE-DJ2-003',
        referenceNo: 'WAIVE-DJ2-003',
        paymentDate: today,
        status: 'Waived' as PaymentStatus,
        notes: 'Approved one-time management orientation fee waiver.',
        proofImageData: null,
        physicalReceiptStatus: 'Issued' as PhysicalReceiptStatus,
        physicalReceiptNo: 'ADJ-003',
        receiptIssuedBy: email,
        receiptIssuedAt: serverTimestamp(),
      },
      {
        paymentId: `PAY-${ym}-201`,
        receiptNo: `GIS-${ym}-0004`,
        studentId: 'GIS250201',
        studentName: 'Tan Wei Ming',
        roomId: 'NSQ-C-12-B1',
        hostelLocation: 'Nilai Square' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 280,
        paymentMethod: 'Online Transfer' as PaymentMethod,
        bankRefNo: 'FPX-550192',
        referenceNo: 'FPX-550192',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'Nilai Square single bed monthly fee.',
        proofImageData: null,
        physicalReceiptStatus: 'Pending Issuance' as PhysicalReceiptStatus,
        physicalReceiptNo: '',
        receiptIssuedBy: null,
        receiptIssuedAt: null,
      },
      {
        paymentId: `PAY-${ym}-202`,
        receiptNo: `GIS-${ym}-0005`,
        studentId: 'GIS250202',
        studentName: 'Siti Khadijah binti Ismail',
        roomId: 'NSQ-C-12-B2',
        hostelLocation: 'Nilai Square' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 140,
        paymentMethod: 'Online Transfer' as PaymentMethod,
        bankRefNo: 'REM-NSQ-019',
        referenceNo: 'REM-NSQ-019',
        paymentDate: today,
        status: 'Overdue' as PaymentStatus,
        notes: 'After 15th half-rate first month reminder sent.',
        proofImageData: null,
        physicalReceiptStatus: 'Pending Issuance' as PhysicalReceiptStatus,
        physicalReceiptNo: '',
        receiptIssuedBy: null,
        receiptIssuedAt: null,
      },
      {
        paymentId: `PAY-${ym}-301`,
        receiptNo: `GIS-${ym}-0006`,
        studentId: 'STF-GIS-014',
        studentName: 'Encik Haziq bin Mansor',
        roomId: 'NSQ-D-05-B1',
        hostelLocation: 'Nilai Square' as HostelLocation,
        billingMonth: month,
        paymentType: 'Monthly Rent' as PaymentType,
        amount: 150,
        paymentMethod: 'Internal Adjustment' as PaymentMethod,
        bankRefNo: 'HR-DEDUCT-014',
        referenceNo: 'HR-DEDUCT-014',
        paymentDate: today,
        status: 'Paid' as PaymentStatus,
        notes: 'Staff housing payroll settlement (Whole Unit Exclusive Blk D Unit 05).',
        proofImageData: null,
        physicalReceiptStatus: 'Issued' as PhysicalReceiptStatus,
        physicalReceiptNo: 'HR-014',
        receiptIssuedBy: email,
        receiptIssuedAt: serverTimestamp(),
      },
    ];

    for (const p of samplePayments) {
      batch.set(doc(db, 'payments', p.paymentId), {
        ...p,
        recordedBy: email,
        recordedAt: serverTimestamp(),
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sample-seed');
  }
}

const MAX_BATCH_OPERATIONS = 400;

export interface BulkImportRoomItem {
  roomId: string;
  location: HostelLocation;
  block: string;
  unitNo: string;
  bedSlot: string;
  monthlyRate: number;
  status: 'Vacant' | 'Maintenance';
}

export async function bulkImportRooms(
  items: BulkImportRoomItem[],
  staffEmail: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ importedCount: number }> {
  const email = assertStaffEmail(staffEmail);
  if (items.length === 0) return { importedCount: 0 };

  let batch = writeBatch(db);
  let opsInBatch = 0;
  let completed = 0;

  try {
    for (const item of items) {
      const roomId = sanitizeIdSegment(item.roomId).slice(0, FIELD_LIMITS.roomId.max);
      batch.set(doc(db, 'rooms', roomId), {
        roomId,
        location: item.location,
        block: item.block.trim().slice(0, FIELD_LIMITS.block.max),
        unitNo: item.unitNo.trim().slice(0, FIELD_LIMITS.unitNo.max),
        bedSlot: item.bedSlot.trim().slice(0, FIELD_LIMITS.bedSlot.max),
        monthlyRate: clampNumber(
          item.monthlyRate,
          FIELD_LIMITS.monthlyRate.min,
          FIELD_LIMITS.monthlyRate.max
        ),
        status: item.status,
        currentStudentId: null,
        currentStudentName: null,
        statusNote: null,
        exclusiveResidentId: null,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      opsInBatch += 1;
      completed += 1;

      if (opsInBatch >= MAX_BATCH_OPERATIONS) {
        await batch.commit();
        onProgress?.(completed, items.length);
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      onProgress?.(completed, items.length);
    }

    return { importedCount: completed };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'rooms');
  }
}

export interface BulkImportStudentItem {
  studentId: string;
  fullName: string;
  phone: string;
  emergencyContact: string;
  program: ProgramType;
  residentType: ResidentType;
  occupancyMode: OccupancyMode;
  assignedRoomId: string;
  hostelLocation: ResidentHostelLocation;
  checkInDate: string;
  checkOutDate: string | null;
  depositPaid: number;
  standardRoomRate: number;
  monthlyRebate: number;
  rebateReason: string;
  effectiveMonthlyFee: number;
  firstMonthCharge: number;
  firstMonthNote: string;
  status: 'Active' | 'Checked-Out';
}

export async function bulkImportStudents(
  items: BulkImportStudentItem[],
  allRooms: Room[],
  staffEmail: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ importedCount: number; occupiedCount: number; blockedCount: number }> {
  const email = assertStaffEmail(staffEmail);
  if (items.length === 0) {
    return { importedCount: 0, occupiedCount: 0, blockedCount: 0 };
  }

  const roomById = new Map(allRooms.map((r) => [r.roomId, r]));
  const claimedInImport = new Set<string>();

  let batch = writeBatch(db);
  let opsInBatch = 0;
  let completed = 0;
  let occupiedCount = 0;
  let blockedCount = 0;

  const flushBatchIfNeeded = async (neededOps: number) => {
    if (opsInBatch > 0 && opsInBatch + neededOps > MAX_BATCH_OPERATIONS) {
      await batch.commit();
      onProgress?.(completed, items.length);
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  };

  try {
    for (const item of items) {
      const studentId = sanitizeIdSegment(item.studentId).slice(0, FIELD_LIMITS.studentId.max);
      const fullName = item.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
      const assignedRoom = item.assignedRoomId
        ? roomById.get(item.assignedRoomId)
        : undefined;

      const siblingsToBlock =
        item.status === 'Active' &&
        item.occupancyMode === 'Whole Unit Exclusive' &&
        assignedRoom
          ? allRooms.filter(
              (r) =>
                r.roomId !== assignedRoom.roomId &&
                r.location === assignedRoom.location &&
                r.block === assignedRoom.block &&
                r.unitNo === assignedRoom.unitNo &&
                r.status === 'Vacant' &&
                !claimedInImport.has(r.roomId)
            )
          : [];

      const opsForThisResident =
        1 + (item.status === 'Active' && assignedRoom ? 1 + siblingsToBlock.length : 0);

      await flushBatchIfNeeded(opsForThisResident);

      const clampedStdRate = clampNumber(
        item.standardRoomRate,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
      const clampedRebate = clampNumber(
        item.monthlyRebate,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
      const clampedEffFee = clampNumber(
        item.effectiveMonthlyFee,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
      const clampedFirstCharge = clampNumber(
        item.firstMonthCharge,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );

      const initialStayHistory: StayHistorySegment[] = item.assignedRoomId
        ? [
            {
              id: createStaySegmentId(),
              roomId: item.assignedRoomId,
              hostelLocation: item.hostelLocation,
              occupancyMode: item.occupancyMode,
              startDate: item.checkInDate,
              endDate: item.status === 'Checked-Out' ? item.checkOutDate : null,
              standardRoomRate: clampedStdRate,
              monthlyRebate: clampedRebate,
              effectiveMonthlyFee: clampedEffFee,
              firstMonthCharge: clampedFirstCharge,
              reason:
                item.status === 'Checked-Out'
                  ? 'Bulk Import Historical Stay'
                  : 'Bulk Import Check-In',
              recordedBy: email,
              recordedAt: new Date().toISOString(),
            },
          ]
        : [];

      batch.set(doc(db, 'students', studentId), {
        studentId,
        fullName,
        residentType: item.residentType,
        occupancyMode: item.occupancyMode,
        phone: item.phone.trim().slice(0, FIELD_LIMITS.phone.max),
        emergencyContact: item.emergencyContact
          .trim()
          .slice(0, FIELD_LIMITS.emergencyContact.max),
        program: item.program,
        assignedRoomId: item.assignedRoomId,
        hostelLocation: item.hostelLocation,
        checkInDate: item.checkInDate,
        checkOutDate: item.status === 'Checked-Out' ? item.checkOutDate : null,
        depositPaid: clampNumber(
          item.depositPaid,
          FIELD_LIMITS.depositPaid.min,
          FIELD_LIMITS.depositPaid.max
        ),
        standardRoomRate: clampedStdRate,
        monthlyRebate: clampedRebate,
        rebateReason: (item.rebateReason || 'None')
          .trim()
          .slice(0, FIELD_LIMITS.rebateReason.max),
        effectiveMonthlyFee: clampedEffFee,
        monthlyFee: clampedEffFee,
        firstMonthCharge: clampedFirstCharge,
        firstMonthNote: (item.firstMonthNote || 'Standard Full Month')
          .trim()
          .slice(0, 64),
        stayHistory: initialStayHistory,
        status: item.status,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });
      opsInBatch += 1;

      if (item.status === 'Active' && assignedRoom) {
        claimedInImport.add(assignedRoom.roomId);
        batch.update(doc(db, 'rooms', assignedRoom.roomId), {
          status: 'Occupied',
          currentStudentId: studentId,
          currentStudentName: fullName,
          statusNote: null,
          exclusiveResidentId: null,
          updatedBy: email,
          updatedAt: serverTimestamp(),
        });
        opsInBatch += 1;
        occupiedCount += 1;

        const exclusiveNote = `Exclusive Unit: ${fullName}`.slice(
          0,
          FIELD_LIMITS.statusNote.max
        );
        for (const sib of siblingsToBlock) {
          claimedInImport.add(sib.roomId);
          batch.update(doc(db, 'rooms', sib.roomId), {
            status: 'Reserved / Blocked',
            currentStudentId: null,
            currentStudentName: null,
            statusNote: exclusiveNote,
            exclusiveResidentId: studentId,
            updatedBy: email,
            updatedAt: serverTimestamp(),
          });
          opsInBatch += 1;
          blockedCount += 1;
        }
      }

      completed += 1;
      if (opsInBatch >= MAX_BATCH_OPERATIONS) {
        await batch.commit();
        onProgress?.(completed, items.length);
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      onProgress?.(completed, items.length);
    }

    return { importedCount: completed, occupiedCount, blockedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'students');
  }
}

export interface BulkImportPaymentItem {
  student: Student;
  billingMonth: string;
  paymentType: PaymentType;
  amount: number;
  paymentMethod: PaymentMethod;
  bankRefNo: string;
  paymentDate: string;
  status: PaymentStatus;
  physicalReceiptStatus: PhysicalReceiptStatus;
  physicalReceiptNo: string;
  notes: string;
}

export async function bulkImportPayments(
  items: BulkImportPaymentItem[],
  existingPayments: Payment[],
  staffEmail: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ importedCount: number }> {
  const email = assertStaffEmail(staffEmail);
  if (items.length === 0) return { importedCount: 0 };

  // Track sequential receipt numbers per billingMonth across existing + newly imported rows
  const maxSeqByMonth = new Map<string, number>();
  for (const p of existingPayments) {
    const r = p.receiptNo || p.paymentId;
    const prefix = `GIS-${p.billingMonth.replace('-', '')}-`;
    if (r.startsWith(prefix)) {
      const seq = Number.parseInt(r.slice(prefix.length), 10);
      if (!Number.isNaN(seq)) {
        maxSeqByMonth.set(
          p.billingMonth,
          Math.max(maxSeqByMonth.get(p.billingMonth) ?? 0, seq)
        );
      }
    }
  }

  let batch = writeBatch(db);
  let opsInBatch = 0;
  let completed = 0;

  try {
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const ym = item.billingMonth.replace('-', '');
      const prevSeq = maxSeqByMonth.get(item.billingMonth) ?? 0;
      const nextSeq = prevSeq + 1;
      maxSeqByMonth.set(item.billingMonth, nextSeq);
      const receiptNo = `GIS-${ym}-${String(nextSeq).padStart(4, '0')}`;

      const stamp = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
      const paymentId = `PAY-${ym}-${stamp}${idx}${rand}`.slice(
        0,
        FIELD_LIMITS.paymentId.max
      );
      const bankRefNo = item.bankRefNo.trim().slice(0, FIELD_LIMITS.bankRefNo.max);
      const isIssued = item.physicalReceiptStatus === 'Issued';

      batch.set(doc(db, 'payments', paymentId), {
        paymentId,
        receiptNo,
        studentId: item.student.studentId,
        studentName: item.student.fullName.slice(0, FIELD_LIMITS.fullName.max),
        roomId: item.student.assignedRoomId,
        hostelLocation: item.student.hostelLocation,
        billingMonth: item.billingMonth,
        paymentType: item.paymentType,
        amount: clampNumber(
          item.amount,
          FIELD_LIMITS.amount.min,
          FIELD_LIMITS.amount.max
        ),
        paymentMethod: item.paymentMethod,
        bankRefNo,
        referenceNo: bankRefNo,
        paymentDate: item.paymentDate,
        status: item.status,
        notes: item.notes.trim().slice(0, FIELD_LIMITS.notes.max),
        proofImageData: null,
        physicalReceiptStatus: item.physicalReceiptStatus,
        physicalReceiptNo: item.physicalReceiptNo.trim().slice(0, 64),
        receiptIssuedBy: isIssued ? email : null,
        receiptIssuedAt: isIssued ? serverTimestamp() : null,
        recordedBy: email,
        recordedAt: serverTimestamp(),
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      opsInBatch += 1;
      completed += 1;

      if (opsInBatch >= MAX_BATCH_OPERATIONS) {
        await batch.commit();
        onProgress?.(completed, items.length);
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      onProgress?.(completed, items.length);
    }

    return { importedCount: completed };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'payments');
  }
}
