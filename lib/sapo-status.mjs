import { QuotationError } from './quotation-store.mjs';

const value = (input, length) => input == null ? '' : String(input).trim().slice(0, length);
const allowedStatuses = new Set(['created', 'existing', 'cancelled', 'error', 'dry_run', 'unknown']);
const normalizeStatus = body => {
  const status = value(body.status || body.action || 'unknown', 40).toLowerCase();
  if (['cancel', 'canceled', 'cancelled', 'void', 'voided'].includes(status) || body.order?.cancelled_at || body.order?.cancelledAt) return 'cancelled';
  return status;
};
const httpsUrl = input => {
  const url = value(input, 2000);
  if (!url) return null;
  try { return new URL(url).protocol === 'https:' ? url : null; } catch { return null; }
};

export async function upsertSapoStatus(db, body) {
  const quoteNumber = value(body.quote_number || body.quote, 200);
  if (!quoteNumber) throw new QuotationError(400, 'Thiếu số báo giá.');

  const status = normalizeStatus(body);
  if (!allowedStatuses.has(status)) throw new QuotationError(400, 'Trạng thái Sapo không hợp lệ.');

  const row = {
    quoteNumber,
    status,
    sapoOrderId: value(body.sapo_order_id ?? body.order?.id, 100) || null,
    sapoOrderCode: value(body.sapo_order_code ?? body.order?.code ?? body.order?.reference_number, 200) || null,
    sapoOrderUrl: httpsUrl(body.sapo_order_url ?? body.order?.url ?? body.order?.admin_url),
    customerName: value(body.customer_name ?? body.customer?.name, 500),
    message: value(body.message, 4000),
    payloadJson: JSON.stringify(body).slice(0, 20000),
    updatedAt: new Date().toISOString(),
  };

  await db.prepare(`INSERT INTO sapo_order_statuses
    (quote_number,status,sapo_order_id,sapo_order_code,sapo_order_url,customer_name,message,payload_json,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(quote_number) DO UPDATE SET
      status=excluded.status,
      sapo_order_id=excluded.sapo_order_id,
      sapo_order_code=excluded.sapo_order_code,
      sapo_order_url=excluded.sapo_order_url,
      customer_name=excluded.customer_name,
      message=excluded.message,
      payload_json=excluded.payload_json,
      updated_at=excluded.updated_at`)
    .bind(row.quoteNumber, row.status, row.sapoOrderId, row.sapoOrderCode, row.sapoOrderUrl, row.customerName, row.message, row.payloadJson, row.updatedAt)
    .run();

  return { ok: true, status: row };
}
