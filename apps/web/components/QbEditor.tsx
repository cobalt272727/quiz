"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { parse, type Diagnostic } from "@qb/parser";

/** 行・桁を絶対オフセットに変換する */
function toCmDiagnostics(source: string, diagnostics: Diagnostic[]): CmDiagnostic[] {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  return diagnostics.map((d) => {
    const start = lineStarts[Math.min(d.line - 1, lineStarts.length - 1)] ?? 0;
    const from = Math.min(start + Math.max(d.column - 1, 0), source.length);
    const to = Math.min(from + Math.max(d.length ?? 1, 1), source.length);
    return {
      from,
      to: to > from ? to : Math.min(from + 1, source.length),
      severity: d.severity,
      message: `${d.code}: ${d.message}`,
    };
  });
}

const qbTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    backgroundColor: "var(--cm-bg)",
    color: "var(--cm-fg)",
  },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-gutters": {
    backgroundColor: "var(--cm-gutter-bg)",
    color: "var(--cm-gutter-fg)",
    borderRight: "1px solid var(--cm-border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--cm-active)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--cm-active)" },
  ".cm-line": { padding: "0 12px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--cm-fg)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "var(--cm-selection) !important" },
  ".cm-tooltip": {
    backgroundColor: "var(--cm-bg)",
    color: "var(--cm-fg)",
    border: "1px solid var(--cm-border)",
  },
});

export type QbEditorHandle = {
  focus(): void;
  /** カーソル位置にテキストを挿入する(画像のスニペット挿入などで使う) */
  insert(text: string): void;
};

export function QbEditor({
  initialValue,
  onChange,
  ref,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  ref?: React.Ref<QbEditorHandle>;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      insert(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        markdown(),
        lintGutter(),
        EditorView.lineWrapping,
        qbTheme,
        linter(
          (view) => {
            const text = view.state.doc.toString();
            // プレビュー用のパース。ID は付与せず警告のみ(§5.2)
            return toCmDiagnostics(text, parse(text).diagnostics);
          },
          { delay: 500 },
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
