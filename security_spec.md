# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **User Profile Isolation (`/users/{userId}`)**: Only the verified owner (`request.auth.uid == userId` and `email_verified == true`) can read, create, or update their profile. `uid` and `createdAt` are immutable.
2. **Custom Categories (`/categories/{categoryId}`)**: Only the verified owner (`ownerId == request.auth.uid`) can create, list, get, update, or delete their custom categories. `ownerId` and `createdAt` are immutable.
3. **Custom Questions (`/questions/{questionId}`)**: Only the verified owner (`ownerId == request.auth.uid`) can create, list, get, update, or delete their custom questions. `expectedKeywords` is bounded to max 12 items.
4. **Interview Sessions (`/sessions/{sessionId}`)**: Only the verified owner (`userId == request.auth.uid`) can read, create, update, or delete their sessions. Once `status == 'completed'`, the session reaches terminal state and cannot be modified by non-admin clients.
5. **Session Responses (`/sessions/{sessionId}/responses/{responseId}`)**: Master Gate requires parent session `/sessions/{sessionId}` to exist and belong to `request.auth.uid`, and `incoming().sessionId == sessionId` and `incoming().userId == request.auth.uid`.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read on `/users/{uid}`**: `auth = null` -> DENIED.
2. **Cross-user PII read on `/users/{otherUid}`**: `auth.uid != otherUid` -> DENIED.
3. **Email spoofing without verification**: `email_verified: false` -> DENIED.
4. **Shadow field injection on `/users/{uid}` create**: Extra key `isAdmin: true` -> DENIED (`hasOnly` check).
5. **ID poisoning with 1KB path ID**: `/sessions/<1024-char-id>` -> DENIED (`isValidId` max 128 chars & regex).
6. **Spoofed `userId` on `/sessions/{id}` create**: `userId: 'victim_uid'` -> DENIED (`incoming().userId == request.auth.uid`).
7. **Timestamp spoofing on `/sessions/{id}` create**: `createdAt: <past timestamp != request.time>` -> DENIED (`incoming().createdAt == request.time`).
8. **Mutating completed session (terminal lock)**: Updating `overallScore` after `status == 'completed'` -> DENIED.
9. **Orphaned response without parent session**: Creating `/sessions/nonexistent/responses/r1` -> DENIED (`exists(...)` check).
10. **Cross-owner response injection**: Creating response under another user's session -> DENIED (Master Gate `get()` check).
11. **Oversized transcript payload (> 8000 chars)**: Resource exhaustion on `/sessions/{id}/responses/{rid}` -> DENIED.
12. **Blanket list scraping on `/sessions`**: Querying `/sessions` without `where('userId', '==', auth.uid)` -> DENIED (`resource.data.userId == request.auth.uid`).
