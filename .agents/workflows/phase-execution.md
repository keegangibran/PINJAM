# Execute a SmartProjex Phase

1. Read `PRD.md`, root `AGENTS.md`, and the relevant `.agents/rules/`.
2. Inspect current repository state, git diff/status, dependencies, and existing implementation. Do not overwrite existing work.
3. Identify the phase and exact FR/FT/NFR acceptance criteria to implement. Present a short plan and call out ambiguities or external dependencies.
4. Implement only the approved phase in small cohesive changes.
5. Add/update migrations, RLS, tests, docs, and `.env.example` as relevant.
6. Run applicable lint, typecheck, tests, and build. Do not claim checks that were not run.
7. Review security/privacy, data integrity, and out-of-scope creep.
8. Report: completed, test evidence, acceptance criteria status, files changed, known issues, and next phase.
