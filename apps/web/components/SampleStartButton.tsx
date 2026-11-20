"use client";

import { useRouter } from "next/navigation";
import { saveDraft, clearAttempt } from "@/lib/storage";
import { SAMPLE_SOURCE } from "@/lib/sample";

export function SampleStartButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        saveDraft(SAMPLE_SOURCE, "日本史 基礎");
        clearAttempt();
        router.push("/play");
      }}
    >
      サンプルで受験してみる
    </button>
  );
}
