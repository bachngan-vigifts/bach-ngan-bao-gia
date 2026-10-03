import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://baogia.minhlongonline.com"),
  title: "CRM & báo giá Bách Ngân - VIGIFTS",
  description: "Tra cứu khách hàng, cập nhật hồ sơ HĐKT, theo dõi công việc CRM và tạo báo giá Bách Ngân.",
  openGraph: {
    title: "CRM & báo giá Bách Ngân - VIGIFTS",
    description: "Tra cứu khách hàng, cập nhật hồ sơ HĐKT, theo dõi công việc CRM và tạo báo giá Bách Ngân.",
    url: "https://baogia.minhlongonline.com/crm",
    siteName: "Bách Ngân - VIGIFTS",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CRM & báo giá Bách Ngân - VIGIFTS",
    description: "Tra cứu khách hàng, cập nhật hồ sơ HĐKT, theo dõi công việc CRM và tạo báo giá Bách Ngân.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head><link rel="stylesheet" href="/left-navigation.css?v=bottom-draft-note-20261002" /></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
