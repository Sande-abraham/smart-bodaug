# Security Specification - BodaSmart

## Data Invariants
1. A **User Profile** can only be created by the owner (uid match).
2. The `role` and `isApproved` fields can ONLY be updated by an **Admin**.
3. A **Ride Request** can only be created by a **Customer**.
4. Only the assigned **Rider** or the **Customer** can read the ride details.
5. Only the assigned **Rider** can transition ride status from `REQUESTED` -> `ACCEPTED` -> `ARRIVED` -> `STARTED` -> `COMPLETED`.
6. **Location** updates for a user can only be done by that user.
7. **Wallet balances** and **earnings** should only be updated by the system (or under strict transaction rules).

## The Dirty Dozen Payloads
1. **Identity Spoofing**: User A tries to create a profile for User B.
2. **Privilege Escalation**: Customer tries to set their own `role` to 'admin'.
3. **Self-Approval**: Rider tries to set their own `isApproved` to `true`.
4. **Ransom Write**: User A tries to delete User B's profile.
5. **Ride Hijack**: Rider B tries to accept a ride assigned to Rider A.
6. **Ghost Ride**: Unauthorized user tries to create a ride request.
7. **Fare Tamper**: Customer tries to update the `fare` of an ongoing ride.
8. **Illegal Status Jump**: Rider tries to go from `REQUESTED` directly to `COMPLETED`.
9. **Location Stalking**: Unrelated user tries to read another user's `lastKnownLocation`.
10. **Resource Exhaustion**: Attacker sends a 1MB string as a `displayName`.
11. **Negative Wallet**: Customer tries to set their `walletBalance` to a negative number.
12. **System Field Injection**: User tries to add a `ghostField: true` to a ride document.

## Test Runner (Draft)
The test runner `firestore.rules.test.ts` will verify these scenarios.
