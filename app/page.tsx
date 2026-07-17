import type { Metadata } from "next";
import LedgerPathApp from "./LedgerPathApp";

export const metadata: Metadata = {
  title: { absolute: "Ledger Path｜日商簿記3級パイロット" },
  description: "毎日の仕訳練習を、迷わず一歩ずつ。2026年度版の簿記学習アプリ。",
};

export default function Home() {
  return <LedgerPathApp />;
}
