# Security Specification — GIS Nilai Hostel Management

## Development Access Policy
- **Authentication Gate**: All reads and writes to `/rooms`, `/students`, `/payments`, `/users`, and `/staff` require an authenticated Firebase user (`request.auth != null`). Unauthenticated access is denied by the global catch-all rule (`match /{document=**} { allow read, write: if false; }`).
- **Unfiltered Queries Supported**: `allow read` permits full-collection `onSnapshot` listeners for authenticated staff without static `resource.data` query rejections.
- **Client-Side Audit & Validation**: All application writes attach `updatedBy` (staff email) and `updatedAt` (`serverTimestamp()`) and validate payload boundaries in `src/lib/hostelService.ts` and `src/types/hostel.ts`.
- **Production Hardening Reminder**: Before broad production rollout, restore strict field-level validation helpers (`isValidRoom`, `isValidStudent`, `isValidPayment`), `email_verified == true` enforcement, and institutional staff allowlists.
