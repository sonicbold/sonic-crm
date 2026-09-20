import { parseUserRequest } from "@/features/finder/gemini";
import type { ParsedRequest } from "@/features/finder/types";

export async function parseRequest(opts: {
  prompt: string;
  apiKey: string;
  model: string;
}): Promise<ParsedRequest> {
  return parseUserRequest(opts.prompt, opts.apiKey, opts.model);
}
