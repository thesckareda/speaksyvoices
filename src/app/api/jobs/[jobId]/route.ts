import { NextRequest, NextResponse } from "next/server";
import { getJob, requestCancel, serializeJob } from "@/lib/job-store";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(serializeJob(job));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const conversationId = req.nextUrl.searchParams.get("conversationId") || undefined;
  const ok = requestCancel(jobId, conversationId);
  if (!ok) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ cancelled: true, conversationId });
}
