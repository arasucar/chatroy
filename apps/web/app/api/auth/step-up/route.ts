import { verifyStepUpPassword } from "@/lib/auth";

export async function POST(request: Request) {
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
