import { createPublicKey, verify } from "crypto";
import { getConfig } from "@/shared/settings";

type TelnyxSendResponse = {
  data?: {
    id?: string;
    to?: { status?: string }[];
  };
  errors?: { title?: string; detail?: string }[];
};

export async function sendSMS(to: string, body: string): Promise<{ sid: string; status: string }> {
  const cfg = await getConfig();
  if (!cfg.TELNYX_API_KEY) throw new Error("TELNYX_API_KEY is not configured. Paste it in Settings.");
  if (!cfg.TELNYX_PHONE_NUMBER) throw new Error("TELNYX_PHONE_NUMBER is not configured. Paste it in Settings.");

  const payload: Record<string, unknown> = {
    from: cfg.TELNYX_PHONE_NUMBER,
    to,
    text: body,
    type: "SMS",
  };

  if (cfg.TELNYX_MESSAGING_PROFILE_ID) {
    payload.messaging_profile_id = cfg.TELNYX_MESSAGING_PROFILE_ID;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    payload.webhook_url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/status`;
  }

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as TelnyxSendResponse;
  if (!res.ok || json.errors?.length) {
    const err = json.errors?.[0];
    throw new Error(err?.detail || err?.title || `Telnyx send failed (${res.status})`);
  }

  return {
    sid: json.data?.id || "",
    status: json.data?.to?.[0]?.status || "queued",
  };
}

function ed25519PublicKey(publicKeyB64: string) {
  const raw = Buffer.from(publicKeyB64.trim(), "base64");
  if (raw.length === 32) {
    return createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
      format: "der",
      type: "spki",
    });
  }
  return createPublicKey({ key: publicKeyB64, format: "pem" });
}

export async function verifyTelnyxSignature(req: Request, rawBody: string): Promise<boolean> {
  const cfg = await getConfig();
  const publicKey = cfg.TELNYX_PUBLIC_KEY;
  if (!publicKey) return true;

  const signature = req.headers.get("telnyx-signature-ed25519") ?? "";
  const timestamp = req.headers.get("telnyx-timestamp") ?? "";
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  try {
    const signedPayload = Buffer.from(`${timestamp}|${rawBody}`);
    const sig = Buffer.from(signature, "base64");
    return verify(null, signedPayload, ed25519PublicKey(publicKey), sig);
  } catch {
    return false;
  }
}

export function mapTelnyxStatus(status: string | undefined): string {
  const s = (status || "").toLowerCase();
  if (s === "queued" || s === "sending") return "queued";
  if (s === "sent") return "sent";
  if (s === "delivered") return "delivered";
  if (s.includes("fail") || s === "undelivered" || s === "rejected") return "failed";
  return "queued";
}
