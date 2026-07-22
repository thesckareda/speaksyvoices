import os from "os";
import path from "path";

/**
 * Writable directory for generated audio.
 *
 * On Vercel / AWS Lambda the deployment root (`/var/task`) is read-only;
 * only the system temp dir is writable. Locally we keep files under
 * `./data/audio` for easier inspection.
 */
export function getAudioDataDir(): string {
  if (process.env.AUDIO_DATA_DIR) {
    return process.env.AUDIO_DATA_DIR;
  }

  const serverless =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT);

  if (serverless) {
    return path.join(os.tmpdir(), "speaksyvoices", "audio");
  }

  return path.join(process.cwd(), "data", "audio");
}
