import { NextResponse } from "next/server";
import { listCartesiaVoices, getVoiceConfig } from "@/lib/cartesia";
import { CONVERSATION_TONES } from "@/lib/tones";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { voices, source, warning } = await listCartesiaVoices();
    const defaults = getVoiceConfig();

    return NextResponse.json({
      voices,
      source,
      warning,
      defaults: {
        agentVoiceId: defaults.agentVoiceId,
        userVoiceId: defaults.userVoiceId,
      },
      tones: CONVERSATION_TONES,
    });
  } catch (err) {
    console.error("Voices API error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list voices",
      },
      { status: 500 }
    );
  }
}
