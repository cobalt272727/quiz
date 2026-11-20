import type { QuestionAnswer } from "./book";

/**
 * ローカルモード(フェーズ 1 MVP)の保存。
 * 採点はクライアントで行うが、保存するのは回答と出題条件のみ(§11)。
 */

const DRAFT_KEY = "qb:draft:v1";
const ATTEMPT_KEY = "qb:attempt:v1";

export type Draft = {
  version: 1;
  source: string;
  title: string;
  updatedAt: number;
};

export type AttemptRecord = {
  version: 1;
  /** 受験開始時点のソース(後日の編集で結果が変わらないようにする) */
  source: string;
  seed: number;
  startedAt: number;
  submittedAt?: number;
  answers: Record<string, QuestionAnswer>;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): Draft | null {
  const d = readJson<Draft>(DRAFT_KEY);
  if (!d || d.version !== 1 || typeof d.source !== "string") return null;
  return d;
}

export function saveDraft(source: string, title: string): boolean {
  return writeJson(DRAFT_KEY, {
    version: 1,
    source,
    title,
    updatedAt: Date.now(),
  } satisfies Draft);
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 何もしない
  }
}

export function loadAttempt(): AttemptRecord | null {
  const a = readJson<AttemptRecord>(ATTEMPT_KEY);
  if (!a || a.version !== 1 || typeof a.source !== "string") return null;
  return a;
}

export function saveAttempt(attempt: AttemptRecord): boolean {
  return writeJson(ATTEMPT_KEY, attempt);
}

export function clearAttempt(): void {
  try {
    localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // 何もしない
  }
}

export const draftKey = DRAFT_KEY;
export const attemptKey = ATTEMPT_KEY;
