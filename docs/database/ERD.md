# SmartProjex — Entity Relationship Diagram (ERD)

Dokumen ini memodelkan seluruh entitas, relasi, atribut, dan batasan integritas basis data SmartProjex (PostgreSQL / Supabase) berdasarkan PRD Revisi 3.

---

## 1. Diagram Relasi Entitas (Mermaid)

```mermaid
erDiagram
    auth_users ||--o| staff_profiles : "1-to-1 via auth_user_id"
    auth_users ||--o| students : "1-to-1 via auth_user_id"

    staff_profiles ||--o{ students : "memverifikasi (verified_by)"
    staff_profiles ||--o{ class_leader_claims : "memutuskan (decided_by)"
    staff_profiles ||--o{ loans : "memproses pinjam (borrow_processed_by)"
    staff_profiles ||--o{ loans : "memproses kembali (return_processed_by)"
    staff_profiles ||--o{ projector_status_logs : "mengubah status (changed_by)"
    staff_profiles ||--o{ audit_logs : "pelaku staf (actor_staff_id)"
    staff_profiles ||--o{ kiosk_sessions : "membuat sesi (created_by_staff_id)"
    staff_profiles ||--o{ app_settings : "memperbarui (updated_by)"

    classes ||--o| students : "memiliki ketua aktif (leader_student_id)"
    classes ||--o{ students : "kelas terdaftar (current_class_id)"
    classes ||--o{ class_leader_claims : "diajukan pada (class_id)"
    classes ||--o{ loans : "kelas saat meminjam (class_id)"
    classes ||--o{ kiosk_sessions : "konteks kelas (class_id)"

    students ||--o{ class_leader_claims : "mengajukan klaim (student_id)"
    students ||--o{ loans : "peminjam ketua kelas (student_id)"
    students ||--o{ audit_logs : "pelaku mahasiswa (actor_student_id)"
    students ||--o{ kiosk_sessions : "mahasiswa teridentifikasi (student_id)"

    projectors ||--o{ loans : "aset yang dipinjam (projector_id)"
    projectors ||--o{ projector_status_logs : "riwayat status aset (projector_id)"

    loans ||--o{ projector_status_logs : "terkait transaksi pinjam/kembali (loan_id)"

    staff_profiles {
        uuid id PK
        uuid auth_user_id UK
        varchar name
        varchar role "STAFF | ADMIN"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    classes {
        uuid id PK
        varchar study_program
        smallint cohort_year
        varchar section "Rombel: A | B | C"
        varchar academic_term "e.g. 2026/2027-GANJIL"
        uuid leader_student_id FK
        timestamptz leader_since
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    students {
        uuid id PK
        uuid auth_user_id UK
        varchar nim
        varchar name
        varchar email
        uuid current_class_id FK
        varchar registration_status "UNVERIFIED_EMAIL | PENDING_DOCUMENT | PENDING_REVIEW | ACTIVE | REJECTED | RESUBMISSION_REQUIRED | INACTIVE"
        text profile_photo_path
        text verification_document_path
        varchar verification_document_type "KTM | KTP"
        jsonb verification_checks
        text verification_notes
        uuid verified_by FK
        timestamptz verified_at
        integer qr_token_version
        timestamptz deactivated_at
        timestamptz created_at
        timestamptz updated_at
    }

    class_leader_claims {
        uuid id PK
        uuid class_id FK
        uuid student_id FK
        varchar claim_type "INITIAL | REPLACEMENT | TRANSFER"
        varchar status "PENDING | APPROVED | REJECTED | CANCELLED"
        uuid decided_by FK
        timestamptz decided_at
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    projectors {
        uuid id PK
        varchar code UK
        varchar name
        varchar status "AVAILABLE | BORROWED | MAINTENANCE | INACTIVE"
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    loans {
        uuid id PK
        varchar idempotency_key UK
        uuid student_id FK
        uuid class_id FK
        uuid projector_id FK
        timestamptz borrowed_at
        timestamptz due_at
        text borrow_photo_path
        varchar borrow_identification_method "QR | MANUAL_LOOKUP"
        uuid borrow_processed_by FK
        timestamptz returned_at
        text return_photo_path
        varchar returned_by_type "BORROWER | REPRESENTATIVE"
        varchar returned_by_name
        uuid return_processed_by FK
        varchar return_condition "NORMAL | REPORTED_ISSUE"
        text damage_notes
        timestamptz issue_resolved_at
        varchar status "ACTIVE | COMPLETED"
        timestamptz photos_deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    projector_status_logs {
        uuid id PK
        uuid projector_id FK
        varchar from_status
        varchar to_status
        text reason
        text photo_path
        uuid loan_id FK
        varchar idempotency_key
        uuid changed_by FK
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid actor_staff_id FK
        uuid actor_student_id FK
        varchar action
        varchar entity_type
        varchar entity_id
        jsonb metadata
        timestamptz created_at
    }

    kiosk_sessions {
        uuid id PK
        uuid student_id FK
        uuid class_id FK
        uuid created_by_staff_id FK
        varchar identification_method "QR | MANUAL_LOOKUP"
        text manual_reason
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }

    app_settings {
        varchar key PK
        jsonb value
        text description
        uuid updated_by FK
        timestamptz updated_at
    }
```

---

## 2. Invariant Kritis & Partial Unique Indexes

1. **Satu NIM Aktif**:
   `CREATE UNIQUE INDEX idx_students_active_nim ON students (nim) WHERE registration_status = 'ACTIVE';`
   *Tujuan*: Memungkinkan pendaftar dengan NIM sama masuk antrean verifikasi untuk ditandai duplikasi ke petugas, namun hanya 1 akun yang dapat berstatus `ACTIVE`.

2. **Satu Pinjaman Aktif per Unit Proyektor**:
   `CREATE UNIQUE INDEX idx_loans_active_projector ON loans (projector_id) WHERE status = 'ACTIVE';`
   *Tujuan*: Mencegah unit proyektor yang sama dipinjam lebih dari 1 kali secara bersamaan di tingkat basis data.

3. **Satu Pinjaman Aktif per Mahasiswa (Ketua Kelas)**:
   `CREATE UNIQUE INDEX idx_loans_active_student ON loans (student_id) WHERE status = 'ACTIVE';`
   *Tujuan*: Menegakkan aturan bahwa satu ketua kelas hanya boleh membawa maksimal 1 unit proyektor aktif.

4. **Satu Calon Ketua Awal per Kelas**:
   `CREATE UNIQUE INDEX idx_claims_one_pending_initial ON class_leader_claims (class_id) WHERE claim_type = 'INITIAL' AND status = 'PENDING';`
   *Tujuan*: Menegakkan aturan pendaftar pertama (`INITIAL`) per kelas yang belum punya ketua; pendaftar berikutnya otomatis menjadi `REPLACEMENT`.
