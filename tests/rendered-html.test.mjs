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
  assert.match(html, /<html[^>]*lang="ja"/i);
  assert.match(html, /<title>Ledger Path｜日商簿記3級パイロット<\/title>/i);
  assert.match(html, /今日も一仕訳/);
  assert.match(html, /仕訳トレーニング/);
  assert.match(html, /60分ミニ模試/);
  assert.match(html, /独立した非公式の学習パイロット/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes preview assets and retains key product safeguards", async () => {
  const [client, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/LedgerPathApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(layout, /codex-preview/);
  assert.match(client, /localStorage/);
  assert.match(client, /保存済み（この端末）/);
  assert.match(client, /合格を保証するものではありません/);
  assert.match(client, /mockMode/);
  assert.match(client, /aria-live="polite"/);
  await access(new URL("public/og.png", templateRoot));
});
