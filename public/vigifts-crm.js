(() => {
  const $ = (id) => document.getElementById(id);
  const state = { summary: null, user: null, table: null, view: null, rows: [], fields: [], columns: [], searchTimer: 0, todayData: [], customerOptions: [], contactOptions: [], referenceLabels: {}, staffById: null, currentData: null, orderStatus: "all", productApproval: "all", customerFilters: { approval: "all", purchase: "all", owner: "all" } };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  // AppSheet keeps employee photos as relative file names. These signed source URLs
  // preserve the existing employee photos while the CRM reads its own mirrored data.
  const STAFF_PHOTO_URLS = {
    "T5VNSGMIZQI7BCSDGYGMZB.Ảnh.094444.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FT5VNSGMIZQI7BCSDGYGMZB.%E1%BA%A2nh.094444.jpg&appVersion=1.002797&signature=6248562210f70c485a9cefafb1b556f041aafb0d0b322862b170dfa455a3483f",
    "T5VNSZUIZQI7BCSDGYGMZB.Ảnh.135824.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FT5VNSZUIZQI7BCSDGYGMZB.%E1%BA%A2nh.135824.jpg&appVersion=1.002797&signature=52716e43e753d500421c4fdcae25bceafecdb5f628f3848c806135fa27130aa5",
    "T5VNTH4IZQI7BCSDGYGMZB.Ảnh.094944.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FT5VNTH4IZQI7BCSDGYGMZB.%E1%BA%A2nh.094944.jpg&appVersion=1.002797&signature=51673c69ae7562b1caf5b1dc0e113b5fb5bad6ea04ec1132883535976b9c60f0",
    "Bif6k2aiNbglqV5ou4bcbq.Ảnh.135712.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FBif6k2aiNbglqV5ou4bcbq.%E1%BA%A2nh.135712.jpg&appVersion=1.002797&signature=7bcc36220f456667bfd2317b99f95d008494d0b4a00ffe0cc8a7a1bfc5db1b4a",
    "X8vacokRjDOoUWrnM0w4m7.Ảnh.135501.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FX8vacokRjDOoUWrnM0w4m7.%E1%BA%A2nh.135501.jpg&appVersion=1.002797&signature=921b2561ad0aaf01c288f9cd65394215ca0fbf652939bfd483ccf996edd91306",
    "mlMSaBVyjy2PMtV94Upg2P.Ảnh.135736.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FmlMSaBVyjy2PMtV94Upg2P.%E1%BA%A2nh.135736.jpg&appVersion=1.002797&signature=01cc41daa7d728df790baf3e8a5fd3eb35322c67814718d7829c0f047bfaaf0e",
    "KAZhjqCLbP4xiv1T-Kmji6.Ảnh.033655.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FKAZhjqCLbP4xiv1T-Kmji6.%E1%BA%A2nh.033655.jpg&appVersion=1.002797&signature=bfb9228fe24957234a5ad75cec864d340271ecbe32e83225aba94cd35b84c6b1",
    "oCUH1FCxYP41etqj4lMlc6.Ảnh.123744.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FoCUH1FCxYP41etqj4lMlc6.%E1%BA%A2nh.123744.jpg&appVersion=1.002797&signature=8f4a651b6427eb5c892715315a93daece055711520d2167f179467d9fac32bdf",
    "zRLj841cXX4WIbRyavM9s8.Ảnh.123726.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2FzRLj841cXX4WIbRyavM9s8.%E1%BA%A2nh.123726.jpg&appVersion=1.002797&signature=4d1d1ff7a9964d3c1dface476ebfe65379b3ef8231438ad3d36c238b0c7b8fcf",
    "mx0tA2oFnEpn7IeiM6jgFV.Ảnh.162911.jpg": "https://www.appsheet.com/image/getimageurl?appName=QU%E1%BA%A2NL%C3%9DH%C4%90KT-975382311-25-10-21&tableName=NhanVien&fileName=NhanVien_Images%2Fmx0tA2oFnEpn7IeiM6jgFV.%E1%BA%A2nh.162911.jpg&appVersion=1.002797&signature=732345a2fe02e8e581d0f12c319ee9374e516e676e3a7b3080848eda875cc0dc",
  };
  const isOpaqueReference = (value) => {
    const text = String(value || "");
    return text.length === 22 && /^[A-Za-z0-9_-]+$/.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text) && /\d/.test(text);
  };
  const navIcon = (value, icon = "") => {
    const name = `${normalize(value)} ${normalize(icon)}`;
    const icons = [
      [/^home$/, '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'],
      [/home-alt|fa-home/, '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>'],
      [/viec hom nay|nhiem vu/, '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8 15 2 2 5-5"/>'],
      [/lich giao hang/, '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'],
      [/calendar|lich giao hang/, '<path d="M3 6h18v15H3z"/><path d="M7 3v5M17 3v5M3 10h18"/><path d="M8 14h3M13 14h3M8 18h3"/>'],
      [/boxes|box|dolly|san pham|chi tiet san pham/, '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4.5 7.5 7.5 4 7.5-4"/><path d="M12 11.5V21"/>'],
      [/users|user-friends|khach hang|nguoi lien he|nhanvien/, '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5"/><path d="M17 14a5 5 0 0 1 3.5 5"/>'],
      [/inbox|giao dich/, '<path d="M4 4h16v16H4z"/><path d="m4 13 3.5-5h9L20 13"/><path d="M4 13h5l1.5 2h3L15 13h5"/>'],
      [/astronaut|de xuat/, '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8"/><path d="M8 12h5"/>'],
      [/running|kpi|doanh|landmark|ti trong/, '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'],
      [/funnel-dollar|bow-arrow|chart-bar|cong no|thanh toan|loi nhuan/, '<circle cx="12" cy="12" r="9"/><path d="M16 8.5c-.8-.7-2-1-3.2-1-1.8 0-3 .9-3 2.2 0 3.2 6.2 1.8 6.2 5 0 1.3-1.2 2.3-3.2 2.3-1.4 0-2.8-.5-3.8-1.4"/><path d="M12.5 5.5v13"/>'],
      [/chart-pie/, '<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/><path d="M13 3.1A9 9 0 0 1 20.9 11H13z"/>'],
      [/cash-register|phap nhan/, '<path d="M4 21V7l8-4 8 4v14"/><path d="M8 10h2"/><path d="M14 10h2"/><path d="M8 14h2"/><path d="M14 14h2"/><path d="M10 21v-3h4v3"/>'],
      [/microphone|assistant/, '<path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/><path d="M8 21h8"/>'],
      [/file-signature|file-check|hdkt|bao gia/, '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/>'],
    ];
    const body = icons.find(([pattern]) => pattern.test(name))?.[1] || '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>';
    return `<span class="vigifts-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
  };
  const api = async (path, options = {}) => {
    const response = await fetch("/api/vigifts" + path, {
      cache: "no-store",
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || data.message || "Không tải được VIGIFTS CRM.");
    return data;
  };
  const staffApi = async (path) => {
    const response = await fetch("/api/staff" + path, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || data.message || "Không tải được tài khoản hiện tại.");
    return data;
  };

  const VIEW_CONFIGS = [
    { match: /khachhang|khách hàng|công nợ/i, title: ["TênKH", "MÃ KH"], sub: ["Ma So Thue", "So Dien Thoai", "Email"], columns: ["MÃ KH", "TênKH", "Ma So Thue", "So Dien Thoai", "Email", "NV phu trach", "Phê Duyệt", "Cong No", "Tổng doanh số mua hàng", "Trạng thái công nợ"], money: ["Cong No", "Tổng doanh số mua hàng", "Tổng số tiền còn lại"], status: ["Phê Duyệt", "Trạng thái công nợ"], actions: ["Duyệt KH", "Tạo HĐKT", "Ghi giao dịch"] },
    { match: /nhập đơn hàng|hđkt|hdkt/i, title: ["Số HĐ"], sub: ["KH_NDP", "Nhân viên phụ trách", "Pháp nhân"], columns: ["Số HĐ", "Pháp nhân", "Phê duyệt", "KH_NDP", "Nhân viên phụ trách", "Thành Tiền (-Thuế)", "Thành tiền (+thuế)", "Lợi nhuận", "Trạng thái thanh toán", "Đã giao hàng", "Ngày hẹn giao", "Ghi chú"], money: ["Thành Tiền (-Thuế)", "Thành tiền (+thuế)", "Lợi nhuận", "Giá nhập SON"], status: ["Phê duyệt", "Trạng thái thanh toán", "Đã giao hàng"], actions: ["Duyệt HĐ", "In HĐKT", "Lưu HĐKT", "Tạo thanh toán"] },
    { match: /báo giá|bao-gia/i, title: ["Số báo giá"], sub: ["Khách hàng", "Người liên hệ", "Nhân viên phụ trách"], columns: ["Số báo giá", "Trạng thái", "Khách hàng", "Người liên hệ", "Nhân viên phụ trách", "Số lượng", "Đơn giá", "Chiết khấu", "Thành tiền (-VAT)", "Thành tiền (+VAT)", "Ghi chú"], money: ["Đơn giá", "Thành tiền (-VAT)", "Thành tiền (+VAT)", "Tổng Ck", "Tổng lợi nhuận"], status: ["Trạng thái"], actions: ["Duyệt báo giá", "In báo giá", "Sinh HĐ"] },
    { match: /sản phẩm|sanpham/i, title: ["Tên sản phẩm", "Mã hàng"], sub: ["Mã hàng", "Nhà cung cấp", "Đơn vị tính"], columns: ["Ảnh", "Mã hàng", "Tên sản phẩm", "Nhà cung cấp", "Đơn vị tính", "Giá nhập", "Giá bán", "Giá bán trung bình", "LN gộp", "Phê duyệt"], money: ["Giá nhập", "Giá bán", "Giá bán trung bình", "LN gộp"], status: ["Phê duyệt"], actions: ["Duyệt sản phẩm", "Tạo báo giá"] },
    { match: /người liên hệ|nguoi-lien-he/i, title: ["Tên liên hệ", "Hiển thị"], sub: ["Khách hàng", "Chức vụ", "Số điẹn thoai", "Email"], columns: ["Tên liên hệ", "Chức vụ", "Số điẹn thoai", "Email", "Khách hàng", "Hiển thị"], actions: ["Gọi", "Gửi email", "Ghi giao dịch"] },
    { match: /giao dịch|giao-dich/i, title: ["Nôi dung", "Khách hàng"], sub: ["Khách hàng", "Người liên hệ", "Nhân viên phụ trách"], columns: ["Nôi dung", "Thời gian tạo", "Khách hàng", "Người liên hệ", "Loại giao dịch", "Kết quả", "Nhân viên phụ trách", "Chăm sóc lần sau", "Doanh số", "Nhắc tôi trước", "Quá hạn"], money: ["Doanh số"], status: ["Kết quả", "Quá hạn"], actions: ["Hoàn tất", "Nhắc chăm sóc", "Tạo báo giá"] },
    { match: /chi tiết đơn hàng|lịch giao hàng/i, title: ["Sản phẩm", "Số HĐ"], sub: ["Số HĐ", "Ngày hẹn giao", "Status"], columns: ["Ảnh", "Số HĐ", "Sản phẩm", "Đơn vị tính", "Số lượng", "Đơn giá nhập", "Đơn giá bán", "Lợi nhuận", "Status", "Ngày hẹn giao", "Xưởng in", "Xưởng bao bì"], money: ["Đơn giá nhập", "Đơn giá bán", "Lợi nhuận", "Thành tiền (-VAT)", "Thành tiền (+VAT)"], status: ["Status"], actions: ["Cập nhật giao hàng", "Kiểm giá vốn"] },
    { match: /chi phí|thanh toán/i, title: ["Loại chi phí", "Số hoá đơn (nếu có)"], sub: ["Nhân viên", "Người nhận", "Ngày ghi nhận"], columns: ["Loại chi phí", "Nhân viên", "Ngày ghi nhận", "Hoạch toán vào Số HĐ (nếu có)", "Số tiền", "Người nhận", "Tài khoản chi", "NCC", "SP"], money: ["Số tiền"], actions: ["Chi thanh toán", "Đối soát"] },
    { match: /chấm kpi|chitieudoanhso/i, title: ["Nv", "Nhan Vien", "Số HĐTH"], sub: ["Tháng", "năm", "Chốt tháng"], columns: ["Nv", "Nhan Vien", "Tháng", "Năm", "Chỉ tiêu", "dsth", "Doanh số tháng", "TỔNG KPI", "Số khm", "Số gd", "Số báo giá", "Số hđ", "Thưởng", "Mức thưởng dự kiến"], money: ["Chỉ tiêu", "dsth", "Doanh số tháng", "Thưởng", "Mức thưởng dự kiến"], status: ["đã chốt", "Chốt tháng"], actions: ["Xem KPI", "Chốt tháng"] },
    { match: /nhanvien/i, title: ["Ten"], sub: ["Chuc Vu", "Email"], columns: ["Ảnh", "Ten", "Chuc Vu", "Email", "So Dien Thoai", "Dia Chi", "Ngay Vao Lam", "DSTH", "Số đơn thực hiện"], money: ["DSTH"] },
    { match: /pháp nhân/i, title: ["Tên công ty"], sub: ["Mã số thuế", "Người đại diện"], columns: ["LOGO", "Tên công ty", "Mã số thuế", "Địa chỉ", "Người đại diện", "Chức vụ", "Số tài khoản", "ngân hàng", "Email nhân hoá đơn"] },
  ];

  const valueText = (value) => {
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ");
    if (value && typeof value === "object") {
      const id = value.tupleId || value.tuple_id || value.itemId;
      if (value.label && !(value.label === id && isOpaqueReference(id))) return value.label;
      if (state.referenceLabels[id]) return state.referenceLabels[id];
      if (isOpaqueReference(id)) return "Tham chiếu không còn tồn tại";
      return id || JSON.stringify(value);
    }
    if (typeof value === "string" && state.referenceLabels[value]) return state.referenceLabels[value];
    if (typeof value === "string" && isOpaqueReference(value)) return "Tham chiếu không còn tồn tại";
    return value ?? "";
  };
  const referenceId = (value) => value && typeof value === "object" ? (value.tupleId || value.tuple_id || value.itemId || "") : value ?? "";
  const isTechnicalField = (name) => String(name || "").startsWith("_") || /^[A-Z0-9_-]{16,}$/i.test(String(name || "")) || /^[a-f0-9]{20,}$/i.test(String(name || ""));
  const fieldType = (name) => state.fields.find((field) => field.fieldName === name)?.fieldType || "";
  const rowValue = (row, names) => {
    for (const name of names) {
      const value = row?.values?.[name];
      if (valueText(value) !== "") return value;
    }
    return "";
  };
  const currentConfig = (table = state.table, view = state.view) => VIEW_CONFIGS.find((config) => config.match.test(`${table || ""} ${view || ""}`)) || {};
  const isMoneyField = (name, config = currentConfig()) => (config.money || []).includes(name) || /tiền|giá|lợi nhuận|doanh số|công nợ|chi phí|thành tiền|thưởng|chỉ tiêu|dsth/i.test(name);
  const isStatusField = (name, config = currentConfig()) => (config.status || []).includes(name) || /trạng thái|phê duyệt|duyệt|status|quá hạn|đã giao|đã chốt/i.test(name);
  const numberValue = (value) => {
    const text = String(valueText(value)).replace(/[^\d.-]/g, "");
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = (value) => numberValue(value).toLocaleString("vi-VN") + " đ";
  const isCustomerTable = () => normalize(state.table) === "khachhang";
  const isProductTable = () => normalize(state.table) === "sanpham";
  const isDebtView = () => normalize(state.view) === "cong no";
  const isOrderTable = () => normalize(state.table) === "nhap don hang" && /hdkt/i.test(normalize(state.view));
  const isContactTable = () => normalize(state.table) === "nguoi lien he";
  const isTransactionTable = () => normalize(state.table) === "giao dich";
  const isMonthlyKpiView = () => normalize(state.table) === "cham kpi" && normalize(state.view) === "xem kpi thang";
  const isCurrentMonthKpiView = () => normalize(state.table) === "cham kpi" && normalize(state.view) === "xem kpi thang nay";
  const isManager = () => state.user?.role === "manager";
  const isImageField = (name) => /image|ảnh|logo/i.test(name);
  const isImageSource = (value) => /^https?:\/\//i.test(value) || /^[^?#]+\.(?:jpe?g|png|webp|gif|svg)$/i.test(value);
  const mediaUrl = (value) => /^https:\/\/baogia\.minhlongonline\.com\/api\/staff\/media-file\?key=[a-f0-9]{64}$/.test(value) ? value : `/api/vigifts/media?src=${encodeURIComponent(value)}`;
  const imageTag = (value, className = "vigifts-thumb") => `<img class="${className}" src="${esc(mediaUrl(value))}" alt="" loading="lazy">`;
  const UX_VIEW_META = {
    "Home": { icon: "fas fa-home-alt", menuOrder: 1, tableName: "Home" },
    "Khách hàng": { icon: "fas fa-users", menuOrder: 2, tableName: "KhachHang" },
    "HĐKT": { icon: "far fa-file-signature", menuOrder: 1, tableName: "Nhập đơn hàng" },
    "CÔNG NỢ": { icon: "fas fa-funnel-dollar", menuOrder: 2, tableName: "KhachHang" },
    "Đề xuất": { icon: "far fa-user-astronaut", menuOrder: 1, tableName: "SanPham" },
    "Người Liên Hệ": { icon: "fas fa-users", menuOrder: 2, tableName: "Người liên hệ" },
    "Xem kpi tháng": { icon: "fas fa-running", menuOrder: 3, tableName: "chấm kpi" },
    "Xem kpi tháng này": { icon: "fas fa-running", menuOrder: 4, tableName: "chấm kpi" },
    "Sản Phẩm": { icon: "far fa-boxes", menuOrder: 5, tableName: "SanPham" },
    "Giao dịch": { icon: "fas fa-inbox-out", menuOrder: 6, tableName: "Giao dịch" },
    "Báo giá": { icon: "far fa-file-check", menuOrder: 7, tableName: "Báo giá" },
    "Chi tiết sản phẩm": { icon: "far fa-dolly-flatbed-alt", menuOrder: 8, tableName: "Chi tiết đơn hàng" },
    "Lịch giao hàng": { icon: "fa-calendar", menuOrder: 9, tableName: "Chi tiết đơn hàng" },
    "Thanh toán": { icon: "fas fa-bow-arrow", menuOrder: 11, tableName: "Chi phí" },
    "Xem doanh năm": { icon: "fas fa-landmark", menuOrder: 12, tableName: "ChiTieuDoanhSo" },
    "Tỉ trọng đóng góp trong năm": { icon: "fas fa-chart-pie", menuOrder: 13, tableName: "ChiTieuDoanhSo" },
    "NhanVien": { icon: "fas fa-user-friends", menuOrder: 14, tableName: "NhanVien" },
    "Xem lợi nhuận": { icon: "fas fa-chart-bar", menuOrder: 14, tableName: "Nhập đơn hàng" },
    "Pháp nhân": { icon: "fas fa-cash-register", menuOrder: 15, tableName: "Pháp nhân" },
    "Assistant": { icon: "fa-microphone", menuOrder: 16, tableName: "SanPham" },
  };
  const FAST_ROUTES = {
    "khach hang": "/customers",
    "khachhang": "/customers",
    "san pham": "/products",
    "sản phẩm": "/products",
    "sanpham": "/products",
    "sp": "/products",
  };
  const fastRoute = (name) => FAST_ROUTES[normalize(name)];
  const displayName = (view) => {
    const raw = String(view.displayName || "").trim();
    if (!raw) return view.name;
    if (!raw.startsWith("=")) return raw;
    const expression = raw
      .slice(1)
      .replace(/MONTH\s*\(\s*TODAY\s*\(\s*\)\s*\)/gi, String(new Date().getMonth() + 1))
      .replace(/YEAR\s*\(\s*TODAY\s*\(\s*\)\s*\)/gi, String(new Date().getFullYear()));
    const parts = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < expression.length; index += 1) {
      const char = expression[index];
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === "&" && !quoted) {
        parts.push(current.trim());
        current = "";
      } else current += char;
    }
    parts.push(current.trim());
    const text = parts.map((part) => part.replace(/^"|"$/g, "").trim()).join("").trim();
    return text || view.name;
  };
  const viewAllowed = (view) => {
    const showIf = String(view.showIf || "");
    if (!showIf.trim()) return true;
    if (/Chuc Vu/i.test(showIf) && /=\s*"Manager"/i.test(showIf)) return isManager();
    return true;
  };
  const positionRank = (position) => ({ "left most": 0, left: 1, menu: 2 }[String(position || "").toLowerCase()] ?? 9);
  const uxMeta = (view) => UX_VIEW_META[view?.name] || {};
  const uxOrder = (view) => Number(view.menuOrder || uxMeta(view).menuOrder || view.viewOrder || 999);
  const rowId = (row) => row?.tupleId || row?.tuple_id || "";
  const customerFields = [
    ["TênKH", "Tên khách hàng", "text", true],
    ["Ma So Thue", "Mã số thuế", "text"],
    ["So Dien Thoai", "Số điện thoại", "tel"],
    ["Email", "Email", "email"],
    ["Dia Chi", "Địa chỉ", "text", false, true],
    ["Loai Khach Hang", "Loại khách hàng", "text"],
    ["Người liên hê", "Người liên hệ", "text"],
    ["Giới hạn công nợ", "Giới hạn công nợ", "number"],
    ["Số ngày công nợ", "Số ngày công nợ", "number"],
    ["Ghi chú", "Ghi chú", "text", false, true],
  ];
  const contactFields = [
    ["Tên liên hệ", "Tên người liên hệ", "text", true],
    ["Chức vụ", "Chức vụ", "text"],
    ["Số điẹn thoai", "Số điện thoại", "tel"],
    ["Email", "Email", "email"],
  ];
  const transactionFields = [
    ["Nôi dung", "Nội dung giao dịch", "textarea", true],
    ["Loại giao dịch", "Loại giao dịch", "select", true, ["Gọi điện thoại", "Email", "Gặp trực tiếp", "Zalo", "Khác"]],
    ["Kết quả", "Kết quả", "select", true, ["Đang tư vấn", "Hẹn lại", "Thành công", "Không thành công"]],
    ["Chăm sóc lần sau", "Chăm sóc lần sau", "date"],
    ["Nhắc tôi trước", "Nhắc tôi trước", "select", false, ["", "1 Ngày", "3 Ngày", "1 Tuần", "2 Tuần"]],
    ["Doanh số", "Doanh số", "number"],
  ];
  const statusTone = (text) => {
    const clean = normalize(text);
    if (/da duyet|hoan tat|da giao|da chot|hop le|paid|duyet/.test(clean)) return "ok";
    if (/doi|cho|dang|sap|theo doi|pending/.test(clean)) return "wait";
    if (/tu choi|qua han|can|thieu|chua|loi|khong/.test(clean)) return "bad";
    return "info";
  };
  const renderValue = (value, name, config = currentConfig()) => {
    const text = valueText(value);
    if (!text) return "";
    if (isImageField(name) && isImageSource(text)) return imageTag(text);
    if (isMoneyField(name, config) && Number.isFinite(numberValue(text)) && numberValue(text) !== 0) return `<span class="vigifts-money">${money(text)}</span>`;
    if (/FIELD_TYPE_FLOAT|FIELD_TYPE_INT|NUMBER/i.test(fieldType(name)) && Number.isFinite(Number(text))) return Number(text).toLocaleString("vi-VN");
    if (/ngày|thời gian|dấu thời gian/i.test(name) && Number.isFinite(Number(text)) && Number(text) > 25000 && Number(text) < 70000) {
      const serial = Number(text);
      const hasTime = /thời gian/i.test(name) && Math.abs(serial - Math.trunc(serial)) > 0.00001;
      return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", ...(hasTime ? { timeStyle: "short" } : {}) }).format(new Date((serial - 25569) * 86400000));
    }
    if (isStatusField(name, config)) return `<span class="vigifts-badge ${statusTone(text)}">${esc(text)}</span>`;
    return esc(text);
  };
  const pickColumns = (fields, viewColumns = [], config = currentConfig()) => {
    const names = fields.map((field) => field.fieldName);
    const picked = [];
    for (const name of config.columns || []) if (names.includes(name) && !picked.includes(name)) picked.push(name);
    if (!(config.columns || []).length) for (const name of viewColumns || []) if (names.includes(name) && !picked.includes(name) && !isTechnicalField(name) && picked.length < 12) picked.push(name);
    const important = ["TênKH", "Tên khách hàng", "Tên NCC", "Ten", "Tên liên hệ", "Số HĐ", "Số báo giá", "MÃ KH", "Ma So Thue", "So Dien Thoai", "Email", "Trạng thái", "Phê Duyệt", "Phê duyệt", "Nhân viên phụ trách"];
    if (picked.length < 4) for (const name of important) if (names.includes(name) && !picked.includes(name)) picked.push(name);
    if (picked.length < 4) for (const name of names) if (picked.length < 10 && !picked.includes(name) && !isTechnicalField(name)) picked.push(name);
    return picked.slice(0, 12);
  };
  function renderNotReady(data) {
    $("vigiftsStatus").textContent = "Chưa sẵn sàng";
    const importer = isManager() ? `<div class="vigifts-import"><p>Dữ liệu được nạp thẳng vào kho CRM riêng theo từng lô, không công khai file export.</p><button id="vigiftsImportOpen" type="button">Nạp bản export AppSheet</button><input id="vigiftsImportFolder" type="file" webkitdirectory directory multiple hidden><small>Chọn toàn bộ thư mục <strong>vigifts</strong> gồm <code>manifest.json</code> và thư mục <code>tables</code>. Đồng bộ chỉ bổ sung/cập nhật, không tự xóa dữ liệu đang có trên web.</small></div>` : "";
    $("vigiftsContent").innerHTML = `<div class="vigifts-empty"><h3>Chưa nạp dữ liệu AppSheet vào DB web</h3><p>${esc(data.message || "Dữ liệu CRM cần được nạp vào D1 production trước khi xem bản mirror live.")}</p>${importer}</div>`;
  }

  async function importSnapshotDirectory(input) {
    const files = [...(input.files || [])];
    const fileFor = (suffix) => files.find((file) => file.webkitRelativePath.endsWith(suffix) || file.name === suffix.split("/").pop());
    const manifestFile = fileFor("manifest.json");
    if (!manifestFile) throw Error("Không tìm thấy manifest.json. Hãy chọn toàn bộ thư mục export vigifts.");
    const manifest = JSON.parse(await manifestFile.text());
    if (!Array.isArray(manifest.tables) || !manifest.tables.length) throw Error("Manifest AppSheet không có danh sách bảng.");
    if (!confirm(`Nạp ${manifest.tables.length} bảng AppSheet vào kho CRM riêng? Dữ liệu web hiện có sẽ được cập nhật theo mã dòng, không tự xóa.`)) return;
    const progress = $("vigiftsContent");
    let completed = 0;
    const total = manifest.tables.reduce((sum, table) => sum + Number(table.rows || 0), 0);
    for (const [tableIndex, table] of manifest.tables.entries()) {
      const metaFile = fileFor(`tables/${table.safeName}.meta.json`);
      const rowsFile = fileFor(`tables/${table.safeName}.jsonl`);
      if (!metaFile || !rowsFile) throw Error(`Thiếu dữ liệu bảng ${table.name}.`);
      const meta = JSON.parse(await metaFile.text());
      const lines = (await rowsFile.text()).split(/\r?\n/).filter(Boolean);
      for (let offset = 0; offset < Math.max(lines.length, 1); offset += 50) {
        const rows = lines.slice(offset, offset + 50).map((line) => JSON.parse(line));
        progress.innerHTML = `<div class="vigifts-empty"><h3>Đang nạp dữ liệu AppSheet</h3><p>${esc(table.name)}: ${completed.toLocaleString("vi-VN")} / ${total.toLocaleString("vi-VN")} dòng.</p></div>`;
        await api("/import-snapshot", { method: "POST", body: JSON.stringify({
          manifest: { title: "VIGIFTS CRM", sourceAppId: "ad0117e6-9c42-465a-bdfa-b31e90b35248", sourceVersion: "AppSheet export", exportedAt: manifest.exportedAt || "" },
          table,
          fields: offset === 0 ? (meta.fields || []) : [],
          rows,
          offset,
          total: lines.length,
          firstTable: tableIndex === 0 && offset === 0,
        }) });
        completed += rows.length;
      }
    }
    toast(`Đã nạp ${completed.toLocaleString("vi-VN")} dòng từ AppSheet.`);
    await load();
  }
  function renderSummary(data) {
    state.summary = data;
    $("vigiftsStatus").textContent = `${data.fallback ? "Snapshot export" : "AppSheet export"} ${data.app.exportedAt || ""}`;
    $("vigiftsKpis").innerHTML = [
      ["Bảng", data.counts.tables],
      ["Dòng dữ liệu", data.counts.rows],
      ["View", data.counts.views],
      ["Action", data.counts.actions],
      ["Bot", data.counts.bots],
    ].map(([label, value]) => `<article><span>${esc(label)}</span><strong>${Number(value || 0).toLocaleString("vi-VN")}</strong></article>`).join("");
    const mainViews = data.views.filter((view) => ["left", "left most", "menu"].includes(view.position) && viewAllowed(view))
      .sort((a, b) => positionRank(a.position) - positionRank(b.position) || uxOrder(a) - uxOrder(b) || String(a.name).localeCompare(String(b.name), "vi"))
      .slice(0, 40);
    if (!mainViews.some((view) => view.name === "Nhiệm vụ hôm nay")) {
      const todayView = data.views.find((view) => view.name === "Nhiệm vụ hôm nay") || { name: "Nhiệm vụ hôm nay", displayName: "Việc hôm nay", tableName: "Task", position: "ref" };
      const homeIndex = mainViews.findIndex((view) => view.name === "Home");
      mainViews.splice(homeIndex < 0 ? 0 : homeIndex + 1, 0, todayView);
    }
    const tableByName = new Set((data.tables || []).map((table) => table.name));
    $("vigiftsViews").innerHTML = mainViews.map((view) => {
      const meta = uxMeta(view);
      const rawTableName = view.tableName || (tableByName.has(view.name) ? view.name : "");
      const tableName = tableByName.has(rawTableName) || rawTableName === "Home" ? rawTableName : meta.tableName || rawTableName;
      const label = displayName(view);
      const today = view.name === "Nhiệm vụ hôm nay";
      const route = fastRoute(view.name) || fastRoute(label);
      const attrs = route ? `data-fast-route="${esc(route)}"` : today ? 'data-today-view="true"' : `data-table="${esc(tableName)}" data-view="${esc(view.name)}"`;
      return `<button type="button" ${attrs} ${route || tableName || today ? "" : "disabled"}>${navIcon(today ? "Việc hôm nay" : label, view.icon || meta.icon)}<span class="vigifts-nav-label">${esc(today ? "Việc hôm nay" : label)}</span><small>${esc(route ? "Trang nhanh" : today ? "Dashboard" : tableName || view.actionType || view.position)}</small></button>`;
    }).join("");
    const footer = document.getElementById("vigiftsSidebarUser");
    if (footer) footer.innerHTML = `<span>${esc(state.user?.name || state.user?.email || "VIGIFTS")}</span><small>${esc(state.user?.email || state.user?.role || "AppSheet mirror")}</small>`;
    const requested = new URLSearchParams(location.search);
    const requestedTable = requested.get("table");
    const requestedView = requested.get("view");
    const first = requestedTable && tableByName.has(requestedTable)
      ? { tableName: requestedTable, name: requestedView || requestedTable }
      : mainViews.find((view) => view.name === "Home") || mainViews.find((view) => view.tableName || tableByName.has(view.name)) || data.tables[0];
    if (first?.tableName) loadTable(first.tableName, first.name);
    else if (tableByName.has(first?.name)) loadTable(first.name, first.name);
    else if (first?.name) loadTable(first.name, first.name);
  }
  function setActiveNav(tableName, viewName) {
    document.querySelectorAll("#vigiftsViews button").forEach((button) => {
      button.classList.toggle("active", button.dataset.table === tableName && button.dataset.view === viewName);
    });
  }
  async function loadTable(tableName, viewName = tableName) {
    if (!tableName) return;
    state.table = tableName;
    state.view = viewName;
    setActiveNav(tableName, viewName);
    const currentTitle = viewName || tableName;
    $("vigiftsTitle").textContent = currentTitle;
    $("vigiftsMobileTitle").textContent = currentTitle;
    document.querySelector(".vigifts-shell")?.classList.toggle("vigifts-home-mode", /^home$/i.test(tableName));
    document.querySelector(".vigifts-shell")?.classList.toggle("vigifts-customer-mode", normalize(tableName) === "khachhang");
    document.querySelector(".vigifts-shell")?.classList.toggle("vigifts-debt-mode", normalize(viewName) === "cong no");
    document.querySelector(".vigifts-shell")?.classList.remove("vigifts-today-mode");
    document.querySelectorAll("[data-mobile-view]").forEach((item) => item.classList.toggle("active", normalize(item.dataset.mobileView) && normalize(currentTitle).includes(normalize(item.dataset.mobileView))));
    const topSearch = $("vigiftsTopSearch");
    if (topSearch) topSearch.placeholder = `Tìm kiếm ${viewName || tableName}`;
    $("vigiftsContent").innerHTML = "<p>Đang tải bảng...</p>";
    const q = $("vigiftsGlobalSearch").value.trim();
    const orderView = normalize(tableName) === "nhap don hang" && /hdkt/i.test(normalize(viewName));
    const debtView = normalize(viewName) === "cong no";
    const data = await api(`/table?name=${encodeURIComponent(tableName)}&view=${encodeURIComponent(viewName || "")}&limit=${orderView || debtView ? 2000 : 100}&q=${encodeURIComponent(q)}`);
    if (!data.ready) return renderNotReady(data);
    state.rows = data.rows || [];
    state.currentData = data;
    state.fields = data.fields || [];
    const config = currentConfig(tableName, viewName);
    state.columns = pickColumns(data.fields, data.columns, config);
    if (["khachhang", "cham kpi"].includes(normalize(tableName)) && !state.staffById) {
      const staff = await api("/table?name=NhanVien&limit=500");
      state.staffById = new Map((staff.rows || []).map((row) => [row.tupleId || row.tuple_id, row]));
    }
    if (/^home$/i.test(tableName)) return renderHome(data);
    renderTable(data, config);
  }
  function viewForName(name) {
    const target = normalize(name);
    return [...document.querySelectorAll("#vigiftsViews button")].find((button) => normalize(button.dataset.view).includes(target) || normalize(button.textContent).includes(target));
  }
  function renderHome(data) {
    const groups = [
      {
        title: "1. Công việc",
        items: [
          ["📋", "Việc hôm nay", "Nhiệm vụ hôm nay"],
          ["🧾", "Giao dịch", "Giao dịch"],
          ["🚚", "Lịch giao hàng", "Lịch giao hàng"],
          ["📨", "Đề xuất", "Đề xuất"],
        ],
      },
      {
        title: "2. Danh mục",
        items: [
          ["🛍️", "Nhà cung cấp", "Nhà cung cấp"],
          ["👥", "Khách hàng", "Khách hàng"],
          ["📇", "Liên hệ", "Người Liên Hệ"],
          ["🎁", "Sản phẩm", "Sản Phẩm"],
        ],
      },
      {
        title: "3. Bán hàng",
        items: [
          ["🧮", "Báo giá", "Báo giá"],
          ["📄", "HĐKT", "HĐKT"],
          ["💰", "CÔNG NỢ", "CÔNG NỢ"],
          ["📊", "Xem KPI tháng", "Xem kpi tháng"],
        ],
      },
    ];
    const html = groups.map((group) => `<section class="vigifts-home-section"><h3>${esc(group.title)}</h3><div>${group.items.map(([icon, label, target]) => {
      const route = fastRoute(target) || fastRoute(label);
      return `<button class="vigifts-home-card" type="button" ${route ? `data-fast-route="${esc(route)}"` : `data-home-target="${esc(target)}"`}><span>${esc(icon)}</span><strong>${esc(label)}</strong></button>`;
    }).join("")}</div></section>`).join("");
    $("vigiftsContent").innerHTML = `<div class="vigifts-home-appsheet">${html}</div>`;
  }
  const TODAY_PANELS = [
    { id: "reminders", title: "Tạo ghi chú - Nhắc việc", table: "Nhắc hẹn", view: "Tạo ghi chú - Nhắc việc", kind: "cards", titles: ["Nội dung"], meta: ["Giờ", "Ngày nhắc"], add: true },
    { id: "customers", title: "KH đợi duyệt", table: "KhachHang", view: "KH đợi duyệt", query: "Đợi duyệt", titles: ["TênKH", "MÃ KH"], meta: ["MÃ KH", "Phê Duyệt"], add: true, filter: (row) => /doi duyet/.test(normalize(valueText(row.values["Phê Duyệt"]))) },
    { id: "products", title: "Sản phẩm đợi duyệt", table: "SanPham", view: "Sản phẩm đợi duyệt", query: "Chưa duyệt", kind: "products", titles: ["Tên sản phẩm", "Mã hàng"], meta: ["Mã hàng", "Giá bán"], add: true, filter: (row) => /chua duyet|doi duyet/.test(normalize(valueText(row.values["Phê duyệt"]))) },
    { id: "quotes", title: "Báo giá đợi duyệt", table: "Báo giá", view: "Báo giá đợi duyệt", query: "Đợi duyệt giá", titles: ["Khách hàng", "Số báo giá"], meta: ["Ghi chú", "Nhân viên phụ trách"], add: true, filter: (row) => /doi duyet/.test(normalize(valueText(row.values["Trạng thái"]))) },
    { id: "approvals", title: "HĐ cần phê duyệt", table: "Nhập đơn hàng", view: "HĐ cần phê duyệt", query: "Đợi duyệt", titles: ["Số HĐ"], meta: ["KH_NDP", "Thành tiền (+thuế)"], add: true, filter: (row) => /doi duyet/.test(normalize(valueText(row.values["Phê duyệt"]))) },
    { id: "statuses", title: "Chi tiết sản phẩm", table: "Chi tiết đơn hàng", view: "Chi tiết sản phẩm", kind: "statuses" },
    { id: "delivery", title: "SP đến hạn giao", table: "Chi tiết đơn hàng", view: "SP đến hạn giao", query: "Đợi giao hàng", titles: ["Mô tả sản phẩm", "Sản phẩm", "Số HĐ"], meta: ["Ngày hẹn giao", "Status"], filter: (row) => !/da giao/.test(normalize(valueText(row.values.Status))) },
    { id: "invoices", title: "HĐKT chưa xuất HĐ", table: "Nhập đơn hàng", view: "HĐKT chưa xuất HĐ", titles: ["Số HĐ"], meta: ["KH_NDP", "Trạng thái thanh toán"], add: true, filter: (row) => !valueText(row.values["Số Hoá đơn"]) },
    { id: "due-debt", title: "Công nợ đến hạn", table: "Nhập đơn hàng", view: "Công nợ đến hạn", query: "Chưa thanh toán", titles: ["Số HĐ"], meta: ["KH_NDP", "Cảnh báo quá hạn công nợ"], add: true, filter: (row) => !/da thanh toan/.test(normalize(valueText(row.values["Trạng thái thanh toán"]))) },
    { id: "all-debt", title: "Công nợ tổng", table: "Nhập đơn hàng", view: "Công nợ tổng", query: "Chưa thanh toán", titles: ["Số HĐ"], meta: ["KH_NDP", "Trạng thái thanh toán"], add: true, filter: (row) => !/da thanh toan/.test(normalize(valueText(row.values["Trạng thái thanh toán"]))) },
  ];
  const todayPanelTools = (panel) => `<div class="vigifts-panel-tools">${panel.add ? '<button type="button" class="vigifts-panel-add" disabled><b>＋</b> Tạo Mới</button>' : ""}<button type="button" aria-label="Lọc" disabled>≡</button><button type="button" data-today-open="${esc(panel.id)}" aria-label="Chi tiết">↗</button></div>`;
  const todayRowTitle = (row, panel) => valueText(rowValue(row, panel.titles || [])) || "Chưa có tiêu đề";
  const formatTodayMeta = (value, name) => {
    const text = valueText(value);
    const numeric = Number(text);
    if (name === "Giờ" && Number.isFinite(numeric) && numeric >= 0 && numeric < 1) {
      const seconds = Math.round(numeric * 86400);
      return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
    }
    if (/ngày/i.test(name) && Number.isFinite(numeric) && numeric > 25000 && numeric < 70000) {
      return new Intl.DateTimeFormat("vi-VN").format(new Date((numeric - 25569) * 86400000));
    }
    return text;
  };
  const todayRowMeta = (row, panel) => (panel.meta || []).map((name) => formatTodayMeta(row.values[name], name)).filter(Boolean).slice(0, 2).join(" · ");
  function renderTodayPanel(panel, result) {
    const sourceRows = result?.rows || [];
    const rows = (result?.filtered ? sourceRows : panel.filter ? sourceRows.filter(panel.filter) : sourceRows).slice(0, panel.kind === "products" ? 8 : 10);
    let body = "";
    if (panel.kind === "statuses") {
      const counts = new Map();
      sourceRows.forEach((row) => {
        const status = valueText(row.values.Status) || "Chưa cập nhật";
        counts.set(status, (counts.get(status) || 0) + 1);
      });
      body = `<div class="vigifts-status-list"><button type="button"><span>All</span><b>${Number(result?.total || sourceRows.length).toLocaleString("vi-VN")}</b><i>›</i></button>${[...counts.entries()].slice(0, 6).map(([label, count], index) => `<button type="button" data-today-open="${esc(panel.id)}"><span><em class="tone-${index % 4}"></em>${esc(label)}</span><b>${count.toLocaleString("vi-VN")}</b><i>›</i></button>`).join("")}</div>`;
    } else if (!rows.length) {
      body = '<div class="vigifts-panel-empty">No items</div>';
    } else {
      body = `<div class="vigifts-panel-list ${panel.kind === "products" ? "is-products" : ""}">${rows.map((row) => {
        const title = todayRowTitle(row, panel);
        const meta = todayRowMeta(row, panel);
        const image = valueText(row.values["Ảnh"] || row.values.Logo);
        const amount = valueText(row.values["Thành tiền (+thuế)"] || row.values["Thành tiền (+VAT)"] || row.values["Giá bán"]);
        return `<button type="button" data-today-open="${esc(panel.id)}" class="vigifts-panel-row">${panel.kind === "products" ? (image && /^https?:/i.test(image) ? `<img src="${esc(image)}" alt="">` : '<span class="vigifts-row-thumb">▧</span>') : '<span class="vigifts-row-mark">●</span>'}<span class="vigifts-row-copy"><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span>${amount ? `<b class="vigifts-row-amount">${esc(amount)}</b>` : ""}<i>›</i></button>`;
      }).join("")}</div>`;
    }
    return `<section class="vigifts-today-panel"><header><h3>${esc(panel.title)}</h3>${todayPanelTools(panel)}</header><div class="vigifts-panel-body">${body}</div></section>`;
  }
  async function loadTodayDashboard() {
    state.table = "Task";
    state.view = "Nhiệm vụ hôm nay";
    state.rows = [];
    document.querySelectorAll("#vigiftsViews button").forEach((button) => button.classList.toggle("active", button.hasAttribute("data-today-view")));
    document.querySelector(".vigifts-shell")?.classList.remove("vigifts-home-mode");
    document.querySelector(".vigifts-shell")?.classList.remove("vigifts-customer-mode");
    document.querySelector(".vigifts-shell")?.classList.add("vigifts-today-mode");
    $("vigiftsTitle").textContent = "Nhiệm vụ hôm nay";
    $("vigiftsMobileTitle").textContent = "Nhiệm vụ hôm nay";
    if ($("vigiftsTopSearch")) $("vigiftsTopSearch").placeholder = "Tìm kiếm Nhiệm vụ hôm nay";
    $("vigiftsContent").innerHTML = '<div class="vigifts-today-loading">Đang tải Nhiệm vụ hôm nay...</div>';
    const q = $("vigiftsGlobalSearch").value.trim();
    try {
      const [account, staff, reminders, customers, products, quotes, orders, details, payments] = await Promise.all([
        staffApi("/me"),
        api("/table?name=NhanVien&limit=100"),
        api(`/table?name=${encodeURIComponent("Nhắc hẹn")}&limit=200&q=${encodeURIComponent(q)}`),
        api(`/table?name=KhachHang&limit=2000&q=${encodeURIComponent(q || "Đợi duyệt")}`),
        api(`/table?name=SanPham&limit=2000&q=${encodeURIComponent(q || "Chưa duyệt")}`),
        api(`/table?name=${encodeURIComponent("Báo giá")}&limit=2000&q=${encodeURIComponent(q || "Đợi duyệt giá")}`),
        api(`/table?name=${encodeURIComponent("Nhập đơn hàng")}&limit=2000`),
        api(`/table?name=${encodeURIComponent("Chi tiết đơn hàng")}&limit=2000`),
        api(`/table?name=${encodeURIComponent("Sổ thu chi")}&limit=2000`),
      ]);
      const currentEmail = normalize(account.user?.email);
      const employee = staff.rows.find((row) => normalize(valueText(row.values.Email)) === currentEmail);
      const employeeId = employee?.tuple_id || employee?.tupleId || "";
      const employeeName = valueText(employee?.values?.Ten);
      const isManager = account.user?.role === "manager" || normalize(valueText(employee?.values?.["Chuc Vu"])) === "manager";
      const belongsToCurrentUser = (row, field) => isManager || (employeeId && referenceId(row.values[field]) === employeeId);
      const statusIs = (row, field, expected) => normalize(valueText(row.values[field])) === normalize(expected);
      const today = new Date();
      const todaySerial = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000) + 25569;
      const detailsByOrder = new Map();
      details.rows.forEach((row) => {
        const orderId = referenceId(row.values["Số HĐ"]);
        if (!detailsByOrder.has(orderId)) detailsByOrder.set(orderId, []);
        detailsByOrder.get(orderId).push(row);
      });
      const paidByOrder = new Map();
      payments.rows.forEach((row) => {
        const orderId = referenceId(row.values["Số HĐ"]);
        paidByOrder.set(orderId, (paidByOrder.get(orderId) || 0) + numberValue(row.values["Số tiền thanh toán"]));
      });
      const orderDetails = (row) => detailsByOrder.get(row.tuple_id || row.tupleId) || [];
      const allDelivered = (row) => orderDetails(row).every((detail) => statusIs(detail, "Status", "Đã giao hàng"));
      const paymentState = (row) => {
        const total = numberValue(row.values["Thành tiền (+thuế)"]);
        const paid = paidByOrder.get(row.tuple_id || row.tupleId) || 0;
        if (total > 0 && paid >= total - 0.5) return { paid: true, label: "Đã thanh toán", amount: paid };
        if (paid > 0) return { paid: false, label: `Đã tạm ứng ${money(paid)}`, amount: paid };
        return { paid: false, label: "Chưa thanh toán", amount: 0 };
      };
      const enrichOrder = (row) => ({ ...row, values: { ...row.values, "Trạng thái thanh toán": paymentState(row).label } });
      const panelRows = {
        reminders: reminders.rows.filter((row) => !employeeName || normalize(valueText(row.values["Nhân viên"])) === normalize(employeeName)),
        customers: customers.rows.filter((row) => statusIs(row, "Phê Duyệt", "Đợi duyệt")),
        products: products.rows.filter((row) => statusIs(row, "Phê duyệt", "Chưa duyệt") && belongsToCurrentUser(row, "NV tạo")),
        quotes: quotes.rows.filter((row) => statusIs(row, "Trạng thái", "Đợi duyệt giá") && belongsToCurrentUser(row, "Nhân viên phụ trách")),
        approvals: orders.rows.filter((row) => statusIs(row, "Phê duyệt", "Đợi duyệt") && orderDetails(row).length > 0 && belongsToCurrentUser(row, "Nhân viên phụ trách")).map(enrichOrder),
        statuses: details.rows,
        delivery: details.rows.filter((row) => statusIs(row, "Status", "Đợi giao hàng") && numberValue(row.values["Ngày hẹn giao"]) > 0 && numberValue(row.values["Ngày hẹn giao"]) <= todaySerial + 3),
        invoices: orders.rows.filter((row) => !valueText(row.values["Số Hoá đơn"]) && allDelivered(row)).map(enrichOrder),
        "due-debt": orders.rows.filter((row) => {
          const signed = numberValue(row.values["dấu thời gian"]);
          const term = numberValue(row.values["Hạn thanh toán"]);
          return !paymentState(row).paid && signed > 0 && valueText(row.values["Hạn thanh toán"]) !== "" && term >= 0 && term <= 3650 && signed + term <= todaySerial + 5 && allDelivered(row);
        }).map(enrichOrder),
        "all-debt": orders.rows.filter((row) => !paymentState(row).paid).map(enrichOrder),
      };
      if (q) {
        const needle = normalize(q);
        Object.keys(panelRows).forEach((key) => {
          panelRows[key] = panelRows[key].filter((row) => normalize(JSON.stringify(row.values || {})).includes(needle));
        });
      }
      const sourceById = { reminders, customers, products, quotes, approvals: orders, statuses: details, delivery: details, invoices: orders, "due-debt": orders, "all-debt": orders };
      state.todayData = TODAY_PANELS.map((panel) => ({ panel, data: { ...sourceById[panel.id], rows: panelRows[panel.id], total: panelRows[panel.id].length, filtered: true } }));
      $("vigiftsContent").innerHTML = `<div class="vigifts-today-dashboard">${state.todayData.map(({ panel, data }) => renderTodayPanel(panel, data)).join("")}</div>`;
    } catch (error) {
      $("vigiftsContent").innerHTML = `<div class="vigifts-empty"><h3>Không tải được Nhiệm vụ hôm nay</h3><p>${esc(error.message)}</p></div>`;
    }
  }
  function renderSummaryCards(data, config) {
    const rows = state.rows;
    const statusFields = config.status || [];
    const moneyFields = config.money || [];
    const pending = rows.filter((row) => statusFields.some((field) => /đợi|chờ|cần|pending|chưa/i.test(valueText(row.values[field])))).length;
    const moneyField = moneyFields.find((field) => rows.some((row) => numberValue(row.values[field]) > 0));
    const totalMoney = moneyField ? rows.reduce((sum, row) => sum + numberValue(row.values[moneyField]), 0) : 0;
    return `<div class="vigifts-view-summary">
      <article><span>Tổng dòng</span><strong>${Number(data.total || rows.length).toLocaleString("vi-VN")}</strong></article>
      <article><span>Đang hiển thị</span><strong>${rows.length.toLocaleString("vi-VN")}</strong></article>
      <article><span>Cần xử lý</span><strong>${pending.toLocaleString("vi-VN")}</strong></article>
      <article><span>${esc(moneyField || "Giá trị")}</span><strong>${moneyField ? money(totalMoney) : "-"}</strong></article>
    </div>`;
  }
  const customerOwner = (row) => {
    const raw = rowValue(row, ["NV phu trach", "Nhân viên phụ trách", "Nhan Vien", "Nhân viên", "NV tạo"]);
    const tupleId = raw && typeof raw === "object" ? raw.tupleId : "";
    const staff = tupleId ? state.staffById?.get(tupleId) : null;
    if (staff) return valueText(staff.values?.Ten) || valueText(staff.values?.Email) || tupleId;
    const text = valueText(raw);
    return text || "Chưa phân công";
  };
  const customerOwnerImage = (owner) => {
    const staff = [...(state.staffById?.values?.() || [])].find((row) => customerOwner({ values: { "NV phu trach": { tupleId: row.tupleId || row.tuple_id } } }) === owner);
    const image = valueText(staff?.values?.["Ảnh"]);
    return isImageSource(image) ? mediaUrl(image) : "";
  };
  const customerRevenue = (row) => numberValue(rowValue(row, ["Tổng doanh số mua hàng", "Doanh số", "DS", "dsth"]));
  const customerDebt = (row) => numberValue(rowValue(row, ["Cong No", "Tổng số tiền còn lại", "Nợ còn lại", "Công nợ"]));
  const customerLogo = (row) => valueText(rowValue(row, ["Logo", "Ảnh", "Hình ảnh", "Image"]));
  const customerApproval = (row) => normalize(valueText(rowValue(row, ["Phê Duyệt", "Phê duyệt", "Trạng thái duyệt"])));
  const customerDebtTone = (revenue, debt) => {
    if (debt <= 0) return revenue > 0 ? "ok" : "neutral";
    if (revenue > 0 && debt >= revenue * 0.8) return "bad";
    return "warn";
  };
  const ownerInitials = (name) => valueText(name).split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase() || "NV";
  const customerFilterOptions = (rows) => {
    const owners = [...new Set(rows.map(customerOwner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    return owners.map((owner) => `<option value="${esc(owner)}"${state.customerFilters.owner === owner ? " selected" : ""}>${esc(owner)}</option>`).join("");
  };
  const customerFilterBar = (rows, filteredRows) => {
    const { approval, purchase, owner } = state.customerFilters;
    return `<div class="vigifts-customer-filters">
      <label><span>Duyệt</span><select data-customer-filter="approval">
        <option value="all"${approval === "all" ? " selected" : ""}>Tất cả</option>
        <option value="approved"${approval === "approved" ? " selected" : ""}>Đã duyệt</option>
        <option value="pending"${approval === "pending" ? " selected" : ""}>Đợi duyệt</option>
      </select></label>
      <label><span>Mua hàng</span><select data-customer-filter="purchase">
        <option value="all"${purchase === "all" ? " selected" : ""}>Tất cả</option>
        <option value="bought"${purchase === "bought" ? " selected" : ""}>Đã mua hàng</option>
        <option value="not-bought"${purchase === "not-bought" ? " selected" : ""}>Chưa mua hàng</option>
      </select></label>
      <label><span>NV phụ trách</span><select data-customer-filter="owner">
        <option value="all"${owner === "all" ? " selected" : ""}>Tất cả nhân viên</option>
        ${customerFilterOptions(rows)}
      </select></label>
      <button type="button" data-customer-filter-reset>Đặt lại</button>
      <strong>${filteredRows.length.toLocaleString("vi-VN")}/${rows.length.toLocaleString("vi-VN")}</strong>
    </div>`;
  };
  const filteredCustomerRows = () => state.rows.map((row, index) => ({ row, index })).filter(({ row }) => {
    const { approval, purchase, owner } = state.customerFilters;
    const approved = /da duyet/.test(customerApproval(row));
    const bought = customerRevenue(row) > 0;
    if (approval === "approved" && !approved) return false;
    if (approval === "pending" && approved) return false;
    if (purchase === "bought" && !bought) return false;
    if (purchase === "not-bought" && bought) return false;
    if (owner !== "all" && customerOwner(row) !== owner) return false;
    return true;
  });
  function renderCustomerCards(data) {
    const groups = new Map();
    const filteredRows = filteredCustomerRows();
    filteredRows.forEach(({ row, index }) => {
      const owner = customerOwner(row);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push({ row, index });
    });
    const sections = [...groups.entries()].map(([owner, items]) => {
      const cards = items.map(({ row, index }) => {
        const title = valueText(rowValue(row, ["TênKH", "Tên khách hàng", "Ten"])) || "Khách hàng";
        const revenue = customerRevenue(row);
        const debt = customerDebt(row);
        const tone = customerDebtTone(revenue, debt);
        const logo = customerLogo(row);
        const logoHtml = isImageSource(logo)
          ? imageTag(logo, "vigifts-customer-logo")
          : `<span class="vigifts-customer-logo fallback">${esc(ownerInitials(title))}</span>`;
        const meta = debt > 0
          ? `DS: ${money(revenue)} - Nợ còn lại: ${money(debt)}`
          : `DS: ${money(revenue)}`;
        return `<button type="button" class="vigifts-customer-card ${tone}" data-row-index="${index}">
          ${logoHtml}
          <span class="vigifts-customer-copy"><strong>${esc(title.toUpperCase())}</strong><em>${esc(meta)}</em></span>
        </button>`;
      }).join("");
      const ownerImage = customerOwnerImage(owner);
      return `<section class="vigifts-customer-section">
        <header>
          <button type="button" class="vigifts-customer-back" disabled>‹</button>
          <h3>Nhân viên phụ trách</h3>
        </header>
        <div class="vigifts-customer-owner">
          ${ownerImage ? `<img src="${esc(ownerImage)}" alt="">` : `<span>${esc(ownerInitials(owner))}</span>`}
          <strong>${esc(owner)}</strong>
          <b>${items.length.toLocaleString("vi-VN")}</b>
          <i>›</i>
        </div>
        <div class="vigifts-customer-list">${cards}</div>
      </section>`;
    }).join("");
    $("vigiftsContent").innerHTML = `${customerFilterBar(state.rows, filteredRows)}<div class="vigifts-customer-screen">${sections || '<div class="vigifts-panel-empty">Không có khách hàng phù hợp bộ lọc.</div>'}</div><button type="button" class="vigifts-floating-add" data-customer-create aria-label="Tạo khách hàng">+</button>`;
  }
  function renderTable(data, config) {
    if (["Xem doanh năm", "Tỉ trọng đóng góp trong năm", "Xem lợi nhuận"].includes(state.view)) return renderAppSheetChart(data);
    if (isMonthlyKpiView() || isCurrentMonthKpiView()) return renderMonthlyKpiCards(data);
    if (isDebtView()) return renderDebtCards(data);
    if (isCustomerTable()) return renderCustomerCards(data);
    if (isProductTable()) return renderProductCards(data);
    if (isOrderTable()) return renderOrderCards(data, config);
    const columns = state.columns;
    const head = columns.map((name) => `<th>${esc(name)}</th>`).join("");
    const rows = state.rows.map((row, index) => `<tr data-row-index="${index}">${columns.map((name, cellIndex) => {
      const cell = renderValue(row.values[name], name, config) || `<span class="vigifts-muted">-</span>`;
      if (cellIndex === 0) {
        const title = valueText(rowValue(row, config.title || [name])) || valueText(row.values[name]);
        const sub = (config.sub || []).map((field) => valueText(row.values[field])).filter(Boolean).slice(0, 2).join(" · ");
        return `<td class="vigifts-primary-cell"><strong>${esc(title || "-")}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</td>`;
      }
      return `<td>${cell}</td>`;
    }).join("")}</tr>`).join("");
    const customer = isCustomerTable();
    const contact = isContactTable();
    const transaction = isTransactionTable();
    const actions = customer
      ? `<button type="button" class="vigifts-primary-action" data-customer-create>+ Tạo khách hàng</button>`
      : contact ? `<button type="button" class="vigifts-primary-action" data-contact-create>+ Tạo người liên hệ</button>`
      : transaction ? `<button type="button" class="vigifts-primary-action" data-transaction-create>+ Tạo giao dịch</button>`
      : (config.actions || []).map((label) => `<button type="button" disabled>${esc(label)}</button>`).join("") || (data.actions || []).slice(0, 6).map((action) => `<button type="button" disabled>${esc(action.displayName || action.name || action.actionName)}</button>`).join("");
    const actionNote = customer ? "Mã khách hàng được sinh tự động · Trạng thái ban đầu: Đợi duyệt" : contact ? "Liên kết trực tiếp với khách hàng · Có thao tác gọi và gửi email" : transaction ? "Tự ghi thời gian, nhân viên phụ trách, tháng và năm · Áp dụng giới hạn AppSheet từ ngày 25" : "Các thao tác được áp dụng theo trạng thái dữ liệu và quyền tài khoản.";
    $("vigiftsContent").innerHTML = `${renderSummaryCards(data, config)}<div class="vigifts-table-head"><div><p>${esc(data.table.name)}${data.viewInfo?.sourceKind === "slice" ? ` / ${esc(data.viewInfo.tableOrFolderName)}` : ""}</p><h3>${Number(data.total || 0).toLocaleString("vi-VN")} dòng</h3></div></div>${actions ? `<div class="vigifts-row-actions">${actions}<small>${actionNote}</small></div>` : ""}<div class="vigifts-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length || 1}">Không có dữ liệu.</td></tr>`}</tbody></table></div>`;
  }
  function kpiMonthKey(row) {
    const date = numberValue(row.values["dấu thời gian"] || row.values["Chốt tháng"]);
    if (date > 25000 && date < 70000) {
      const parsed = new Date((date - 25569) * 86400000);
      return { key: `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`, label: `Tháng ${parsed.getUTCMonth() + 1}/${parsed.getUTCFullYear()}`, order: date };
    }
    const month = numberValue(row.values.Tháng);
    const year = numberValue(row.values.năm || row.values.Năm);
    return { key: `${year || 0}-${String(month || 0).padStart(2, "0")}`, label: month && year ? `Tháng ${month}/${year}` : "Chưa xác định kỳ", order: year * 100 + month };
  }
  function kpiStaffName(row) {
    return valueText(rowValue(row, ["Nhan Vien", "Nhân viên", "p23M71Ivml4xMUz1xdRlM2", "Nv"])) || "Chưa phân công";
  }
  function kpiStaffPhoto(row) {
    const staffId = String(referenceId(row.values.Nv) || "");
    const photo = valueText(state.staffById?.get(staffId)?.values?.["Ảnh"]);
    const fileName = photo.split(/[\\/]/).pop();
    return STAFF_PHOTO_URLS[fileName] || (/^https?:\/\//i.test(photo) ? photo : "");
  }
  function renderMonthlyKpiCards(data) {
    // AppSheet view "Xem kpi tháng": Card/Photo, sort dấu thời gian DESC,
    // then group by Nv ASC with no group aggregate.
    const rows = [...state.rows].sort((a, b) => {
      const dateDifference = numberValue(b.values["dấu thời gian"]) - numberValue(a.values["dấu thời gian"]);
      if (dateDifference) return dateDifference;
      return kpiStaffName(a).localeCompare(kpiStaffName(b), "vi");
    });
    const groups = new Map();
    rows.forEach((row, index) => {
      const owner = kpiStaffName(row);
      const key = String(referenceId(row.values.Nv) || owner);
      if (!groups.has(key)) groups.set(key, { owner, items: [] });
      groups.get(key).items.push({ row, index });
    });
    const card = ({ row, index }) => {
      const period = kpiMonthKey(row).label;
      const closed = row.values["đã chốt"] === true || normalize(valueText(row.values["đã chốt"])).includes("true");
      const title = valueText(row.values["TỔNG KPI"] || row.values["Hiển thị"] || row.values["Số sao hđ"]) || "Chưa có nội dung KPI";
      const subtitle = [period, valueText(row.values.dsth) ? `DSTH ${money(row.values.dsth)}` : "", closed ? "Đã chốt" : ""].filter(Boolean).join(" · ");
      const owner = kpiStaffName(row);
      const initials = owner.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
      const photo = kpiStaffPhoto(row);
      const avatar = photo
        ? `<img src="${esc(photo)}" alt="${esc(owner)}" loading="lazy" onerror="this.remove();this.parentElement.classList.add('is-fallback')">`
        : esc(initials || "NV");
      return `<button type="button" class="vigifts-kpi-card ${closed ? "is-closed" : ""}" data-row-index="${index}">
        <span class="vigifts-kpi-avatar${photo ? "" : " is-fallback"}" data-fallback="${esc(initials || "NV")}">${avatar}</span>
        <span class="vigifts-kpi-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>
      </button>`;
    };
    const content = [...groups.values()].sort((a, b) => a.owner.localeCompare(b.owner, "vi")).map((group) => `<section class="vigifts-kpi-month"><header><h3>${esc(group.owner)}</h3></header><div>${group.items.map(card).join("")}</div></section>`).join("");
    const title = isCurrentMonthKpiView() ? `Chi tiết KPI tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}` : "Xem KPI tháng";
    $("vigiftsContent").innerHTML = `<section class="vigifts-kpi-screen"><header class="vigifts-kpi-head"><div><p>CHẤM KPI</p><h3>${esc(title)}</h3><small>Card / Photo · nhóm nhân viên · kỳ mới nhất hiển thị trước.</small></div><b>${rows.length.toLocaleString("vi-VN")} bản ghi</b></header>${content || '<div class="vigifts-panel-empty">Không có dữ liệu KPI.</div>'}</section>`;
  }
  function productApproval(row) {
    return valueText(row.values["Phê duyệt"]) || "Chưa duyệt";
  }
  function productPurchaseState(row) {
    const explicit = valueText(row.values["Sản phẩm đã bán/chưa"] || row.values["Đã bán"]);
    if (explicit) return explicit;
    const sold = numberValue(row.values["Số HĐ"] || row.values["SL đã bán:"] || row.values["SL đã bán"]);
    return sold > 0 ? "Đã bán" : "Chưa bán";
  }
  function renderProductCards() {
    // AppSheet view: Card/Photo, _RowNumber DESC, group Phê duyệt then sales state.
    const approvalOrder = ["Đã duyệt", "Chưa duyệt"];
    const filters = [["all", "Tất cả"], ["Đã duyệt", "Đã duyệt"], ["Chưa duyệt", "Chưa duyệt"]];
    const rows = [...state.rows]
      .filter((row) => state.productApproval === "all" || normalize(productApproval(row)) === normalize(state.productApproval))
      .sort((a, b) => numberValue(b.values._RowNumber) - numberValue(a.values._RowNumber) || Date.parse(b.sourceCreatedAt || 0) - Date.parse(a.sourceCreatedAt || 0))
      .map((row) => ({ row, index: state.rows.indexOf(row) }));
    const approvals = new Map();
    rows.forEach(({ row, index }) => {
      const approval = productApproval(row);
      const purchase = productPurchaseState(row);
      if (!approvals.has(approval)) approvals.set(approval, new Map());
      const purchases = approvals.get(approval);
      if (!purchases.has(purchase)) purchases.set(purchase, []);
      purchases.get(purchase).push({ row, index });
    });
    const photo = (row) => {
      const image = valueText(row.values["Ảnh"]);
      return /^https?:\/\//i.test(image) ? `<img src="${esc(mediaUrl(image))}" data-source="${esc(image)}" alt="" loading="lazy" onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src=this.dataset.source}else{this.remove()}">` : '<span aria-hidden="true">▧</span>';
    };
    const card = ({ row, index }) => {
      const name = valueText(row.values["Tên sản phẩm"]) || valueText(row.values["Mã hàng"]) || "Chưa có tên sản phẩm";
      const code = valueText(row.values["Mã hàng"]);
      const fields = [
        code ? `Mã hàng: ${code}` : "",
        row.values["Giá bán"] !== undefined && row.values["Giá bán"] !== "" ? `Giá: ${money(row.values["Giá bán"])}` : "",
        row.values["Giá bán trung bình"] !== undefined && row.values["Giá bán trung bình"] !== "" ? `Giá TB: ${money(row.values["Giá bán trung bình"])}` : "",
        row.values["Số HĐ"] !== undefined && row.values["Số HĐ"] !== "" ? `Số HĐ: ${valueText(row.values["Số HĐ"])}` : "",
        row.values["SL đã bán:"] !== undefined && row.values["SL đã bán:"] !== "" ? `SL: ${valueText(row.values["SL đã bán:"])} ${valueText(row.values["Đơn vị tính"])}` : "",
      ].filter(Boolean).join(" · ");
      return `<button type="button" class="vigifts-product-card" data-row-index="${index}"><span class="vigifts-product-copy"><strong>${esc(name)}</strong><small>${esc(fields || "Chưa có thông tin giá bán")}</small></span><span class="vigifts-product-photo">${photo(row)}</span></button>`;
    };
    const content = [...approvals.entries()].sort(([a], [b]) => (approvalOrder.indexOf(a) + 1 || 99) - (approvalOrder.indexOf(b) + 1 || 99) || a.localeCompare(b, "vi")).map(([approval, purchases]) => `<section class="vigifts-product-approval"><header><i class="${normalize(approval).includes("chua") ? "is-pending" : ""}"></i><h3>${esc(approval)}</h3><b>${[...purchases.values()].flat().length.toLocaleString("vi-VN")}</b></header>${[...purchases.entries()].sort(([a], [b]) => normalize(a).includes("da ban") ? -1 : normalize(b).includes("da ban") ? 1 : a.localeCompare(b, "vi")).map(([purchase, items]) => `<div class="vigifts-product-purchase"><h4>${esc(purchase)}</h4><div>${items.map(card).join("")}</div></div>`).join("")}</section>`).join("");
    const filterBar = `<aside class="vigifts-product-filters"><h3>Phê duyệt</h3>${filters.map(([value, label]) => `<button type="button" class="${state.productApproval === value ? "active" : ""}" data-product-filter="${esc(value)}"><i></i>${esc(label)}</button>`).join("")}</aside>`;
    $("vigiftsContent").innerHTML = `<section class="vigifts-product-screen"><div class="vigifts-product-layout">${filterBar}<main><div class="vigifts-product-summary">${rows.length.toLocaleString("vi-VN")} sản phẩm</div>${content || '<div class="vigifts-panel-empty">Không có sản phẩm phù hợp bộ lọc.</div>'}</main></div></section>`;
  }
  function orderStatusKey(value) {
    const text = normalize(valueText(value));
    if (text.includes("thanh ly")) return "da-thanh-ly";
    if (text.includes("da duyet")) return "da-duyet";
    return "doi-duyet";
  }
  function orderRowNumber(row) {
    const raw = numberValue(rowValue(row, ["_RowNumber", "RowNumber"]));
    return Number.isFinite(raw) ? raw : 0;
  }
  function renderOrderCards(data, config) {
    const orderMoney = (value) => Math.round(numberValue(value)).toLocaleString("en-US");
    const statuses = [
      ["all", "Tất cả"],
      ["doi-duyet", "Đợi duyệt"],
      ["da-duyet", "Đã duyệt"],
      ["da-thanh-ly", "Đã thanh lý"],
    ];
    // AppSheet Editor cấu hình HĐKT: Sort by _RowNumber, Descending.
    const rows = [...state.rows].sort((a, b) => orderRowNumber(b) - orderRowNumber(a));
    const totalFor = (key) => rows.reduce((sum, row) => key === "all" || orderStatusKey(row.values["Phê duyệt"]) === key
      ? sum + numberValue(rowValue(row, ["Thành tiền (+thuế)", "Thành Tiền (+Thuế)", "Thành Tiền (-Thuế)"]))
      : sum, 0);
    const selected = statuses.some(([key]) => key === state.orderStatus) ? state.orderStatus : "all";
    const visible = selected === "all" ? rows : rows.filter((row) => orderStatusKey(row.values["Phê duyệt"]) === selected);
    const groups = new Map();
    visible.forEach((row) => {
      const owner = valueText(rowValue(row, ["Nhân viên phụ trách", "NV phụ trách", "Nhân viên"])) || "Chưa phân công";
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(row);
    });
    const statusTree = statuses.map(([key, label]) => `<button type="button" class="vigifts-order-status ${selected === key ? "active" : ""}" data-order-status="${key}"><span><i></i>${esc(label)}</span><b>${orderMoney(totalFor(key))}</b></button>`).join("");
    const sections = [...groups.entries()].sort(([ownerA], [ownerB]) => ownerB.localeCompare(ownerA, "vi")).map(([owner, items]) => {
      const groupTotal = items.reduce((sum, row) => sum + numberValue(rowValue(row, ["Thành tiền (+thuế)", "Thành Tiền (+Thuế)", "Thành Tiền (-Thuế)"])), 0);
      const cards = items.map((row) => {
        const index = state.rows.indexOf(row);
        const customer = valueText(rowValue(row, ["KH_NDP", "Khách hàng", "TênKH"])) || "Khách hàng chưa xác định";
        const contract = valueText(rowValue(row, ["Số HĐ", "Số hợp đồng"])) || "Chưa có số HĐ";
        const amount = orderMoney(rowValue(row, ["Thành tiền (+thuế)", "Thành Tiền (+Thuế)", "Thành Tiền (-Thuế)"])) + "đ";
        const payment = valueText(rowValue(row, ["Trạng thái thanh toán", "Thanh toán"])) || "Chưa thanh toán";
        const deliveryValue = valueText(rowValue(row, ["trạng thái giao hàng qua task-chi tiết sản phẩm", "Đã giao hàng", "HT_đã giao/chưa giao", "Trạng thái giao hàng"])) || "Đợi triển khai";
        const delivery = normalize(deliveryValue) === "da giao" ? "Đã giao hàng" : deliveryValue;
        const approval = orderStatusKey(row.values["Phê duyệt"]);
        return `<button type="button" class="vigifts-order-card ${approval}" data-row-index="${index}"><span class="vigifts-order-copy"><strong>${esc(customer.toUpperCase())}</strong><small>Số HĐ: ${esc(contract)} - Giá trị: ${esc(amount)} - ${esc(payment)} - ${esc(delivery)}</small></span><i>›</i></button>`;
      }).join("");
      return `<section class="vigifts-order-owner"><header><strong>${esc(owner)}</strong><b>${orderMoney(groupTotal)}</b></header><div>${cards}</div></section>`;
    }).join("");
    $("vigiftsContent").innerHTML = `<section class="vigifts-order-screen"><header class="vigifts-order-toolbar"><div><p>Hợp đồng kinh tế</p><h3>HĐKT</h3></div><button type="button" class="vigifts-primary-action" data-order-create>＋ Tạo Mới</button></header><div class="vigifts-order-layout"><aside><div class="vigifts-order-filter-title"><strong>HĐKT</strong><span>⌕</span></div>${statusTree}</aside><main>${sections || '<div class="vigifts-panel-empty">Không có HĐKT trong nhóm này.</div>'}</main></div></section>`;
  }
  function renderAppSheetChart(data) {
    const pie = state.view === "Tỉ trọng đóng góp trong năm";
    const profit = state.view === "Xem lợi nhuận";
    const labelField = profit ? "Pháp nhân" : "NV";
    const valueField = profit ? "Tổng lợi nhuận tháng" : "doanh số thực hiện";
    const secondaryField = profit ? "Tổng doanh số tháng" : "Chỉ tiêu năm";
    const groups = new Map();
    state.rows.forEach((row) => {
      const label = valueText(row.values[labelField] || row.values[profit ? "Pháp nhân" : "Nhan Vien"]) || "Chưa xác định";
      const item = groups.get(label) || { label, value: 0, secondary: 0 };
      item.value += numberValue(row.values[valueField] || row.values.dsth);
      item.secondary += numberValue(row.values[secondaryField]);
      groups.set(label, item);
    });
    const items = [...groups.values()].sort((a, b) => b.value - a.value);
    const total = items.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
    const max = Math.max(1, ...items.flatMap((item) => [item.value, item.secondary]));
    const colors = ["#2563eb", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#64748b"];
    let body = "";
    if (pie) {
      let cursor = 0;
      const stops = items.map((item, index) => {
        const start = cursor;
        cursor += total ? item.value / total * 100 : 0;
        return `${colors[index % colors.length]} ${start}% ${cursor}%`;
      }).join(",");
      body = `<div class="vigifts-pie-layout"><div class="vigifts-pie" style="background:conic-gradient(${stops || "#e2e8f0 0 100%"})"><span><b>${money(total)}</b><small>Tổng doanh số</small></span></div><div class="vigifts-chart-legend">${items.map((item, index) => `<div><i style="background:${colors[index % colors.length]}"></i><span>${esc(item.label)}</span><b>${money(item.value)}</b><small>${total ? (item.value / total * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : 0}%</small></div>`).join("")}</div></div>`;
    } else {
      body = `<div class="vigifts-bar-chart">${items.map((item, index) => `<div class="vigifts-bar-row"><strong>${esc(item.label)}</strong><div><span style="width:${Math.max(1, item.value / max * 100)}%;background:${colors[index % colors.length]}"></span></div><b>${money(item.value)}</b>${item.secondary ? `<div class="secondary"><span style="width:${Math.max(1, item.secondary / max * 100)}%"></span></div><small>${profit ? "Doanh số" : "Chỉ tiêu"}: ${money(item.secondary)}</small>` : ""}</div>`).join("")}</div>`;
    }
    $("vigiftsContent").innerHTML = `<section class="vigifts-chart-screen"><header><div><p>${esc(data.viewInfo?.actionType || "Biểu đồ")}</p><h3>${esc(state.view)}</h3></div><strong>${items.length.toLocaleString("vi-VN")} nhóm</strong></header>${body || '<div class="vigifts-panel-empty">Không có dữ liệu.</div>'}</section>`;
  }
  function closeOverlay(id) {
    document.getElementById(id)?.remove();
  }
  function customerForm(row = null) {
    const values = row?.values || {};
    const fields = customerFields.map(([name, label, type, required, wide]) => {
      const value = valueText(values[name]);
      const control = wide
        ? `<textarea name="${esc(name)}" rows="3" ${required ? "required" : ""}>${esc(value)}</textarea>`
        : `<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="1"' : ""}>`;
      return `<label class="${wide ? "wide" : ""}"><span>${esc(label)}${required ? " *" : ""}</span>${control}</label>`;
    }).join("");
    const editing = Boolean(row);
    document.body.insertAdjacentHTML("beforeend", `<div class="vigifts-customer-backdrop" id="vigiftsCustomerBackdrop"><form class="vigifts-customer-form" id="vigiftsCustomerForm" data-customer-id="${esc(rowId(row))}"><header><div><p>Khách hàng</p><h3>${editing ? "Cập nhật khách hàng" : "Tạo khách hàng mới"}</h3></div><button type="button" id="vigiftsCustomerCancel">Đóng</button></header><div class="vigifts-customer-grid">${fields}</div><p class="vigifts-form-error" id="vigiftsCustomerError" role="alert"></p><footer><button type="button" id="vigiftsCustomerCancelFooter">Hủy</button><button type="submit" class="vigifts-primary-action">${editing ? "Lưu thay đổi" : "Tạo khách hàng"}</button></footer></form></div>`);
  }
  function toast(message) {
    document.querySelector(".vigifts-toast")?.remove();
    document.body.insertAdjacentHTML("beforeend", `<div class="vigifts-toast" role="status">${esc(message)}</div>`);
    setTimeout(() => document.querySelector(".vigifts-toast")?.remove(), 3200);
  }
  async function submitCustomer(form) {
    const submit = form.querySelector('[type="submit"]');
    const error = $("vigiftsCustomerError");
    const id = form.dataset.customerId;
    const payload = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    error.textContent = "";
    try {
      await api(id ? `/customers/${encodeURIComponent(id)}` : "/customers", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      closeOverlay("vigiftsCustomerBackdrop");
      toast(id ? "Đã cập nhật khách hàng." : "Đã tạo khách hàng và chuyển sang Đợi duyệt.");
      await loadTable(state.table, state.view);
    } catch (cause) {
      error.textContent = cause.message;
      submit.disabled = false;
    }
  }
  async function refreshCustomer(message) {
    closeOverlay("vigiftsDetailBackdrop");
    toast(message);
    await loadTable(state.table, state.view);
  }
  async function ensureCustomerOptions() {
    if (state.customerOptions.length) return state.customerOptions;
    state.customerOptions = (await api("/customer-options")).options || [];
    return state.customerOptions;
  }
  async function contactForm(row = null) {
    const options = await ensureCustomerOptions();
    const values = row?.values || {};
    const fields = contactFields.map(([name, label, type, required]) => `<label><span>${esc(label)}${required ? " *" : ""}</span><input name="${esc(name)}" type="${type}" value="${esc(valueText(values[name]))}" ${required ? "required" : ""}></label>`).join("");
    const customerId = values["Khách hàng"]?.tupleId || valueText(values["Khách hàng"]);
    const selected = options.find((item) => item.tupleId === customerId);
    const datalist = options.map((item) => `<option value="${esc(item.label)}">${esc(item.code || "")}</option>`).join("");
    const editing = Boolean(row);
    document.body.insertAdjacentHTML("beforeend", `<div class="vigifts-customer-backdrop" id="vigiftsContactBackdrop"><form class="vigifts-customer-form" id="vigiftsContactForm" data-contact-id="${esc(rowId(row))}"><header><div><p>Người liên hệ</p><h3>${editing ? "Cập nhật người liên hệ" : "Tạo người liên hệ mới"}</h3></div><button type="button" data-contact-cancel>Đóng</button></header><div class="vigifts-customer-grid">${fields}<label class="wide"><span>Khách hàng *</span><input name="Khách hàng" list="vigiftsCustomerOptions" value="${esc(selected?.label || customerId)}" required autocomplete="off"><datalist id="vigiftsCustomerOptions">${datalist}</datalist></label></div><p class="vigifts-form-error" id="vigiftsContactError" role="alert"></p><footer><button type="button" data-contact-cancel>Hủy</button><button type="submit" class="vigifts-primary-action">${editing ? "Lưu thay đổi" : "Tạo người liên hệ"}</button></footer></form></div>`);
  }
  async function submitContact(form) {
    const submit = form.querySelector('[type="submit"]');
    const error = $("vigiftsContactError");
    const id = form.dataset.contactId;
    submit.disabled = true;
    error.textContent = "";
    try {
      await api(id ? `/contacts/${encodeURIComponent(id)}` : "/contacts", { method: id ? "PATCH" : "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      closeOverlay("vigiftsContactBackdrop");
      toast(id ? "Đã cập nhật người liên hệ." : "Đã tạo người liên hệ.");
      await loadTable(state.table, state.view);
    } catch (cause) {
      error.textContent = cause.message;
      submit.disabled = false;
    }
  }
  const serialToDateInput = (value) => {
    const numeric = Number(valueText(value));
    if (!Number.isFinite(numeric) || numeric < 25000) return "";
    const date = new Date((numeric - 25569) * 86400000 + 7 * 60 * 60 * 1000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  };
  async function loadContactOptions(customerId) {
    state.contactOptions = (await api(`/contact-options?customer=${encodeURIComponent(customerId || "")}`)).options || [];
    return state.contactOptions;
  }
  async function transactionForm(row = null) {
    const customers = await ensureCustomerOptions();
    const values = row?.values || {};
    const customerId = values["Khách hàng"]?.tupleId || valueText(values["Khách hàng"]);
    const selectedCustomer = customers.find((item) => item.tupleId === customerId);
    const contacts = await loadContactOptions(customerId);
    const contactId = values["Người liên hệ"]?.tupleId || valueText(values["Người liên hệ"]);
    const selectedContact = contacts.find((item) => item.tupleId === contactId);
    const customerList = customers.map((item) => `<option value="${esc(item.label)}">${esc(item.code || "")}</option>`).join("");
    const contactList = contacts.map((item) => `<option value="${esc(item.label)}">${esc(item.phone || "")}</option>`).join("");
    const controls = transactionFields.map(([name, label, type, required, options]) => {
      let value = valueText(values[name]);
      if (type === "date") value = serialToDateInput(values[name]);
      if (type === "textarea") return `<label class="wide"><span>${esc(label)}${required ? " *" : ""}</span><textarea name="${esc(name)}" rows="4" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
      if (type === "select") return `<label><span>${esc(label)}${required ? " *" : ""}</span><select name="${esc(name)}" ${required ? "required" : ""}>${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(option || "Không nhắc")}</option>`).join("")}</select></label>`;
      return `<label><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${type === "number" ? 'min="0" step="1"' : ""}></label>`;
    }).join("");
    const editing = Boolean(row);
    document.body.insertAdjacentHTML("beforeend", `<div class="vigifts-customer-backdrop" id="vigiftsTransactionBackdrop"><form class="vigifts-customer-form" id="vigiftsTransactionForm" data-transaction-id="${esc(rowId(row))}"><header><div><p>Giao dịch</p><h3>${editing ? "Cập nhật giao dịch" : "Tạo giao dịch mới"}</h3></div><button type="button" data-transaction-cancel>Đóng</button></header><div class="vigifts-customer-grid"><label><span>Khách hàng *</span><input name="Khách hàng" list="vigiftsTransactionCustomers" value="${esc(selectedCustomer?.label || customerId)}" required autocomplete="off"><datalist id="vigiftsTransactionCustomers">${customerList}</datalist></label><label><span>Người liên hệ</span><input name="Người liên hệ" list="vigiftsTransactionContacts" value="${esc(selectedContact?.label || contactId)}" autocomplete="off"><datalist id="vigiftsTransactionContacts">${contactList}</datalist></label>${controls}</div><p class="vigifts-form-error" id="vigiftsTransactionError" role="alert"></p><footer><button type="button" data-transaction-cancel>Hủy</button><button type="submit" class="vigifts-primary-action">${editing ? "Lưu thay đổi" : "Tạo giao dịch"}</button></footer></form></div>`);
  }
  async function submitTransaction(form) {
    const submit = form.querySelector('[type="submit"]');
    const error = $("vigiftsTransactionError");
    const id = form.dataset.transactionId;
    submit.disabled = true;
    error.textContent = "";
    try {
      await api(id ? `/transactions/${encodeURIComponent(id)}` : "/transactions", { method: id ? "PATCH" : "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      closeOverlay("vigiftsTransactionBackdrop");
      toast(id ? "Đã cập nhật giao dịch." : "Đã tạo giao dịch.");
      await loadTable(state.table, state.view);
    } catch (cause) {
      error.textContent = cause.message;
      submit.disabled = false;
    }
  }
  function renderDebtCards(data) {
    const debtMoney = (value) => {
      const amount = numberValue(value);
      return `${amount < 0 ? "-" : ""}₫${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const debtOwner = (row) => {
      const raw = row.values["NV Bán hàng"];
      const labels = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(valueText).filter(Boolean);
      return [...new Set(labels)].join(" , ") || customerOwner(row);
    };
    const groups = new Map();
    state.rows.forEach((row, index) => {
      const owner = debtOwner(row);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push({ row, index });
    });
    const sections = [...groups.entries()].map(([owner, items]) => {
      const totalDebt = items.reduce((sum, { row }) => sum + customerDebt(row), 0);
      const cards = items.map(({ row, index }) => {
        const customer = valueText(rowValue(row, ["TênKH", "Tên khách hàng"])) || "Khách hàng";
        const revenue = customerRevenue(row);
        const debt = customerDebt(row);
        return `<button type="button" class="vigifts-debt-card ${debt < 0 ? "credit" : "owed"}" data-row-index="${index}"><span><strong>${esc(customer.toUpperCase())}</strong><small>DS: ${esc(debtMoney(revenue))} - Nợ còn lại: ${esc(debtMoney(debt))}</small></span><i>›</i></button>`;
      }).join("");
      return `<section class="vigifts-debt-owner"><header><strong>${esc(owner)}</strong><b>${esc(debtMoney(totalDebt))}</b></header><div>${cards}</div></section>`;
    }).join("");
    $("vigiftsContent").innerHTML = `<section class="vigifts-debt-screen"><header class="vigifts-order-toolbar"><div><p>Khách hàng còn nợ</p><h3>CÔNG NỢ</h3></div></header><div class="vigifts-debt-list">${sections || '<div class="vigifts-panel-empty">Không có khách hàng còn công nợ.</div>'}</div></section>`;
  }
  const appSheetOrderUrl = (view, tupleId = "") => `https://www.appsheet.com/start/ad0117e6-9c42-465a-bdfa-b31e90b35248?platform=desktop#appName=${encodeURIComponent("QUẢNLÝHĐKT-975382311-25-10-21")}&view=${encodeURIComponent(view)}${tupleId ? `&row=${encodeURIComponent(tupleId)}` : ""}`;
  function orderPaymentForm(row) {
    const id = rowId(row);
    const contract = valueText(rowValue(row, ["Số HĐ"])) || "HĐKT";
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    document.body.insertAdjacentHTML("beforeend", `<div class="vigifts-customer-backdrop" id="vigiftsOrderPaymentBackdrop"><form class="vigifts-customer-form" id="vigiftsOrderPaymentForm" data-order-id="${esc(id)}"><header><div><p>Thu công nợ</p><h3>${esc(contract)}</h3></div><button type="button" data-order-payment-cancel>Đóng</button></header><div class="vigifts-customer-grid"><label><span>Ngày ghi nhận *</span><input name="date" type="date" value="${today}" required></label><label><span>Số tiền thanh toán *</span><input name="amount" type="number" min="1" step="1" required></label><label class="wide"><span>Nội dung</span><textarea name="content" rows="3">Thu công nợ ${esc(contract)}</textarea></label></div><p class="vigifts-form-error" id="vigiftsOrderPaymentError" role="alert"></p><footer><button type="button" data-order-payment-cancel>Hủy</button><button type="submit" class="vigifts-primary-action">Ghi nhận thanh toán</button></footer></form></div>`);
  }
  async function submitOrderPayment(form) {
    const submit = form.querySelector('[type="submit"]');
    const error = $("vigiftsOrderPaymentError");
    submit.disabled = true;
    error.textContent = "";
    try {
      const result = await api(`/orders/${encodeURIComponent(form.dataset.orderId)}/payments`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      closeOverlay("vigiftsOrderPaymentBackdrop");
      closeOverlay("vigiftsDetailBackdrop");
      toast(`Đã ghi nhận thanh toán. ${result.status || ""}`.trim());
      await loadTable(state.table, state.view);
    } catch (cause) {
      error.textContent = cause.message;
      submit.disabled = false;
    }
  }
  function openDetail(row) {
    if (!row) return;
    const config = currentConfig();
    const important = [...new Set([...(config.title || []), ...(config.sub || []), ...(config.columns || []), ...state.columns])];
    const rest = state.fields.map((field) => field.fieldName).filter((name) => !important.includes(name) && !isTechnicalField(name));
    const fields = [...important, ...rest].filter((name) => !isTechnicalField(name) && row.values[name] !== undefined).slice(0, 70);
    const title = valueText(rowValue(row, config.title || fields)) || state.view || "Chi tiết";
    const body = fields.map((name) => {
      const rendered = renderValue(row.values[name], name, config) || "<em>Trống</em>";
      const wide = /ghi chú|mô tả|địa chỉ|nội dung|cảnh báo|hiển thị/i.test(name) ? " wide" : "";
      return `<label class="${wide}"><span>${esc(name)}</span><strong>${rendered}</strong></label>`;
    }).join("");
    const unifiedCustomerStorage = Boolean(state.currentData?.unifiedStorage);
    const customerActions = isCustomerTable() && !isDebtView() ? `<button type="button" data-customer-edit="${esc(rowId(row))}">Sửa</button>${!unifiedCustomerStorage && isManager() && normalize(row.values["Phê Duyệt"]) !== "da duyet" ? `<button type="button" class="approve" data-customer-approve="${esc(rowId(row))}">Duyệt khách hàng</button>` : ""}${!unifiedCustomerStorage && isManager() ? `<button type="button" class="danger" data-customer-delete="${esc(rowId(row))}">Xóa</button>` : ""}` : "";
    const phone = valueText(row.values["Số điẹn thoai"]);
    const email = valueText(row.values.Email);
    const contactActions = isContactTable() ? `<button type="button" data-contact-edit="${esc(rowId(row))}">Sửa</button>${phone ? `<a href="tel:${esc(phone.replace(/[^+\d]/g, ""))}">Gọi</a>` : ""}${email ? `<a href="mailto:${esc(email)}">Gửi email</a>` : ""}${isManager() ? `<button type="button" class="danger" data-contact-delete="${esc(rowId(row))}">Xóa</button>` : ""}` : "";
    const transactionActions = isTransactionTable() ? `<button type="button" data-transaction-edit="${esc(rowId(row))}">Sửa</button>${isManager() ? `<button type="button" class="danger" data-transaction-delete="${esc(rowId(row))}">Xóa</button>` : ""}` : "";
    const orderStatus = orderStatusKey(row.values["Phê duyệt"]);
    const paid = normalize(valueText(row.values["Trạng thái thanh toán"])) === "da thanh toan";
    const orderActions = isOrderTable() ? `${isManager() && !["da-duyet", "da-thanh-ly"].includes(orderStatus) ? `<button type="button" class="approve" data-order-approve="${esc(rowId(row))}">Duyệt HĐ</button>` : ""}<button type="button" data-order-document="print" data-order-id="${esc(rowId(row))}">In HĐKT</button><button type="button" data-order-document="save" data-order-id="${esc(rowId(row))}">Lưu HĐKT</button>${paid ? "" : `<button type="button" data-order-payment="${esc(rowId(row))}">Tạo thanh toán</button>`}` : "";
    const html = `<div class="vigifts-detail-backdrop" id="vigiftsDetailBackdrop"><aside class="vigifts-detail"><header><div><p>${esc(state.table || "")}</p><h3>${esc(title)}</h3></div><button type="button" id="vigiftsDetailClose">Đóng</button></header><div class="vigifts-detail-actions">${orderActions || customerActions || contactActions || transactionActions || (config.actions || []).map((label) => `<button type="button" disabled>${esc(label)}</button>`).join("")}</div><div class="vigifts-detail-grid">${body}</div></aside></div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  }
  async function load() {
    try {
      const [data, account, referenceLabels] = await Promise.all([
        api("/summary"),
        staffApi("/me"),
        fetch("/vigifts-reference-labels.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : {}).catch(() => ({})),
      ]);
      state.user = account.user || account;
      state.referenceLabels = referenceLabels || {};
      const hashParams = new URLSearchParams(location.hash.slice(1));
      const importPayload = hashParams.get("product-image-import");
      const importImageMap = hashParams.get("product-image-map-import") === "1";
      let importMessage = "";
      if (importPayload) {
        history.replaceState(null, "", location.pathname + location.search);
        const imported = await api("/import-product-images", { method: "POST", body: JSON.stringify({ payload: importPayload }) });
        importMessage = `Đã đồng bộ ${Number(imported.updated || 0).toLocaleString("vi-VN")} ảnh sản phẩm.`;
      }
      if (importImageMap) {
        history.replaceState(null, "", location.pathname + location.search);
        const imported = await api("/product-image-map/import-snapshot", { method: "POST" });
        importMessage = `Đã lưu ${Number(imported.imported || 0).toLocaleString("vi-VN")} mapping ảnh sản phẩm vào D1.`;
      }
      if (!data.ready) return renderNotReady(data);
      renderSummary(data);
      if (importMessage) $("vigiftsStatus").textContent = importMessage;
    } catch (error) {
      if (/đăng nhập/i.test(error.message)) location.href = "/login.html";
      $("vigiftsContent").innerHTML = `<div class="vigifts-empty"><h3>Không tải được mirror</h3><p>${esc(error.message)}</p></div>`;
    }
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("#vigiftsImportOpen")) return void $("vigiftsImportFolder")?.click();
    const orderStatus = event.target.closest("[data-order-status]");
    if (orderStatus) {
      state.orderStatus = orderStatus.dataset.orderStatus;
      return void renderOrderCards(state.currentData, currentConfig());
    }
    if (event.target.closest("[data-order-create]")) return void window.open(appSheetOrderUrl("Nhập đơn hàng_Form"), "_blank", "noopener");
    const orderApprove = event.target.closest("[data-order-approve]");
    if (orderApprove) {
      if (!confirm("Xác nhận duyệt HĐKT này?")) return;
      return void api(`/orders/${encodeURIComponent(orderApprove.dataset.orderApprove)}/approve`, { method: "POST" }).then(async () => { closeOverlay("vigiftsDetailBackdrop"); toast("Đã duyệt HĐKT."); await loadTable(state.table, state.view); }).catch((cause) => toast(cause.message));
    }
    const orderDocument = event.target.closest("[data-order-document]");
    if (orderDocument) return void api(`/orders/${encodeURIComponent(orderDocument.dataset.orderId)}/document`, { method: "POST", body: JSON.stringify({ action: orderDocument.dataset.orderDocument }) }).then((result) => { if (result.openUrl) window.open(result.openUrl, "_blank", "noopener"); toast(result.message || "Đã thực hiện thao tác HĐKT."); }).catch((cause) => toast(cause.message));
    const orderPayment = event.target.closest("[data-order-payment]");
    if (orderPayment) {
      const row = state.rows.find((item) => rowId(item) === orderPayment.dataset.orderPayment);
      return void orderPaymentForm(row);
    }
    if (event.target.closest("[data-order-payment-cancel]") || event.target.id === "vigiftsOrderPaymentBackdrop") return void closeOverlay("vigiftsOrderPaymentBackdrop");
    if (event.target.closest("[data-debt-create]")) return void customerForm();
    if (event.target.closest("[data-customer-create]")) return void customerForm();
    if (event.target.closest("[data-contact-create]")) return void contactForm().catch((cause) => toast(cause.message));
    if (event.target.closest("[data-transaction-create]")) return void transactionForm().catch((cause) => toast(cause.message));
    const edit = event.target.closest("[data-customer-edit]");
    if (edit) {
      const row = state.rows.find((item) => rowId(item) === edit.dataset.customerEdit);
      closeOverlay("vigiftsDetailBackdrop");
      return void customerForm(row);
    }
    const approve = event.target.closest("[data-customer-approve]");
    if (approve) return void api(`/customers/${encodeURIComponent(approve.dataset.customerApprove)}/approve`, { method: "POST" }).then(() => refreshCustomer("Đã duyệt khách hàng.")).catch((cause) => toast(cause.message));
    const remove = event.target.closest("[data-customer-delete]");
    if (remove) {
      if (!confirm("Xóa khách hàng này khỏi dữ liệu mirror?")) return;
      return void api(`/customers/${encodeURIComponent(remove.dataset.customerDelete)}`, { method: "DELETE" }).then(() => refreshCustomer("Đã xóa khách hàng.")).catch((cause) => toast(cause.message));
    }
    if (event.target.closest("#vigiftsCustomerCancel, #vigiftsCustomerCancelFooter") || event.target.id === "vigiftsCustomerBackdrop") return void closeOverlay("vigiftsCustomerBackdrop");
    const contactEdit = event.target.closest("[data-contact-edit]");
    if (contactEdit) {
      const row = state.rows.find((item) => rowId(item) === contactEdit.dataset.contactEdit);
      closeOverlay("vigiftsDetailBackdrop");
      return void contactForm(row).catch((cause) => toast(cause.message));
    }
    const contactDelete = event.target.closest("[data-contact-delete]");
    if (contactDelete) {
      if (!confirm("Xóa người liên hệ này khỏi dữ liệu mirror?")) return;
      return void api(`/contacts/${encodeURIComponent(contactDelete.dataset.contactDelete)}`, { method: "DELETE" }).then(() => refreshCustomer("Đã xóa người liên hệ.")).catch((cause) => toast(cause.message));
    }
    if (event.target.closest("[data-contact-cancel]") || event.target.id === "vigiftsContactBackdrop") return void closeOverlay("vigiftsContactBackdrop");
    const transactionEdit = event.target.closest("[data-transaction-edit]");
    if (transactionEdit) {
      const row = state.rows.find((item) => rowId(item) === transactionEdit.dataset.transactionEdit);
      closeOverlay("vigiftsDetailBackdrop");
      return void transactionForm(row).catch((cause) => toast(cause.message));
    }
    const transactionDelete = event.target.closest("[data-transaction-delete]");
    if (transactionDelete) {
      if (!confirm("Xóa giao dịch này khỏi dữ liệu mirror?")) return;
      return void api(`/transactions/${encodeURIComponent(transactionDelete.dataset.transactionDelete)}`, { method: "DELETE" }).then(() => refreshCustomer("Đã xóa giao dịch.")).catch((cause) => toast(cause.message));
    }
    if (event.target.closest("[data-transaction-cancel]") || event.target.id === "vigiftsTransactionBackdrop") return void closeOverlay("vigiftsTransactionBackdrop");
    const fast = event.target.closest("[data-fast-route]");
    if (fast) {
      location.href = fast.dataset.fastRoute;
      return;
    }
    const todayView = event.target.closest("[data-today-view]");
    if (todayView) return void loadTodayDashboard();
    const productFilter = event.target.closest("[data-product-filter]");
    if (productFilter) {
      state.productApproval = productFilter.dataset.productFilter;
      return void renderProductCards();
    }
    const button = event.target.closest("[data-table]");
    if (button) loadTable(button.dataset.table, button.dataset.view);
    const home = event.target.closest("[data-home-target]");
    if (home) {
      if (home.dataset.homeTarget === "Nhiệm vụ hôm nay") return void loadTodayDashboard();
      const view = viewForName(home.dataset.homeTarget);
      if (view) loadTable(view.dataset.table, view.dataset.view);
    }
    const todayOpen = event.target.closest("[data-today-open]");
    if (todayOpen) {
      const panel = TODAY_PANELS.find((item) => item.id === todayOpen.dataset.todayOpen);
      if (panel) loadTable(panel.table, panel.view);
    }
    const mobileView = event.target.closest("[data-mobile-view]");
    if (mobileView) {
      const route = fastRoute(mobileView.dataset.mobileView);
      if (route) {
        location.href = route;
        return;
      }
      document.querySelectorAll("[data-mobile-view]").forEach((item) => item.classList.toggle("active", item === mobileView));
      const view = viewForName(mobileView.dataset.mobileView);
      if (view) loadTable(view.dataset.table, view.dataset.view);
    }
    const menuButton = event.target.closest(".vigifts-menu-button, .vigifts-mobile-titlebar button[aria-label='Mở menu']");
    if (menuButton) {
      document.querySelector(".vigifts-shell")?.classList.toggle("vigifts-menu-open");
      return;
    }
    const row = event.target.closest("[data-row-index]");
    if (row) openDetail(state.rows[Number(row.dataset.rowIndex)]);
    if (event.target.closest("#vigiftsDetailClose") || event.target.id === "vigiftsDetailBackdrop") document.getElementById("vigiftsDetailBackdrop")?.remove();
    if (event.target.closest("#vigiftsViews button") && window.matchMedia("(max-width: 1024px)").matches) document.querySelector(".vigifts-shell")?.classList.remove("vigifts-menu-open");
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "vigiftsImportFolder") {
      return void importSnapshotDirectory(event.target).catch((cause) => {
        $("vigiftsContent").innerHTML = `<div class="vigifts-empty"><h3>Chưa nạp được dữ liệu</h3><p>${esc(cause.message)}</p></div>`;
      });
    }
    const filter = event.target.closest("[data-customer-filter]");
    if (!filter) return;
    state.customerFilters[filter.dataset.customerFilter] = filter.value;
    renderCustomerCards({ rows: state.rows, total: state.rows.length });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-customer-filter-reset]")) return;
    state.customerFilters = { approval: "all", purchase: "all", owner: "all" };
    renderCustomerCards({ rows: state.rows, total: state.rows.length });
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "vigiftsCustomerForm") return;
    event.preventDefault();
    submitCustomer(event.target);
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "vigiftsOrderPaymentForm") return;
    event.preventDefault();
    submitOrderPayment(event.target);
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "vigiftsTransactionForm") return;
    event.preventDefault();
    submitTransaction(event.target);
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "vigiftsContactForm") return;
    event.preventDefault();
    submitContact(event.target);
  });
  $("vigiftsReload").addEventListener("click", load);
  $("vigiftsReloadTop")?.addEventListener("click", load);
  $("vigiftsReloadMobile")?.addEventListener("click", load);
  $("vigiftsGlobalSearch").addEventListener("input", () => {
    const topSearch = $("vigiftsTopSearch");
    if (topSearch && topSearch.value !== $("vigiftsGlobalSearch").value) topSearch.value = $("vigiftsGlobalSearch").value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => state.table && loadTable(state.table, state.view), 250);
  });
  $("vigiftsTopSearch")?.addEventListener("input", () => {
    $("vigiftsGlobalSearch").value = $("vigiftsTopSearch").value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => state.table && loadTable(state.table, state.view), 250);
  });
  load();
})();
