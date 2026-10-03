import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VIGIFTS CRM mirror",
  description: "Bản web thay thế AppSheet VIGIFTS CRM, dùng dữ liệu export từ AppSheet Database.",
};

export default function VigiftsCrmMirror() {
  return (
    <main className="vigifts-shell">
      <header className="vigifts-appbar">
        <button className="vigifts-menu-button" type="button" aria-label="Mở menu">☰</button>
        <div className="vigifts-logo">VIGIFTS</div>
        <strong>VIGIFTS_CRM</strong>
        <label className="vigifts-app-search">
          <span>⌕</span>
          <input id="vigiftsTopSearch" placeholder="Tìm kiếm Home" />
        </label>
        <div className="vigifts-app-tools">
          <button id="vigiftsReloadTop" type="button" aria-label="Đồng bộ">↻</button>
          <button type="button" aria-label="Tùy chọn">⌄</button>
          <span>C</span>
        </div>
      </header>
      <aside className="vigifts-sidebar">
        <div className="vigifts-brand">
          <img src="/vigifts-letterhead.png" alt="" />
          <strong>VIGIFTS CRM</strong>
        </div>
        <div className="vigifts-search">
          <input id="vigiftsGlobalSearch" placeholder="Tìm trong bảng đang mở..." />
        </div>
        <nav id="vigiftsViews" aria-label="AppSheet views"></nav>
        <div className="vigifts-sidebar-user" id="vigiftsSidebarUser"></div>
      </aside>
      <section className="vigifts-main">
        <header className="vigifts-mobile-apphead">
          <div className="vigifts-mobile-titlebar">
            <button type="button" aria-label="Mở menu">☰</button>
            <span className="vigifts-mobile-logo">VIGIFTS</span>
            <strong id="vigiftsMobileTitle">Home</strong>
            <button type="button" aria-label="Tìm kiếm">⌕</button>
            <button id="vigiftsReloadMobile" type="button" aria-label="Đồng bộ">↻</button>
          </div>
        </header>
        <header className="vigifts-topbar">
          <div>
            <p id="vigiftsStatus">Đang kiểm tra dữ liệu AppSheet...</p>
            <h2 id="vigiftsTitle">Nhiệm vụ hôm nay</h2>
          </div>
          <div className="vigifts-actions">
            <a href="/crm">CRM web hiện tại</a>
            <button id="vigiftsReload" type="button">Đồng bộ màn hình</button>
          </div>
        </header>
        <section className="vigifts-kpis" id="vigiftsKpis"></section>
        <section className="vigifts-content" id="vigiftsContent">
          <p>Đang tải bản mirror...</p>
        </section>
        <nav className="vigifts-mobile-tabs" aria-label="Điều hướng nhanh">
          <button type="button" data-mobile-view="Home" className="active"><span>⌂</span><small>Home</small></button>
          <button type="button" data-mobile-view="Khách hàng"><span>♟</span><small>Khách hàng</small></button>
          <button type="button" data-mobile-view="HĐKT"><span>▧</span><small>HĐKT</small></button>
          <button type="button" data-mobile-view="CÔNG NỢ"><span>◒</span><small>CÔNG NỢ</small></button>
        </nav>
      </section>
      <script src="/vigifts-crm.js?v=media-cache-20260926-6" defer></script>
    </main>
  );
}
