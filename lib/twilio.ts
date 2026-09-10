import twilio from "twilio";

let _twilioClient: twilio.Twilio;
function getTwilio() {
  if (!_twilioClient) {
    _twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID || "dummy",
      process.env.TWILIO_AUTH_TOKEN || "dummy"
    );
  }
  return _twilioClient;
}

export const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || "";

export async function sendSMS(to: string, body: string): Promise<{ sid: string; status: string }> {
  const statusCallback = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/status`
    : undefined;
  const message = await getTwilio().messages.create({
    body,
    from: TWILIO_FROM,
    to,
    ...(statusCallback ? { statusCallback } : {}),
  });
  return { sid: message.sid, status: message.status };
}

export function verifyTwilioSignature(req: Request, rawBody: string): boolean {
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/webhook`;
  const params: Record<string, string> = {};
  new URLSearchParams(rawBody).forEach((v, k) => { params[k] = v; });
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN!, sig, url, params);
}


