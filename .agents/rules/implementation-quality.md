---
trigger: model_decision
description: "Apply to implementation, tests, UI, API, documentation, and project structure changes."
---
# Implementation Quality
- TypeScript strict, accessible UI, Indonesian interface, mobile/student and laptop/kiosk layouts.
- Keep changes scoped and phased; avoid speculative abstractions and unnecessary dependencies.
- Validate all untrusted input on server. Add tests for behavior and authorization, not merely snapshots.
- Do not report a test, build, deployment, or manual verification as passed unless it was actually run.
- Keep environment variables documented in `.env.example` with placeholder values only.
- No real personal data in tests, seed data, logs, or screenshots.
- For each phase, report files changed, requirements addressed, commands/results, remaining acceptance criteria, security/privacy concerns, and blockers.
