# Bản gốc trước khi đổi giao diện theo v0

- Ngày chốt: 01/10/2026 (Asia/Ho_Chi_Minh).
- Website: https://baogia.minhlongonline.com
- Project: appgprj_6a9bfc4374a48191b084674313611bc4
- Phiên bản đã lưu: 706.
- Version ID: appgprj_6a9bfc4374a48191b084674313611bc4~appgver_9295ca2905bc8191b660b7a63c51c02b
- Commit gốc: fde65514986c4310b467c08e9e1493775740411f
- Archive: file_00000000b8108206b9278e6ba5ec5f10
- SHA256 archive: e6b0bf4cb0f18cf82ff567d2ee5e86351c58898d186cb706f25bce8f70451899
- Mẫu giao diện: https://request-a-quote.v0.build/

## Khôi phục

Dùng Sites để triển khai lại version ID trên, giữ nguyên quyền truy cập và tên miền. Khi cần khôi phục mã nguồn, checkout commit gốc trên trong repository hiện tại. Không tạo lại project.

Đây là mốc khôi phục mã nguồn và giao diện; không phải bản sao dữ liệu database, tệp tải lên hay biến môi trường. Không hoàn nguyên dữ liệu kinh doanh khi khôi phục giao diện.

## Yêu cầu thiết kế

Anh Thái yêu cầu dựng giao diện và cấu trúc giống mẫu v0, giữ chức năng web báo giá hiện có. Mẫu đã được lấy từ repository bachngan-vigifts/request-a-quote, commit 67a74cb151cac0c1da2d58ccda1c21ddd2ae7b8e. Giao diện mới dùng dữ liệu và quyền truy cập của hệ thống hiện tại; không nhập dữ liệu demo hoặc chạy migration Neon trong mẫu.
