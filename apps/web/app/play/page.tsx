import type { Metadata } from "next";
import { PlayView } from "@/components/PlayView";

export const metadata: Metadata = { title: "受験" };

export default function PlayPage() {
  return <PlayView />;
}
