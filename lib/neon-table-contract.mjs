// Generated from the checked source schema.
export const neonTableContract = {
  "staff_auth_attempts": {
    "primary": [
      "key"
    ],
    "columns": [
      {
        "name": "key",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      },
      {
        "name": "expires",
        "type": "integer"
      }
    ]
  },
  "contract_counters": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "type",
        "type": "text"
      },
      {
        "name": "year",
        "type": "integer"
      },
      {
        "name": "month",
        "type": "integer"
      },
      {
        "name": "legal_entity",
        "type": "text"
      },
      {
        "name": "last_sequence",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "contract_document_numbers": {
    "primary": [
      "quote_number",
      "legal_entity"
    ],
    "columns": [
      {
        "name": "quote_number",
        "type": "text"
      },
      {
        "name": "legal_entity",
        "type": "text"
      },
      {
        "name": "contract_number",
        "type": "text"
      }
    ]
  },
  "contract_statuses": {
    "primary": [
      "quote_number"
    ],
    "columns": [
      {
        "name": "quote_number",
        "type": "text"
      },
      {
        "name": "contract_number",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "crm_row_id",
        "type": "text"
      },
      {
        "name": "crm_url",
        "type": "text"
      },
      {
        "name": "customer_name",
        "type": "text"
      },
      {
        "name": "item_count",
        "type": "integer"
      },
      {
        "name": "message",
        "type": "text"
      },
      {
        "name": "result_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "contract_transfers": {
    "primary": [
      "quote_number"
    ],
    "columns": [
      {
        "name": "quote_number",
        "type": "text"
      },
      {
        "name": "contract_number",
        "type": "text"
      },
      {
        "name": "contract_url",
        "type": "text"
      },
      {
        "name": "message",
        "type": "text"
      },
      {
        "name": "result_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "staff_credentials": {
    "primary": [
      "member_id"
    ],
    "columns": [
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "password_hash",
        "type": "text"
      },
      {
        "name": "activation_hash",
        "type": "text"
      },
      {
        "name": "activation_expires",
        "type": "integer"
      },
      {
        "name": "version",
        "type": "integer"
      }
    ]
  },
  "crm_tasks": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "details",
        "type": "text"
      },
      {
        "name": "customer_id",
        "type": "text"
      },
      {
        "name": "quote_number",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "priority",
        "type": "text"
      },
      {
        "name": "due_date",
        "type": "text"
      },
      {
        "name": "assigned_to",
        "type": "text"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      },
      {
        "name": "completed_at",
        "type": "text"
      }
    ]
  },
  "customer_contract_profiles": {
    "primary": [
      "customer_id"
    ],
    "columns": [
      {
        "name": "customer_id",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "sapo_customers": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "tax_code",
        "type": "text"
      },
      {
        "name": "customer_code",
        "type": "text"
      },
      {
        "name": "discounts",
        "type": "text"
      },
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "contact",
        "type": "text"
      },
      {
        "name": "phone",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "address",
        "type": "text"
      },
      {
        "name": "search",
        "type": "text"
      },
      {
        "name": "source_version",
        "type": "integer"
      },
      {
        "name": "synced_at",
        "type": "text"
      }
    ]
  },
  "staff_members": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "identity_id",
        "type": "text"
      },
      {
        "name": "phone",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "role",
        "type": "text"
      },
      {
        "name": "position_id",
        "type": "text"
      },
      {
        "name": "active",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "text"
      }
    ]
  },
  "staff_notification_reads": {
    "primary": [],
    "columns": [
      {
        "name": "notification_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "read_at",
        "type": "text"
      }
    ]
  },
  "staff_positions": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      }
    ]
  },
  "product_edits": {
    "primary": [
      "sku"
    ],
    "columns": [
      {
        "name": "sku",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      }
    ]
  },
  "staff_quotations": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "creator_id",
        "type": "text"
      },
      {
        "name": "quote_no",
        "type": "text"
      },
      {
        "name": "quote_type",
        "type": "text"
      },
      {
        "name": "customer",
        "type": "text"
      },
      {
        "name": "quote_date",
        "type": "text"
      },
      {
        "name": "search_text",
        "type": "text"
      },
      {
        "name": "contract_number",
        "type": "text"
      },
      {
        "name": "contract_quote_no",
        "type": "text"
      },
      {
        "name": "has_contract",
        "type": "integer"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "staff_quote_notifications": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "quote_id",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "event_type",
        "type": "text"
      },
      {
        "name": "quote_no",
        "type": "text"
      },
      {
        "name": "customer",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      }
    ]
  },
  "sapo_order_statuses": {
    "primary": [
      "quote_number"
    ],
    "columns": [
      {
        "name": "quote_number",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "sapo_order_id",
        "type": "text"
      },
      {
        "name": "sapo_order_code",
        "type": "text"
      },
      {
        "name": "sapo_order_url",
        "type": "text"
      },
      {
        "name": "customer_name",
        "type": "text"
      },
      {
        "name": "message",
        "type": "text"
      },
      {
        "name": "payload_json",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "staff_sessions": {
    "primary": [
      "hash"
    ],
    "columns": [
      {
        "name": "hash",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "version",
        "type": "integer"
      },
      {
        "name": "expires",
        "type": "integer"
      }
    ]
  },
  "staff_setup": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      }
    ]
  },
  "staff_sapo_links": {
    "primary": [
      "sapo_id"
    ],
    "columns": [
      {
        "name": "sapo_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "evidence",
        "type": "text"
      }
    ]
  },
  "stock_imports": {
    "primary": [
      "revision"
    ],
    "columns": [
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "key",
        "type": "text"
      },
      {
        "name": "filename",
        "type": "text"
      },
      {
        "name": "observed_at",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  "vigifts_appsheet_actions": {
    "primary": [
      "app_id",
      "action_name",
      "table_name"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "action_name",
        "type": "text"
      },
      {
        "name": "display_name",
        "type": "text"
      },
      {
        "name": "table_name",
        "type": "text"
      },
      {
        "name": "action_type",
        "type": "text"
      },
      {
        "name": "icon",
        "type": "text"
      },
      {
        "name": "condition",
        "type": "text"
      },
      {
        "name": "modifies_data",
        "type": "integer"
      },
      {
        "name": "action_json",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_apps": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "source_app_id",
        "type": "text"
      },
      {
        "name": "source_version",
        "type": "text"
      },
      {
        "name": "app_definition_json",
        "type": "text"
      },
      {
        "name": "exported_at",
        "type": "text"
      },
      {
        "name": "imported_at",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_bots": {
    "primary": [
      "app_id",
      "bot_name"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "bot_name",
        "type": "text"
      },
      {
        "name": "event_name",
        "type": "text"
      },
      {
        "name": "process_name",
        "type": "text"
      },
      {
        "name": "disabled",
        "type": "integer"
      },
      {
        "name": "bot_json",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_fields": {
    "primary": [
      "app_id",
      "table_name",
      "field_id"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "table_name",
        "type": "text"
      },
      {
        "name": "field_id",
        "type": "text"
      },
      {
        "name": "field_name",
        "type": "text"
      },
      {
        "name": "field_type",
        "type": "text"
      },
      {
        "name": "ordinal",
        "type": "integer"
      },
      {
        "name": "is_key",
        "type": "integer"
      },
      {
        "name": "is_label",
        "type": "integer"
      },
      {
        "name": "is_required",
        "type": "integer"
      },
      {
        "name": "is_hidden",
        "type": "integer"
      },
      {
        "name": "is_virtual",
        "type": "integer"
      },
      {
        "name": "expression_json",
        "type": "text"
      },
      {
        "name": "field_json",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_rows": {
    "primary": [
      "app_id",
      "table_name",
      "tuple_id"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "table_name",
        "type": "text"
      },
      {
        "name": "tuple_id",
        "type": "text"
      },
      {
        "name": "values_json",
        "type": "text"
      },
      {
        "name": "raw_json",
        "type": "text"
      },
      {
        "name": "search_text",
        "type": "text"
      },
      {
        "name": "source_created_at",
        "type": "text"
      },
      {
        "name": "source_updated_at",
        "type": "text"
      },
      {
        "name": "imported_at",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_tables": {
    "primary": [
      "app_id",
      "table_name"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "table_name",
        "type": "text"
      },
      {
        "name": "safe_name",
        "type": "text"
      },
      {
        "name": "base_id",
        "type": "text"
      },
      {
        "name": "frame_id",
        "type": "text"
      },
      {
        "name": "schema_name",
        "type": "text"
      },
      {
        "name": "update_mode",
        "type": "integer"
      },
      {
        "name": "allowed_updates",
        "type": "integer"
      },
      {
        "name": "source_json",
        "type": "text"
      }
    ]
  },
  "vigifts_appsheet_views": {
    "primary": [
      "app_id",
      "view_name"
    ],
    "columns": [
      {
        "name": "app_id",
        "type": "text"
      },
      {
        "name": "view_name",
        "type": "text"
      },
      {
        "name": "display_name",
        "type": "text"
      },
      {
        "name": "position",
        "type": "text"
      },
      {
        "name": "table_name",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "action_type",
        "type": "text"
      },
      {
        "name": "view_order",
        "type": "integer"
      },
      {
        "name": "show_if",
        "type": "text"
      },
      {
        "name": "view_json",
        "type": "text"
      }
    ]
  },
  "staff_web_notification_reads": {
    "primary": [
      "notification_id",
      "member_id"
    ],
    "columns": [
      {
        "name": "notification_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "read_at",
        "type": "text"
      }
    ]
  },
  "staff_web_notifications": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "event_type",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "body",
        "type": "text"
      },
      {
        "name": "url",
        "type": "text"
      },
      {
        "name": "target_role",
        "type": "text"
      },
      {
        "name": "target_member_id",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "data_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      }
    ]
  },
  "staff_web_push_subscriptions": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "endpoint",
        "type": "text"
      },
      {
        "name": "p256dh",
        "type": "text"
      },
      {
        "name": "auth",
        "type": "text"
      },
      {
        "name": "user_agent",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      },
      {
        "name": "last_seen_at",
        "type": "text"
      },
      {
        "name": "disabled_at",
        "type": "text"
      },
      {
        "name": "failure_count",
        "type": "integer"
      }
    ]
  },
  "work_assignments": {
    "primary": [
      "member_id",
      "branch_id"
    ],
    "columns": [
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "branch_id",
        "type": "text"
      },
      {
        "name": "sapo_account_id",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "work_audit": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "entity_id",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      }
    ]
  },
  "work_branches": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "keeper_id",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "work_cash_requests": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "shift_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "amount",
        "type": "integer"
      },
      {
        "name": "note",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "reviewed_by",
        "type": "text"
      },
      {
        "name": "review_note",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "work_reports": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "shift_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "position_id",
        "type": "text"
      },
      {
        "name": "phase",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "snapshot",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "text"
      },
      {
        "name": "submitted_at",
        "type": "text"
      },
      {
        "name": "reviewed_by",
        "type": "text"
      },
      {
        "name": "review_note",
        "type": "text"
      }
    ]
  },
  "work_shifts": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "branch_id",
        "type": "text"
      },
      {
        "name": "work_date",
        "type": "text"
      },
      {
        "name": "starts_at",
        "type": "text"
      },
      {
        "name": "ends_at",
        "type": "text"
      },
      {
        "name": "label",
        "type": "text"
      },
      {
        "name": "keeper_id",
        "type": "text"
      },
      {
        "name": "opening",
        "type": "integer"
      },
      {
        "name": "actual",
        "type": "integer"
      },
      {
        "name": "expected",
        "type": "integer"
      },
      {
        "name": "difference",
        "type": "integer"
      },
      {
        "name": "cash_status",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "text"
      }
    ]
  },
  "work_snapshots": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "shift_id",
        "type": "text"
      },
      {
        "name": "member_id",
        "type": "text"
      },
      {
        "name": "data",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      }
    ]
  },
  "printing_workshops": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "name_key",
        "type": "text"
      },
      {
        "name": "tax_code",
        "type": "text"
      },
      {
        "name": "address",
        "type": "text"
      },
      {
        "name": "phone",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "text"
      },
      {
        "name": "created_by",
        "type": "text"
      }
    ]
  },
  "sapo_runtime_sessions": {
    "primary": [
      "id"
    ],
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "encrypted_cookie",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      }
    ]
  },
  "vigifts_product_image_map": {
    "primary": [
      "product_id"
    ],
    "columns": [
      {
        "name": "product_id",
        "type": "text"
      },
      {
        "name": "sku",
        "type": "text"
      },
      {
        "name": "product_name",
        "type": "text"
      },
      {
        "name": "image_file_name",
        "type": "text"
      },
      {
        "name": "image_source_path",
        "type": "text"
      },
      {
        "name": "image_url",
        "type": "text"
      },
      {
        "name": "sync_status",
        "type": "text"
      },
      {
        "name": "imported_at",
        "type": "text"
      }
    ]
  }
};
