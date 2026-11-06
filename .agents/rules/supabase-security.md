---
trigger: model_decision
description: "Apply when designing or changing Supabase schema, RLS, storage, auth, API handlers, QR tokens, or transaction workflows."
---
# Supabase Security and Transaction Rules
- Enable RLS for every exposed table; design explicit policies and least privilege.
- Service-role credentials must remain server-only. Never place secrets in NEXT_PUBLIC variables.
- Private storage only; DB stores object paths. Signed URLs expire within 60 seconds and are audited.
- Never store NIK or OCR text. Delete identity-document photo after decision (maximum 24 hours). Face matching is manual only.
- Signed QR Pass (HS256) has 60-second lifetime, no NIM in payload; verify signature, expiry, token version, active account and active class-leader status server-side.
- Never transmit QR token in URL/query string. Kiosk lookup and transaction APIs use POST.
- Transaction mutation is server-authoritative and atomic: lock projector row, determine borrow/return from current status, update loan/projector/status history together. Use idempotency key.
- Enforce partial unique indexes for active loan per projector and per student. Include race-condition tests.
- Audit verification decisions, leader claims/transfer, QR revocation, projector status change, signed photo URL, manual lookup.
- All timestamps are timestamptz; transaction timestamp comes from server; display Asia/Jakarta.
