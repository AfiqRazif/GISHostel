# Security Specification — GIS Nilai Hostel Management

## 1. Data Invariants
1. **Authentication Gate**: Unauthenticated or unverified users (`request.auth == null || request.auth.token.email_verified != true`) cannot read or write any document in `/rooms`, `/students`, `/payments`, or `/staff`.
2. **Audit Log Integrity**: Every create and update on `/rooms`, `/students`, and `/payments` MUST set `updatedBy == request.auth.token.email` and `updatedAt == request.time`. Staff cannot forge another staff member's email or spoof timestamps.
3. **Referential & State Integrity**:
   - A `Room` cannot be marked `Occupied` without non-null `currentStudentId` and `currentStudentName`.
   - A `Room` cannot be marked `Vacant` or `Maintenance` while still holding a non-null `currentStudentId` or `currentStudentName`.
   - A `Student` cannot be created unless their `assignedRoomId` references an existing room in `/rooms/{assignedRoomId}` (via `exists()` / `existsAfter()`).
   - A `Payment` cannot be created unless `studentId` exists in `/students/{studentId}` (via `exists()` / `existsAfter()`).
   - Path ID variables (`roomId`, `studentId`, `paymentId`, `uid`) must match `^[a-zA-Z0-9_\-]+$` and stay under 128 chars.
4. **Strict Schema Enforcement**: Every write checks `hasAll` and `hasOnly` on create, `affectedKeys().hasOnly(...)` on action-based updates, and type/boundary limits on every field.
5. **Staff Profile Isolation**: Users can only read/write their own `/staff/{uid}` document (`uid == request.auth.uid`) and cannot self-assign `role: 'admin'`.

## 2. Dirty Dozen Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated Room Read**: `GET /rooms/DJ2-A-04-B1` with `auth: null`.
2. **Unverified Email Write**: `CREATE /rooms/DJ2-A-04-B1` with `email_verified: false`.
3. **Audit Spoofing (`updatedBy`)**: `CREATE /rooms/DJ2-A-04-B1` with `updatedBy: "other@gis.edu.my"` while signed in as `"staff@gis.edu.my"`.
4. **Client-Forged Timestamp (`updatedAt`)**: `UPDATE /rooms/DJ2-A-04-B1` with client `Date` instead of `request.time`.
5. **Shadow Field Injection**: `CREATE /rooms/DJ2-A-04-B1` including extra `"isAdminOverride": true`.
6. **ID Poisoning**: `CREATE /rooms/invalid$id!with#chars` or 500-character ID.
7. **Orphaned Student Registration**: `CREATE /students/GIS999` referencing non-existent `assignedRoomId: "FAKE-ROOM-1"`.
8. **Orphaned Payment**: `CREATE /payments/PAY-999` referencing non-existent `studentId: "NON-EXISTENT"`.
9. **Room Occupancy Desync**: `UPDATE /rooms/DJ2-A-04-B1` setting `status: "Vacant"` while keeping `currentStudentId: "GIS001"`.
10. **Negative Currency / Value Poisoning**: `CREATE /payments/PAY-1` with `amount: -500` or `amount: "five hundred"`.
11. **Privilege Escalation on Staff Profile**: `CREATE /staff/{uid}` setting `role: "admin"` when not bootstrapped admin.
12. **Cross-User Staff Profile Read**: `GET /staff/{otherUid}` by a non-admin staff member.
