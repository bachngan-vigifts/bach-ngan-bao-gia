import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Miniflare } from "../node_modules/.pnpm/node_modules/miniflare/dist/src/index.js";
import { vigiftsMirrorApi } from "../lib/vigifts-mirror-api.mjs";

test("VIGIFTS customer lifecycle validates data and enforces manager actions", { timeout: 30000 }, async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-05-01",
    d1Databases: ["DB"],
  });
  try {
    const db = await mf.getD1Database("DB");
    for (const sql of readFileSync(new URL("../drizzle/0019_vigifts_appsheet_mirror.sql", import.meta.url), "utf8").split("--> statement-breakpoint")) {
      if (sql.trim()) await db.prepare(sql).run();
    }
    await db.prepare("INSERT INTO vigifts_appsheet_apps (id,title,source_app_id,source_version,app_definition_json,exported_at,imported_at) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "VIGIFTS CRM", "test", "559", "{}", new Date().toISOString(), new Date().toISOString()).run();
    await db.prepare("INSERT INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,source_json) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "KhachHang", "khachhang", "", "customers", "", "{}").run();
    await db.prepare("INSERT INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,source_json) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "Người liên hệ", "nguoi-lien-he", "", "contacts", "", "{}").run();
    await db.prepare("INSERT INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,source_json) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "Giao dịch", "giao-dich", "", "transactions", "", "{}").run();
    await db.prepare("INSERT INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,source_json) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "NhanVien", "nhan-vien", "", "employees", "", "{}").run();
    await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,imported_at) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "NhanVien", "NV-01", JSON.stringify({ Email: "staff@vigifts.test", Ten: "Nhân viên test" }), "{}", "staff vigifts test", new Date().toISOString()).run();

    const call = async (path, method, body, role = "employee") => {
      const response = await vigiftsMirrorApi(new Request(`https://test/api/vigifts${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }), { DB: db }, role);
      return { status: response.status, data: await response.json() };
    };

    const invalid = await call("/customers", "POST", { "TênKH": "Công ty lỗi", Email: "sai" });
    assert.equal(invalid.status, 400);

    const created = await call("/customers", "POST", {
      "TênKH": "Công ty VIGIFTS",
      "Ma So Thue": "0312345678",
      "So Dien Thoai": "0901 234 567",
      Email: "hello@vigifts.test",
      "Giới hạn công nợ": "15000000",
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.row.values["MÃ KH"], "KH-0001");
    assert.equal(created.data.row.values["Phê Duyệt"], "Đợi duyệt");
    assert.equal(created.data.row.values["Giới hạn công nợ"], 15000000);
    const id = created.data.row.tupleId;

    const badContact = await call("/contacts", "POST", { "Tên liên hệ": "Chị Sen", "Khách hàng": "không tồn tại" });
    assert.equal(badContact.status, 400);
    const contact = await call("/contacts", "POST", { "Tên liên hệ": "Chị Sen", "Chức vụ": "Giám đốc", "Số điẹn thoai": "0909 123 456", Email: "sen@vigifts.test", "Khách hàng": "Công ty VIGIFTS" });
    assert.equal(contact.status, 201);
    assert.deepEqual(contact.data.row.values["Khách hàng"], { tupleId: id });
    assert.match(contact.data.row.values["Hiển thị"], /Chị Sen.*Công ty VIGIFTS/);
    const contactId = contact.data.row.tupleId;
    const changedContact = await call(`/contacts/${contactId}`, "PATCH", { "Tên liên hệ": "Madam Sen", "Khách hàng": id });
    assert.equal(changedContact.status, 200);
    assert.equal(changedContact.data.row.values["Tên liên hệ"], "Madam Sen");

    const missingEmployee = await call("/transactions", "POST", { "Khách hàng": id, "Người liên hệ": contactId, "Nôi dung": "Gọi hỏi nhu cầu quà tặng", "Loại giao dịch": "Gọi điện thoại", "Kết quả": "Đang tư vấn" });
    assert.equal(missingEmployee.status, 400);
    const transaction = await call("/transactions", "POST", { "Khách hàng": id, "Người liên hệ": contactId, "Nôi dung": "Gọi hỏi nhu cầu quà tặng", "Loại giao dịch": "Gọi điện thoại", "Kết quả": "Đang tư vấn", "Doanh số": "1200000" }, { role: "employee", email: "staff@vigifts.test" });
    assert.equal(transaction.status, 201);
    assert.deepEqual(transaction.data.row.values["Khách hàng"], { tupleId: id });
    assert.deepEqual(transaction.data.row.values["Người liên hệ"], { tupleId: contactId });
    assert.deepEqual(transaction.data.row.values["Nhân viên phụ trách"], { tupleId: "NV-01" });
    assert.equal(transaction.data.row.values["Doanh số"], 1200000);
    const transactionId = transaction.data.row.tupleId;
    await db.prepare("INSERT INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,imported_at) VALUES (?,?,?,?,?,?,?)")
      .bind("vigifts-crm", "Giao dịch", "LEGACY-REF", JSON.stringify({ "Khách hàng": "yFoDEA57IgCxZt8xFvrSqN", "Người liên hệ": "JMTIHHkWoItakkeK7vGp0T", "Nhân viên phụ trách": "T5VNSZUIZQI7BCSDGYGMZB" }), "{}", "legacy", new Date().toISOString()).run();
    const transactionTable = await call(`/table?name=${encodeURIComponent("Giao dịch")}`, "GET");
    assert.equal(transactionTable.status, 200);
    const currentTransaction = transactionTable.data.rows.find((row) => row.tupleId === transactionId);
    assert.deepEqual(currentTransaction.values["Khách hàng"], { tupleId: id, label: "Công ty VIGIFTS" });
    assert.deepEqual(currentTransaction.values["Người liên hệ"], { tupleId: contactId, label: "Madam Sen · Giám đốc · Công ty VIGIFTS" });
    assert.deepEqual(currentTransaction.values["Nhân viên phụ trách"], { tupleId: "NV-01", label: "Nhân viên test" });
    const legacy = transactionTable.data.rows.find((row) => row.tupleId === "LEGACY-REF");
    assert.notEqual(legacy.values["Khách hàng"].label, "yFoDEA57IgCxZt8xFvrSqN");
    assert.notEqual(legacy.values["Người liên hệ"].label, "JMTIHHkWoItakkeK7vGp0T");
    assert.notEqual(legacy.values["Nhân viên phụ trách"].label, "T5VNSZUIZQI7BCSDGYGMZB");
    const changedTransaction = await call(`/transactions/${transactionId}`, "PATCH", { "Kết quả": "Thành công", "Khách hàng": id, "Người liên hệ": contactId });
    assert.equal(changedTransaction.status, 200);
    assert.equal(changedTransaction.data.row.values["Kết quả"], "Thành công");
    assert.equal((await call(`/transactions/${transactionId}`, "DELETE", null, "employee")).status, 403);
    assert.equal((await call(`/transactions/${transactionId}`, "DELETE", null, "manager")).status, 200);

    assert.equal((await call(`/contacts/${contactId}`, "DELETE", null, "employee")).status, 403);
    assert.equal((await call(`/contacts/${contactId}`, "DELETE", null, "manager")).status, 200);

    const duplicate = await call("/customers", "POST", { "TênKH": "Công ty trùng", "Ma So Thue": "0312345678" });
    assert.equal(duplicate.status, 409);

    const updated = await call(`/customers/${encodeURIComponent(id)}`, "PATCH", { "TênKH": "Công ty VIGIFTS mới", "So Dien Thoai": "0912 345 678" });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.row.values["TênKH"], "Công ty VIGIFTS mới");
    assert.equal(updated.data.row.values["MÃ KH"], "KH-0001");

    assert.equal((await call(`/customers/${id}/approve`, "POST", null, "employee")).status, 403);
    const approved = await call(`/customers/${id}/approve`, "POST", null, "manager");
    assert.equal(approved.status, 200);
    assert.equal(approved.data.row.values["Phê Duyệt"], "Đã duyệt");

    assert.equal((await call(`/customers/${id}`, "DELETE", null, "employee")).status, 403);
    assert.equal((await call(`/customers/${id}`, "DELETE", null, "manager")).status, 200);
    assert.equal((await db.prepare("SELECT count(*) AS count FROM vigifts_appsheet_rows WHERE app_id=? AND table_name=?").bind("vigifts-crm", "KhachHang").first()).count, 0);
  } finally {
    await mf.dispose();
  }
});
