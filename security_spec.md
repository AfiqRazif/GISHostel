# Security Specification — GIS Nilai Hostel Management

## Role-Based Access Control (RBAC) & Governance Policy
- **Default Deny Catch-All**: Unmatched paths are denied via `match /{document=**} { allow read, write: if false; }`.
- **Operational Collections (`rooms`, `students`, `payments`)**:
  - **Read**: Allowed for authenticated users with an active record (`active == true`) and valid role (`"Master Admin"`, `"Admin"`, `"Staff"`, or `"Viewer"`) in `/staff_users/{request.auth.uid}`.
  - **Write (`create`, `update`, `delete`)**: Restricted strictly to active write-authorized staff (`role in ["Master Admin", "Admin", "Staff"]`). `"Viewer"` accounts and disabled accounts (`active == false`) cannot mutate any hostel data.
- **Master Admin RBAC & Viewer Self-Registration (`staff_users`)**:
  - `get`: Allowed for the signed-in user's own `staff_users/{uid}` document or an active `"Master Admin"`.
  - `list`: Restricted to active `"Master Admin"` users (or the verified bootstrap owner during initial setup) for PII isolation.
  - `create`: Allowed for:
    1. Active `"Master Admin"` provisioning staff accounts;
    2. Verified bootstrap owner (`afiqjacksonmusic@gmail.com`) creating their own initial `"Master Admin"` record;
    3. Authenticated Google sign-in users creating ONLY their own `staff_users/{request.auth.uid}` document with strict server enforcement of `role == "Viewer"`, `active == true`, and `authProvider == "google"` (preventing role self-escalation).
  - `update`: Restricted exclusively to active `"Master Admin"` users, with strict `affectedKeys().hasOnly(['role', 'active', 'fullName', 'updatedBy', 'updatedAt'])` and immutable `uid`/`createdAt` protection.
  - `delete`: Permanently denied (`false`). Accounts are deactivated via `active: false` rather than deleted.
- **UI & Service-Layer Lockout Guardrail**: Both `UserManagementTab.tsx` and `updateStaffUserAccount` prevent demoting or disabling the sole remaining active `"Master Admin"`.
