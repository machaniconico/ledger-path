import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished Japanese Ledger Path app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const normalizedHtml = html.replace(/<!--.*?-->/g, "");
  assert.match(html, /<html[^>]*lang="ja"/i);
  assert.match(html, /<title>Ledger Path｜日商簿記3級パイロット<\/title>/i);
  assert.match(html, /今日も一仕訳/);
  assert.match(html, /仕訳トレーニング/);
  assert.match(html, /<h3[^>]*tabindex="-1"[^>]*>/);
  assert.match(html, /カテゴリから選ぶ/);
  assert.match(html, /現金・預金/);
  assert.match(html, /aria-label="問題カテゴリ"/);
  assert.equal(
    (html.match(/class="entry-row"/g) ?? []).length,
    4,
    "initial row count must not reveal the answer shape",
  );
  assert.match(normalizedHtml, /仕訳行1の区分/);
  assert.match(html, /<option[^>]*value="debit"[^>]*>借方<\/option>/);
  assert.match(html, /<option[^>]*value="credit"[^>]*>貸方<\/option>/);
  assert.match(html, /行を追加/);
  assert.match(html, /行を削除/);
  assert.match(html, /60分ミニ模試/);
  assert.match(html, /独立した非公式の学習パイロット/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes preview assets and retains key product safeguards", async () => {
  const [client, layout, packageJson, globalStyles] = await Promise.all([
    readFile(new URL("../app/LedgerPathApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(layout, /codex-preview/);
  assert.match(client, /localStorage/);
  assert.match(client, /保存済み（この端末）/);
  assert.match(client, /合格を保証するものではありません/);
  assert.match(client, /mockMode/);
  assert.match(client, /aria-live="polite"/);
  assert.doesNotMatch(
    client,
    /question\.expected\.map\(\(\{ side \}\)/,
    "blank rows must not derive their sides from the answer",
  );
  assert.doesNotMatch(
    client,
    /blankLines\((?!\))/,
    "blank row initialization must be question-independent in every mode",
  );
  assert.match(client, /const INITIAL_ENTRY_LINES = 4/);
  assert.match(client, /const MIN_ENTRY_LINES = 2/);
  assert.match(client, /const MAX_ENTRY_LINES = 8/);
  assert.match(client, /items\.length >= MAX_ENTRY_LINES/);
  assert.match(client, /items\.length <= MIN_ENTRY_LINES/);
  assert.match(globalStyles, /button, input, select \{ min-height: 44px; \}/);
  assert.match(globalStyles, /:focus-visible/);
  assert.match(globalStyles, /prefers-reduced-motion: reduce/);
  await access(new URL("public/og.png", templateRoot));
});
