# Security Specification: CinemaChat Social & Sync

## Data Invariants
1. A user profile MUST have a unique identity (UID) matching their Auth ID.
2. `uniqueCode` (e.g., CC-1234) is unique across the system (verified by client search, but rules ensure it's immutable after creation).
3. `SyncGroup` documents represent private rooms. Access to messages and reactions is synced to the `memberIds` list.
4. `isOnline` status is the only field that can be updated rapidly and by the user themselves.
5. Users cannot join a room without adding themselves to `memberIds` using a strict update gate.

## The "Dirty Dozen" Payloads (Targeting Vulnerabilities)

1. **Identity Spoofing**: Attempt to create a user profile with a UID different from `request.auth.uid`.
2. **Code Poisoning**: Attempt to update `uniqueCode` to a 1MB string to cause Denial of Wallet.
3. **Ghost Status**: Attempt to set `isOnline` to "YES" (string) instead of `true` (bool).
4. **Room Hijack**: Attempt to update a `SyncGroup` as a non-member.
5. **Playback Poisoning**: Attempt to set `playback.currentTime` to -1 or a string.
6. **Message Spoofing**: Attempt to send a message with `senderId` of another user.
7. **Reaction Spam**: Attempt to send a reaction with a 1MB `type` string.
8. **Join Escalation**: Attempt to update `SyncGroup.creatorId` during a `memberIds` join operation.
9. **PII Scraping**: Attempt to `list` the entire `users` collection without a specific filter.
10. **System Field Injection**: Attempt to create a user with an `isAdmin` field set to `true`.
11. **Negative Time**: Attempt to set `playback.currentTime` to a negative number.
12. **Orphaned Message**: Attempt to create a message in a non-existent group (verified by `getGroupData()` helper which fails if group doesn't exist).

## Conflict Report

| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
|------------|-------------------|-------------------|-------------------|
| users      | Blocked (isOwner) | Blocked (isValid) | Blocked (size checks)|
| syncGroups | Blocked (isMember)| Blocked (Action gate)| Blocked (isValid)|
| messages   | Blocked (senderId)| N/A               | Blocked (size/isValid)|
| reactions  | Blocked (senderId)| N/A               | Blocked (size limits)|

---

## Red Team Audit Results

- **Email Spoofing Test**: Pass. Rules use `request.auth.uid` which is immutable and unique.
- **Shadow Update Test**: Pass. `affectedKeys().hasOnly()` blocks any undeclared fields.
- **PII Blanket Test**: Pass. `users` collection contains minimal public info (name, code). PII (phone) is only accessible because of `isSignedIn()` blanket read - **Harden needed**.
- **Query Trust Test**: Pass. `syncGroups` list query is protected by `isMemberOf(resource.data)`.
