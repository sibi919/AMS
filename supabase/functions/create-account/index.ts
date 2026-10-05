import { createClient } from "npm:@supabase/supabase-js@2.109.0";
import { validateAccountInput } from "../_shared/account-input.ts";

Deno.serve(async (request: Request) => {
  const origin = Deno.env.get("PORTAL_ORIGIN") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  const reply = (status: number, message: string) =>
    new Response(JSON.stringify({ message }), { status, headers });
  if (!origin) return reply(503, "Account service setup is incomplete.");
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return reply(403, "Origin not allowed.");
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, "POST required.");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, "Sign in required.");
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user)
      return reply(401, "Session expired. Sign in again.");
    const { data: actor, error } = await admin
      .from("profiles")
      .select("role,active,can_create_students")
      .eq("id", user.id)
      .single();
    if (
      error ||
      !actor?.active ||
      !(
        actor.role === "admin" ||
        (actor.role === "staff" && actor.can_create_students)
      )
    )
      return reply(403, "Account creation is not permitted.");
    const reader = request.body?.getReader();
    if (!reader) return reply(400, "Invalid request.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8000) { await reader.cancel(); return reply(413, "Request too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder().decode(bytes);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, "Invalid request.");
    }
    const input = validateAccountInput(body, actor.role);
    if (!input)
      return reply(
        400,
        "Check account details. Use a unique ID and a password of at least 12 characters.",
      );
    const { error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: {
        academy_role: input.role,
        account_code: input.accountCode,
        full_name: input.fullName,
        course_label: input.courseLabel,
        created_by: user.id,
        batch_id: input.batchId ?? null,
        assigned_staff_id:
          actor.role === "staff" ? user.id : input.assignedStaffId,
      },
    });
    // The DB trigger rechecks permissions atomically and creates profile + audit record.
    if (createError)
      return reply(
        400,
        "Account could not be created. Check for an existing email/ID, valid staff assignment, or the hourly creation limit. No password is logged.",
      );
    return reply(
      201,
      "Account created. Share access details privately with the account holder.",
    );
  } catch {
    return reply(503, "Account service is unavailable. Please try again.");
  }
});
