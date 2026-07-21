import { NextRequest, NextResponse } from "next/server";
import { analyzeMarkdown } from "@/lib/deepseek";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let markdown = "";
    let fileName = "conversations.md";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file && typeof file === "object" && "text" in file) {
        const f = file as File;
        fileName = f.name || fileName;
        markdown = await f.text();
      } else {
        const text = form.get("markdown");
        if (typeof text === "string") markdown = text;
        const name = form.get("fileName");
        if (typeof name === "string") fileName = name;
      }
    } else {
      const body = (await req.json()) as {
        markdown?: string;
        fileName?: string;
      };
      markdown = body.markdown || "";
      fileName = body.fileName || fileName;
    }

    if (!markdown.trim()) {
      return NextResponse.json(
        { error: "No Markdown content provided" },
        { status: 400 }
      );
    }

    if (!fileName.toLowerCase().endsWith(".md")) {
      fileName = fileName.endsWith(".") ? `${fileName}md` : `${fileName}.md`;
    }

    const result = await analyzeMarkdown(markdown, fileName);

    return NextResponse.json({
      fileName,
      totalConversations: result.conversations.length,
      conversations: result.conversations,
      warnings: result.warnings,
      source: result.source,
      rawMarkdown: markdown,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to analyze Markdown",
      },
      { status: 500 }
    );
  }
}
