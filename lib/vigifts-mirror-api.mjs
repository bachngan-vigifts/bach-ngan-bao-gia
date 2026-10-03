import {crmContractOverview} from './crm-contract-overview.mjs';
import {mappedMediaResponse} from './r2-media.mjs';
import { vigiftsSnapshot } from "./vigifts-snapshot-data.mjs";
import { neon } from "@neondatabase/serverless";

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

async function readJson(request, limit = 200000) {
  const text = await request.text();
  if (text.length > limit) fail(413, "Nội dung quá lớn.");
  try {
    const value = text ? JSON.parse(text) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value;
  } catch {
    fail(400, "Nội dung không hợp lệ.");
  }
}

const compactJson = (value) => JSON.stringify(value ?? {});
const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const imageContentType = (source = "", fallback = "") => {
  const type = String(fallback || "").toLowerCase();
  if (/^image\/(?:jpeg|jpg|png|webp|gif|svg\+xml)$/.test(type)) return type === "image/jpg" ? "image/jpeg" : type;
  const clean = String(source || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
};
const isImageSource = (source) => {
  const text = String(source || "").trim();
  return /^https?:\/\//i.test(text) || /^[^?#]+\.(?:jpe?g|png|webp|gif|svg)$/i.test(text);
};
async function mediaCacheKey(source) {
  const hash = bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(source || ""))));
  const ext = imageContentType(source).replace("image/", "").replace("jpeg", "jpg").replace("svg+xml", "svg");
  return `vigifts-media/${hash}.${ext}`;
}
async function readBase64Image(body) {
  const source = cleanText(body.source, 2000);
  if (!source || !isImageSource(source)) fail(400, "Nguồn ảnh không hợp lệ.");
  let data = String(body.data || body.base64 || "");
  const dataMatch = data.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  const contentType = imageContentType(source, dataMatch?.[1] || body.contentType);
  if (dataMatch) data = dataMatch[2];
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data)) fail(400, "Dữ liệu ảnh không hợp lệ.");
  const binary = atob(data.replace(/\s+/g, ""));
  if (binary.length > 5_000_000) fail(413, "Ảnh vượt quá 5 MB.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { source, contentType, bytes };
}
async function serveMedia(env, url) {
  if (!env.FILES) fail(503, "Kho ảnh VIGIFTS chưa sẵn sàng.");
  const source = String(url.searchParams.get("src") || "").trim();
  if (!source || !isImageSource(source)) fail(400, "Nguồn ảnh không hợp lệ.");
  const key = await mediaCacheKey(source);
  let object = await env.FILES.get(key);
  if (!object && /^https?:\/\//i.test(source)) {
    const fetched = await fetch(source, { headers: { "User-Agent": "VIGIFTS-CRM-media-cache/1.0" } });
    if (!fetched.ok) fail(404, "Không tải được ảnh nguồn.");
    const contentType = imageContentType(source, fetched.headers.get("content-type") || "");
    const length = Number(fetched.headers.get("content-length") || 0);
    if (length > 5_000_000) fail(413, "Ảnh vượt quá 5 MB.");
    const bytes = await fetched.arrayBuffer();
    if (bytes.byteLength > 5_000_000) fail(413, "Ảnh vượt quá 5 MB.");
    await env.FILES.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { source } });
    object = await env.FILES.get(key);
  }
  if (!object) fail(404, "Ảnh chưa có trong cache riêng.");
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || imageContentType(source),
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function cacheMedia(env, request, role) {
  const auth = request.headers.get("authorization") || "";
  const syncAuthorized = Boolean(env.VIGIFTS_MEDIA_SYNC_TOKEN) && auth === `Bearer ${env.VIGIFTS_MEDIA_SYNC_TOKEN}`;
  if (role !== "manager" && !syncAuthorized) fail(403, "Chỉ Manager được nạp ảnh VIGIFTS.");
  if (!env.FILES) fail(503, "Kho ảnh VIGIFTS chưa sẵn sàng.");
  const body = await readJson(request, 6_500_000);
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [body];
  const saved = [];
  for (const item of items) {
    const { source, contentType, bytes } = await readBase64Image(item);
    const key = await mediaCacheKey(source);
    await env.FILES.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { source } });
    saved.push({ source, key, url: `/api/vigifts/media?src=${encodeURIComponent(source)}` });
  }
  return { ok: true, saved };
}

async function importProductImageUrls(env, payload, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được đồng bộ ảnh sản phẩm.");
  const encoded = String(payload || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!encoded || encoded.length > 180_000) fail(400, "Lô ảnh sản phẩm không hợp lệ.");
  let items;
  try {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    items = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "Không đọc được lô ảnh sản phẩm.");
  }
  if (!Array.isArray(items) || !items.length || items.length > 30) fail(400, "Lô ảnh sản phẩm không hợp lệ.");
  await ensureProductImageMapTable(env.DB);
  const statements = [];
  let updated = 0;
  for (const item of items) {
    const source = cleanText(item?.source, 500);
    const imageUrl = cleanText(item?.url, 2000);
    if (!/^SanPham_Images\/[^/]+\.(?:jpe?g|png|webp|gif)$/i.test(source)) continue;
    let parsed;
    try { parsed = new URL(imageUrl); } catch { continue; }
    if (parsed.hostname !== "www.appsheet.com" || parsed.pathname !== "/image/getimageurl") continue;
    if (decodeURIComponent(parsed.searchParams.get("fileName") || "") !== source || !parsed.searchParams.get("signature")) continue;
    statements.push(env.DB.prepare("UPDATE vigifts_product_image_map SET image_url=?, sync_status=?, imported_at=? WHERE image_source_path=?").bind(
      imageUrl, "Đã gắn URL ảnh", new Date().toISOString(), source,
    ));
    updated += 1;
  }
  if (statements.length) await env.DB.batch(statements);
  return { ok: true, received: items.length, updated };
}
async function ensureProductImageMapTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS vigifts_product_image_map (
    product_id TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    image_file_name TEXT NOT NULL,
    image_source_path TEXT NOT NULL,
    image_url TEXT,
    sync_status TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_vigifts_product_image_map_sku ON vigifts_product_image_map(sku)").run();
}

async function importProductImageMapSnapshot(db, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được nạp mapping ảnh sản phẩm.");
  const sourceRows = vigiftsSnapshot.data?.SanPham?.rows || [];
  const rows = sourceRows.map((row) => {
    const imagePath = cleanText(row?.values?.["Ảnh"], 500);
    return {
      productId: cleanText(row?.tupleId, 100),
      sku: cleanText(row?.values?.["Mã hàng"], 200),
      productName: cleanText(row?.values?.["Tên sản phẩm"], 500),
      imagePath,
    };
  }).filter((row) => row.productId && row.sku && row.imagePath && /^SanPham_Images\/[^/]+\.(?:jpe?g|png|webp|gif)$/i.test(row.imagePath));

  await ensureProductImageMapTable(db);
  const importedAt = new Date().toISOString();
  for (let start = 0; start < rows.length; start += 50) {
    const statements = rows.slice(start, start + 50).map((row) => {
      const fileName = row.imagePath.split("/").pop() || "";
      return db.prepare(`INSERT INTO vigifts_product_image_map
        (product_id, sku, product_name, image_file_name, image_source_path, image_url, sync_status, imported_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(product_id) DO UPDATE SET
          sku=excluded.sku, product_name=excluded.product_name, image_file_name=excluded.image_file_name,
          image_source_path=excluded.image_source_path, sync_status=excluded.sync_status, imported_at=excluded.imported_at`).bind(
        row.productId, row.sku, row.productName, fileName, row.imagePath, "Đã nạp đường dẫn gốc", importedAt,
      );
    });
    await db.batch(statements);
  }
  return { ok: true, imported: rows.length, importedAt };
}
const parseJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const viewMetadata = (row) => {
  const raw = parseJsonObject(row.viewJson);
  const settings = parseJsonObject(raw.Settings);
  const definition = parseJsonObject(raw.ViewDefinition);
  const icon = definition.Icon || settings.Icon || raw.Icon || "";
  const menuOrder = Number(definition.MenuOrder ?? settings.MenuOrder ?? raw.MenuOrder ?? row.viewOrder ?? 0) || 0;
  return {
    ...row,
    icon,
    menuOrder,
    viewOrder: Number(row.viewOrder || 0),
    viewJson: undefined,
  };
};
const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const SOURCE_APP_ID = "ad0117e6-9c42-465a-bdfa-b31e90b35248";
const neonSql = (env) => env?.NEON_DATABASE_URL ? neon(env.NEON_DATABASE_URL) : null;
const postgresRow = (row) => ({
  ...row,
  values_json: typeof row.values_json === "string" ? row.values_json : JSON.stringify(row.values_json || {}),
  raw_json: typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json || {}),
});

const CUSTOMER_FIELDS = [
  "TênKH",
  "Ma So Thue",
  "So Dien Thoai",
  "Email",
  "Dia Chi",
  "Loai Khach Hang",
  "Người liên hê",
  "Giới hạn công nợ",
  "Số ngày công nợ",
  "Ghi chú",
];
const CONTACT_FIELDS = ["Tên liên hệ", "Chức vụ", "Số điẹn thoai", "Email", "Khách hàng"];
const TRANSACTION_FIELDS = ["Chăm sóc lần sau", "Khách hàng", "Người liên hệ", "Nôi dung", "Kết quả", "Loại giao dịch", "Doanh số", "Nhắc tôi trước"];

const cleanText = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const customerValues = (body, previous = {}) => {
  const next = { ...previous };
  for (const field of CUSTOMER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) next[field] = cleanText(body[field], field === "Ghi chú" || field === "Dia Chi" ? 2000 : 500);
  }
  next["TênKH"] = cleanText(next["TênKH"], 500);
  if (!next["TênKH"]) fail(400, "Tên khách hàng là bắt buộc.");
  const taxCode = cleanText(next["Ma So Thue"], 20);
  if (taxCode && !/^\d{10}(?:-\d{3})?$/.test(taxCode)) fail(400, "Mã số thuế phải có 10 chữ số hoặc dạng 10 chữ số-3 chữ số.");
  const phone = cleanText(next["So Dien Thoai"], 30);
  if (phone && !/^\+?[\d .()-]{8,20}$/.test(phone)) fail(400, "Số điện thoại không hợp lệ.");
  const email = cleanText(next.Email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Email không hợp lệ.");
  for (const moneyField of ["Giới hạn công nợ", "Số ngày công nợ"]) {
    if (next[moneyField] === "") delete next[moneyField];
    else if (next[moneyField] !== undefined) {
      const number = Number(String(next[moneyField]).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(number) || number < 0) fail(400, `${moneyField} không hợp lệ.`);
      next[moneyField] = number;
    }
  }
  return next;
};

async function assertUniqueCustomerTaxCode(db, taxCode, tupleId = "") {
  if (!taxCode) return;
  const rows = await db.prepare("SELECT tuple_id,values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "KhachHang").all();
  const duplicate = rows.results.find((row) => row.tuple_id !== tupleId && cleanText(parseRow(row).values["Ma So Thue"], 20) === taxCode);
  if (duplicate) fail(409, "Mã số thuế đã tồn tại trong danh sách khách hàng.");
}

async function nextCustomerCode(db) {
  const rows = await db.prepare("SELECT values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "KhachHang").all();
  let largest = 0;
  for (const row of rows.results) {
    try {
      const match = String(JSON.parse(row.values_json || "{}")["MÃ KH"] || "").match(/^KH-(\d+)$/i);
      if (match) largest = Math.max(largest, Number(match[1]));
    } catch {}
  }
  return `KH-${String(largest + 1).padStart(4, "0")}`;
}

async function saveCustomerRow(db, tupleId, values, sourceCreatedAt = null) {
  const now = new Date().toISOString();
  const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
  await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(app_id,table_name,tuple_id) DO UPDATE SET values_json=excluded.values_json,search_text=excluded.search_text,source_updated_at=excluded.source_updated_at,imported_at=excluded.imported_at")
    .bind("vigifts-crm", "KhachHang", tupleId, compactJson(values), "{}", searchText, sourceCreatedAt || now, now, now)
    .run();
  return { tupleId, values, sourceCreatedAt: sourceCreatedAt || now, sourceUpdatedAt: now };
}

async function createCustomer(db, request) {
  const app = await ensureReady(db);
  if (!app) fail(503, "Dữ liệu VIGIFTS CRM chưa sẵn sàng.");
  const body = await readJson(request, 40000);
  const values = customerValues(body);
  await assertUniqueCustomerTaxCode(db, cleanText(values["Ma So Thue"], 20));
  values["MÃ KH"] = await nextCustomerCode(db);
  values["Phê Duyệt"] = "Đợi duyệt";
  values["Ngày tạo"] = Math.floor(Date.now() / 86400000) + 25569;
  const row = await saveCustomerRow(db, crypto.randomUUID(), values);
  return { ok: true, row };
}

async function updateCustomer(db, request, tupleId) {
  const current = await db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "KhachHang", tupleId).first();
  if (!current) fail(404, "Không tìm thấy khách hàng.");
  const body = await readJson(request, 40000);
  const previous = parseRow(current).values;
  const values = customerValues(body, previous);
  await assertUniqueCustomerTaxCode(db, cleanText(values["Ma So Thue"], 20), tupleId);
  const row = await saveCustomerRow(db, tupleId, values, current.source_created_at || null);
  return { ok: true, row };
}

async function approveCustomer(db, tupleId, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được duyệt khách hàng.");
  const current = await db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "KhachHang", tupleId).first();
  if (!current) fail(404, "Không tìm thấy khách hàng.");
  const values = { ...parseRow(current).values, "Phê Duyệt": "Đã duyệt" };
  const row = await saveCustomerRow(db, tupleId, values, current.source_created_at || null);
  return { ok: true, row };
}

async function deleteCustomer(db, tupleId, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được xóa khách hàng.");
  const result = await db.prepare("DELETE FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "KhachHang", tupleId).run();
  if (!result.meta?.changes) fail(404, "Không tìm thấy khách hàng.");
  return { ok: true };
}

async function customerOptions(db) {
  const rows = await db.prepare("SELECT tuple_id,values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? ORDER BY tuple_id").bind("vigifts-crm", "KhachHang").all();
  return rows.results.map((row) => {
    const values = parseRow(row).values;
    return { tupleId: row.tuple_id, label: cleanText(values["TênKH"], 500), code: cleanText(values["MÃ KH"], 100) };
  }).filter((item) => item.label);
}

async function contactOptions(db, customerId = "") {
  const rows = await db.prepare("SELECT tuple_id,values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? ORDER BY tuple_id").bind("vigifts-crm", "Người liên hệ").all();
  return rows.results.map((row) => {
    const values = parseRow(row).values;
    const linkedCustomer = values["Khách hàng"]?.tupleId || valueTextForSearch(values["Khách hàng"]);
    return { tupleId: row.tuple_id, label: cleanText(values["Tên liên hệ"], 500), customerId: cleanText(linkedCustomer, 200), phone: cleanText(values["Số điẹn thoai"], 30) };
  }).filter((item) => item.label && (!customerId || item.customerId === customerId));
}

async function resolveCustomer(db, input) {
  const value = input && typeof input === "object" ? cleanText(input.tupleId, 200) : cleanText(input, 500);
  if (!value) return null;
  const options = await customerOptions(db);
  const target = normalizeText(value);
  const match = options.find((item) => item.tupleId === value || normalizeText(item.label) === target || normalizeText(item.code) === target);
  if (!match) fail(400, "Khách hàng được chọn không tồn tại.");
  return match;
}

async function contactValues(db, body, previous = {}) {
  const next = { ...previous };
  for (const field of CONTACT_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) next[field] = cleanText(body[field], 500);
  next["Tên liên hệ"] = cleanText(next["Tên liên hệ"], 500);
  if (!next["Tên liên hệ"]) fail(400, "Tên người liên hệ là bắt buộc.");
  const phone = cleanText(next["Số điẹn thoai"], 30);
  if (phone && !/^\+?[\d .()-]{8,20}$/.test(phone)) fail(400, "Số điện thoại không hợp lệ.");
  const email = cleanText(next.Email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Email không hợp lệ.");
  const selectedCustomer = await resolveCustomer(db, next["Khách hàng"]);
  if (!selectedCustomer) fail(400, "Khách hàng là bắt buộc.");
  next["Khách hàng"] = { tupleId: selectedCustomer.tupleId };
  next["Hiển thị"] = [next["Tên liên hệ"], cleanText(next["Chức vụ"], 500), selectedCustomer.label].filter(Boolean).join(" · ");
  return next;
}

async function saveContactRow(db, tupleId, values, sourceCreatedAt = null) {
  const now = new Date().toISOString();
  const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
  await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(app_id,table_name,tuple_id) DO UPDATE SET values_json=excluded.values_json,search_text=excluded.search_text,source_updated_at=excluded.source_updated_at,imported_at=excluded.imported_at")
    .bind("vigifts-crm", "Người liên hệ", tupleId, compactJson(values), "{}", searchText, sourceCreatedAt || now, now, now).run();
  return { tupleId, values, sourceCreatedAt: sourceCreatedAt || now, sourceUpdatedAt: now };
}

async function createContact(db, request) {
  if (!(await ensureReady(db))) fail(503, "Dữ liệu VIGIFTS CRM chưa sẵn sàng.");
  const values = await contactValues(db, await readJson(request, 40000));
  const tupleId = crypto.randomUUID();
  values.Id = tupleId;
  return { ok: true, row: await saveContactRow(db, tupleId, values) };
}

async function updateContact(db, request, tupleId) {
  const current = await db.prepare("SELECT tuple_id,values_json,source_created_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "Người liên hệ", tupleId).first();
  if (!current) fail(404, "Không tìm thấy người liên hệ.");
  const values = await contactValues(db, await readJson(request, 40000), parseRow(current).values);
  return { ok: true, row: await saveContactRow(db, tupleId, values, current.source_created_at || null) };
}

async function deleteContact(db, tupleId, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được xóa người liên hệ.");
  const result = await db.prepare("DELETE FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "Người liên hệ", tupleId).run();
  if (!result.meta?.changes) fail(404, "Không tìm thấy người liên hệ.");
  return { ok: true };
}

async function resolveContact(db, input, customerId) {
  const value = input && typeof input === "object" ? cleanText(input.tupleId, 200) : cleanText(input, 500);
  if (!value) return null;
  const target = normalizeText(value);
  const match = (await contactOptions(db)).find((item) => item.tupleId === value || normalizeText(item.label) === target);
  if (!match) fail(400, "Người liên hệ được chọn không tồn tại.");
  if (customerId && match.customerId !== customerId) fail(400, "Người liên hệ không thuộc khách hàng đã chọn.");
  return match;
}

async function resolveEmployee(db, actor) {
  if (!actor?.email) return null;
  const rows = await db.prepare("SELECT tuple_id,values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "NhanVien").all();
  const email = normalizeText(actor.email);
  const row = rows.results.find((item) => normalizeText(parseRow(item).values.Email) === email);
  if (!row) return null;
  return { tupleId: row.tuple_id, values: parseRow(row).values };
}

const excelSerial = (date = new Date()) => date.getTime() / 86400000 + 25569;
const vietnamParts = (date = new Date()) => {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return { day: local.getUTCDate(), month: local.getUTCMonth() + 1, year: local.getUTCFullYear() };
};
const dateInputToSerial = (value) => {
  const text = cleanText(value, 30);
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(400, "Ngày chăm sóc lần sau không hợp lệ.");
  const ms = Date.parse(`${text}T00:00:00+07:00`);
  if (!Number.isFinite(ms)) fail(400, "Ngày chăm sóc lần sau không hợp lệ.");
  return ms / 86400000 + 25569;
};

async function transactionValues(db, body, previous = {}) {
  const next = { ...previous };
  for (const field of TRANSACTION_FIELDS) if (Object.prototype.hasOwnProperty.call(body, field)) next[field] = cleanText(body[field], field === "Nôi dung" ? 4000 : 500);
  const customer = await resolveCustomer(db, next["Khách hàng"]);
  if (!customer) fail(400, "Khách hàng là bắt buộc.");
  next["Khách hàng"] = { tupleId: customer.tupleId };
  next["Hiển thị tên HK"] = customer.label;
  const contact = await resolveContact(db, next["Người liên hệ"], customer.tupleId);
  if (contact) next["Người liên hệ"] = { tupleId: contact.tupleId };
  else delete next["Người liên hệ"];
  next["Nôi dung"] = cleanText(next["Nôi dung"], 4000);
  if (!next["Nôi dung"]) fail(400, "Nội dung giao dịch là bắt buộc.");
  next["Loại giao dịch"] = cleanText(next["Loại giao dịch"], 100);
  if (!next["Loại giao dịch"]) fail(400, "Loại giao dịch là bắt buộc.");
  next["Kết quả"] = cleanText(next["Kết quả"], 100);
  if (!next["Kết quả"]) fail(400, "Kết quả là bắt buộc.");
  const revenue = cleanText(next["Doanh số"], 100);
  if (!revenue) delete next["Doanh số"];
  else {
    const amount = Number(revenue.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) fail(400, "Doanh số không hợp lệ.");
    next["Doanh số"] = amount;
  }
  const followUp = dateInputToSerial(next["Chăm sóc lần sau"]);
  if (followUp === "") delete next["Chăm sóc lần sau"];
  else next["Chăm sóc lần sau"] = followUp;
  return next;
}

async function saveTransactionRow(db, tupleId, values, sourceCreatedAt = null) {
  const now = new Date().toISOString();
  const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
  await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(app_id,table_name,tuple_id) DO UPDATE SET values_json=excluded.values_json,search_text=excluded.search_text,source_updated_at=excluded.source_updated_at,imported_at=excluded.imported_at")
    .bind("vigifts-crm", "Giao dịch", tupleId, compactJson(values), "{}", searchText, sourceCreatedAt || now, now, now).run();
  return { tupleId, values, sourceCreatedAt: sourceCreatedAt || now, sourceUpdatedAt: now };
}

async function createTransaction(db, request, actor) {
  if (!(await ensureReady(db))) fail(503, "Dữ liệu VIGIFTS CRM chưa sẵn sàng.");
  const employee = await resolveEmployee(db, actor);
  if (!employee) fail(400, "Tài khoản hiện tại chưa được liên kết với nhân viên AppSheet.");
  const parts = vietnamParts();
  if (parts.day >= 25) {
    const rows = await db.prepare("SELECT values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "Giao dịch").all();
    const today = Math.floor(excelSerial());
    const count = rows.results.filter((item) => {
      const values = parseRow(item).values;
      return Math.floor(Number(values["Thời gian tạo"] || 0)) === today && valueTextForSearch(values["Nhân viên phụ trách"]) === employee.tupleId;
    }).length;
    if (count >= 15) fail(409, "Từ ngày 25, mỗi nhân viên chỉ được tạo tối đa 15 giao dịch trong ngày.");
  }
  const values = await transactionValues(db, await readJson(request, 50000));
  const tupleId = crypto.randomUUID();
  values["Row ID"] = tupleId;
  values["Thời gian tạo"] = excelSerial();
  values["Nhân viên phụ trách"] = { tupleId: employee.tupleId };
  values.Tháng = parts.month;
  values.Năm = parts.year;
  return { ok: true, row: await saveTransactionRow(db, tupleId, values) };
}

async function updateTransaction(db, request, tupleId) {
  const current = await db.prepare("SELECT tuple_id,values_json,source_created_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "Giao dịch", tupleId).first();
  if (!current) fail(404, "Không tìm thấy giao dịch.");
  const values = await transactionValues(db, await readJson(request, 50000), parseRow(current).values);
  return { ok: true, row: await saveTransactionRow(db, tupleId, values, current.source_created_at || null) };
}

async function deleteTransaction(db, tupleId, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được xóa giao dịch.");
  const result = await db.prepare("DELETE FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "Giao dịch", tupleId).run();
  if (!result.meta?.changes) fail(404, "Không tìm thấy giao dịch.");
  return { ok: true };
}

async function orderRecord(db, tupleId) {
  const row = await db.prepare("SELECT tuple_id,values_json,source_created_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND tuple_id=?").bind("vigifts-crm", "Nhập đơn hàng", tupleId).first();
  if (!row) fail(404, "Không tìm thấy HĐKT.");
  return row;
}

async function saveOrderRow(db, tupleId, values, sourceCreatedAt = null) {
  const now = new Date().toISOString();
  const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
  await db.prepare("UPDATE vigifts_appsheet_rows SET values_json=?,search_text=?,source_updated_at=?,imported_at=? WHERE app_id=? AND table_name=? AND tuple_id=?")
    .bind(compactJson(values), searchText, now, now, "vigifts-crm", "Nhập đơn hàng", tupleId).run();
  return { tupleId, values, sourceCreatedAt, sourceUpdatedAt: now };
}

async function approveOrder(db, tupleId, role) {
  if (role !== "manager") fail(403, "Chỉ Manager được duyệt HĐKT.");
  const current = await orderRecord(db, tupleId);
  const values = parseRow(current).values;
  const status = normalizeText(valueTextForSearch(values["Phê duyệt"]));
  if (["da duyet", "da thanh ly"].includes(status)) fail(409, "HĐKT này đã được duyệt.");
  values["Phê duyệt"] = "Đã duyệt";
  return { ok: true, row: await saveOrderRow(db, tupleId, values, current.source_created_at || null) };
}

async function triggerOrderDocument(db, request, tupleId) {
  const current = await orderRecord(db, tupleId);
  const body = await readJson(request, 10000);
  const action = cleanText(body.action, 20);
  if (!['print', 'save'].includes(action)) fail(400, "Thao tác HĐKT không hợp lệ.");
  const values = parseRow(current).values;
  const savedUrl = cleanText(valueTextForSearch(values["Lưu HĐKT"]), 2000);
  if (savedUrl && /^(?:https?:\/\/|\/)/i.test(savedUrl)) return { ok: true, openUrl: savedUrl, message: "Đã mở file HĐKT." };
  values["In HĐKT"] = true;
  await saveOrderRow(db, tupleId, values, current.source_created_at || null);
  return { ok: true, message: action === "print" ? "Đã gửi lệnh in HĐKT." : "Đã gửi lệnh tạo và lưu HĐKT." };
}

async function createOrderPayment(db, request, tupleId, actor) {
  const current = await orderRecord(db, tupleId);
  const body = await readJson(request, 30000);
  const amount = Number(String(body.amount ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) fail(400, "Số tiền thanh toán phải lớn hơn 0.");
  const employee = await resolveEmployee(db, actor);
  if (!employee) fail(400, "Tài khoản hiện tại chưa được liên kết với nhân viên AppSheet.");
  const paymentId = crypto.randomUUID();
  const date = dateInputToSerial(cleanText(body.date, 20)) || Math.floor(excelSerial());
  const values = {
    "Row ID": paymentId,
    Id: paymentId,
    "Ngày ghi nhận": date,
    "Số HĐ": { tupleId },
    "Số tiền thanh toán": amount,
    "Nọi dung": cleanText(body.content || "Thu công nợ HĐKT", 2000),
    "Nhân Viên": { tupleId: employee.tupleId },
  };
  const now = new Date().toISOString();
  const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
  await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind("vigifts-crm", "Sổ thu chi", paymentId, compactJson(values), "{}", searchText, now, now, now).run();
  const payments = await db.prepare("SELECT values_json FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "Sổ thu chi").all();
  const paid = (payments.results || []).reduce((sum, item) => {
    const payment = parseRow(item).values;
    const linked = payment["Số HĐ"]?.tupleId || rawValue(payment["Số HĐ"]);
    return linked === tupleId ? sum + Number(payment["Số tiền thanh toán"] || 0) : sum;
  }, 0);
  const orderValues = parseRow(current).values;
  const total = Number(orderValues["Thành tiền (+thuế)"] || orderValues["Thành Tiền (-Thuế)"] || 0);
  orderValues["Trạng thái thanh toán"] = total > 0 && paid >= total ? "Đã thanh toán" : `Đã tạm ứng ${paid.toLocaleString("en-US")}đ`;
  await saveOrderRow(db, tupleId, orderValues, current.source_created_at || null);
  return { ok: true, payment: { tupleId: paymentId, values }, paid, status: orderValues["Trạng thái thanh toán"] };
}

function parseRow(row) {
  let values = {};
  try {
    values = JSON.parse(row.values_json || "{}");
  } catch {}
  return {
    tupleId: row.tuple_id,
    values,
    sourceCreatedAt: row.source_created_at || null,
    sourceUpdatedAt: row.source_updated_at || null,
  };
}

const REFERENCE_LABEL_FIELDS = {
  NhanVien: ["Ten", "Tên", "Email"],
  KhachHang: ["TênKH", "MÃ KH", "Ma So Thue"],
  "Người liên hệ": ["Hiển thị", "Tên liên hệ", "Email"],
  "Nhập đơn hàng": ["Số HĐ", "KH_NDP"],
  "Báo giá": ["Số báo giá", "Khách hàng"],
  SanPham: ["Tên sản phẩm", "Mã hàng"],
  NhaCungCap: ["Tên NCC", "Ten", "Mã NCC"],
  "Pháp nhân": ["Tên công ty", "Tên pháp nhân", "Ten"],
  XuongGiaGong: ["Ten", "Tên xưởng"],
};

function collectReferenceIds(value, ids) {
  if (Array.isArray(value)) return value.forEach((item) => collectReferenceIds(item, ids));
  if (value && typeof value === "object") {
    const id = value.tupleId || value.tuple_id || value.itemId;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
    return Object.values(value).forEach((item) => collectReferenceIds(item, ids));
  }
  if (typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value.trim())) ids.add(value.trim());
}

function referenceLabel(tableName, values, tupleId) {
  const preferred = REFERENCE_LABEL_FIELDS[tableName] || ["Tên", "Ten", "Name", "Hiển thị", "Mã", "Code"];
  for (const name of preferred) {
    const value = values?.[name];
    if (["string", "number"].includes(typeof value) && String(value).trim() && String(value) !== tupleId) return String(value).trim();
  }
  for (const value of Object.values(values || {})) {
    if (["string", "number"].includes(typeof value) && String(value).trim() && String(value) !== tupleId && String(value).length <= 160) return String(value).trim();
  }
  return tupleId;
}

function enrichReferences(value, labels) {
  if (Array.isArray(value)) return value.map((item) => enrichReferences(item, labels));
  if (value && typeof value === "object") {
    const id = value.tupleId || value.tuple_id || value.itemId;
    const enriched = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, enrichReferences(item, labels)]));
    return id && labels.has(String(id)) ? { ...enriched, tupleId: String(id), label: labels.get(String(id)) } : enriched;
  }
  if (typeof value === "string" && labels.has(value)) return { tupleId: value, label: labels.get(value) };
  return value;
}

let snapshotReferenceLabels;
function getSnapshotReferenceLabels() {
  if (snapshotReferenceLabels) return snapshotReferenceLabels;
  snapshotReferenceLabels = new Map();
  for (const [tableName, data] of Object.entries(vigiftsSnapshot.data || {})) {
    for (const row of data.rows || []) {
      if (!row.tupleId) continue;
      const label = referenceLabel(tableName, row.values || {}, row.tupleId);
      if (!snapshotReferenceLabels.has(row.tupleId) || label !== row.tupleId) snapshotReferenceLabels.set(row.tupleId, label);
    }
  }
  return snapshotReferenceLabels;
}

async function enrichRowReferences(db, appId, rows) {
  const ids = new Set();
  rows.forEach((row) => Object.values(row.values || {}).forEach((value) => collectReferenceIds(value, ids)));
  if (!ids.size) return rows;
  const snapshotLabels = getSnapshotReferenceLabels();
  const labels = new Map([...ids].flatMap((id) => snapshotLabels.has(id) ? [[id, snapshotLabels.get(id)]] : []));
  const candidates = [...ids];
  for (let offset = 0; offset < candidates.length; offset += 80) {
    const chunk = candidates.slice(offset, offset + 80);
    const placeholders = chunk.map(() => "?").join(",");
    const found = await db.prepare(`SELECT table_name,tuple_id,values_json FROM vigifts_appsheet_rows WHERE app_id=? AND tuple_id IN (${placeholders})`).bind(appId, ...chunk).all();
    for (const row of found.results || []) {
      const values = parseRow(row).values;
      const label = referenceLabel(row.table_name, values, row.tuple_id);
      if (!labels.has(row.tuple_id) || label !== row.tuple_id) labels.set(row.tuple_id, label);
    }
  }
  return rows.map((row) => ({ ...row, values: enrichReferences(row.values, labels) }));
}

function rawValue(value) {
  return value && typeof value === "object" ? (value.tupleId || value.tuple_id || value.itemId || value.label || "") : value;
}

function buildDebtRows(customerRows, orderRows, paymentRows) {
  const paymentByOrder = new Map();
  for (const payment of paymentRows) {
    const orderId = String(rawValue(payment.values?.["Số HĐ"]) || "");
    if (!orderId) continue;
    paymentByOrder.set(orderId, (paymentByOrder.get(orderId) || 0) + Number(rawValue(payment.values?.["Số tiền thanh toán"]) || 0));
  }
  const ordersByCustomer = new Map();
  for (const order of orderRows) {
    const customerId = String(rawValue(order.values?.KH_NDP) || "");
    if (!customerId) continue;
    if (!ordersByCustomer.has(customerId)) ordersByCustomer.set(customerId, []);
    ordersByCustomer.get(customerId).push(order);
  }
  return customerRows.flatMap((customer) => {
    const orders = ordersByCustomer.get(customer.tupleId) || [];
    const revenue = orders.reduce((sum, order) => sum + Number(rawValue(order.values?.["Thành tiền (+thuế)"]) || rawValue(order.values?.["Thành Tiền (-Thuế)"]) || 0), 0);
    const paid = orders.reduce((sum, order) => sum + (paymentByOrder.get(order.tupleId) || 0), 0);
    const debt = revenue - paid;
    if (Math.abs(debt) < 0.005) return [];
    const owners = [];
    const ownerIds = new Set();
    for (const order of orders) {
      const owner = order.values?.["Nhân viên phụ trách"];
      const ownerId = String(rawValue(owner) || "");
      if (!ownerId || ownerIds.has(ownerId)) continue;
      ownerIds.add(ownerId);
      owners.push(owner && typeof owner === "object" ? owner : { tupleId: ownerId });
    }
    return [{ ...customer, values: { ...customer.values, "Tổng doanh số mua hàng": revenue, "Tổng số tiền còn lại": debt, "Cong No": debt, "NV Bán hàng": owners, "Trạng thái công nợ": debt > 0 ? "Còn nợ" : "Dư tiền" } }];
  });
}

function excelDate(value) {
  const serial = Number(rawValue(value));
  return Number.isFinite(serial) && serial > 25000 && serial < 70000 ? new Date((serial - 25569) * 86400000) : null;
}

function filterViewRows(rows, view) {
  const now = new Date();
  if (view === "CÔNG NỢ") return rows.filter((row) => Number(rawValue(row.values["Tổng số tiền còn lại"]) || 0) !== 0);
  if (view === "Lịch giao hàng") return rows.filter((row) => normalizeText(rawValue(row.values.Status)) !== normalizeText("Đã giao hàng"));
  if (["Xem doanh năm", "Tỉ trọng đóng góp trong năm"].includes(view)) return rows.filter((row) => Number(rawValue(row.values["Năm"])) === now.getFullYear());
  if (view === "Xem kpi tháng này") return rows.filter((row) => {
    const date = excelDate(row.values["dấu thời gian"]);
    return date && date.getUTCMonth() === now.getMonth() && date.getUTCFullYear() === now.getFullYear();
  });
  if (view === "Xem lợi nhuận") {
    const latest = new Map();
    for (const row of rows) {
      const company = String(rawValue(row.values["Pháp nhân"]) || "");
      const date = excelDate(row.values["dấu thời gian"]);
      if (!company || !date || date.getUTCMonth() !== now.getMonth() || date.getUTCFullYear() !== now.getFullYear()) continue;
      const current = latest.get(company);
      if (!current || Number(rawValue(row.values["dấu thời gian"])) > Number(rawValue(current.values["dấu thời gian"]))) latest.set(company, row);
    }
    return [...latest.values()];
  }
  return rows;
}

async function ensureReady(db) {
  try {
    const app = await db
      .prepare("SELECT id,title,source_app_id AS sourceAppId,source_version AS sourceVersion,exported_at AS exportedAt,imported_at AS importedAt FROM vigifts_appsheet_apps WHERE id=?")
      .bind("vigifts-crm")
      .first();
    return app || null;
  } catch (error) {
    if (String(error?.message || error).includes("no such table")) return null;
    throw error;
  }
}

async function neonSummary(env) {
  const sql = neonSql(env);
  if (!sql) return null;
  const [tables, rowCount, imported] = await Promise.all([
    sql.query("SELECT table_name AS name, safe_name AS \"safeName\", frame_id AS \"frameId\" FROM crm.appsheet_tables WHERE source_app_id = $1 ORDER BY table_name", [SOURCE_APP_ID]),
    sql.query("SELECT count(*)::int AS count FROM crm.appsheet_rows WHERE source_app_id = $1", [SOURCE_APP_ID]),
    sql.query("SELECT max(imported_at) AS \"importedAt\" FROM crm.appsheet_rows WHERE source_app_id = $1", [SOURCE_APP_ID]),
  ]);
  if (!rowCount[0]?.count) return null;
  return {
    ready: true,
    dataSource: "neon",
    app: {
      id: "vigifts-crm",
      title: "VIGIFTS CRM",
      sourceAppId: SOURCE_APP_ID,
      sourceVersion: "AppSheet export",
      exportedAt: imported[0]?.importedAt || null,
      importedAt: imported[0]?.importedAt || null,
    },
    counts: {
      tables: tables.length,
      rows: rowCount[0].count,
      views: (vigiftsSnapshot.views || []).length,
      actions: Object.values(vigiftsSnapshot.actionsByTable || {}).flat().length,
      bots: (vigiftsSnapshot.bots || []).length,
    },
    tables,
    views: vigiftsSnapshot.views || [],
  };
}

async function neonTableData(env, url) {
  const sql = neonSql(env);
  if (!sql) return null;
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) fail(400, "Thiếu tên bảng.");
  const view = String(url.searchParams.get("view") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 2000);
  const q = normalizeText(String(url.searchParams.get("q") || "").trim());
  const [table] = await sql.query("SELECT table_name AS name, safe_name AS \"safeName\", frame_id AS \"frameId\" FROM crm.appsheet_tables WHERE source_app_id = $1 AND table_name = $2", [SOURCE_APP_ID, name]);
  if (!table) fail(404, "Không tìm thấy bảng AppSheet.");
  const [fields, totalResult] = await Promise.all([
    sql.query("SELECT field_id AS \"fieldId\", field_name AS \"fieldName\", field_type AS \"fieldType\", ordinal FROM crm.appsheet_fields WHERE source_app_id = $1 AND table_name = $2 ORDER BY ordinal", [SOURCE_APP_ID, name]),
    sql.query("SELECT count(*)::int AS count FROM crm.appsheet_rows WHERE source_app_id = $1 AND table_name = $2", [SOURCE_APP_ID, name]),
  ]);
  const legacyQ = q.replace(/(^|\s)d/g, "$1đ");
  const viewInfo = view ? vigiftsSnapshot.viewMap?.[view] : null;
  const queryLimit = viewInfo?.filter ? 10000 : limit;
  const rows = q
    ? await sql.query("SELECT tuple_id, values_json, raw_json, source_created_at, source_updated_at FROM crm.appsheet_rows WHERE source_app_id = $1 AND table_name = $2 AND (search_text ILIKE $3 OR search_text ILIKE $4) ORDER BY tuple_id LIMIT $5", [SOURCE_APP_ID, name, `%${q}%`, `%${legacyQ}%`, queryLimit])
    : await sql.query("SELECT tuple_id, values_json, raw_json, source_created_at, source_updated_at FROM crm.appsheet_rows WHERE source_app_id = $1 AND table_name = $2 ORDER BY tuple_id LIMIT $3", [SOURCE_APP_ID, name, queryLimit]);
  let parsedRows = rows.map(postgresRow).map(parseRow);
  if (view === "CÔNG NỢ" && name === "KhachHang") {
    const [orders, payments] = await Promise.all([
      sql.query("SELECT tuple_id, values_json, raw_json, source_created_at, source_updated_at FROM crm.appsheet_rows WHERE source_app_id = $1 AND table_name = $2", [SOURCE_APP_ID, "Nhập đơn hàng"]),
      sql.query("SELECT tuple_id, values_json, raw_json, source_created_at, source_updated_at FROM crm.appsheet_rows WHERE source_app_id = $1 AND table_name = $2", [SOURCE_APP_ID, "Sổ thu chi"]),
    ]);
    parsedRows = buildDebtRows(parsedRows, orders.map(postgresRow).map(parseRow), payments.map(postgresRow).map(parseRow));
  } else {
    parsedRows = filterViewRows(parsedRows, view);
  }
  return {
    ready: true,
    dataSource: "neon",
    table,
    fields,
    view,
    viewInfo,
    columns: viewInfo?.columns || null,
    rows: parsedRows.slice(0, limit),
    total: viewInfo?.filter ? parsedRows.length : totalResult[0]?.count || 0,
  };
}

async function summary(db, env) {
  const neonData = await neonSummary(env);
  if (neonData) return neonData;
  const app = await ensureReady(db);
  if (!app) return vigiftsSnapshot;
  const [tables, views, actions, bots, rowCount] = await Promise.all([
    db.prepare("SELECT table_name AS name,safe_name AS safeName,frame_id AS frameId FROM vigifts_appsheet_tables WHERE app_id=? ORDER BY table_name").bind(app.id).all(),
    db.prepare("SELECT view_name AS name,display_name AS displayName,position,table_name AS tableName,action,action_type AS actionType,view_order AS viewOrder,show_if AS showIf,view_json AS viewJson FROM vigifts_appsheet_views WHERE app_id=? ORDER BY view_order,view_name").bind(app.id).all(),
    db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_actions WHERE app_id=?").bind(app.id).first(),
    db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_bots WHERE app_id=?").bind(app.id).first(),
    db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_rows WHERE app_id=?").bind(app.id).first(),
  ]);
  if (!rowCount.count) return vigiftsSnapshot;
  return {
    ready: true,
    app,
    counts: {
      tables: tables.results.length,
      rows: rowCount.count,
      views: views.results.length,
      actions: actions.count,
      bots: bots.count,
    },
    tables: tables.results,
    views: views.results.map(viewMetadata),
  };
}

async function tableData(db, url, env) {
  const neonData = await neonTableData(env, url);
  if (neonData) return neonData;
  const app = await ensureReady(db);
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) fail(400, "Thiếu tên bảng.");
  const view = String(url.searchParams.get("view") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 2000);
  const q = normalizeText(String(url.searchParams.get("q") || "").trim());
  if (!app) return snapshotTable(db, name, q, limit, view);
  const appRows = await db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_rows WHERE app_id=?").bind(app.id).first();
  if (!appRows.count) return snapshotTable(db, name, q, limit, view);
  const table = await db.prepare("SELECT table_name AS name,safe_name AS safeName,frame_id AS frameId FROM vigifts_appsheet_tables WHERE app_id=? AND table_name=?").bind(app.id, name).first();
  if (!table) fail(404, "Không tìm thấy bảng AppSheet.");
  const fields = await db.prepare("SELECT field_id AS fieldId,field_name AS fieldName,field_type AS fieldType,ordinal FROM vigifts_appsheet_fields WHERE app_id=? AND table_name=? ORDER BY ordinal").bind(app.id, name).all();
  const legacyQ = q.replace(/(^|\s)d/g, "$1đ");
  const viewInfo = view ? vigiftsSnapshot.viewMap?.[view] : null;
  const queryLimit = viewInfo?.filter ? 10000 : limit;
  const query = q
    ? db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? AND (search_text LIKE ? OR search_text LIKE ?) ORDER BY tuple_id LIMIT ?").bind(app.id, name, `%${q}%`, `%${legacyQ}%`, queryLimit)
    : db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=? ORDER BY tuple_id LIMIT ?").bind(app.id, name, queryLimit);
  const rows = await query.all();
  const total = await db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind(app.id, name).first();
  let parsedRows = rows.results.map(parseRow);
  if (view === "CÔNG NỢ" && name === "KhachHang") {
    const [orders, payments] = await Promise.all([
      db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind(app.id, "Nhập đơn hàng").all(),
      db.prepare("SELECT tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind(app.id, "Sổ thu chi").all(),
    ]);
    parsedRows = buildDebtRows(parsedRows, (orders.results || []).map(parseRow), (payments.results || []).map(parseRow));
  } else parsedRows = filterViewRows(parsedRows, view);
  const visibleRows = parsedRows.slice(0, limit);
  return { ready: true, table, fields: fields.results, view, viewInfo, columns: viewInfo?.columns || null, rows: await enrichRowReferences(db, app.id, visibleRows), total: viewInfo?.filter ? parsedRows.length : total.count };
}

async function importSnapshotChunk(db, request, role) {
  if (role !== "manager") fail(403, "Chỉ manager được nạp dữ liệu AppSheet.");
  // CRM records are sent in small authenticated batches, never as public assets.
  const body = await readJson(request, 2_000_000);
  const manifest = body.manifest && typeof body.manifest === "object" ? body.manifest : {};
  const table = body.table && typeof body.table === "object" ? body.table : null;
  const fields = Array.isArray(body.fields) ? body.fields.slice(0, 300) : [];
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
  const offset = Math.max(Number(body.offset || 0), 0);
  const total = Math.max(Number(body.total || 0), rows.length);
  const firstTable = Boolean(body.firstTable);
  if (!table || !cleanText(table.name, 250) || !/^[a-z0-9-]{1,100}$/i.test(cleanText(table.safeName, 100))) fail(400, "Thông tin bảng AppSheet không hợp lệ.");
  if (!rows.length && total > offset) fail(400, "Lô dữ liệu AppSheet đang trống.");
  const importedAt = new Date().toISOString();
  const statements = [];
  if (offset === 0) {
    statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_apps (id,title,source_app_id,source_version,app_definition_json,exported_at,imported_at) VALUES (?,?,?,?,?,?,?)").bind("vigifts-crm", cleanText(manifest.title || "VIGIFTS CRM", 250), cleanText(manifest.sourceAppId || "ad0117e6-9c42-465a-bdfa-b31e90b35248", 250), cleanText(manifest.sourceVersion || "snapshot", 250), "{}", cleanText(manifest.exportedAt, 100), importedAt));
    if (firstTable) {
      for (const view of vigiftsSnapshot.views || []) {
        statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_views (app_id,view_name,display_name,position,table_name,action,action_type,view_order,show_if,view_json) VALUES (?,?,?,?,?,?,?,?,?,?)").bind("vigifts-crm", view.name, view.displayName || view.name, view.position || "", view.tableName || "", view.action || "", view.actionType || "", Number(view.viewOrder || 0), view.showIf || null, compactJson(view)));
      }
      for (const actions of Object.values(vigiftsSnapshot.actionsByTable || {})) {
        for (const action of actions) {
          statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_actions (app_id,action_name,display_name,table_name,action_type,icon,condition,modifies_data,action_json) VALUES (?,?,?,?,?,?,?,?,?)").bind("vigifts-crm", action.name || "", action.displayName || action.name || "", action.table || "", action.type || "", action.icon || "", action.condition || null, action.modifiesData ? 1 : 0, compactJson(action)));
        }
      }
      for (const bot of vigiftsSnapshot.bots || []) {
        statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_bots (app_id,bot_name,event_name,process_name,disabled,bot_json) VALUES (?,?,?,?,?,?)").bind("vigifts-crm", bot.name || "", bot.eventName || "", bot.processName || "", bot.disabled ? 1 : 0, compactJson(bot)));
      }
    }
    statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,update_mode,allowed_updates,source_json) VALUES (?,?,?,?,?,?,?,?,?)").bind("vigifts-crm", table.name, table.safeName, table.baseId || "", table.frameId || "", table.schemaName || "", Number(table.updateMode || 0), Number(table.allowedUpdates || 0), compactJson({ source: table.source || "" })));
    for (const [index, field] of fields.entries()) {
      statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_fields (app_id,table_name,field_id,field_name,field_type,ordinal,is_key,is_label,is_required,is_hidden,is_virtual,expression_json,field_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind("vigifts-crm", table.name, field.fieldId || field.name || String(index), field.name || field.fieldId || String(index), field.type || "", index, 0, 0, 0, 0, 0, "{}", compactJson(field.raw || field)));
    }
  }
  for (const record of rows) {
    const values = record.values || {};
    const searchText = normalizeText(Object.values(values).map(valueTextForSearch).join(" "));
    statements.push(db.prepare("INSERT OR REPLACE INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (?,?,?,?,?,?,?,?,?)").bind("vigifts-crm", table.name, record.tupleId, compactJson(values), compactJson(record.raw || {}), searchText, record.createdAt || null, record.updatedAt || null, importedAt));
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  const nextOffset = offset + rows.length < total ? offset + rows.length : null;
  return { ok: true, table: table.name, safeName: table.safeName, offset, imported: rows.length, total, nextOffset, mode: "merge" };
}

function valueTextForSearch(value) {
  if (Array.isArray(value)) return value.map(valueTextForSearch).join(" ");
  if (value && typeof value === "object") return value.label || value.tupleId || value.itemId || JSON.stringify(value);
  return value ?? "";
}

async function snapshotTable(db, name, q, limit, view) {
  const data = vigiftsSnapshot.data?.[name];
  if (!data) fail(404, "Không tìm thấy bảng AppSheet.");
  const viewInfo = view ? vigiftsSnapshot.viewMap?.[view] : null;
  let rows = data.rows || [];
  if (q) rows = rows.filter((row) => JSON.stringify(row.values || {}).toLowerCase().includes(q));
  if (view === "CÔNG NỢ" && name === "KhachHang") rows = buildDebtRows(rows, vigiftsSnapshot.data?.["Nhập đơn hàng"]?.rows || [], vigiftsSnapshot.data?.["Sổ thu chi"]?.rows || []);
  const visibleRows = rows.slice(0, limit).map((row) => ({ ...row, values: { ...(row.values || {}) } }));
  if (name === "SanPham") {
    try {
      await ensureProductImageMapTable(db);
      const maps = await db.prepare("SELECT product_id,image_url FROM vigifts_product_image_map WHERE image_url IS NOT NULL AND image_url<>''").all();
      const imageByProductId = new Map((maps.results || []).map((item) => [item.product_id, item.image_url]));
      for (const row of visibleRows) {
        const imageUrl = imageByProductId.get(row.tupleId);
        if (imageUrl) row.values["Ảnh"] = imageUrl;
      }
    } catch {
      // The product list remains available when image mapping has not been initialized yet.
    }
  }
  return {
    ready: true,
    ...data,
    view,
    viewInfo,
    columns: viewInfo?.columns || data.columns,
    rows: visibleRows,
    total: view === "CÔNG NỢ" ? rows.length : data.total || rows.length,
    fallback: true,
  };
}

async function contractOverviewData(env){
 const names=['Nhập đơn hàng','Chi tiết đơn hàng','NhanVien','KhachHang','SanPham'];
 const sql=neonSql(env);let tables={},dataSource='d1',fallback=false;
 if(sql){
  const rows=await sql.query("SELECT table_name,tuple_id,values_json,source_created_at,source_updated_at FROM crm.appsheet_rows WHERE source_app_id=$1 AND table_name=ANY($2::text[])",[SOURCE_APP_ID,names]);
  for(const name of names)tables[name]=rows.filter(r=>r.table_name===name).map(postgresRow).map(parseRow);
  dataSource='neon';
 }else{
  const app=await ensureReady(env.DB);
  if(app){const rows=await env.DB.prepare("SELECT table_name,tuple_id,values_json,source_created_at,source_updated_at FROM vigifts_appsheet_rows WHERE app_id=? AND table_name IN (?,?,?,?,?)").bind(app.id,...names).all();for(const name of names)tables[name]=(rows.results||[]).filter(r=>r.table_name===name).map(parseRow);}
  else {for(const name of names)tables[name]=vigiftsSnapshot.data?.[name]?.rows||[];dataSource='snapshot';fallback=true;}
 }
 return {records:crmContractOverview(tables),dataSource,fallback,asOf:fallback?vigiftsSnapshot.generatedAt:new Date().toISOString()};
}

async function vigiftsMirrorApiInternal(request, env, identity = "employee") {
  try {
    const actor = typeof identity === "string" ? { role: identity } : identity || { role: "employee" };
    const role = actor.role || "employee";
    if (!env.DB) fail(503, "DB web chưa sẵn sàng.");
    const url = new URL(request.url);
    if (url.pathname === "/api/vigifts/import-snapshot" && request.method === "POST") return json(await importSnapshotChunk(env.DB, request, role));
    if (url.pathname === "/api/vigifts/media" && request.method === "GET") return serveMedia(env, url);
    if (url.pathname === "/api/vigifts/media-cache" && request.method === "POST") return json(await cacheMedia(env, request, role));
    if (url.pathname === "/api/vigifts/import-product-images" && request.method === "GET") return json(await importProductImageUrls(env, url.searchParams.get("payload"), role));
    if (url.pathname === "/api/vigifts/import-product-images" && request.method === "POST") return json(await importProductImageUrls(env, (await readJson(request, 190_000)).payload, role));
    if (url.pathname === "/api/vigifts/product-image-map/import-snapshot" && request.method === "POST") return json(await importProductImageMapSnapshot(env.DB, role));
    if (url.pathname === "/api/vigifts/customer-options" && request.method === "GET") return json({ options: await customerOptions(env.DB) });
    if (url.pathname === "/api/vigifts/contact-options" && request.method === "GET") return json({ options: await contactOptions(env.DB, cleanText(url.searchParams.get("customer"), 200)) });
    if (url.pathname === "/api/vigifts/customers" && request.method === "POST") return json(await createCustomer(env.DB, request), 201);
    if (url.pathname === "/api/vigifts/contacts" && request.method === "POST") return json(await createContact(env.DB, request), 201);
    if (url.pathname === "/api/vigifts/transactions" && request.method === "POST") return json(await createTransaction(env.DB, request, actor), 201);
    const customerMatch = url.pathname.match(/^\/api\/vigifts\/customers\/([^/]+)(?:\/(approve))?$/);
    if (customerMatch) {
      const tupleId = decodeURIComponent(customerMatch[1]);
      if (customerMatch[2] === "approve" && request.method === "POST") return json(await approveCustomer(env.DB, tupleId, role));
      if (request.method === "PATCH") return json(await updateCustomer(env.DB, request, tupleId));
      if (request.method === "DELETE") return json(await deleteCustomer(env.DB, tupleId, role));
    }
    const contactMatch = url.pathname.match(/^\/api\/vigifts\/contacts\/([^/]+)$/);
    if (contactMatch) {
      const tupleId = decodeURIComponent(contactMatch[1]);
      if (request.method === "PATCH") return json(await updateContact(env.DB, request, tupleId));
      if (request.method === "DELETE") return json(await deleteContact(env.DB, tupleId, role));
    }
    const transactionMatch = url.pathname.match(/^\/api\/vigifts\/transactions\/([^/]+)$/);
    if (transactionMatch) {
      const tupleId = decodeURIComponent(transactionMatch[1]);
      if (request.method === "PATCH") return json(await updateTransaction(env.DB, request, tupleId));
      if (request.method === "DELETE") return json(await deleteTransaction(env.DB, tupleId, role));
    }
    const orderMatch = url.pathname.match(/^\/api\/vigifts\/orders\/([^/]+)\/(approve|document|payments)$/);
    if (orderMatch && request.method === "POST") {
      const tupleId = decodeURIComponent(orderMatch[1]);
      if (orderMatch[2] === "approve") return json(await approveOrder(env.DB, tupleId, role));
      if (orderMatch[2] === "document") return json(await triggerOrderDocument(env.DB, request, tupleId));
      if (orderMatch[2] === "payments") return json(await createOrderPayment(env.DB, request, tupleId, actor), 201);
    }
    if (request.method !== "GET") fail(405, "Phương thức không hỗ trợ.");
    if (url.pathname === "/api/vigifts/contract-overview") {if(role==='supplier')fail(403,'Tài khoản chưa được xem HĐKT CRM.');return json(await contractOverviewData(env));}
    if (url.pathname === "/api/vigifts/summary") return json(await summary(env.DB, env));
    if (url.pathname === "/api/vigifts/table") return json(await tableData(env.DB, url, env));
    fail(404, "Không tìm thấy API VIGIFTS CRM.");
  } catch (error) {
    return json({ error: error.message || "Không tải được dữ liệu VIGIFTS CRM." }, error.status || 500);
  }
}

export async function vigiftsMirrorApi(request,env,identity="employee"){return mappedMediaResponse(await vigiftsMirrorApiInternal(request,env,identity),env.FILES);}
