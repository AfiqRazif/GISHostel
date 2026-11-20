# Security Specification — GIS Nilai Hostel Management

## Role-Based Access Control (RBAC) & Governance Policy
- **Default Deny Catch-All**: Unmatched paths are denied via `match /{document=**} { allow read, write: if false; }`.
- **Active Staff Gate (`rooms`, `students`, `payments`)**: Only authenticated Firebase users with an active record (`active == true`) in `/staff_users/{request.auth.uid}` can read or write hostel rooms, residents, or payment ledger documents. Disabled staff accounts immediately lose access.
- **Master Admin RBAC (`staff_users`)**:
  - `get`: Allowed for the signed-in user's own `staff_users/{uid}` document (to verify role and active status) or any active staff member.
  - `list`: Allowed for active staff members (or the verified bootstrap owner during initial setup).
  - `create`: Restricted exclusively to active `"Master Admin"` users (plus one-time verified bootstrap owner `afiqjacksonmusic@gmail.com` when their own doc does not yet exist).
  - `update`: Restricted exclusively to active `"Master Admin"` users, with strict `affectedKeys().hasOnly(['role', 'active', 'fullName', 'updatedBy', 'updatedAt'])` and immutable `uid`/`createdAt` protection.
  - `delete`: Permanently denied (`false`). Staff accounts are deactivated via `active: false` rather than deleted.
- **UI & Service-Layer Lockout Guardrail**: Both `UserManagementTab.tsx` and `updateStaffUserAccount` prevent demoting or disabling the sole remaining active `"Master Admin"`.
