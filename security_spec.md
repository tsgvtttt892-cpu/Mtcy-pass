# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Immutable Seal Records (`/seals/{sealId}`)**:
   - Every seal document ID `sealId` MUST match `^[a-zA-Z0-9_\-]{8,64}$` and equal `request.resource.data.id`.
   - Every seal document MUST contain strictly the required keys: `['id', 'name', 'question', 'hint', 'instructions', 'sealedEnvelope', 'createdAtIso']` and no shadow keys.
   - Plaintext passwords and plaintext secret content are NEVER stored in Firestore; only the server-wrapped `sealedEnvelope` (Argon2id + AES-256-GCM ciphertext) is stored.
   - Once created, a seal document is strictly immutable (`allow update, delete: if false;`), preventing anyone with a public solve link from tampering with or deleting a Thiên Ấn.
   - Collection listing (`allow list: if false;`) is strictly forbidden so that seals can only be accessed if the caller knows the exact cryptographic random `sealId`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection**: `{ id: "abc123456789", name: "Test", question: "Q?", hint: "", instructions: "", sealedEnvelope: "v1:...", createdAtIso: "2026-11-17T00:00:00.000Z", isAdmin: true }` -> Rejected by `hasOnly()`.
2. **ID Mismatch Poisoning**: Path `/seals/realId123456` with body `{ id: "spoofedId1234", ... }` -> Rejected by `incoming().id == sealId`.
3. **Oversized Name Denial-of-Wallet**: `name` with 5,000 characters -> Rejected by `data.name.size() <= 200`.
4. **Oversized Question Denial-of-Wallet**: `question` with 20,000 characters -> Rejected by `data.question.size() <= 5000`.
5. **Empty Question**: `question: ""` -> Rejected by `data.question.size() >= 1`.
6. **Type Confusion on Hint**: `hint: 12345` -> Rejected by `data.hint is string`.
7. **Type Confusion on Instructions**: `instructions: ["array"]` -> Rejected by `data.instructions is string`.
8. **Missing Encrypted Envelope**: Omitting `sealedEnvelope` -> Rejected by `hasAll()`.
9. **Short/Invalid Encrypted Envelope**: `sealedEnvelope: "short"` -> Rejected by `data.sealedEnvelope.size() >= 20`.
10. **Unauthorized Seal Update via Solve Link**: Attempting `updateDoc` on `/seals/{sealId}` -> Rejected by `allow update: if false;`.
11. **Unauthorized Seal Deletion**: Attempting `deleteDoc` on `/seals/{sealId}` -> Rejected by `allow delete: if false;`.
12. **Directory Scraping / List Enumeration**: Attempting `getDocs(collection(db, 'seals'))` -> Rejected by `allow list: if false;`.
