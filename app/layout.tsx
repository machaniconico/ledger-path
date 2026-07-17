import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ledger Path｜日商簿記3級パイロット",
    template: "%s｜Ledger Path",
  },
  description: "毎日続く、日商簿記3級の仕訳トレーニング。2026年度版。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Ledger Path｜日商簿記3級パイロット",
    description: "毎日の仕訳練習を、迷わず一歩ずつ。",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og.png", width: 1717, height: 916, alt: "Ledger Path" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ledger Path｜日商簿記3級パイロット",
    description: "毎日の仕訳練習を、迷わず一歩ずつ。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
