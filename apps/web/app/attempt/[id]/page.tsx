import { ServerPlay } from "@/components/ServerPlay";

export const dynamic = "force-dynamic";

export const metadata = { title: "受験" };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServerPlay attemptId={id} />;
}
