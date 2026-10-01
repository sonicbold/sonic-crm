import { parseUserRequest } from "@/features/finder/gemini";
import { applyPlumberNiche } from "@/features/finder/niche";
import type { ParsedRequest } from "@/features/finder/types";

export async function parseRequest(opts: {
  prompt: string;
  apiKey: string;
  model: string;
}): Promise<ParsedRequest> {
  const parsed = await parseUserRequest(opts.prompt, opts.apiKey, opts.model);
  return applyPlumberNiche(parsed);
}
