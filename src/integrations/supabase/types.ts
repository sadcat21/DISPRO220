export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounting_session_items: {
        Row: {
          actual_amount: number
          created_at: string
          difference: number | null
          expected_amount: number
          id: string
          item_type: string
          notes: string | null
          session_id: string
        }
        Insert: {
          actual_amount?: number
          created_at?: string
          difference?: number | null
          expected_amount?: number
          id?: string
          item_type: string
          notes?: string | null
          session_id: string
        }
        Update: {
          actual_amount?: number
          created_at?: string
          difference?: number | null
          expected_amount?: number
          id?: string
          item_type?: string
          notes?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "accounting_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_sessions: {
        Row: {
          branch_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          manager_id: string
          notes: string | null
          period_end: string
          period_start: string
          session_date: string
          status: string
          worker_id: string
        }
        Insert: {
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          manager_id: string
          notes?: string | null
          period_end: string
          period_start: string
          session_date?: string
          status?: string
          worker_id: string
        }
        Update: {
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          manager_id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          session_date?: string
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_sessions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_sessions_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action_type: string
          branch_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          worker_id: string
        }
        Insert: {
          action_type: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          worker_id: string
        }
        Update: {
          action_type?: string
          branch_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          admin_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          wilaya: string
        }
        Insert: {
          address?: string | null
          admin_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          wilaya: string
        }
        Update: {
          address?: string | null
          admin_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          wilaya?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description_ar: string | null
          id: string
          is_system: boolean | null
          name_ar: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_system?: boolean | null
          name_ar: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          id?: string
          is_system?: boolean | null
          name_ar?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          business_type: string | null
          created_at: string
          customer_id: string | null
          full_name: string
          id: string
          password_hash: string
          phone: string
          rejection_reason: string | null
          status: string
          store_name: string
          updated_at: string
          username: string
          wilaya: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          created_at?: string
          customer_id?: string | null
          full_name: string
          id?: string
          password_hash: string
          phone: string
          rejection_reason?: string | null
          status?: string
          store_name: string
          updated_at?: string
          username: string
          wilaya?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_type?: string | null
          created_at?: string
          customer_id?: string | null
          full_name?: string
          id?: string
          password_hash?: string
          phone?: string
          rejection_reason?: string | null
          status?: string
          store_name?: string
          updated_at?: string
          username?: string
          wilaya?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_approval_requests: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          operation_type: string
          payload: Json
          rejection_reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          operation_type: string
          payload: Json
          rejection_reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          operation_type?: string
          payload?: Json
          rejection_reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_approval_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_debts: {
        Row: {
          branch_id: string | null
          collection_amount: number | null
          collection_days: string[] | null
          collection_type: string | null
          created_at: string
          customer_id: string
          due_date: string | null
          id: string
          notes: string | null
          order_id: string | null
          paid_amount: number
          remaining_amount: number | null
          status: string
          total_amount: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          branch_id?: string | null
          collection_amount?: number | null
          collection_days?: string[] | null
          collection_type?: string | null
          created_at?: string
          customer_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          status?: string
          total_amount?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          branch_id?: string | null
          collection_amount?: number | null
          collection_days?: string[] | null
          collection_type?: string | null
          created_at?: string
          customer_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          status?: string
          total_amount?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_debts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_special_prices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          price_type: string
          product_id: string
          special_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          price_type?: string
          product_id: string
          special_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          price_type?: string
          product_id?: string
          special_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_special_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_special_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_special_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_special_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string | null
          created_at: string
          created_by: string | null
          default_payment_type: string | null
          default_price_subtype: string | null
          id: string
          internal_name: string | null
          is_trusted: boolean | null
          latitude: number | null
          location_type: string | null
          longitude: number | null
          name: string
          name_fr: string | null
          pending_changes: Json | null
          phone: string | null
          sales_rep_name: string | null
          sales_rep_phone: string | null
          sector_id: string | null
          status: string
          store_name: string | null
          trust_notes: string | null
          wilaya: string | null
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_type?: string | null
          default_price_subtype?: string | null
          id?: string
          internal_name?: string | null
          is_trusted?: boolean | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          name: string
          name_fr?: string | null
          pending_changes?: Json | null
          phone?: string | null
          sales_rep_name?: string | null
          sales_rep_phone?: string | null
          sector_id?: string | null
          status?: string
          store_name?: string | null
          trust_notes?: string | null
          wilaya?: string | null
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_type?: string | null
          default_price_subtype?: string | null
          id?: string
          internal_name?: string | null
          is_trusted?: boolean | null
          latitude?: number | null
          location_type?: string | null
          longitude?: number | null
          name?: string
          name_fr?: string | null
          pending_changes?: Json | null
          phone?: string | null
          sales_rep_name?: string | null
          sales_rep_phone?: string | null
          sector_id?: string | null
          status?: string
          store_name?: string | null
          trust_notes?: string | null
          wilaya?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_collections: {
        Row: {
          action: string
          amount_collected: number
          approved_at: string | null
          approved_by: string | null
          collection_date: string
          created_at: string
          debt_id: string
          id: string
          next_due_date: string | null
          notes: string | null
          payment_method: string | null
          rejection_reason: string | null
          status: string
          worker_id: string
        }
        Insert: {
          action?: string
          amount_collected?: number
          approved_at?: string | null
          approved_by?: string | null
          collection_date?: string
          created_at?: string
          debt_id: string
          id?: string
          next_due_date?: string | null
          notes?: string | null
          payment_method?: string | null
          rejection_reason?: string | null
          status?: string
          worker_id: string
        }
        Update: {
          action?: string
          amount_collected?: number
          approved_at?: string | null
          approved_by?: string | null
          collection_date?: string
          created_at?: string
          debt_id?: string
          id?: string
          next_due_date?: string | null
          notes?: string | null
          payment_method?: string | null
          rejection_reason?: string | null
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_collections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_collections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_collections_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "customer_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_collections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_collections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          collected_at: string
          created_at: string
          debt_id: string
          id: string
          notes: string | null
          payment_method: string
          worker_id: string
        }
        Insert: {
          amount: number
          collected_at?: string
          created_at?: string
          debt_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          worker_id: string
        }
        Update: {
          amount?: number
          collected_at?: string
          created_at?: string
          debt_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "customer_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          name_en: string | null
          name_fr: string | null
          visible_to_roles: string[] | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          name_en?: string | null
          name_fr?: string | null
          visible_to_roles?: string[] | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_en?: string | null
          name_fr?: string | null
          visible_to_roles?: string[] | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category_id: string
          created_at: string | null
          description: string | null
          expense_date: string
          id: string
          payment_method: string | null
          receipt_url: string | null
          receipt_urls: string[] | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          worker_id: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          category_id: string
          created_at?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          receipt_url?: string | null
          receipt_urls?: string[] | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          worker_id: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category_id?: string
          created_at?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string | null
          receipt_url?: string | null
          receipt_urls?: string[] | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      navbar_preferences: {
        Row: {
          created_at: string
          id: string
          tab_paths: string[]
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tab_paths?: string[]
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tab_paths?: string[]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "navbar_preferences_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navbar_preferences_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          gift_offer_id: string | null
          gift_quantity: number
          id: string
          invoice_payment_method: string | null
          order_id: string
          payment_type: string | null
          price_subtype: string | null
          product_id: string
          quantity: number
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          gift_offer_id?: string | null
          gift_quantity?: number
          id?: string
          invoice_payment_method?: string | null
          order_id: string
          payment_type?: string | null
          price_subtype?: string | null
          product_id: string
          quantity?: number
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          gift_offer_id?: string | null
          gift_quantity?: number
          id?: string
          invoice_payment_method?: string | null
          order_id?: string
          payment_type?: string | null
          price_subtype?: string | null
          product_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_gift_offer_id_fkey"
            columns: ["gift_offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_worker_id: string | null
          branch_id: string | null
          created_at: string
          created_by: string
          created_by_customer: string | null
          customer_id: string
          delivery_date: string | null
          id: string
          invoice_payment_method: string | null
          notes: string | null
          partial_amount: number | null
          payment_status: string | null
          payment_type: string | null
          status: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          assigned_worker_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by: string
          created_by_customer?: string | null
          customer_id: string
          delivery_date?: string | null
          id?: string
          invoice_payment_method?: string | null
          notes?: string | null
          partial_amount?: number | null
          payment_status?: string | null
          payment_type?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          assigned_worker_id?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string
          created_by_customer?: string | null
          customer_id?: string
          delivery_date?: string | null
          id?: string
          invoice_payment_method?: string | null
          notes?: string | null
          partial_amount?: number | null
          payment_status?: string | null
          payment_type?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_customer_fkey"
            columns: ["created_by_customer"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          code: string
          created_at: string
          description_ar: string | null
          id: string
          name_ar: string
          resource: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description_ar?: string | null
          id?: string
          name_ar: string
          resource?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description_ar?: string | null
          id?: string
          name_ar?: string
          resource?: string | null
        }
        Relationships: []
      }
      pricing_groups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offer_tiers: {
        Row: {
          created_at: string
          discount_percentage: number | null
          gift_product_id: string | null
          gift_quantity: number
          gift_quantity_unit: string | null
          gift_type: string
          id: string
          max_quantity: number | null
          min_quantity: number
          min_quantity_unit: string | null
          offer_id: string
          tier_order: number
          worker_reward_amount: number | null
          worker_reward_type: string | null
        }
        Insert: {
          created_at?: string
          discount_percentage?: number | null
          gift_product_id?: string | null
          gift_quantity?: number
          gift_quantity_unit?: string | null
          gift_type?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          min_quantity_unit?: string | null
          offer_id: string
          tier_order?: number
          worker_reward_amount?: number | null
          worker_reward_type?: string | null
        }
        Update: {
          created_at?: string
          discount_percentage?: number | null
          gift_product_id?: string | null
          gift_quantity?: number
          gift_quantity_unit?: string | null
          gift_type?: string
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          min_quantity_unit?: string | null
          offer_id?: string
          tier_order?: number
          worker_reward_amount?: number | null
          worker_reward_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_offer_tiers_gift_product_id_fkey"
            columns: ["gift_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offer_tiers_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          branch_id: string | null
          condition_type: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_percentage: number | null
          end_date: string | null
          gift_product_id: string | null
          gift_quantity: number
          gift_quantity_unit: string | null
          gift_type: string
          id: string
          is_active: boolean
          is_auto_apply: boolean
          is_stackable: boolean
          max_quantity: number | null
          min_quantity: number
          min_quantity_unit: string | null
          name: string
          priority: number
          product_id: string
          start_date: string | null
          updated_at: string
          worker_reward_amount: number | null
          worker_reward_type: string | null
        }
        Insert: {
          branch_id?: string | null
          condition_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          end_date?: string | null
          gift_product_id?: string | null
          gift_quantity?: number
          gift_quantity_unit?: string | null
          gift_type?: string
          id?: string
          is_active?: boolean
          is_auto_apply?: boolean
          is_stackable?: boolean
          max_quantity?: number | null
          min_quantity?: number
          min_quantity_unit?: string | null
          name: string
          priority?: number
          product_id: string
          start_date?: string | null
          updated_at?: string
          worker_reward_amount?: number | null
          worker_reward_type?: string | null
        }
        Update: {
          branch_id?: string | null
          condition_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_percentage?: number | null
          end_date?: string | null
          gift_product_id?: string | null
          gift_quantity?: number
          gift_quantity_unit?: string | null
          gift_type?: string
          id?: string
          is_active?: boolean
          is_auto_apply?: boolean
          is_stackable?: boolean
          max_quantity?: number | null
          min_quantity?: number
          min_quantity_unit?: string | null
          name?: string
          priority?: number
          product_id?: string
          start_date?: string | null
          updated_at?: string
          worker_reward_amount?: number | null
          worker_reward_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_gift_product_id_fkey"
            columns: ["gift_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pricing_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pricing_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pricing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pricing_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_shortage_tracking: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_id: string
          id: string
          marked_by: string
          notes: string | null
          order_id: string | null
          product_id: string
          quantity_needed: number
          resolved_at: string | null
          status: string
          worker_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          marked_by: string
          notes?: string | null
          order_id?: string | null
          product_id: string
          quantity_needed?: number
          resolved_at?: string | null
          status?: string
          worker_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          marked_by?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string
          quantity_needed?: number
          resolved_at?: string | null
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_shortage_tracking_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_shortage_tracking_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allow_unit_sale: boolean
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          pieces_per_box: number
          price_gros: number | null
          price_invoice: number | null
          price_no_invoice: number | null
          price_retail: number | null
          price_super_gros: number | null
          pricing_unit: string
          weight_per_box: number | null
        }
        Insert: {
          allow_unit_sale?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          pieces_per_box?: number
          price_gros?: number | null
          price_invoice?: number | null
          price_no_invoice?: number | null
          price_retail?: number | null
          price_super_gros?: number | null
          pricing_unit?: string
          weight_per_box?: number | null
        }
        Update: {
          allow_unit_sale?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pieces_per_box?: number
          price_gros?: number | null
          price_invoice?: number | null
          price_no_invoice?: number | null
          price_retail?: number | null
          price_super_gros?: number | null
          pricing_unit?: string
          weight_per_box?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      promos: {
        Row: {
          bonus_amount: number | null
          created_at: string
          customer_id: string
          gratuite_quantity: number
          has_bonus: boolean | null
          id: string
          notes: string | null
          product_id: string
          promo_date: string
          vente_quantity: number
          worker_id: string
        }
        Insert: {
          bonus_amount?: number | null
          created_at?: string
          customer_id: string
          gratuite_quantity?: number
          has_bonus?: boolean | null
          id?: string
          notes?: string | null
          product_id: string
          promo_date?: string
          vente_quantity: number
          worker_id: string
        }
        Update: {
          bonus_amount?: number | null
          created_at?: string
          customer_id?: string
          gratuite_quantity?: number
          has_bonus?: boolean | null
          id?: string
          notes?: string | null
          product_id?: string
          promo_date?: string
          vente_quantity?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promos_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promos_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      quantity_price_tiers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_quantity: number | null
          min_quantity: number
          notes: string | null
          price_type: string
          product_id: string
          tier_price: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_quantity?: number | null
          min_quantity: number
          notes?: string | null
          price_type?: string
          product_id: string
          tier_price: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_quantity?: number | null
          min_quantity?: number
          notes?: string | null
          price_type?: string
          product_id?: string
          tier_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quantity_price_tiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quantity_price_tiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quantity_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_modifications: {
        Row: {
          changes_summary: string | null
          created_at: string
          id: string
          is_reviewed: boolean
          modification_type: string
          modified_by: string
          modified_data: Json
          original_data: Json
          receipt_id: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          changes_summary?: string | null
          created_at?: string
          id?: string
          is_reviewed?: boolean
          modification_type?: string
          modified_by: string
          modified_data: Json
          original_data: Json
          receipt_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          changes_summary?: string | null
          created_at?: string
          id?: string
          is_reviewed?: boolean
          modification_type?: string
          modified_by?: string
          modified_data?: Json
          original_data?: Json
          receipt_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_modifications_modified_by_fkey"
            columns: ["modified_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_modifications_modified_by_fkey"
            columns: ["modified_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_modifications_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_modifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_modifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_id: string
          customer_name: string
          customer_phone: string | null
          debt_id: string | null
          discount_amount: number
          id: string
          is_modified: boolean
          items: Json
          last_printed_at: string | null
          notes: string | null
          order_id: string | null
          original_data: Json | null
          paid_amount: number
          payment_method: string | null
          print_count: number
          receipt_number: number
          receipt_type: string
          remaining_amount: number
          total_amount: number
          updated_at: string
          worker_id: string
          worker_name: string
          worker_phone: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_id: string
          customer_name: string
          customer_phone?: string | null
          debt_id?: string | null
          discount_amount?: number
          id?: string
          is_modified?: boolean
          items?: Json
          last_printed_at?: string | null
          notes?: string | null
          order_id?: string | null
          original_data?: Json | null
          paid_amount?: number
          payment_method?: string | null
          print_count?: number
          receipt_number?: number
          receipt_type?: string
          remaining_amount?: number
          total_amount?: number
          updated_at?: string
          worker_id: string
          worker_name: string
          worker_phone?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string
          customer_name?: string
          customer_phone?: string | null
          debt_id?: string | null
          discount_amount?: number
          id?: string
          is_modified?: boolean
          items?: Json
          last_printed_at?: string | null
          notes?: string | null
          order_id?: string | null
          original_data?: Json | null
          paid_amount?: number
          payment_method?: string | null
          print_count?: number
          receipt_number?: number
          receipt_type?: string
          remaining_amount?: number
          total_amount?: number
          updated_at?: string
          worker_id?: string
          worker_name?: string
          worker_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "customer_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          delivery_worker_id: string | null
          id: string
          name: string
          sales_worker_id: string | null
          updated_at: string
          visit_day_delivery: string | null
          visit_day_sales: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_worker_id?: string | null
          id?: string
          name: string
          sales_worker_id?: string | null
          updated_at?: string
          visit_day_delivery?: string | null
          visit_day_sales?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_worker_id?: string | null
          id?: string
          name?: string
          sales_worker_id?: string | null
          updated_at?: string
          visit_day_delivery?: string | null
          visit_day_sales?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sectors_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_delivery_worker_id_fkey"
            columns: ["delivery_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_delivery_worker_id_fkey"
            columns: ["delivery_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_sales_worker_id_fkey"
            columns: ["sales_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sectors_sales_worker_id_fkey"
            columns: ["sales_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_price_tiers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_amount: number | null
          min_amount: number
          notes: string | null
          percentage: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount: number
          notes?: string | null
          percentage?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_amount?: number | null
          min_amount?: number
          notes?: string | null
          percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "stamp_price_tiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stamp_price_tiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          min_quantity: number
          product_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          product_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          min_quantity?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          created_at: string
          created_by: string
          id: string
          movement_type: string
          notes: string | null
          order_id: string | null
          product_id: string
          quantity: number
          receipt_id: string | null
          return_reason: string | null
          status: string
          worker_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          movement_type: string
          notes?: string | null
          order_id?: string | null
          product_id: string
          quantity: number
          receipt_id?: string | null
          return_reason?: string | null
          status?: string
          worker_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          movement_type?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string
          quantity?: number
          receipt_id?: string | null
          return_reason?: string | null
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipt_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          receipt_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          receipt_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "stock_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipts: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string
          id: string
          invoice_number: string | null
          invoice_photo_url: string | null
          notes: string | null
          receipt_date: string
          total_items: number | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          invoice_number?: string | null
          invoice_photo_url?: string | null
          notes?: string | null
          receipt_date?: string
          total_items?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string | null
          invoice_photo_url?: string | null
          notes?: string | null
          receipt_date?: string
          total_items?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          worker_id: string | null
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          worker_id?: string | null
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_tracking: {
        Row: {
          accuracy: number | null
          address: string | null
          branch_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          operation_id: string | null
          operation_type: string
          worker_id: string
        }
        Insert: {
          accuracy?: number | null
          address?: string | null
          branch_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          operation_id?: string | null
          operation_type: string
          worker_id: string
        }
        Update: {
          accuracy?: number | null
          address?: string | null
          branch_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          operation_id?: string | null
          operation_type?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_tracking_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tracking_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tracking_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_tracking_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          branch_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_debt_payments: {
        Row: {
          amount: number
          collected_by: string
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          worker_debt_id: string
        }
        Insert: {
          amount: number
          collected_by: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          worker_debt_id: string
        }
        Update: {
          amount?: number
          collected_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          worker_debt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_debt_payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debt_payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debt_payments_worker_debt_id_fkey"
            columns: ["worker_debt_id"]
            isOneToOne: false
            referencedRelation: "worker_debts"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_debts: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          created_by: string
          debt_type: string
          description: string | null
          id: string
          paid_amount: number
          remaining_amount: number | null
          session_id: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by: string
          debt_type?: string
          description?: string | null
          id?: string
          paid_amount?: number
          remaining_amount?: number | null
          session_id?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string
          debt_type?: string
          description?: string | null
          id?: string
          paid_amount?: number
          remaining_amount?: number | null
          session_id?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_debts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "accounting_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_debts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_locations: {
        Row: {
          accuracy: number | null
          branch_id: string | null
          created_at: string
          heading: number | null
          id: string
          is_tracking: boolean
          latitude: number
          longitude: number
          speed: number | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          accuracy?: number | null
          branch_id?: string | null
          created_at?: string
          heading?: number | null
          id?: string
          is_tracking?: boolean
          latitude: number
          longitude: number
          speed?: number | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          accuracy?: number | null
          branch_id?: string | null
          created_at?: string
          heading?: number | null
          id?: string
          is_tracking?: boolean
          latitude?: number
          longitude?: number
          speed?: number | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          custom_role_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          worker_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          worker_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_roles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_roles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_roles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_stock: {
        Row: {
          branch_id: string | null
          id: string
          product_id: string
          quantity: number
          updated_at: string
          worker_id: string
        }
        Insert: {
          branch_id?: string | null
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          worker_id: string
        }
        Update: {
          branch_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_stock_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_stock_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          branch_id: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          password_hash: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          password_hash: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          password_hash?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      workers_safe: {
        Row: {
          branch_id: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_manage_product_offers: {
        Args: { p_worker_id: string }
        Returns: boolean
      }
      get_customer_account_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_worker_branch_id: { Args: never; Returns: string }
      get_worker_id: { Args: never; Returns: string }
      get_worker_permissions: {
        Args: { p_worker_id: string }
        Returns: {
          category: string
          permission_code: string
          permission_name: string
          resource: string
        }[]
      }
      get_worker_roles: {
        Args: { p_worker_id: string }
        Returns: {
          branch_id: string
          branch_name: string
          custom_role_code: string
          custom_role_id: string
          custom_role_name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_of_branch: { Args: { p_branch_id: string }; Returns: boolean }
      is_approved_customer: { Args: never; Returns: boolean }
      is_branch_admin: { Args: never; Returns: boolean }
      is_worker: { Args: never; Returns: boolean }
      search_orders_by_prefix: {
        Args: { p_limit?: number; p_prefix: string }
        Returns: {
          order_id: string
        }[]
      }
      set_worker_session: { Args: { p_worker_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      verify_customer_password: {
        Args: { p_password_hash: string; p_username: string }
        Returns: {
          created_at: string
          customer_id: string
          full_name: string
          id: string
          phone: string
          status: string
          store_name: string
          username: string
        }[]
      }
      verify_worker_password: {
        Args: { p_password_hash: string; p_username: string }
        Returns: {
          branch_id: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          username: string
        }[]
      }
      worker_has_permission: {
        Args: { p_permission_code: string; p_worker_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "worker" | "supervisor" | "branch_admin"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "doing" | "done"
      task_type: "task" | "request"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "worker", "supervisor", "branch_admin"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "doing", "done"],
      task_type: ["task", "request"],
    },
  },
} as const
