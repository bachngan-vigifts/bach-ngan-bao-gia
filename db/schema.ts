import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

export const positions = sqliteTable('staff_positions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
}, t => [uniqueIndex('idx_positions_name').on(t.name)]);

export const employees = sqliteTable('staff_members', {
  id: text('id').primaryKey(),
  identityId: text('identity_id'),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['employee', 'manager', 'supplier'] }).notNull().default('employee'),
  positionId: text('position_id').references(() => positions.id),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('idx_members_email').on(t.email), uniqueIndex('idx_members_identity').on(t.identityId), index('idx_members_position').on(t.positionId)]);

export const quotations = sqliteTable('staff_quotations', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').notNull().references(() => employees.id),
  quoteNo: text('quote_no').notNull(),
  quoteType: text('quote_type', { enum: ['HRC', 'B2B', 'VIGIFTS'] }).notNull(),
  customer: text('customer').notNull(),
  quoteDate: text('quote_date'),
  searchText: text('search_text'),
  contractNumber: text('contract_number'),
  contractQuoteNo: text('contract_quote_no'),
  hasContract: integer('has_contract').notNull().default(0),
  data: text('data').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [
  index('idx_quotations_creator_updated').on(t.creatorId, t.updatedAt),
  index('idx_quotations_created').on(t.createdAt),
  index('idx_quotations_quote_date').on(t.quoteDate),
  index('idx_quotations_contract').on(t.contractNumber),
  index('idx_quotations_has_contract').on(t.hasContract, t.createdAt),
]);

export const credentials = sqliteTable('staff_credentials', {
  memberId: text('member_id').primaryKey().references(() => employees.id),
  passwordHash: text('password_hash'),
  activationHash: text('activation_hash'),
  activationExpires: integer('activation_expires'),
  version: integer('version').notNull().default(0),
});
export const sessions = sqliteTable('staff_sessions', {
  hash: text('hash').primaryKey(),
  memberId: text('member_id').notNull().references(() => employees.id),
  version: integer('version').notNull(),
  expires: integer('expires').notNull(),
}, t => [index('idx_sessions_member').on(t.memberId), index('idx_sessions_expires').on(t.expires)]);
export const authAttempts = sqliteTable('staff_auth_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expires: integer('expires').notNull(),
}, t => [index('idx_attempts_expires').on(t.expires)]);
export const setup = sqliteTable('staff_setup', { id: text('id').primaryKey() });
export const stockImports = sqliteTable('stock_imports', {
  revision: integer('revision').primaryKey(),
  key: text('key').notNull(),
  filename: text('filename').notNull(),
  observedAt: text('observed_at').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
  count: integer('count').notNull(),
});
export const productEdits = sqliteTable('product_edits', {
  sku: text('sku').primaryKey(),
  data: text('data').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const quoteNotifications = sqliteTable('staff_quote_notifications', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id').notNull().references(() => quotations.id),
  actorId: text('actor_id').notNull().references(() => employees.id),
  eventType: text('event_type').notNull(),
  quoteNo: text('quote_no').notNull(),
  customer: text('customer').notNull(),
  createdAt: text('created_at').notNull(),
}, t => [index('idx_quote_notifications_created').on(t.createdAt)]);

export const notificationReads = sqliteTable('staff_notification_reads', {
  notificationId: text('notification_id').notNull().references(() => quoteNotifications.id),
  memberId: text('member_id').notNull().references(() => employees.id),
  readAt: text('read_at').notNull(),
}, t => [uniqueIndex('idx_notification_reads').on(t.notificationId, t.memberId)]);

export const webPushSubscriptions = sqliteTable('staff_web_push_subscriptions', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => employees.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  lastSeenAt: text('last_seen_at'),
  disabledAt: text('disabled_at'),
  failureCount: integer('failure_count').notNull().default(0),
}, t => [uniqueIndex('idx_web_push_endpoint').on(t.endpoint), index('idx_web_push_member').on(t.memberId, t.disabledAt)]);

export const webNotifications = sqliteTable('staff_web_notifications', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  url: text('url').notNull(),
  targetRole: text('target_role').default('manager'),
  targetMemberId: text('target_member_id'),
  actorId: text('actor_id').references(() => employees.id),
  dataJson: text('data_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, t => [index('idx_web_notifications_created').on(t.createdAt), index('idx_web_notifications_target').on(t.targetRole, t.targetMemberId, t.createdAt)]);

export const webNotificationReads = sqliteTable('staff_web_notification_reads', {
  notificationId: text('notification_id').notNull().references(() => webNotifications.id),
  memberId: text('member_id').notNull().references(() => employees.id),
  readAt: text('read_at').notNull(),
}, t => [primaryKey({columns: [t.notificationId, t.memberId]})]);

export const sapoOrderStatuses = sqliteTable('sapo_order_statuses', {
  quoteNumber: text('quote_number').primaryKey(),
  status: text('status').notNull(),
  sapoOrderId: text('sapo_order_id'),
  sapoOrderCode: text('sapo_order_code'),
  sapoOrderUrl: text('sapo_order_url'),
  customerName: text('customer_name'),
  message: text('message'),
  payloadJson: text('payload_json'),
  updatedAt: text('updated_at').notNull(),
}, t => [index('idx_sapo_order_statuses_updated').on(t.updatedAt)]);

export const contractCounters = sqliteTable('contract_counters', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  legalEntity: text('legal_entity').notNull(),
  lastSequence: integer('last_sequence').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [uniqueIndex('idx_contract_counters_period').on(t.type,t.year,t.month,t.legalEntity)]);

export const contractTransfers = sqliteTable('contract_transfers', {
  quoteNumber: text('quote_number').primaryKey(),
  contractNumber: text('contract_number').notNull(),
  contractUrl: text('contract_url'),
  message: text('message').notNull(),
  resultJson: text('result_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [index('idx_contract_transfers_updated').on(t.updatedAt)]);

export const contractStatuses = sqliteTable('contract_statuses', {
  quoteNumber: text('quote_number').primaryKey(),
  contractNumber: text('contract_number'),
  status: text('status').notNull(),
  crmRowId: text('crm_row_id'),
  crmUrl: text('crm_url'),
  customerName: text('customer_name'),
  itemCount: integer('item_count'),
  message: text('message'),
  resultJson: text('result_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, t => [index('idx_contract_statuses_updated').on(t.updatedAt)]);

export const customers = sqliteTable('sapo_customers', {
  createdAt: text('created_at').notNull().default(''),
  taxCode: text('tax_code').notNull().default(''),
  customerCode: text('customer_code').notNull().default(''),
  discounts: text('discounts').notNull().default('{}'),
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  address: text('address').notNull(),
  search: text('search').notNull(),
  sourceVersion: integer('source_version').notNull(),
  syncedAt: text('synced_at').notNull(),
}, t => [index('idx_sapo_customers_name').on(t.name)]);

export const customerContractProfiles = sqliteTable('customer_contract_profiles', {
  customerId: text('customer_id').primaryKey().references(() => customers.id),
  data: text('data').notNull().default('{}'),
  updatedAt: text('updated_at').notNull(),
}, t => [index('idx_customer_contract_profiles_updated').on(t.updatedAt)]);

export const crmTasks = sqliteTable('crm_tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  details: text('details').notNull().default(''),
  customerId: text('customer_id'),
  quoteNumber: text('quote_number'),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('normal'),
  dueDate: text('due_date'),
  assignedTo: text('assigned_to').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
}, t => [index('idx_crm_tasks_assignee_status').on(t.assignedTo,t.status), index('idx_crm_tasks_due_date').on(t.dueDate)]);

export const contractDocumentNumbers = sqliteTable('contract_document_numbers', {
 quoteNumber: text('quote_number').notNull(),
 legalEntity: text('legal_entity').notNull(),
 contractNumber: text('contract_number').notNull(),
}, t => [primaryKey({columns:[t.quoteNumber,t.legalEntity]}), uniqueIndex('idx_contract_document_number').on(t.contractNumber)]);

export const vigiftsApps = sqliteTable('vigifts_appsheet_apps', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sourceAppId: text('source_app_id').notNull(),
  sourceVersion: text('source_version').notNull().default(''),
  appDefinitionJson: text('app_definition_json').notNull(),
  exportedAt: text('exported_at').notNull(),
  importedAt: text('imported_at').notNull(),
});

export const vigiftsTables = sqliteTable('vigifts_appsheet_tables', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  tableName: text('table_name').notNull(),
  safeName: text('safe_name').notNull(),
  baseId: text('base_id').notNull(),
  frameId: text('frame_id').notNull(),
  schemaName: text('schema_name').notNull(),
  updateMode: integer('update_mode').notNull().default(0),
  allowedUpdates: integer('allowed_updates').notNull().default(0),
  sourceJson: text('source_json').notNull().default('{}'),
}, t => [
  primaryKey({columns:[t.appId,t.tableName]}),
  uniqueIndex('idx_vigifts_tables_frame').on(t.appId,t.frameId),
  index('idx_vigifts_tables_safe').on(t.safeName),
]);

export const vigiftsFields = sqliteTable('vigifts_appsheet_fields', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  tableName: text('table_name').notNull(),
  fieldId: text('field_id').notNull(),
  fieldName: text('field_name').notNull(),
  fieldType: text('field_type').notNull().default(''),
  ordinal: integer('ordinal').notNull().default(0),
  isKey: integer('is_key', { mode: 'boolean' }).notNull().default(false),
  isLabel: integer('is_label', { mode: 'boolean' }).notNull().default(false),
  isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(false),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
  isVirtual: integer('is_virtual', { mode: 'boolean' }).notNull().default(false),
  expressionJson: text('expression_json').notNull().default('{}'),
  fieldJson: text('field_json').notNull().default('{}'),
}, t => [
  primaryKey({columns:[t.appId,t.tableName,t.fieldId]}),
  index('idx_vigifts_fields_name').on(t.appId,t.tableName,t.fieldName),
]);

export const vigiftsRows = sqliteTable('vigifts_appsheet_rows', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  tableName: text('table_name').notNull(),
  tupleId: text('tuple_id').notNull(),
  valuesJson: text('values_json').notNull(),
  rawJson: text('raw_json').notNull().default('{}'),
  searchText: text('search_text').notNull().default(''),
  sourceCreatedAt: text('source_created_at'),
  sourceUpdatedAt: text('source_updated_at'),
  importedAt: text('imported_at').notNull(),
}, t => [
  primaryKey({columns:[t.appId,t.tableName,t.tupleId]}),
  index('idx_vigifts_rows_table').on(t.appId,t.tableName),
  index('idx_vigifts_rows_search').on(t.searchText),
]);

export const vigiftsViews = sqliteTable('vigifts_appsheet_views', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  viewName: text('view_name').notNull(),
  displayName: text('display_name').notNull().default(''),
  position: text('position').notNull().default(''),
  tableName: text('table_name').notNull().default(''),
  action: text('action').notNull().default(''),
  actionType: text('action_type').notNull().default(''),
  order: integer('view_order').notNull().default(0),
  showIf: text('show_if'),
  viewJson: text('view_json').notNull().default('{}'),
}, t => [
  primaryKey({columns:[t.appId,t.viewName]}),
  index('idx_vigifts_views_position').on(t.appId,t.position,t.order),
]);

export const vigiftsActions = sqliteTable('vigifts_appsheet_actions', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  actionName: text('action_name').notNull(),
  displayName: text('display_name').notNull().default(''),
  tableName: text('table_name').notNull().default(''),
  actionType: text('action_type').notNull().default(''),
  icon: text('icon').notNull().default(''),
  condition: text('condition'),
  modifiesData: integer('modifies_data', { mode: 'boolean' }).notNull().default(false),
  actionJson: text('action_json').notNull().default('{}'),
}, t => [
  primaryKey({columns:[t.appId,t.actionName,t.tableName]}),
  index('idx_vigifts_actions_table').on(t.appId,t.tableName),
]);

export const vigiftsBots = sqliteTable('vigifts_appsheet_bots', {
  appId: text('app_id').notNull().references(() => vigiftsApps.id),
  botName: text('bot_name').notNull(),
  eventName: text('event_name').notNull().default(''),
  processName: text('process_name').notNull().default(''),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  botJson: text('bot_json').notNull().default('{}'),
}, t => [
  primaryKey({columns:[t.appId,t.botName]}),
  index('idx_vigifts_bots_disabled').on(t.appId,t.disabled),
]);

export const workBranches = sqliteTable('work_branches', {
 id: text('id').primaryKey(), name: text('name').notNull(), keeperId: text('keeper_id'), updatedAt:text('updated_at').notNull(),
});
export const workAssignments = sqliteTable('work_assignments', {
 memberId:text('member_id').notNull().references(()=>employees.id), branchId:text('branch_id').notNull().references(()=>workBranches.id),
 sapoAccountId:text('sapo_account_id').notNull(), updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.memberId,t.branchId]}),uniqueIndex('idx_work_branch_account').on(t.branchId,t.sapoAccountId)]);
export const workShifts = sqliteTable('work_shifts', {
 id:text('id').primaryKey(), branchId:text('branch_id').notNull().references(()=>workBranches.id), workDate:text('work_date').notNull(),
 startsAt:text('starts_at').notNull(),endsAt:text('ends_at').notNull(),label:text('label').notNull(),keeperId:text('keeper_id'),
 opening:integer('opening'),actual:integer('actual'),expected:integer('expected'),difference:integer('difference'),
 cashStatus:text('cash_status').notNull().default('not_opened'),data:text('data').notNull().default('{}'),
 revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('idx_work_shift_period').on(t.branchId,t.startsAt,t.endsAt),index('idx_work_branch_time').on(t.branchId,t.endsAt)]);
export const workReports = sqliteTable('work_reports', {
 id:text('id').primaryKey(),shiftId:text('shift_id').notNull().references(()=>workShifts.id),memberId:text('member_id').notNull().references(()=>employees.id),
 positionId:text('position_id').notNull(),phase:text('phase').notNull(),status:text('status').notNull().default('draft'),
 data:text('data').notNull(),snapshot:text('snapshot').notNull().default('{}'),revision:integer('revision').notNull().default(1),
 updatedAt:text('updated_at').notNull(),submittedAt:text('submitted_at'),reviewedBy:text('reviewed_by'),reviewNote:text('review_note').notNull().default(''),
},t=>[uniqueIndex('idx_work_report_once').on(t.shiftId,t.memberId,t.phase),index('idx_work_reports_member').on(t.memberId,t.updatedAt),index('idx_work_reports_status').on(t.status,t.updatedAt)]);
export const workAudit = sqliteTable('work_audit', {
 id:text('id').primaryKey(),entityId:text('entity_id').notNull(),actorId:text('actor_id').notNull(),action:text('action').notNull(),
 data:text('data').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_work_audit_entity').on(t.entityId,t.createdAt)]);
export const workSnapshots = sqliteTable('work_snapshots', {
 id:text('id').primaryKey(),shiftId:text('shift_id').notNull(),memberId:text('member_id').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull(),
},t=>[index('idx_work_snapshot_owner').on(t.memberId,t.shiftId,t.createdAt)]);
export const workCashRequests = sqliteTable('work_cash_requests', {
 id:text('id').primaryKey(),shiftId:text('shift_id').notNull().references(()=>workShifts.id),memberId:text('member_id').notNull().references(()=>employees.id),
 kind:text('kind').notNull(),amount:integer('amount').notNull(),note:text('note').notNull(),status:text('status').notNull().default('pending'),
 reviewedBy:text('reviewed_by'),reviewNote:text('review_note').notNull().default(''),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('idx_work_cash_requests_shift').on(t.shiftId,t.status)]);
export const staffSapoLinks = sqliteTable('staff_sapo_links', {
 sapoId:text('sapo_id').primaryKey(),memberId:text('member_id').notNull().references(()=>employees.id),createdAt:text('created_at').notNull(),evidence:text('evidence').notNull(),
},t=>[uniqueIndex('idx_staff_sapo_member').on(t.memberId)]);
