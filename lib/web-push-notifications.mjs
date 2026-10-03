import { QuotationError } from './quotation-store.mjs';

const fail = (status, message) => { throw new QuotationError(status, message); };
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const json = value => JSON.stringify(value ?? {});
const base64url = input => {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const fromBase64url = value => {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
};
const pushConfigured = env => Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);

export function webPushConfig(env) {
  return {enabled: pushConfigured(env), publicKey: clean(env.WEB_PUSH_PUBLIC_KEY || '', 200)};
}

function validateSubscription(input) {
  const endpoint = clean(input?.endpoint, 2000);
  const p256dh = clean(input?.keys?.p256dh || input?.p256dh, 300);
  const auth = clean(input?.keys?.auth || input?.auth, 300);
  if (!/^https:\/\/.+/i.test(endpoint) || !p256dh || !auth) fail(400, 'Subscription web push không hợp lệ.');
  return {endpoint, p256dh, auth};
}

export async function subscribeWebPush(db, member, input, userAgent = '') {
  const sub = validateSubscription(input);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO staff_web_push_subscriptions
    (id,member_id,endpoint,p256dh,auth,user_agent,created_at,updated_at,last_seen_at,disabled_at,failure_count)
    VALUES (?,?,?,?,?,?,?,?,?,NULL,0)
    ON CONFLICT(endpoint) DO UPDATE SET member_id=excluded.member_id,p256dh=excluded.p256dh,auth=excluded.auth,
      user_agent=excluded.user_agent,updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at,disabled_at=NULL,failure_count=0`)
    .bind(crypto.randomUUID(), member.id, sub.endpoint, sub.p256dh, sub.auth, clean(userAgent, 500), now, now, now).run();
  return {ok: true};
}

export async function unsubscribeWebPush(db, member, input) {
  const endpoint = clean(input?.endpoint, 2000);
  if (!endpoint) return {ok: true};
  await db.prepare('UPDATE staff_web_push_subscriptions SET disabled_at=?,updated_at=? WHERE endpoint=? AND member_id=?')
    .bind(new Date().toISOString(), new Date().toISOString(), endpoint, member.id).run();
  return {ok: true};
}

function notificationScopeSql(member) {
  return {
    sql: `(n.target_member_id IS NULL OR n.target_member_id = ?) AND (n.target_role IS NULL OR n.target_role = 'all' OR n.target_role = ?)`,
    bindings: [member.id, member.role],
  };
}

export function webNotificationTarget(note) {
  const data=note.data||{};
  if(data.quoteId)return '/quote?quoteId='+encodeURIComponent(data.quoteId);
  if(data.quoteNo)return '/quote?quote='+encodeURIComponent(data.quoteNo);
  if(data.shiftId)return '/work-reports.html?cashShift='+encodeURIComponent(data.shiftId);
  if(data.shipmentId)return '/quote?dashboardAction=incoming&shipmentId='+encodeURIComponent(data.shipmentId);
  if(data.orderId&&note.eventType?.startsWith('supplier_order_'))return '/quote?supplierOrderId='+encodeURIComponent(data.orderId);
  const url=String(note.url||'/quote');
  return url.startsWith('/')&&!url.startsWith('//')&&!/[\\\r\n]/.test(url)?url:'/quote';
}

export async function listWebNotifications(db, member, limit = 50) {
  const scope = notificationScopeSql(member), capped = Math.max(1, Math.min(Number(limit) || 50, 50));
  const result = await db.prepare(`SELECT n.id,n.event_type AS eventType,n.title,n.body,n.url,n.data_json AS dataJson,
      n.actor_id AS actorId,a.name AS actorName,n.created_at AS createdAt,r.read_at AS readAt
    FROM staff_web_notifications n
    LEFT JOIN staff_members a ON a.id=n.actor_id
    LEFT JOIN staff_web_notification_reads r ON r.notification_id=n.id AND r.member_id=?
    WHERE ${scope.sql}
    ORDER BY n.created_at DESC LIMIT ?`).bind(member.id, ...scope.bindings, capped).all();
  const notifications = (result.results || []).map(row => ({...row, data: safeJson(row.dataJson)}));
  for(const note of notifications){
    const legacyQuoteNo=note.data?.quoteNo||new URL(note.url||'/quote','https://local.invalid').searchParams.get('quote');
    if(!note.data.quoteId&&legacyQuoteNo){
      const quote=await db.prepare('SELECT id FROM staff_quotations WHERE quote_no=? ORDER BY updated_at DESC LIMIT 1').bind(legacyQuoteNo).first();
      note.data={...note.data,quoteNo:legacyQuoteNo,...(quote?{quoteId:quote.id}:{})};
    }
    note.url=webNotificationTarget(note);
  }
  return {notifications, unreadCount: notifications.filter(item => !item.readAt).length};
}

export async function readWebNotifications(db, member, ids) {
  const rows = Array.isArray(ids) ? ids : [];
  if (rows.length > 50 || rows.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(id))) fail(400, 'Danh sách thông báo không hợp lệ.');
  if (!rows.length) return {ok: true};
  const readAt = new Date().toISOString();
  await db.batch(rows.map(id => db.prepare(`INSERT INTO staff_web_notification_reads (notification_id,member_id,read_at)
    SELECT id,?,? FROM staff_web_notifications WHERE id=? ON CONFLICT(notification_id,member_id) DO UPDATE SET read_at=excluded.read_at`)
    .bind(member.id, readAt, id)));
  return {ok: true};
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function vapidAuthorization(env, endpoint) {
  const publicKey = clean(env.WEB_PUSH_PUBLIC_KEY, 200);
  const rawPublic = fromBase64url(publicKey);
  if (rawPublic.length !== 65 || rawPublic[0] !== 4) throw Error('WEB_PUSH_PUBLIC_KEY không hợp lệ.');
  const d = clean(env.WEB_PUSH_PRIVATE_KEY, 80);
  const jwk = {kty: 'EC', crv: 'P-256', x: base64url(rawPublic.slice(1, 33)), y: base64url(rawPublic.slice(33, 65)), d, ext: false};
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const aud = new URL(endpoint).origin;
  const header = base64url(JSON.stringify({typ: 'JWT', alg: 'ES256'}));
  const payload = base64url(JSON.stringify({aud, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: clean(env.WEB_PUSH_SUBJECT || 'mailto:claw@quatangvigifts.com', 200)}));
  const input = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, new TextEncoder().encode(input)));
  return `vapid t=${input}.${base64url(signature)}, k=${publicKey}`;
}

async function sendEmptyPush(env, subscription) {
  const authorization = await vapidAuthorization(env, subscription.endpoint);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {TTL: '86400', Urgency: 'normal', Authorization: authorization},
  });
}

export async function createWebNotification(db, env, options) {
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    eventType: clean(options.eventType, 80),
    title: clean(options.title, 180),
    body: clean(options.body, 500),
    url: clean(options.url || '/quote', 500),
    targetRole: clean(options.targetRole || 'manager', 40),
    targetMemberId: options.targetMemberId ? clean(options.targetMemberId, 80) : null,
    actorId: options.actorId ? clean(options.actorId, 80) : null,
    data: options.data || {},
  };
  if (!note.eventType || !note.title) return {ok: false, skipped: true};
  await db.prepare(`INSERT INTO staff_web_notifications
    (id,event_type,title,body,url,target_role,target_member_id,actor_id,data_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(note.id, note.eventType, note.title, note.body, note.url, note.targetRole, note.targetMemberId, note.actorId, json(note.data), now).run();
  const delivery = pushConfigured(env) ? await dispatchWebPush(db, env, note) : {sent: 0, disabled: 0, skipped: true};
  return {ok: true, notificationId: note.id, delivery};
}

export async function dispatchWebPush(db, env, note) {
  const result = await db.prepare(`SELECT s.id,s.endpoint FROM staff_web_push_subscriptions s
    JOIN staff_members m ON m.id=s.member_id AND m.active=1
    WHERE s.disabled_at IS NULL
      AND (? IS NULL OR s.member_id=?)
      AND (? IS NULL OR ?='all' OR m.role=?)`)
    .bind(note.targetMemberId, note.targetMemberId, note.targetRole, note.targetRole, note.targetRole).all();
  let sent = 0, disabled = 0;
  for (const sub of result.results || []) {
    try {
      const response = await sendEmptyPush(env, sub);
      if ([404, 410].includes(response.status)) {
        disabled++;
        await db.prepare('UPDATE staff_web_push_subscriptions SET disabled_at=?,failure_count=failure_count+1,updated_at=? WHERE id=?')
          .bind(new Date().toISOString(), new Date().toISOString(), sub.id).run();
      } else if (response.ok || response.status === 201 || response.status === 202) {
        sent++;
        await db.prepare('UPDATE staff_web_push_subscriptions SET last_seen_at=?,failure_count=0,updated_at=? WHERE id=?')
          .bind(new Date().toISOString(), new Date().toISOString(), sub.id).run();
      } else {
        await db.prepare('UPDATE staff_web_push_subscriptions SET failure_count=failure_count+1,updated_at=? WHERE id=?')
          .bind(new Date().toISOString(), sub.id).run();
      }
    } catch {
      await db.prepare('UPDATE staff_web_push_subscriptions SET failure_count=failure_count+1,updated_at=? WHERE id=?')
        .bind(new Date().toISOString(), sub.id).run();
    }
  }
  return {sent, disabled};
}

export function webNotificationForClientEvent(member, input) {
  const type = clean(input?.eventType || input?.type, 80);
  const quoteNo = clean(input?.quoteNo || input?.quote_number, 160);
  const customer = clean(input?.customer, 240);
  if (type === 'contract_download') return {
    eventType: type,
    targetRole: 'manager',
    actorId: member.id,
    title: 'Nhân viên tải HĐKT',
    body: `${member.name} tải HĐKT${quoteNo ? ' cho ' + quoteNo : ''}${customer ? ' · ' + customer : ''}`,
    url: quoteNo ? `/quote?quote=${encodeURIComponent(quoteNo)}` : '/quote',
    data: {quoteNo, customer},
  };
  if (type === 'quote_excel_download') return {
    eventType: type,
    targetRole: 'manager',
    actorId: member.id,
    title: 'Nhân viên tải Excel báo giá',
    body: `${member.name} tải Excel${quoteNo ? ' cho ' + quoteNo : ''}${customer ? ' · ' + customer : ''}`,
    url: '/quote',
    data: {quoteNo, customer},
  };
  fail(400, 'Loại sự kiện thông báo chưa hỗ trợ.');
}
