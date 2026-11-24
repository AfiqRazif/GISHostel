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
  AssignableOccupancyMode,
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
  normalizeAssignableOccupancyMode,
  normalizeStaffLoginEmail,
  OccupancyMode,
  OCCUPANT_TYPES,
  OccupantType,
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  PhysicalReceiptStatus,
  ProgramType,
  ResidentHostelLocation,
  ResidentOccupancyMode,
  ResidentType,
  resolveBedsOccupiedCount,
  resolveOccupantType,
  Room,
  RoomStatus,
  sanitizeIdSegment,
  StaffRole,
  StaffUser,
  StayHistorySegment,
  Student,
  StudentStatus,
  subtractOneDayISO,
  toLegacyResidentType,
} from '../types/hostel';

export { calculateStudentBilling };

export interface UnitOccupantInfo {
  student: Student;
  occupantType: OccupantType;
  occupancyMode: OccupancyMode;
  bedsOccupied: number;
}

export interface UnitCapacitySummary {
  unitKey: string;
  location: HostelLocation;
  block: string;
  unitNo: string;
  rooms: Room[];
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  blockedBeds: number;
  maintenanceBeds: number;
  standardMonthlyRate: number;
  activeOccupants: UnitOccupantInfo[];
}

export function getUnitKey(
  room: Pick<Room, 'location' | 'block' | 'unitNo'>
): string {
  return `${room.location}::${room.block}::${room.unitNo}`;
}

export function computeUnitCapacities(
  allRooms: Room[],
  allStudents: Student[]
): Map<string, UnitCapacitySummary> {
  const unitRoomsMap = new Map<string, Room[]>();
  for (const r of allRooms) {
    const key = getUnitKey(r);
    const list = unitRoomsMap.get(key) ?? [];
    list.push(r);
    unitRoomsMap.set(key, list);
  }

  const studentById = new Map(allStudents.map((s) => [s.studentId, s]));
  const result = new Map<string, UnitCapacitySummary>();

  for (const [unitKey, unitRooms] of unitRoomsMap.entries()) {
    const sortedRooms = [...unitRooms].sort((a, b) =>
      a.bedSlot.localeCompare(b.bedSlot, undefined, { numeric: true })
    );
    const first = sortedRooms[0];
    const totalBeds = sortedRooms.length;
    const availableBeds = sortedRooms.filter((r) => r.status === 'Vacant').length;
    const blockedBeds = sortedRooms.filter(
      (r) => r.status === 'Reserved / Blocked'
    ).length;
    const maintenanceBeds = sortedRooms.filter(
      (r) => r.status === 'Maintenance'
    ).length;

    const seenStudentIds = new Set<string>();
    const activeOccupants: UnitOccupantInfo[] = [];
    let occupiedBeds = 0;

    for (const r of sortedRooms) {
      if (r.status === 'Occupied' && r.currentStudentId) {
        if (!seenStudentIds.has(r.currentStudentId)) {
          seenStudentIds.add(r.currentStudentId);
          const stu = studentById.get(r.currentStudentId);
          if (stu) {
            const mode = normalizeAssignableOccupancyMode(stu.occupancyMode);
            const beds =
              mode === 'Whole Unit Exclusive'
                ? Math.max(
                    1,
                    resolveBedsOccupiedCount(mode, stu.bedsOccupied, true),
                    1 +
                      sortedRooms.filter(
                        (sib) =>
                          sib.roomId !== r.roomId &&
                          sib.status === 'Reserved / Blocked' &&
                          (sib.exclusiveResidentId === stu.studentId ||
                            !sib.exclusiveResidentId)
                      ).length
                  )
                : Math.min(
                    totalBeds,
                    Math.max(1, resolveBedsOccupiedCount(mode, stu.bedsOccupied, true))
                  );
            activeOccupants.push({
              student: stu,
              occupantType: resolveOccupantType(stu),
              occupancyMode: mode,
              bedsOccupied: beds,
            });
            occupiedBeds += beds;
          } else {
            occupiedBeds += 1;
          }
        }
      } else if (r.status === 'Occupied') {
        occupiedBeds += 1;
      }
    }

    // Fallback: if no student match existed for some blocked beds or legacy whole-unit blocks,
    // ensure occupiedBeds reflects resident-blocked slots without double-counting.
    const residentBlockedCount = sortedRooms.filter(
      (r) => r.status === 'Reserved / Blocked' && Boolean(r.exclusiveResidentId)
    ).length;
    const rawOccupiedRoomCount = sortedRooms.filter(
      (r) => r.status === 'Occupied'
    ).length;
    occupiedBeds = Math.min(
      totalBeds,
      Math.max(occupiedBeds, rawOccupiedRoomCount + residentBlockedCount)
    );

    const standardMonthlyRate =
      sortedRooms.find((r) => r.monthlyRate > 0)?.monthlyRate ??
      first.monthlyRate ??
      0;

    result.set(unitKey, {
      unitKey,
      location: first.location,
      block: first.block,
      unitNo: first.unitNo,
      rooms: sortedRooms,
      totalBeds,
      occupiedBeds,
      availableBeds,
      blockedBeds,
      maintenanceBeds,
      standardMonthlyRate,
      activeOccupants,
    });
  }

  return result;
}

export interface UnitAvailabilityInfo {
  unitRooms: Room[];
  totalBeds: number;
  vacantCount: number;
  reclaimableCount: number;
  availableForResident: number;
  isUnitEmptyForExclusive: boolean;
}

export function getUnitAvailabilityForRoom(
  targetRoom: Room | null | undefined,
  allRooms: Room[],
  excludeStudentId?: string | null,
  prevOccupancyMode?: OccupancyMode | null
): UnitAvailabilityInfo {
  if (!targetRoom) {
    return {
      unitRooms: [],
      totalBeds: 0,
      vacantCount: 0,
      reclaimableCount: 0,
      availableForResident: 0,
      isUnitEmptyForExclusive: false,
    };
  }
  const unitRooms = allRooms.filter(
    (r) =>
      r.location === targetRoom.location &&
      r.block === targetRoom.block &&
      r.unitNo === targetRoom.unitNo
  );

  const isReclaimable = (r: Room): boolean => {
    if (!excludeStudentId) return false;
    if (r.currentStudentId === excludeStudentId) return true;
    if (r.status === 'Reserved / Blocked') {
      if (r.exclusiveResidentId === excludeStudentId) return true;
      if (!r.exclusiveResidentId && prevOccupancyMode === 'Whole Unit Exclusive') {
        return true;
      }
    }
    return false;
  };

  let vacantCount = 0;
  let reclaimableCount = 0;
  let availableForResident = 0;
  let nonEmptyForExclusive = false;

  for (const r of unitRooms) {
    const reclaimable = isReclaimable(r);
    if (r.status === 'Vacant') vacantCount += 1;
    if (reclaimable) reclaimableCount += 1;
    if (r.status === 'Vacant' || reclaimable) {
      availableForResident += 1;
    } else {
      nonEmptyForExclusive = true;
    }
  }

  return {
    unitRooms,
    totalBeds: unitRooms.length,
    vacantCount,
    reclaimableCount,
    availableForResident,
    isUnitEmptyForExclusive: unitRooms.length > 0 && !nonEmptyForExclusive,
  };
}

interface PlannedRoomReservation {
  resolvedBedsOccupied: number;
  blockedSiblings: string[];
  roomUpdates: Map<string, Record<string, unknown>>;
}

function buildSimulatedOccupancyMap(allRooms: Room[]): Map<string, RoomStatus> {
  return new Map(allRooms.map((r) => [r.roomId, r.status]));
}

function queueReleaseForResident(
  allRooms: Room[],
  residentId: string,
  prevRoom: Room | undefined,
  prevOccupancyMode: OccupancyMode | string | undefined,
  email: string,
  roomUpdates: Map<string, Record<string, unknown>>,
  simStatus: Map<string, RoomStatus>
): void {
  for (const r of allRooms) {
    const isPrimaryOwned = r.currentStudentId === residentId;
    const isBlockedByResident =
      r.status === 'Reserved / Blocked' &&
      (r.exclusiveResidentId === residentId ||
        (!r.exclusiveResidentId &&
          prevOccupancyMode === 'Whole Unit Exclusive' &&
          prevRoom &&
          r.location === prevRoom.location &&
          r.block === prevRoom.block &&
          r.unitNo === prevRoom.unitNo));

    if (isPrimaryOwned || isBlockedByResident) {
      simStatus.set(r.roomId, 'Vacant');
      roomUpdates.set(r.roomId, {
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
}

function queueReserveForResident(
  targetRoom: Room,
  allRooms: Room[],
  residentId: string,
  residentName: string,
  occupancyMode: AssignableOccupancyMode,
  requestedBedsOccupied: number | undefined,
  email: string,
  roomUpdates: Map<string, Record<string, unknown>>,
  simStatus: Map<string, RoomStatus>
): { resolvedBedsOccupied: number; blockedSiblings: string[] } {
  const targetSimStatus = simStatus.get(targetRoom.roomId) ?? targetRoom.status;
  if (targetSimStatus !== 'Vacant') {
    throw new Error(`Room "${targetRoom.roomId}" is no longer Vacant.`);
  }

  const unitRooms = allRooms
    .filter(
      (r) =>
        r.location === targetRoom.location &&
        r.block === targetRoom.block &&
        r.unitNo === targetRoom.unitNo
    )
    .sort((a, b) => a.bedSlot.localeCompare(b.bedSlot, undefined, { numeric: true }));

  const siblings = unitRooms.filter((r) => r.roomId !== targetRoom.roomId);
  const vacantSiblings = siblings.filter(
    (r) => (simStatus.get(r.roomId) ?? r.status) === 'Vacant'
  );

  let resolvedBedsOccupied = 1;
  let siblingsToBlock: Room[] = [];
  let blockNotePrefix = '';

  if (occupancyMode === 'Whole Unit Exclusive') {
    const occupiedOrBlockedByOther = siblings.some(
      (r) => (simStatus.get(r.roomId) ?? r.status) !== 'Vacant'
    );
    if (occupiedOrBlockedByOther) {
      throw new Error(
        `Whole Unit Exclusive requires all beds in ${targetRoom.location} ${targetRoom.block}-${targetRoom.unitNo} to be Vacant.`
      );
    }
    resolvedBedsOccupied = Math.max(1, unitRooms.length);
    siblingsToBlock = vacantSiblings;
    blockNotePrefix = `Exclusive Unit: ${residentName}`.slice(
      0,
      FIELD_LIMITS.statusNote.max
    );
  } else if (occupancyMode === 'Custom Multi-Bed') {
    const requested = Math.max(
      1,
      Math.floor(Number(requestedBedsOccupied) || 2)
    );
    const maxAvailable = 1 + vacantSiblings.length;
    if (requested > maxAvailable) {
      throw new Error(
        `Only ${maxAvailable} bed(s) available in ${targetRoom.location} ${targetRoom.block}-${targetRoom.unitNo}, cannot assign ${requested} beds.`
      );
    }
    resolvedBedsOccupied = requested;
    siblingsToBlock = vacantSiblings.slice(0, requested - 1);
    blockNotePrefix = `Multi-Bed (${requested} Beds): ${residentName}`.slice(
      0,
      FIELD_LIMITS.statusNote.max
    );
  } else {
    resolvedBedsOccupied = 1;
  }

  simStatus.set(targetRoom.roomId, 'Occupied');
  roomUpdates.set(targetRoom.roomId, {
    status: 'Occupied',
    currentStudentId: residentId,
    currentStudentName: residentName,
    statusNote: null,
    exclusiveResidentId: null,
    updatedBy: email,
    updatedAt: serverTimestamp(),
  });

  const blockedSiblings: string[] = [];
  for (const sib of siblingsToBlock) {
    simStatus.set(sib.roomId, 'Reserved / Blocked');
    roomUpdates.set(sib.roomId, {
      status: 'Reserved / Blocked',
      currentStudentId: null,
      currentStudentName: null,
      statusNote: blockNotePrefix,
      exclusiveResidentId: residentId,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    });
    blockedSiblings.push(sib.roomId);
  }

  return { resolvedBedsOccupied, blockedSiblings };
}

function applyRoomUpdateMapToBatch(
  batch: ReturnType<typeof writeBatch>,
  roomUpdates: Map<string, Record<string, unknown>>
): void {
  for (const [roomId, payload] of roomUpdates.entries()) {
    batch.update(doc(db, 'rooms', roomId), payload);
  }
}

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

    const isBootstrapOwner =
      email.toLowerCase() === 'afiqjacksonmusic@gmail.com' &&
      user.emailVerified;
    const isGoogleSignIn = user.providerData.some(
      (provider) => provider.providerId === 'google.com'
    );

    if (!isBootstrapOwner && !isGoogleSignIn) {
      throw new Error(
        'NOT_PROVISIONED: Your account has not been provisioned in GIS Nilai Staff Accounts. Please ask a Master Admin to create your staff login.'
      );
    }

    let isFirstUser = false;
    if (isBootstrapOwner) {
      try {
        const firstCheckSnap = await getDocs(
          query(collection(db, 'staff_users'), limit(1))
        );
        isFirstUser = firstCheckSnap.empty;
      } catch {
        isFirstUser = false;
      }
    }

    const baseUsername = extractUsernameFromEmail(email).slice(0, 64);
    const username =
      baseUsername.length >= 2
        ? baseUsername
        : `${baseUsername || 'user'}01`.slice(0, 64);
    const rawFullName = (
      user.displayName ||
      username ||
      'GIS Viewer'
    ).trim();
    const fullName = (
      rawFullName.length >= 2 ? rawFullName : `${rawFullName} User`
    ).slice(0, FIELD_LIMITS.fullName.max);
    const role: StaffRole =
      isBootstrapOwner && (isFirstUser || isBootstrapOwner)
        ? 'Master Admin'
        : 'Viewer';
    const authProvider = isGoogleSignIn ? 'google' : 'password';

    const newRecord = {
      uid: user.uid,
      username,
      email,
      fullName,
      role,
      active: true,
      authProvider,
      createdAt: serverTimestamp(),
      updatedBy: email,
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, newRecord);
    const createdSnap = await getDoc(ref);
    return (
      (createdSnap.data() as StaffUser) || {
        uid: user.uid,
        username,
        email,
        fullName,
        role,
        active: true,
        authProvider,
        createdAt: null,
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NOT_PROVISIONED:')) {
      throw error;
    }
    const errCode = (error as { code?: string })?.code;
    if (errCode === 'permission-denied') {
      throw new Error(
        'NOT_PROVISIONED: Access denied. Your account is not authorized in GIS Nilai Staff Accounts.'
      );
    }
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
      authProvider: 'password',
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
    // Lockout Guardrail: ensure at least one active Master Admin always remains
    const allSnap = await getDocs(collection(db, 'staff_users'));
    const allStaff = allSnap.docs.map((d) => d.data() as StaffUser);
    const target = allStaff.find((u) => u.uid === uid);

    if (!target) {
      throw new Error('Staff user account not found.');
    }

    const nextRole = updates.role ?? target.role;
    const nextActive = updates.active ?? target.active;
    const remainingActiveMasterAdmins = allStaff.filter((u) => {
      const effectiveRole = u.uid === uid ? nextRole : u.role;
      const effectiveActive = u.uid === uid ? nextActive : u.active;
      return effectiveRole === 'Master Admin' && effectiveActive;
    });

    if (remainingActiveMasterAdmins.length === 0) {
      throw new Error(
        'Lockout Protection: At least one active Master Admin account must remain. Promote another active user to Master Admin before demoting or disabling this account.'
      );
    }

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
    if (
      error instanceof Error &&
      (error.message.includes('Lockout Protection') ||
        error.message.includes('not found'))
    ) {
      throw error;
    }
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
  residentType?: ResidentType;
  occupantType?: OccupantType;
  occupancyMode?: ResidentOccupancyMode;
  bedsOccupied?: number;
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
  selectedRoom: Room | null,
  allRooms: Room[],
  staffEmail: string
): Promise<{ blockedSiblings: string[] }> {
  const email = assertStaffEmail(staffEmail);
  const studentId = sanitizeIdSegment(input.studentId).slice(0, FIELD_LIMITS.studentId.max);
  const fullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullName.max);
  const phone = input.phone.trim().slice(0, FIELD_LIMITS.phone.max);
  const emergencyContact = input.emergencyContact.trim().slice(0, FIELD_LIMITS.emergencyContact.max);
  const cleanAssignedRoomId = (input.assignedRoomId || '').trim();
  const isUnassigned = !cleanAssignedRoomId || !selectedRoom;

  const resolvedOccupantType: OccupantType =
    input.occupantType && OCCUPANT_TYPES.includes(input.occupantType)
      ? input.occupantType
      : resolveOccupantType({ residentType: input.residentType });
  const legacyResidentType = toLegacyResidentType(resolvedOccupantType);

  const standardRoomRate = isUnassigned
    ? 0
    : clampNumber(
        input.standardRoomRate,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
  const monthlyRebate = isUnassigned
    ? 0
    : clampNumber(
        input.monthlyRebate,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
  const effectiveMonthlyFee = isUnassigned
    ? 0
    : Math.max(0, Math.round((standardRoomRate - monthlyRebate) * 100) / 100);
  const firstMonthDefaults = calculateFirstMonthDefaults(
    input.checkInDate,
    effectiveMonthlyFee
  );
  const firstMonthCharge = isUnassigned
    ? 0
    : clampNumber(
        typeof input.firstMonthCharge === 'number' && !Number.isNaN(input.firstMonthCharge)
          ? input.firstMonthCharge
          : firstMonthDefaults.firstMonthCharge,
        FIELD_LIMITS.monthlyFee.min,
        FIELD_LIMITS.monthlyFee.max
      );
  const firstMonthNote = isUnassigned
    ? 'Unassigned — No Room Rent'
    : (input.firstMonthNote?.trim() || firstMonthDefaults.firstMonthNote).slice(0, 64);

  const rebateReason = isUnassigned
    ? 'None'
    : (input.rebateReason || 'None').trim().slice(0, FIELD_LIMITS.rebateReason.max);
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
  } else if (!isUnassigned && selectedRoom.status !== 'Vacant') {
    throw new Error('Selected room is no longer Vacant. Please choose another available bed.');
  }

  const studentRef = doc(db, 'students', studentId);
  let blockedSiblings: string[] = [];

  try {
    const existingStudent = await getDoc(studentRef);
    if (existingStudent.exists()) {
      throw new Error(`Resident ID "${studentId}" is already registered.`);
    }

    const batch = writeBatch(db);

    if (isUnassigned) {
      batch.set(studentRef, {
        studentId,
        fullName,
        residentType: legacyResidentType,
        occupantType: resolvedOccupantType,
        occupancyMode: 'Unassigned',
        bedsOccupied: 0,
        phone,
        emergencyContact,
        program: input.program,
        assignedRoomId: '',
        hostelLocation: 'Unassigned',
        checkInDate: input.checkInDate,
        checkOutDate: input.status === 'Checked-Out' ? input.checkOutDate : null,
        depositPaid,
        standardRoomRate: 0,
        monthlyRebate: 0,
        rebateReason: 'None',
        effectiveMonthlyFee: 0,
        monthlyFee: 0,
        firstMonthCharge: 0,
        firstMonthNote: 'Unassigned — No Room Rent',
        stayHistory: [],
        status: input.status,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return { blockedSiblings };
    }

    const resolvedOccupancyMode = normalizeAssignableOccupancyMode(input.occupancyMode);
    let resolvedBedsOccupied = resolveBedsOccupiedCount(
      resolvedOccupancyMode,
      input.bedsOccupied,
      true
    );

    if (input.status === 'Active') {
      const roomRef = doc(db, 'rooms', selectedRoom.roomId);
      const freshRoom = await getDoc(roomRef);
      if (!freshRoom.exists() || freshRoom.data()?.status !== 'Vacant') {
        throw new Error(`Room "${selectedRoom.roomId}" is not currently Vacant.`);
      }

      const simStatus = buildSimulatedOccupancyMap(allRooms);
      const roomUpdates = new Map<string, Record<string, unknown>>();
      const reserved = queueReserveForResident(
        selectedRoom,
        allRooms,
        studentId,
        fullName,
        resolvedOccupancyMode,
        input.bedsOccupied,
        email,
        roomUpdates,
        simStatus
      );
      resolvedBedsOccupied = reserved.resolvedBedsOccupied;
      blockedSiblings = reserved.blockedSiblings;
      applyRoomUpdateMapToBatch(batch, roomUpdates);
    } else if (resolvedOccupancyMode === 'Whole Unit Exclusive') {
      const unitCount = allRooms.filter(
        (r) =>
          r.location === selectedRoom.location &&
          r.block === selectedRoom.block &&
          r.unitNo === selectedRoom.unitNo
      ).length;
      resolvedBedsOccupied = Math.max(1, unitCount || resolvedBedsOccupied);
    }

    const initialSegment: StayHistorySegment = {
      id: createStaySegmentId(),
      roomId: selectedRoom.roomId,
      hostelLocation: selectedRoom.location,
      occupancyMode: resolvedOccupancyMode,
      bedsOccupied: resolvedBedsOccupied,
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
      residentType: legacyResidentType,
      occupantType: resolvedOccupantType,
      occupancyMode: resolvedOccupancyMode,
      bedsOccupied: resolvedBedsOccupied,
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
        error.message.includes('Check-Out') ||
        error.message.includes('available') ||
        error.message.includes('Exclusive'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `students/${studentId}`);
  }
}

export interface UpdateStudentInput {
  fullName: string;
  residentType?: ResidentType;
  occupantType?: OccupantType;
  occupancyMode: OccupancyMode;
  bedsOccupied?: number;
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
  const resolvedOccupantType: OccupantType =
    input.occupantType && OCCUPANT_TYPES.includes(input.occupantType)
      ? input.occupantType
      : resolveOccupantType({
          occupantType: currentStudent.occupantType,
          residentType: input.residentType || currentStudent.residentType,
        });
  const legacyResidentType = toLegacyResidentType(resolvedOccupantType);

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
  const simStatus = buildSimulatedOccupancyMap(allRooms);
  const roomUpdates = new Map<string, Record<string, unknown>>();

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
      queueReleaseForResident(
        allRooms,
        currentStudent.studentId,
        currentRoomObj,
        currentStudent.occupancyMode,
        email,
        roomUpdates,
        simStatus
      );
      applyRoomUpdateMapToBatch(batch, roomUpdates);

      const closedHistory = existingStayHistory.map((seg, idx) => {
        if (!seg.endDate || idx === existingStayHistory.length - 1) {
          return {
            ...seg,
            endDate: seg.endDate || input.checkOutDate,
          };
        }
        return seg;
      });

      const resolvedBeds = currentStudent.assignedRoomId
        ? resolveBedsOccupiedCount(
            input.occupancyMode,
            input.bedsOccupied ?? currentStudent.bedsOccupied,
            true
          )
        : 0;

      batch.update(studentRef, {
        fullName,
        residentType: legacyResidentType,
        occupantType: resolvedOccupantType,
        occupancyMode: currentStudent.assignedRoomId ? input.occupancyMode : 'Unassigned',
        bedsOccupied: resolvedBeds,
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

      const nextMode = normalizeAssignableOccupancyMode(input.occupancyMode);
      const reserved = queueReserveForResident(
        input.newRoom,
        allRooms,
        currentStudent.studentId,
        fullName,
        nextMode,
        input.bedsOccupied,
        email,
        roomUpdates,
        simStatus
      );
      applyRoomUpdateMapToBatch(batch, roomUpdates);

      const lastSeg = existingStayHistory[existingStayHistory.length - 1];
      const restartDate =
        lastSeg?.endDate && input.checkInDate <= lastSeg.endDate
          ? getTodayISO()
          : input.checkInDate;
      const recheckSegment: StayHistorySegment = {
        id: createStaySegmentId(),
        roomId: input.newRoom.roomId,
        hostelLocation: input.newRoom.location,
        occupancyMode: nextMode,
        bedsOccupied: reserved.resolvedBedsOccupied,
        startDate: restartDate,
        endDate: null,
        standardRoomRate,
        monthlyRebate,
        effectiveMonthlyFee,
        firstMonthCharge:
          existingStayHistory.length === 0
            ? firstMonthCharge
            : calculateFirstMonthDefaults(restartDate, effectiveMonthlyFee)
                .firstMonthCharge,
        reason: 'Re-Check-In',
        recordedBy: email,
        recordedAt: new Date().toISOString(),
      };

      batch.update(studentRef, {
        fullName,
        residentType: legacyResidentType,
        occupantType: resolvedOccupantType,
        occupancyMode: nextMode,
        bedsOccupied: reserved.resolvedBedsOccupied,
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
    let nextMode: OccupancyMode = !targetRoomId
      ? 'Unassigned'
      : normalizeAssignableOccupancyMode(input.occupancyMode);
    let nextBedsOccupied = !targetRoomId
      ? 0
      : resolveBedsOccupiedCount(nextMode, input.bedsOccupied ?? currentStudent.bedsOccupied, true);

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

        queueReleaseForResident(
          allRooms,
          currentStudent.studentId,
          currentRoomObj,
          currentStudent.occupancyMode,
          email,
          roomUpdates,
          simStatus
        );

        const assignableMode = normalizeAssignableOccupancyMode(input.occupancyMode);
        nextMode = assignableMode;

        if (input.status === 'Active') {
          const reserved = queueReserveForResident(
            input.newRoom,
            allRooms,
            currentStudent.studentId,
            fullName,
            assignableMode,
            input.bedsOccupied,
            email,
            roomUpdates,
            simStatus
          );
          nextBedsOccupied = reserved.resolvedBedsOccupied;
        } else {
          nextBedsOccupied = resolveBedsOccupiedCount(
            assignableMode,
            input.bedsOccupied,
            true
          );
        }

        targetRoomId = input.newRoom.roomId;
        targetLocation = input.newRoom.location;

        if (!currentStudent.assignedRoomId && !existingStayHistory.some((s) => !s.endDate)) {
          const placementDate = input.checkInDate;
          const newFirstSeg: StayHistorySegment = {
            id: createStaySegmentId(),
            roomId: input.newRoom.roomId,
            hostelLocation: input.newRoom.location,
            occupancyMode: assignableMode,
            bedsOccupied: nextBedsOccupied,
            startDate: placementDate,
            endDate: null,
            standardRoomRate,
            monthlyRebate,
            effectiveMonthlyFee,
            firstMonthCharge:
              existingStayHistory.length === 0
                ? firstMonthCharge
                : calculateFirstMonthDefaults(placementDate, effectiveMonthlyFee)
                    .firstMonthCharge,
            reason:
              existingStayHistory.length === 0
                ? 'Initial Room Assignment'
                : 'Room Assignment',
            recordedBy: email,
            recordedAt: new Date().toISOString(),
          };
          nextStayHistory = [...existingStayHistory, newFirstSeg];
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
              occupancyMode: assignableMode,
              bedsOccupied: nextBedsOccupied,
              startDate: today,
              endDate: null,
              standardRoomRate,
              monthlyRebate,
              effectiveMonthlyFee,
              firstMonthCharge: calculateFirstMonthDefaults(
                today,
                effectiveMonthlyFee
              ).firstMonthCharge,
              reason: 'Room Transfer (Profile Edit)',
              recordedBy: email,
              recordedAt: new Date().toISOString(),
            },
          ];
        }
      } else if (currentRoomObj) {
        const assignableMode = normalizeAssignableOccupancyMode(input.occupancyMode);
        nextMode = assignableMode;

        if (input.status === 'Active') {
          queueReleaseForResident(
            allRooms,
            currentStudent.studentId,
            currentRoomObj,
            currentStudent.occupancyMode,
            email,
            roomUpdates,
            simStatus
          );
          const reserved = queueReserveForResident(
            currentRoomObj,
            allRooms,
            currentStudent.studentId,
            fullName,
            assignableMode,
            input.bedsOccupied ?? currentStudent.bedsOccupied,
            email,
            roomUpdates,
            simStatus
          );
          nextBedsOccupied = reserved.resolvedBedsOccupied;
        } else {
          if (currentRoomObj.currentStudentId === currentStudent.studentId) {
            roomUpdates.set(currentRoomObj.roomId, {
              currentStudentName: fullName,
              updatedBy: email,
              updatedAt: serverTimestamp(),
            });
          }
          nextBedsOccupied = resolveBedsOccupiedCount(
            assignableMode,
            input.bedsOccupied ?? currentStudent.bedsOccupied,
            true
          );
        }

        if (nextStayHistory.length > 0) {
          nextStayHistory = nextStayHistory.map((seg, idx) => {
            if (seg.endDate !== null) return seg;
            return {
              ...seg,
              occupancyMode: assignableMode,
              bedsOccupied: nextBedsOccupied,
              standardRoomRate,
              monthlyRebate,
              effectiveMonthlyFee,
              startDate: idx === 0 ? input.checkInDate : seg.startDate,
              firstMonthCharge:
                idx === 0 || seg.startDate === input.checkInDate
                  ? firstMonthCharge
                  : typeof seg.firstMonthCharge === 'number'
                    ? seg.firstMonthCharge
                    : calculateFirstMonthDefaults(
                        seg.startDate,
                        effectiveMonthlyFee
                      ).firstMonthCharge,
            };
          });
        }
      }
      applyRoomUpdateMapToBatch(batch, roomUpdates);
    }

    batch.update(studentRef, {
      fullName,
      residentType: legacyResidentType,
      occupantType: resolvedOccupantType,
      occupancyMode: !targetRoomId ? 'Unassigned' : nextMode,
      bedsOccupied: !targetRoomId ? 0 : nextBedsOccupied,
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
      (error.message.includes('Vacant') ||
        error.message.includes('Check-Out') ||
        error.message.includes('available') ||
        error.message.includes('Exclusive'))
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
  newBedsOccupied?: number;
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
  if (
    input.newRoom.status !== 'Vacant' &&
    !(
      input.newRoom.status === 'Reserved / Blocked' &&
      input.newRoom.exclusiveResidentId === currentStudent.studentId
    )
  ) {
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

  try {
    const freshNewRoom = await getDoc(newRoomRef);
    const freshData = freshNewRoom.data();
    const isReclaimableOwnBlock =
      freshData?.status === 'Reserved / Blocked' &&
      freshData?.exclusiveResidentId === currentStudent.studentId;
    if (!freshNewRoom.exists() || (freshData?.status !== 'Vacant' && !isReclaimableOwnBlock)) {
      throw new Error(`Room "${input.newRoom.roomId}" is no longer Vacant.`);
    }

    const batch = writeBatch(db);
    const currentRoomObj = currentStudent.assignedRoomId
      ? allRooms.find((r) => r.roomId === currentStudent.assignedRoomId)
      : undefined;

    const simStatus = buildSimulatedOccupancyMap(allRooms);
    const roomUpdates = new Map<string, Record<string, unknown>>();

    queueReleaseForResident(
      allRooms,
      currentStudent.studentId,
      currentRoomObj,
      currentStudent.occupancyMode,
      email,
      roomUpdates,
      simStatus
    );

    const nextMode = normalizeAssignableOccupancyMode(input.newOccupancyMode);
    const reserved = queueReserveForResident(
      input.newRoom,
      allRooms,
      currentStudent.studentId,
      currentStudent.fullName,
      nextMode,
      input.newBedsOccupied,
      email,
      roomUpdates,
      simStatus
    );
    applyRoomUpdateMapToBatch(batch, roomUpdates);

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
    const segStartDate = isFirstAssignedSegment
      ? currentStudent.checkInDate || input.effectiveTransferDate
      : input.effectiveTransferDate;
    const newSegment: StayHistorySegment = {
      id: createStaySegmentId(),
      roomId: input.newRoom.roomId,
      hostelLocation: input.newRoom.location,
      occupancyMode: nextMode,
      bedsOccupied: reserved.resolvedBedsOccupied,
      startDate: segStartDate,
      endDate: null,
      standardRoomRate: newStandardRate,
      monthlyRebate: newMonthlyRebate,
      effectiveMonthlyFee: newEffectiveMonthlyFee,
      firstMonthCharge:
        isFirstAssignedSegment && typeof currentStudent.firstMonthCharge === 'number'
          ? currentStudent.firstMonthCharge
          : calculateFirstMonthDefaults(segStartDate, newEffectiveMonthlyFee)
              .firstMonthCharge,
      reason: isFirstAssignedSegment ? 'Initial Room Assignment' : transferReason,
      recordedBy: email,
      recordedAt: new Date().toISOString(),
    };

    batch.update(studentRef, {
      assignedRoomId: input.newRoom.roomId,
      hostelLocation: input.newRoom.location,
      occupancyMode: nextMode,
      bedsOccupied: reserved.resolvedBedsOccupied,
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
      blockedSiblings: reserved.blockedSiblings,
      releasedRoomId: currentStudent.assignedRoomId || null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Vacant') ||
        error.message.includes('Transfer') ||
        error.message.includes('Active') ||
        error.message.includes('available') ||
        error.message.includes('Exclusive'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `students/${currentStudent.studentId}`);
  }
}

export interface AssignRoomToStudentInput {
  room: Room;
  occupancyMode: OccupancyMode;
  bedsOccupied?: number;
  placementDate: string;
  standardRoomRate: number;
  monthlyRebate: number;
  rebateReason: string;
}

export async function assignRoomToStudent(
  student: Student,
  input: AssignRoomToStudentInput,
  allRooms: Room[],
  staffEmail: string
): Promise<{ blockedSiblings: string[] }> {
  const email = assertStaffEmail(staffEmail);

  if (!DATE_REGEX.test(input.placementDate)) {
    throw new Error('Placement Start Date must be in YYYY-MM-DD format.');
  }
  if (input.room.status !== 'Vacant') {
    throw new Error(`Room "${input.room.roomId}" is not currently Vacant.`);
  }

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
  const rebateReason = (input.rebateReason || 'None')
    .trim()
    .slice(0, FIELD_LIMITS.rebateReason.max);

  const studentRef = doc(db, 'students', student.studentId);
  const roomRef = doc(db, 'rooms', input.room.roomId);

  try {
    const freshRoom = await getDoc(roomRef);
    if (!freshRoom.exists() || freshRoom.data()?.status !== 'Vacant') {
      throw new Error(`Room "${input.room.roomId}" is no longer Vacant.`);
    }

    const batch = writeBatch(db);
    const simStatus = buildSimulatedOccupancyMap(allRooms);
    const roomUpdates = new Map<string, Record<string, unknown>>();
    const prevRoomObj = student.assignedRoomId
      ? allRooms.find((r) => r.roomId === student.assignedRoomId)
      : undefined;

    queueReleaseForResident(
      allRooms,
      student.studentId,
      prevRoomObj,
      student.occupancyMode,
      email,
      roomUpdates,
      simStatus
    );

    const nextMode = normalizeAssignableOccupancyMode(input.occupancyMode);
    const reserved = queueReserveForResident(
      input.room,
      allRooms,
      student.studentId,
      student.fullName,
      nextMode,
      input.bedsOccupied,
      email,
      roomUpdates,
      simStatus
    );
    applyRoomUpdateMapToBatch(batch, roomUpdates);

    const existingStayHistory: StayHistorySegment[] = Array.isArray(student.stayHistory)
      ? student.stayHistory.map((seg) => ({ ...seg }))
      : student.assignedRoomId
        ? getNormalizedStayHistory(student)
        : [];

    const closedExisting = existingStayHistory.map((seg) =>
      !seg.endDate
        ? {
            ...seg,
            endDate: computeClosedEndDate(seg.startDate, input.placementDate),
          }
        : seg
    );

    const isFirstSegment = closedExisting.length === 0;
    const defaults = calculateFirstMonthDefaults(input.placementDate, effectiveMonthlyFee);
    const hadPriorAssignedRoomOrRate =
      Boolean((student.assignedRoomId || '').trim()) ||
      (student.effectiveMonthlyFee ?? student.monthlyFee ?? 0) > 0;
    const resolvedFirstMonthCharge =
      isFirstSegment &&
      hadPriorAssignedRoomOrRate &&
      typeof student.firstMonthCharge === 'number' &&
      student.checkInDate === input.placementDate
        ? student.firstMonthCharge
        : defaults.firstMonthCharge;
    const newSegment: StayHistorySegment = {
      id: createStaySegmentId(),
      roomId: input.room.roomId,
      hostelLocation: input.room.location,
      occupancyMode: nextMode,
      bedsOccupied: reserved.resolvedBedsOccupied,
      startDate: input.placementDate,
      endDate: null,
      standardRoomRate,
      monthlyRebate,
      effectiveMonthlyFee,
      firstMonthCharge: resolvedFirstMonthCharge,
      reason: isFirstSegment ? 'Initial Room Assignment' : 'Room Assignment',
      recordedBy: email,
      recordedAt: new Date().toISOString(),
    };

    const nextStayHistory = [...closedExisting, newSegment].sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );
    const firstSeg = nextStayHistory[0];

    const studentUpdate: Record<string, unknown> = {
      assignedRoomId: input.room.roomId,
      hostelLocation: input.room.location,
      occupancyMode: nextMode,
      bedsOccupied: reserved.resolvedBedsOccupied,
      status: 'Active',
      checkOutDate: null,
      checkInDate: firstSeg ? firstSeg.startDate : input.placementDate,
      standardRoomRate,
      monthlyRebate,
      rebateReason,
      effectiveMonthlyFee,
      monthlyFee: effectiveMonthlyFee,
      stayHistory: nextStayHistory,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    };
    if (isFirstSegment && typeof newSegment.firstMonthCharge === 'number') {
      studentUpdate.firstMonthCharge = newSegment.firstMonthCharge;
      studentUpdate.firstMonthNote = defaults.firstMonthNote;
    }

    batch.update(studentRef, studentUpdate);
    await batch.commit();
    return { blockedSiblings: reserved.blockedSiblings };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Vacant') ||
        error.message.includes('available') ||
        error.message.includes('Exclusive'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `students/${student.studentId}`);
  }
}

function areStaySegmentsEquivalent(
  a: StayHistorySegment,
  b: StayHistorySegment
): boolean {
  return (
    a.id === b.id &&
    a.roomId === b.roomId &&
    a.hostelLocation === b.hostelLocation &&
    a.occupancyMode === b.occupancyMode &&
    (a.bedsOccupied ?? 1) === (b.bedsOccupied ?? 1) &&
    a.startDate === b.startDate &&
    (a.endDate ?? null) === (b.endDate ?? null) &&
    a.standardRoomRate === b.standardRoomRate &&
    a.monthlyRebate === b.monthlyRebate &&
    a.effectiveMonthlyFee === b.effectiveMonthlyFee &&
    (a.firstMonthCharge ?? null) === (b.firstMonthCharge ?? null)
  );
}

export async function saveStudentStayHistory(
  currentStudent: Student,
  rawSegments: StayHistorySegment[],
  allRooms: Room[],
  staffEmail: string
): Promise<void> {
  const email = assertStaffEmail(staffEmail);

  const sanitizedSegments: StayHistorySegment[] = rawSegments.map((seg) => {
    const cleanRoomId = (seg.roomId || '').trim().slice(0, FIELD_LIMITS.roomId.max);
    if (!cleanRoomId) {
      throw new Error('Every stay segment must specify a Room / Bed ID.');
    }
    if (!DATE_REGEX.test(seg.startDate)) {
      throw new Error('Every stay segment must have a valid Start Date (YYYY-MM-DD).');
    }
    const cleanEnd = seg.endDate ? seg.endDate.trim() : null;
    if (cleanEnd) {
      if (!DATE_REGEX.test(cleanEnd)) {
        throw new Error('End Date must be in YYYY-MM-DD format.');
      }
      if (cleanEnd < seg.startDate) {
        throw new Error('Stay segment End Date cannot be earlier than Start Date.');
      }
    }

    const stdRate = clampNumber(
      Number(seg.standardRoomRate) || 0,
      FIELD_LIMITS.monthlyFee.min,
      FIELD_LIMITS.monthlyFee.max
    );
    const rebate = clampNumber(
      Number(seg.monthlyRebate) || 0,
      FIELD_LIMITS.monthlyFee.min,
      FIELD_LIMITS.monthlyFee.max
    );
    const effFee = Math.max(0, Math.round((stdRate - rebate) * 100) / 100);
    const segFirstMonth =
      typeof seg.firstMonthCharge === 'number' && !Number.isNaN(seg.firstMonthCharge)
        ? clampNumber(
            seg.firstMonthCharge,
            FIELD_LIMITS.monthlyFee.min,
            FIELD_LIMITS.monthlyFee.max
          )
        : calculateFirstMonthDefaults(seg.startDate, effFee).firstMonthCharge;
    const segMode = normalizeAssignableOccupancyMode(seg.occupancyMode);
    const segBeds = resolveBedsOccupiedCount(segMode, seg.bedsOccupied, true);

    return {
      id: seg.id || createStaySegmentId(),
      roomId: cleanRoomId,
      hostelLocation: seg.hostelLocation || 'Unassigned',
      occupancyMode: segMode,
      bedsOccupied: segBeds,
      startDate: seg.startDate,
      endDate: cleanEnd,
      standardRoomRate: stdRate,
      monthlyRebate: rebate,
      effectiveMonthlyFee: effFee,
      firstMonthCharge: segFirstMonth,
      reason: (seg.reason || 'Stay Record').trim().slice(0, 120),
      recordedBy: seg.recordedBy || email,
      recordedAt: seg.recordedAt || new Date().toISOString(),
    };
  });

  const sortedSegments = sanitizedSegments.sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const openSegments = sortedSegments.filter((s) => !s.endDate);
  if (openSegments.length > 1) {
    throw new Error(
      'Only one stay segment can be open (Present / no End Date). Please enter an End Date on past stays.'
    );
  }

  const prevNormalized = getNormalizedStayHistory(currentStudent);
  const prevOpen = prevNormalized.find((s) => !s.endDate) || null;
  const nextOpen = openSegments[0] || null;

  if (
    currentStudent.status !== 'Active' &&
    nextOpen &&
    (!prevOpen || !areStaySegmentsEquivalent(prevOpen, nextOpen))
  ) {
    throw new Error(
      'Checked-Out residents cannot have an ongoing stay without an End Date.'
    );
  }

  const studentRef = doc(db, 'students', currentStudent.studentId);
  const batch = writeBatch(db);
  const simStatus = buildSimulatedOccupancyMap(allRooms);
  const roomUpdates = new Map<string, Record<string, unknown>>();

  try {
    const studentUpdate: Record<string, unknown> = {
      stayHistory: sortedSegments,
      updatedBy: email,
      updatedAt: serverTimestamp(),
    };

    // Closed-Segment Protection Rule:
    // Only sync top-level current rate and room fields when modifying the single active segment
    // where endDate === null (and student.status === 'Active').
    // Adding, editing, or deleting any closed segment (endDate !== null) leaves top-level
    // assignedRoomId, standardRoomRate, monthlyRebate, and effectiveMonthlyFee untouched.
    const activeOpenModified =
      currentStudent.status === 'Active' &&
      ((prevOpen === null && nextOpen !== null) ||
        (prevOpen !== null && nextOpen === null) ||
        (prevOpen !== null &&
          nextOpen !== null &&
          !areStaySegmentsEquivalent(prevOpen, nextOpen)));

    if (activeOpenModified) {
      const oldRoomObj = currentStudent.assignedRoomId
        ? allRooms.find((r) => r.roomId === currentStudent.assignedRoomId)
        : undefined;

      if (nextOpen) {
        const nextOpenMode = normalizeAssignableOccupancyMode(nextOpen.occupancyMode);
        let nextOpenBeds = resolveBedsOccupiedCount(nextOpenMode, nextOpen.bedsOccupied, true);

        const roomChanged = nextOpen.roomId !== currentStudent.assignedRoomId;
        const bedConfigChanged =
          !prevOpen ||
          prevOpen.occupancyMode !== nextOpenMode ||
          (prevOpen.bedsOccupied ?? 1) !== nextOpenBeds;

        if (roomChanged || bedConfigChanged) {
          queueReleaseForResident(
            allRooms,
            currentStudent.studentId,
            oldRoomObj,
            currentStudent.occupancyMode,
            email,
            roomUpdates,
            simStatus
          );

          const newRoomObj = allRooms.find((r) => r.roomId === nextOpen.roomId);
          if (newRoomObj) {
            const newRoomRef = doc(db, 'rooms', newRoomObj.roomId);
            const freshSnap = await getDoc(newRoomRef);
            const freshData = freshSnap.data();
            const isOwnReclaimable =
              freshData?.currentStudentId === currentStudent.studentId ||
              (freshData?.status === 'Reserved / Blocked' &&
                freshData?.exclusiveResidentId === currentStudent.studentId);
            if (freshSnap.exists() && freshData?.status !== 'Vacant' && !isOwnReclaimable) {
              throw new Error(
                `Room "${newRoomObj.roomId}" is currently ${freshData?.status}. Set an End Date if recording a past stay, or pick a Vacant bed.`
              );
            }
            if (freshSnap.exists()) {
              const reserved = queueReserveForResident(
                newRoomObj,
                allRooms,
                currentStudent.studentId,
                currentStudent.fullName,
                nextOpenMode,
                nextOpenBeds,
                email,
                roomUpdates,
                simStatus
              );
              nextOpenBeds = reserved.resolvedBedsOccupied;
              nextOpen.bedsOccupied = nextOpenBeds;
            }
          }
          applyRoomUpdateMapToBatch(batch, roomUpdates);
        }

        studentUpdate.assignedRoomId = nextOpen.roomId;
        studentUpdate.hostelLocation = nextOpen.hostelLocation;
        studentUpdate.occupancyMode = nextOpenMode;
        studentUpdate.bedsOccupied = nextOpenBeds;
        studentUpdate.standardRoomRate = nextOpen.standardRoomRate;
        studentUpdate.monthlyRebate = nextOpen.monthlyRebate;
        studentUpdate.effectiveMonthlyFee = nextOpen.effectiveMonthlyFee;
        studentUpdate.monthlyFee = nextOpen.effectiveMonthlyFee;

        if (sortedSegments[0]?.id === nextOpen.id) {
          studentUpdate.checkInDate = nextOpen.startDate;
          if (typeof nextOpen.firstMonthCharge === 'number') {
            studentUpdate.firstMonthCharge = nextOpen.firstMonthCharge;
          }
        }
      } else {
        // The single active open segment (endDate === null) was closed or removed:
        // release live bed occupancy without overwriting top-level rates from any historical segment.
        queueReleaseForResident(
          allRooms,
          currentStudent.studentId,
          oldRoomObj,
          currentStudent.occupancyMode,
          email,
          roomUpdates,
          simStatus
        );
        applyRoomUpdateMapToBatch(batch, roomUpdates);
        studentUpdate.assignedRoomId = '';
        studentUpdate.hostelLocation = 'Unassigned';
        studentUpdate.occupancyMode = 'Unassigned';
        studentUpdate.bedsOccupied = 0;
      }
    }

    batch.update(studentRef, studentUpdate);
    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('currently') ||
        error.message.includes('Date') ||
        error.message.includes('Room') ||
        error.message.includes('available') ||
        error.message.includes('Exclusive'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `students/${currentStudent.studentId}`
    );
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
  physicalReceiptStatus?: PhysicalReceiptStatus;
  physicalReceiptNo?: string;
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
  const physStatus: PhysicalReceiptStatus =
    input.physicalReceiptStatus === 'Issued' ? 'Issued' : 'Pending Issuance';
  const physNo = (input.physicalReceiptNo || '').trim().slice(0, 64);

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
      physicalReceiptStatus: physStatus,
      physicalReceiptNo: physNo,
      receiptIssuedBy: physStatus === 'Issued' ? email : null,
      receiptIssuedAt: physStatus === 'Issued' ? serverTimestamp() : null,
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
  physicalReceiptStatus?: PhysicalReceiptStatus;
  physicalReceiptNo?: string;
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
    if (input.physicalReceiptStatus !== undefined) {
      payload.physicalReceiptStatus = input.physicalReceiptStatus;
      payload.physicalReceiptNo = (input.physicalReceiptNo || '').trim().slice(0, 64);
      if (input.physicalReceiptStatus === 'Issued') {
        payload.receiptIssuedBy = email;
        payload.receiptIssuedAt = serverTimestamp();
      } else {
        payload.receiptIssuedBy = null;
        payload.receiptIssuedAt = null;
      }
    }
    await updateDoc(doc(db, 'payments', paymentId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePayment(paymentId: string): Promise<void> {
  const path = `payments/${paymentId}`;
  try {
    await deleteDoc(doc(db, 'payments', paymentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
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
  occupantType?: OccupantType;
  occupancyMode: OccupancyMode;
  bedsOccupied?: number;
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
      const resolvedOccupantType: OccupantType =
        item.occupantType && OCCUPANT_TYPES.includes(item.occupantType)
          ? item.occupantType
          : resolveOccupantType({ residentType: item.residentType });
      const legacyResidentType = toLegacyResidentType(resolvedOccupantType);
      const resolvedMode: OccupancyMode = !assignedRoom
        ? 'Unassigned'
        : normalizeAssignableOccupancyMode(item.occupancyMode);

      const vacantSiblings =
        item.status === 'Active' && assignedRoom
          ? allRooms
              .filter(
                (r) =>
                  r.roomId !== assignedRoom.roomId &&
                  r.location === assignedRoom.location &&
                  r.block === assignedRoom.block &&
                  r.unitNo === assignedRoom.unitNo &&
                  r.status === 'Vacant' &&
                  !claimedInImport.has(r.roomId)
              )
              .sort((a, b) =>
                a.bedSlot.localeCompare(b.bedSlot, undefined, { numeric: true })
              )
          : [];

      let siblingsToBlock: Room[] = [];
      let resolvedBedsOccupied = 0;
      if (assignedRoom) {
        if (resolvedMode === 'Whole Unit Exclusive') {
          siblingsToBlock = vacantSiblings;
          const totalUnitBeds = allRooms.filter(
            (r) =>
              r.location === assignedRoom.location &&
              r.block === assignedRoom.block &&
              r.unitNo === assignedRoom.unitNo
          ).length;
          resolvedBedsOccupied = Math.max(1, totalUnitBeds);
        } else if (resolvedMode === 'Custom Multi-Bed') {
          const requestedBeds = Math.max(
            1,
            Math.floor(Number(item.bedsOccupied) || 2)
          );
          if (item.status === 'Active') {
            siblingsToBlock = vacantSiblings.slice(0, requestedBeds - 1);
            resolvedBedsOccupied = 1 + siblingsToBlock.length;
          } else {
            resolvedBedsOccupied = requestedBeds;
          }
        } else {
          resolvedBedsOccupied = 1;
        }
      }

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
              occupancyMode: resolvedMode,
              bedsOccupied: resolvedBedsOccupied,
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
        residentType: legacyResidentType,
        occupantType: resolvedOccupantType,
        occupancyMode: resolvedMode,
        bedsOccupied: resolvedBedsOccupied,
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

        const blockNote =
          resolvedMode === 'Custom Multi-Bed'
            ? `Multi-Bed (${resolvedBedsOccupied} Beds): ${fullName}`.slice(
                0,
                FIELD_LIMITS.statusNote.max
              )
            : `Exclusive Unit: ${fullName}`.slice(
                0,
                FIELD_LIMITS.statusNote.max
              );
        for (const sib of siblingsToBlock) {
          claimedInImport.add(sib.roomId);
          batch.update(doc(db, 'rooms', sib.roomId), {
            status: 'Reserved / Blocked',
            currentStudentId: null,
            currentStudentName: null,
            statusNote: blockNote,
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

export type TenancyImportMode = 'append' | 'replace';

export interface BulkImportTenancyHistoryItem {
  studentId: string;
  roomId: string;
  hostelLocation: ResidentHostelLocation;
  occupancyMode: OccupancyMode;
  bedsOccupied?: number;
  startDate: string;
  endDate: string | null;
  standardRoomRate: number;
  monthlyRebate: number;
  effectiveMonthlyFee: number;
  firstMonthCharge: number;
  reason: string;
}

export interface BulkImportTenancyResult {
  updatedStudentsCount: number;
  segmentsImportedCount: number;
  totalRecalculatedRent: number;
  totalRecalculatedOutstanding: number;
}

export async function bulkImportTenancyHistory(
  items: BulkImportTenancyHistoryItem[],
  mode: TenancyImportMode,
  existingStudents: Student[],
  allPayments: Payment[],
  staffEmail: string,
  onProgress?: (completed: number, total: number) => void
): Promise<BulkImportTenancyResult> {
  const email = assertStaffEmail(staffEmail);
  if (items.length === 0) {
    return {
      updatedStudentsCount: 0,
      segmentsImportedCount: 0,
      totalRecalculatedRent: 0,
      totalRecalculatedOutstanding: 0,
    };
  }

  const studentById = new Map(existingStudents.map((s) => [s.studentId, s]));
  const grouped = new Map<string, BulkImportTenancyHistoryItem[]>();
  for (const item of items) {
    const cleanSid = sanitizeIdSegment(item.studentId);
    const list = grouped.get(cleanSid) ?? [];
    list.push(item);
    grouped.set(cleanSid, list);
  }

  let batch = writeBatch(db);
  let opsInBatch = 0;
  let completedSegments = 0;
  let updatedStudentsCount = 0;
  let totalRecalculatedRent = 0;
  let totalRecalculatedOutstanding = 0;

  try {
    let segCounter = 0;
    const entries = Array.from(grouped.entries());

    for (const [studentId, studentItems] of entries) {
      const existingStudent = studentById.get(studentId);
      if (!existingStudent) {
        throw new Error(`Resident ID "${studentId}" not found in students collection.`);
      }

      const importedSegments: StayHistorySegment[] = studentItems.map((item) => {
        segCounter += 1;
        const cleanRoomId = (item.roomId || '').trim().slice(0, FIELD_LIMITS.roomId.max);
        if (!cleanRoomId) {
          throw new Error(`Missing Room ID for ${studentId}.`);
        }
        if (!DATE_REGEX.test(item.startDate)) {
          throw new Error(`Invalid startDate "${item.startDate}" for ${studentId}.`);
        }
        const cleanEnd = item.endDate ? item.endDate.trim() : null;
        if (cleanEnd) {
          if (!DATE_REGEX.test(cleanEnd)) {
            throw new Error(`Invalid endDate "${cleanEnd}" for ${studentId}.`);
          }
          if (cleanEnd < item.startDate) {
            throw new Error(
              `endDate (${cleanEnd}) cannot be earlier than startDate (${item.startDate}) for ${studentId}.`
            );
          }
        } else if (existingStudent.status !== 'Active') {
          throw new Error(
            `Resident ${studentId} has status ${existingStudent.status}; blank endDate is only allowed for Active residents.`
          );
        }

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
        const clampedEffFee = Math.max(
          0,
          Math.round((clampedStdRate - clampedRebate) * 100) / 100
        );
        const clampedFirstCharge = clampNumber(
          item.firstMonthCharge,
          FIELD_LIMITS.monthlyFee.min,
          FIELD_LIMITS.monthlyFee.max
        );
        const segMode = normalizeAssignableOccupancyMode(item.occupancyMode);
        const segBeds = resolveBedsOccupiedCount(segMode, item.bedsOccupied, true);

        return {
          id: `${createStaySegmentId()}-${segCounter}`,
          roomId: cleanRoomId,
          hostelLocation: item.hostelLocation || 'Unassigned',
          occupancyMode: segMode,
          bedsOccupied: segBeds,
          startDate: item.startDate,
          endDate: cleanEnd,
          standardRoomRate: clampedStdRate,
          monthlyRebate: clampedRebate,
          effectiveMonthlyFee: clampedEffFee,
          firstMonthCharge: clampedFirstCharge,
          reason: (
            item.reason || (cleanEnd ? 'Historical Stay' : 'Active Placement')
          )
            .trim()
            .slice(0, 120),
          recordedBy: email,
          recordedAt: new Date().toISOString(),
        };
      });

      const baseSegments =
        mode === 'append' ? getNormalizedStayHistory(existingStudent) : [];
      const mergedSegments = [...baseSegments, ...importedSegments].sort((a, b) => {
        const cmp = a.startDate.localeCompare(b.startDate);
        if (cmp !== 0) return cmp;
        // Closed segments before ongoing segment on identical startDate
        if (a.endDate && !b.endDate) return -1;
        if (!a.endDate && b.endDate) return 1;
        return 0;
      });

      const openSegments = mergedSegments.filter((s) => !s.endDate);
      if (openSegments.length > 1) {
        throw new Error(
          `Resident ${studentId} would have ${openSegments.length} ongoing stays without an End Date. Only one ongoing stay is allowed.`
        );
      }

      const importedOpenSegment = importedSegments.find((s) => !s.endDate) || null;
      const shouldSyncActiveFields =
        existingStudent.status === 'Active' && importedOpenSegment !== null;

      const updatePayload: Record<string, unknown> = {
        stayHistory: mergedSegments,
        updatedBy: email,
        updatedAt: serverTimestamp(),
      };

      let simulatedStudent: Student = {
        ...existingStudent,
        stayHistory: mergedSegments,
      };

      // Strict Rate Isolation: only sync top-level current rate & room when importing an open active segment for an Active resident
      if (shouldSyncActiveFields && importedOpenSegment) {
        updatePayload.assignedRoomId = importedOpenSegment.roomId;
        updatePayload.hostelLocation = importedOpenSegment.hostelLocation;
        updatePayload.occupancyMode = importedOpenSegment.occupancyMode;
        updatePayload.bedsOccupied = importedOpenSegment.bedsOccupied ?? 1;
        updatePayload.standardRoomRate = importedOpenSegment.standardRoomRate;
        updatePayload.monthlyRebate = importedOpenSegment.monthlyRebate;
        updatePayload.effectiveMonthlyFee = importedOpenSegment.effectiveMonthlyFee;
        updatePayload.monthlyFee = importedOpenSegment.effectiveMonthlyFee;
        if (mergedSegments.length === 1 && typeof importedOpenSegment.firstMonthCharge === 'number') {
          updatePayload.firstMonthCharge = importedOpenSegment.firstMonthCharge;
        }
        simulatedStudent = {
          ...simulatedStudent,
          assignedRoomId: importedOpenSegment.roomId,
          hostelLocation: importedOpenSegment.hostelLocation,
          occupancyMode: importedOpenSegment.occupancyMode,
          bedsOccupied: importedOpenSegment.bedsOccupied ?? 1,
          standardRoomRate: importedOpenSegment.standardRoomRate,
          monthlyRebate: importedOpenSegment.monthlyRebate,
          effectiveMonthlyFee: importedOpenSegment.effectiveMonthlyFee,
          monthlyFee: importedOpenSegment.effectiveMonthlyFee,
          firstMonthCharge:
            mergedSegments.length === 1 &&
            typeof importedOpenSegment.firstMonthCharge === 'number'
              ? importedOpenSegment.firstMonthCharge
              : existingStudent.firstMonthCharge,
        };
      }

      const billing = calculateStudentBilling(simulatedStudent, allPayments);
      totalRecalculatedRent =
        Math.round((totalRecalculatedRent + billing.totalExpectedRent) * 100) / 100;
      totalRecalculatedOutstanding =
        Math.round(
          (totalRecalculatedOutstanding + billing.outstandingBalance) * 100
        ) / 100;

      batch.update(doc(db, 'students', studentId), updatePayload);
      opsInBatch += 1;
      updatedStudentsCount += 1;
      completedSegments += studentItems.length;

      if (opsInBatch >= MAX_BATCH_OPERATIONS) {
        await batch.commit();
        onProgress?.(completedSegments, items.length);
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
      onProgress?.(completedSegments, items.length);
    }

    return {
      updatedStudentsCount,
      segmentsImportedCount: completedSegments,
      totalRecalculatedRent,
      totalRecalculatedOutstanding,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('ongoing stays') ||
        error.message.includes('blank endDate') ||
        error.message.includes('Invalid') ||
        error.message.includes('Missing') ||
        error.message.includes('cannot be earlier'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'students');
  }
}

export interface BatchPastPaymentEntry {
  billingMonth: string;
  amount: number;
  roomId?: string;
  hostelLocation?: ResidentHostelLocation;
}

export interface BatchPastPaymentConfig {
  paymentMethod: PaymentMethod;
  bankRefNo: string;
  physicalReceiptStatus: PhysicalReceiptStatus;
  physicalReceiptNo?: string;
  notes: string;
  paymentType?: PaymentType;
}

export interface BatchPastPaymentResult {
  createdCount: number;
  receiptNumbers: string[];
  totalAmount: number;
}

export async function batchCreatePastPayments(
  student: Student,
  entries: BatchPastPaymentEntry[],
  config: BatchPastPaymentConfig,
  existingPayments: Payment[],
  masterAdminEmail: string
): Promise<BatchPastPaymentResult> {
  const email = assertStaffEmail(masterAdminEmail);
  if (entries.length === 0) {
    throw new Error('Select at least one month to record.');
  }

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

  const bankRefNo = config.bankRefNo.trim().slice(0, FIELD_LIMITS.bankRefNo.max);
  const physStatus: PhysicalReceiptStatus =
    config.physicalReceiptStatus === 'Issued' ? 'Issued' : 'Pending Issuance';
  const physNo = (config.physicalReceiptNo || '').trim().slice(0, 64);
  const notes = config.notes.trim().slice(0, FIELD_LIMITS.notes.max);
  const paymentType: PaymentType = config.paymentType || 'Monthly Rent';
  const currentMonth = getCurrentMonthISO();
  const todayISO = getTodayISO();

  let batch = writeBatch(db);
  let opsInBatch = 0;
  const receiptNumbers: string[] = [];
  let totalAmount = 0;

  try {
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx];
      if (!MONTH_REGEX.test(entry.billingMonth)) {
        throw new Error(`Invalid billing month "${entry.billingMonth}".`);
      }
      const cleanAmt = clampNumber(
        entry.amount,
        FIELD_LIMITS.amount.min,
        FIELD_LIMITS.amount.max
      );
      if (cleanAmt <= 0) {
        throw new Error(
          `Payment amount for ${entry.billingMonth} must be greater than RM 0.00.`
        );
      }

      const ym = entry.billingMonth.replace('-', '');
      const nextSeq = (maxSeqByMonth.get(entry.billingMonth) ?? 0) + 1;
      maxSeqByMonth.set(entry.billingMonth, nextSeq);
      const receiptNo = `GIS-${ym}-${String(nextSeq).padStart(4, '0')}`;
      receiptNumbers.push(receiptNo);

      const stamp = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
      const paymentId = `PAY-${ym}-${stamp}${idx}${rand}`.slice(
        0,
        FIELD_LIMITS.paymentId.max
      );
      const paymentDate =
        entry.billingMonth === currentMonth ? todayISO : `${entry.billingMonth}-01`;

      batch.set(doc(db, 'payments', paymentId), {
        paymentId,
        receiptNo,
        studentId: student.studentId,
        studentName: student.fullName.slice(0, FIELD_LIMITS.fullName.max),
        roomId: (entry.roomId ?? student.assignedRoomId) || '',
        hostelLocation:
          entry.hostelLocation ?? student.hostelLocation ?? 'Unassigned',
        billingMonth: entry.billingMonth,
        paymentType,
        amount: cleanAmt,
        paymentMethod: config.paymentMethod,
        bankRefNo,
        referenceNo: bankRefNo,
        paymentDate,
        status: 'Paid' as PaymentStatus,
        notes,
        proofImageData: null,
        physicalReceiptStatus: physStatus,
        physicalReceiptNo: physNo,
        receiptIssuedBy: physStatus === 'Issued' ? email : null,
        receiptIssuedAt: physStatus === 'Issued' ? serverTimestamp() : null,
        recordedBy: email,
        recordedAt: serverTimestamp(),
        updatedBy: email,
        updatedAt: serverTimestamp(),
      });

      totalAmount = Math.round((totalAmount + cleanAmt) * 100) / 100;
      opsInBatch += 1;

      if (opsInBatch >= MAX_BATCH_OPERATIONS) {
        await batch.commit();
        batch = writeBatch(db);
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
    }

    return {
      createdCount: entries.length,
      receiptNumbers,
      totalAmount,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Invalid billing month') ||
        error.message.includes('greater than RM 0.00') ||
        error.message.includes('Select at least one'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'payments');
  }
}

