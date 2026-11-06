/**
 * Definisi Tipe Data Skema Database SmartProjex (PostgreSQL / Supabase)
 * Sesuai PRD Revisi 3 Bagian 7.2 dan Migration 1-4.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type StaffRole = 'STAFF' | 'ADMIN';

export type StudentRegistrationStatus =
  | 'UNVERIFIED_EMAIL'
  | 'PENDING_DOCUMENT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'REJECTED'
  | 'RESUBMISSION_REQUIRED'
  | 'INACTIVE';

export type VerificationDocumentType = 'KTM' | 'KTP';

export type ClaimType = 'INITIAL' | 'REPLACEMENT' | 'TRANSFER';

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ProjectorStatus = 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'INACTIVE';

export type LoanStatus = 'ACTIVE' | 'COMPLETED';

export type LoanCondition = 'NORMAL' | 'REPORTED_ISSUE';

export type ReturnerType = 'BORROWER' | 'REPRESENTATIVE';

export type IdentificationMethod = 'QR' | 'MANUAL_LOOKUP';

export interface Database {
  public: {
    Tables: {
      staff_profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          name: string;
          role: StaffRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          name: string;
          role: StaffRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          name?: string;
          role?: StaffRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      classes: {
        Row: {
          id: string;
          study_program: string;
          cohort_year: number;
          section: string;
          academic_term: string;
          leader_student_id: string | null;
          leader_since: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          study_program: string;
          cohort_year: number;
          section: string;
          academic_term: string;
          leader_student_id?: string | null;
          leader_since?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          study_program?: string;
          cohort_year?: number;
          section?: string;
          academic_term?: string;
          leader_student_id?: string | null;
          leader_since?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      students: {
        Row: {
          id: string;
          auth_user_id: string;
          nim: string;
          name: string;
          email: string;
          current_class_id: string | null;
          registration_status: StudentRegistrationStatus;
          profile_photo_path: string | null;
          verification_document_path: string | null;
          verification_document_type: VerificationDocumentType | null;
          verification_checks: Json | null;
          verification_notes: string | null;
          verified_by: string | null;
          verified_at: string | null;
          qr_token_version: number;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          nim: string;
          name: string;
          email: string;
          current_class_id?: string | null;
          registration_status?: StudentRegistrationStatus;
          profile_photo_path?: string | null;
          verification_document_path?: string | null;
          verification_document_type?: VerificationDocumentType | null;
          verification_checks?: Json | null;
          verification_notes?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          qr_token_version?: number;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          nim?: string;
          name?: string;
          email?: string;
          current_class_id?: string | null;
          registration_status?: StudentRegistrationStatus;
          profile_photo_path?: string | null;
          verification_document_path?: string | null;
          verification_document_type?: VerificationDocumentType | null;
          verification_checks?: Json | null;
          verification_notes?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          qr_token_version?: number;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      class_leader_claims: {
        Row: {
          id: string;
          class_id: string;
          student_id: string;
          claim_type: ClaimType;
          status: ClaimStatus;
          decided_by: string | null;
          decided_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          student_id: string;
          claim_type: ClaimType;
          status?: ClaimStatus;
          decided_by?: string | null;
          decided_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          student_id?: string;
          claim_type?: ClaimType;
          status?: ClaimStatus;
          decided_by?: string | null;
          decided_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      projectors: {
        Row: {
          id: string;
          code: string;
          name: string;
          status: ProjectorStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          status?: ProjectorStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          status?: ProjectorStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      projector_status_logs: {
        Row: {
          id: string;
          projector_id: string;
          from_status: ProjectorStatus;
          to_status: ProjectorStatus;
          reason: string | null;
          photo_path: string | null;
          loan_id: string | null;
          idempotency_key: string | null;
          changed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          projector_id: string;
          from_status: ProjectorStatus;
          to_status: ProjectorStatus;
          reason?: string | null;
          photo_path?: string | null;
          loan_id?: string | null;
          idempotency_key?: string | null;
          changed_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          projector_id?: string;
          from_status?: ProjectorStatus;
          to_status?: ProjectorStatus;
          reason?: string | null;
          photo_path?: string | null;
          loan_id?: string | null;
          idempotency_key?: string | null;
          changed_by?: string | null;
          created_at?: string;
        };
      };
      loans: {
        Row: {
          id: string;
          idempotency_key: string;
          student_id: string;
          class_id: string;
          projector_id: string;
          borrowed_at: string;
          due_at: string;
          borrow_photo_path: string | null;
          borrow_identification_method: IdentificationMethod;
          borrow_processed_by: string;
          returned_at: string | null;
          return_photo_path: string | null;
          returned_by_type: ReturnerType | null;
          returned_by_name: string | null;
          return_processed_by: string | null;
          return_condition: LoanCondition | null;
          damage_notes: string | null;
          issue_resolved_at: string | null;
          status: LoanStatus;
          photos_deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          student_id: string;
          class_id: string;
          projector_id: string;
          borrowed_at?: string;
          due_at: string;
          borrow_photo_path?: string | null;
          borrow_identification_method?: IdentificationMethod;
          borrow_processed_by: string;
          returned_at?: string | null;
          return_photo_path?: string | null;
          returned_by_type?: ReturnerType | null;
          returned_by_name?: string | null;
          return_processed_by?: string | null;
          return_condition?: LoanCondition | null;
          damage_notes?: string | null;
          issue_resolved_at?: string | null;
          status?: LoanStatus;
          photos_deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          student_id?: string;
          class_id?: string;
          projector_id?: string;
          borrowed_at?: string;
          due_at?: string;
          borrow_photo_path?: string | null;
          borrow_identification_method?: IdentificationMethod;
          borrow_processed_by?: string;
          returned_at?: string | null;
          return_photo_path?: string | null;
          returned_by_type?: ReturnerType | null;
          returned_by_name?: string | null;
          return_processed_by?: string | null;
          return_condition?: LoanCondition | null;
          damage_notes?: string | null;
          issue_resolved_at?: string | null;
          status?: LoanStatus;
          photos_deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          actor_staff_id: string | null;
          actor_student_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_staff_id?: string | null;
          actor_student_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_staff_id?: string | null;
          actor_student_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      kiosk_sessions: {
        Row: {
          id: string;
          student_id: string;
          class_id: string;
          created_by_staff_id: string;
          identification_method: IdentificationMethod;
          manual_reason: string | null;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          class_id: string;
          created_by_staff_id: string;
          identification_method: IdentificationMethod;
          manual_reason?: string | null;
          expires_at: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          class_id?: string;
          created_by_staff_id?: string;
          identification_method?: IdentificationMethod;
          manual_reason?: string | null;
          expires_at?: string;
          consumed_at?: string | null;
          created_at?: string;
        };
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
      };
    };
    Functions: {
      is_active_staff: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_active_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_active_staff_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      get_active_student_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      process_loan_transaction: {
        Args: {
          p_idempotency_key: string;
          p_projector_code: string;
          p_photo_path: string;
          p_condition: LoanCondition;
          p_staff_auth_id: string;
          p_kiosk_session_id?: string | null;
          p_issue_notes?: string | null;
          p_returner_type?: ReturnerType | null;
          p_returner_name?: string | null;
          p_due_at?: string | null;
        };
        Returns: Json;
      };
    };
  };
}

