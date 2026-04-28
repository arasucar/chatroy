import { resolveSession, verifyStepUpPassword } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await resolveSession();
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rl = await checkRateLimit(`step-up:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let payload: { password?: string };
  try {
    payload = (await request.json()) as { password?: string };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await verifyStepUpPassword(payload.password ?? "");
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 401 });
  }

  return Response.json({
    ok: true,
    expiresAt: result.expiresAt.toISOString(),
  });
}
