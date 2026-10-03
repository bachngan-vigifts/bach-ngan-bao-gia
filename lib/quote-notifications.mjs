import { QuotationError } from './quotation-store.mjs';

const fail = (status, message) => { throw new QuotationError(status, message); };

export async function createQuoteNotification(db, member, quote, eventType) {
  if (member.role !== 'employee') return;
  if (!['saved', 'pdf'].includes(eventType)) throw Error('Unsupported notification type');
  await db.prepare(`INSERT INTO staff_quote_notifications
    (id,quote_id,actor_id,event_type,quote_no,customer,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), quote.id, member.id, eventType, String(quote.quoteNo || '').slice(0, 200), String(quote.customer || '').slice(0, 300), new Date().toISOString()).run();
}

export async function listQuoteNotifications(db, member) {
  if (member.role !== 'manager') fail(403, 'Chỉ Manager được xem thông báo.');
  const result = await db.prepare(`SELECT n.id,n.quote_id AS quoteId,n.event_type AS eventType,n.quote_no AS quoteNo,
      n.customer,n.created_at AS createdAt,m.name AS actorName,r.read_at AS readAt
    FROM staff_quote_notifications n JOIN staff_members m ON m.id=n.actor_id
    LEFT JOIN staff_notification_reads r ON r.notification_id=n.id AND r.member_id=?
    ORDER BY n.created_at DESC LIMIT 50`).bind(member.id).all();
  return {notifications: result.results, unreadCount: result.results.filter(item => !item.readAt).length};
}

export async function readQuoteNotifications(db, member, ids) {
  if (member.role !== 'manager') fail(403, 'Chỉ Manager được xem thông báo.');
  const rows = Array.isArray(ids) ? ids : [];
  if (rows.length > 50 || rows.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id))) fail(400, 'Danh sách thông báo không hợp lệ.');
  if (!rows.length) return {ok: true};
  const readAt = new Date().toISOString();
  await db.batch(rows.map(id => db.prepare(`INSERT INTO staff_notification_reads (notification_id,member_id,read_at)
    SELECT id,?,? FROM staff_quote_notifications WHERE id=? ON CONFLICT(notification_id,member_id) DO UPDATE SET read_at=excluded.read_at`)
    .bind(member.id, readAt, id)));
  return {ok: true};
}
