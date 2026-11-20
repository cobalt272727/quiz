"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parse, saveSource, collectQuestions, toPublic } from "@qb/parser";
import { QbEditor, type QbEditorHandle } from "@/components/QbEditor";
import { AstView } from "@/components/AstView";
import { buildReveals } from "@/lib/book";
import { loadDraft, saveDraft } from "@/lib/storage";
import { BLANK_BOOK_SOURCE, SAMPLE_SOURCE } from "@/lib/sample";

type Loaded = { title: string };

export type EditorBook = { id: string; version: number; source: string };

export function EditorClient({
  initial = null,
  initialAssets = [],
  signedIn = false,
}: {
  initial?: EditorBook | null;
  /** サーバ保存済みブックの画像一覧(プレビューで img: を解決する) */
  initialAssets?: Array<{ id: string; name: string }>;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState(initial?.source ?? BLANK_BOOK_SOURCE);
  const [book, setBook] = useState<{ id: string; version: number } | null>(
    initial ? { id: initial.id, version: initial.version } : null,
  );
  const [saving, setSaving] = useState(false);
  /** サーバ上の画像(name → { id }) 。プレビューで `img:` を解決するために使う */
  const [assets, setAssets] = useState<Map<string, { id: string }>>(
    new Map(initialAssets.map((a) => [a.name, { id: a.id }])),
  );
  const [editorKey, setEditorKey] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<"preview" | "diagnostics">("preview");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<QbEditorHandle | null>(null);
  const mounted = useRef(false);

  // 下書きの復元(初回のみ。サーバのブックを開いているときは復元しない)
  useEffect(() => {
    if (initial) {
      mounted.current = true;
      return;
    }
    const draft = loadDraft();
    if (draft) {
      setSource(draft.source);
      setEditorKey((k) => k + 1);
      setNotice("前回の下書きを復元しました。");
    }
    mounted.current = true;
  }, [initial]);

  // 画像アセットの一覧(プレビューで img: 参照を解決する)
  useEffect(() => {
    const id = book?.id;
    if (!id) {
      setAssets(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/books/${id}/assets`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { assets?: Array<{ id: string; name: string }> };
        if (cancelled || !data.assets) return;
        setAssets(new Map(data.assets.map((a) => [a.name, { id: a.id }])));
      } catch {
        /* 一覧が取れないときはプレースホルダ表示にフォールバック */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book?.id, saving]);

  // 入力のデバウンス(300ms。§9)
  const parseOptions = useMemo(
    () =>
      book && assets.size > 0
        ? { assetNames: new Set(assets.keys()), assetIds: new Map([...assets].map(([n, a]) => [n, a.id])) }
        : book
          ? { assetNames: new Set<string>() }
          : {},
    [book, assets],
  );

  const [parsed, setParsed] = useState(() => parse(initial?.source ?? BLANK_BOOK_SOURCE, parseOptions));
  useEffect(() => {
    const timer = setTimeout(() => {
      setParsed(parse(source, parseOptions));
    }, 300);
    return () => clearTimeout(timer);
  }, [source, parseOptions]);

  // 下書きの自動保存(ローカル編集のときだけ)
  useEffect(() => {
    if (!mounted.current || book) return;
    const timer = setTimeout(() => {
      saveDraft(source, parsed.ast.meta.title || "無題のブック");
    }, 1000);
    return () => clearTimeout(timer);
  }, [source, parsed.ast.meta.title, book]);

  // プレビューは作者向け。公開射影を通した形で表示し、正解と解説は別枠で見せる
  const publicBook = useMemo(() => toPublic(parsed.ast), [parsed]);

  const reveals = useMemo(() => buildReveals(parsed.ast), [parsed]);
  const questionCount = useMemo(() => collectQuestions(parsed.ast.blocks).length, [parsed]);
  const errorCount = parsed.diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = parsed.diagnostics.filter((d) => d.severity === "warning").length;

  const openFile = async (file: File) => {
    const text = await file.text();
    setSource(text);
    setEditorKey((k) => k + 1);
    setLoaded({ title: file.name });
    setNotice(`${file.name} を読み込みました。`);
  };

  const writebackAndDownload = () => {
    // 保存と同じ手順で ID を確定させ、確定済みソースを書き出す(§7.3)
    const saved = saveSource(source);
    const blob = new Blob([saved.source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(saved.result.ast.meta.title || "book").replace(/[\\/:*?"<>|]/g, "_")}.qb`;
    a.click();
    URL.revokeObjectURL(url);
    if (saved.wroteBack) {
      setSource(saved.source);
      setEditorKey((k) => k + 1);
      setNotice("未確定の ID を書き戻して書き出しました。");
    }
  };

  /** サーバへ保存(§7.3)。ID の書き戻し結果でエディタを置き換える */
  const saveToServer = async () => {
    if (!signedIn) {
      setNotice("ログインするとブックをサーバに保存できます。");
      return;
    }
    if (errorCount > 0) {
      setTab("diagnostics");
      setNotice("エラーを解消してから保存してください。");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(book ? `/api/books/${book.id}` : "/api/books", {
        method: book ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          book
            ? { source, expectedVersion: book.version }
            : { source, visibility: "private" },
        ),
      });
      const data = (await res.json()) as {
        book?: { id: string; version: number; source: string; wroteBack: boolean };
        error?: { message?: string; details?: Array<{ code: string; line: number; column: number; message: string }> };
      };
      if (!res.ok || !data.book) {
        const detail = data.error?.details?.[0];
        setNotice(
          detail
            ? `${data.error?.message ?? "保存できませんでした"}: ${detail.code} ${detail.line} 行 ${detail.message}`
            : (data.error?.message ?? "保存できませんでした"),
        );
        return;
      }
      setBook({ id: data.book.id, version: data.book.version });
      if (data.book.source !== source) {
        setSource(data.book.source);
        setEditorKey((k) => k + 1);
      }
      if (!book) router.replace(`/books/new?book=${data.book.id}`);
      setNotice(
        data.book.wroteBack
          ? `保存しました(v${data.book.version})。未確定だった ID を書き戻しました。`
          : `保存しました(v${data.book.version})。`,
      );
    } catch {
      setNotice("通信に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  /** 画像アップロード(§7.8)。サーバ保存済みのブックにだけ追加できる */
  const uploadImage = async (file: File) => {
    if (!book) {
      setNotice("画像を追加するには、先にブックをサーバへ保存してください。");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/books/${book.id}/assets`, { method: "POST", body: form });
      const data = (await res.json()) as {
        asset?: { name: string; markdown: string; width: number; height: number };
        error?: { message?: string };
      };
      if (!res.ok || !data.asset) {
        setNotice(data.error?.message ?? "画像をアップロードできませんでした。");
        return;
      }
      const snippet = `

![${data.asset.name}](img:${data.asset.name}){width=${data.asset.width}}
`;
      editorRef.current?.insert(snippet);
      setNotice(
        `画像「${data.asset.name}」を追加しました(${data.asset.width}×${data.asset.height})。`,
      );
    } catch {
      setNotice("通信に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  /** ZIP(本文 + 画像)を取り込んで新しいブックとして開く(§9) */
  const importZip = async (file: File) => {
    if (!signedIn) {
      setNotice("ZIP の取り込みにはログインが必要です。");
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/books/import", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        book?: { id: string };
        error?: { message?: string };
      };
      if (!res.ok || !data.book) {
        setNotice(data.error?.message ?? "ZIP を取り込めませんでした。");
        return;
      }
      router.push(`/books/new?book=${data.book.id}`);
    } catch {
      setNotice("通信に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const startAttempt = async (mode: "practice" | "exam") => {
    if (errorCount > 0) {
      setTab("diagnostics");
      setNotice("エラーを解消してから受験してください。");
      return;
    }
    if (book) {
      // サーバ保存済みのブックはサーバ受験(採点もサーバ。§7.6)
      try {
        const res = await fetch(`/api/books/${book.id}/attempts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode }),
        });
        const data = (await res.json()) as { attemptId?: string; error?: { message?: string } };
        if (res.ok && data.attemptId) {
          router.push(`/attempt/${data.attemptId}`);
          return;
        }
        setNotice(data.error?.message ?? "受験を開始できませんでした。");
      } catch {
        setNotice("通信に失敗しました。");
      }
      return;
    }
    saveDraft(source, parsed.ast.meta.title || "無題のブック");
    router.push("/play");
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8.5rem)] max-w-7xl flex-col px-3 py-3 lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <h1 className="mr-auto text-lg font-bold">{book ? "ブックを編集" : "ブックを作成"}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {parsed.ast.meta.title || "無題"} / 設問 {questionCount} 件
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            errorCount > 0
              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              : warnCount > 0
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {errorCount > 0
            ? `エラー ${errorCount}`
            : warnCount > 0
              ? `警告 ${warnCount}`
              : "問題なし"}
        </span>
        <button
          type="button"
          onClick={() => {
            setSource(SAMPLE_SOURCE);
            setEditorKey((k) => k + 1);
            setNotice("サンプルを読み込みました。");
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          サンプル
        </button>
        <button
          type="button"
          onClick={() => {
            if (!book) {
              setNotice("画像を追加するには、先にブックをサーバへ保存してください。");
              return;
            }
            imageInput.current?.click();
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          画像を追加
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          ファイルを開く
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".qb,.md,.txt,.json,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (/\.zip$/i.test(file.name)) void importZip(file);
              else void openFile(file);
            }
            e.target.value = "";
          }}
        />
        {book && (
          <>
            <a
              href={`/books/${book.id}/history`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              履歴
            </a>
            <a
              href={`/books/${book.id}/members`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              共同編集
            </a>
            <a
              href={`/api/books/${book.id}/export?format=zip`}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              ZIP 書き出し
            </a>
          </>
        )}
        <button
          type="button"
          onClick={writebackAndDownload}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          .qb 書き出し
        </button>
        {signedIn && (
          <button
            type="button"
            onClick={() => void saveToServer()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? "保存中…" : book ? "サーバに保存" : "サーバに保存"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const ok = saveDraft(source, parsed.ast.meta.title || "無題のブック");
            setNotice(ok ? "下書きを保存しました。" : "保存できませんでした(容量超過?)");
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          下書き保存
        </button>
        {book ? (
          <>
            <button
              type="button"
              onClick={() => void startAttempt("practice")}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              練習で受験
            </button>
            <button
              type="button"
              onClick={() => void startAttempt("exam")}
              className="rounded-lg border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-950/40"
            >
              本番で受験
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void startAttempt("practice")}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            このブックで受験する
          </button>
        )}
      </div>

      {notice && (
        <div className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
          {notice}
          <button
            type="button"
            className="ml-2 text-blue-600 underline dark:text-blue-300"
            onClick={() => setNotice(null)}
          >
            閉じる
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <section className="flex h-[55dvh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-auto lg:min-h-0 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>ソース {loaded ? `(${loaded.title})` : ""}</span>
            <Link href="/docs/syntax" className="underline">
              記法リファレンス
            </Link>
          </div>
          <div className="min-h-0 flex-1">
            <QbEditor
              key={editorKey}
              ref={editorRef}
              initialValue={source}
              onChange={(value) => setSource(value)}
            />
          </div>
        </section>

        <section className="flex h-[55dvh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:h-auto lg:min-h-0 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex gap-1 border-b border-slate-200 px-3 py-1.5 text-xs dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={`rounded-md px-2 py-1 ${tab === "preview" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              プレビュー
            </button>
            <button
              type="button"
              onClick={() => setTab("diagnostics")}
              className={`rounded-md px-2 py-1 ${tab === "diagnostics" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}
            >
              診断 {parsed.diagnostics.length}
            </button>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "preview" ? (
              <div className="qb-book">
                <h1>{publicBook.meta.title || "無題"}</h1>
                {publicBook.meta.description && (
                  <p className="text-slate-500 dark:text-slate-400">{publicBook.meta.description}</p>
                )}
                <AstView
                  blocks={publicBook.blocks}
                  mode="preview"
                  reveals={reveals}
                  answers={{}}
                  {...(book
                    ? { assetUrl: (assetId: string) => `/api/books/${book.id}/assets/${assetId}` }
                    : {})}
                />
              </div>
            ) : parsed.diagnostics.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">診断はありません。</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {parsed.diagnostics.map((d, i) => (
                  <li
                    key={i}
                    className={`rounded-lg border px-3 py-2 ${
                      d.severity === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                    }`}
                  >
                    <span className="font-mono text-xs font-semibold">{d.code}</span>
                    <span className="ml-2 text-xs opacity-70">
                      {d.line} 行 {d.column} 列
                    </span>
                    <p className="mt-1">{d.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
