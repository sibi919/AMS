import { createClient } from "@supabase/supabase-js";
// Run only from a trusted terminal. Environment values never enter the frontend bundle.
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "ADMIN_CODE",
];
for (const key of required)
  if (!process.env[key]) throw new Error(`Missing ${key}`);
if (process.env.ADMIN_PASSWORD.length < 12)
  throw new Error("Use at least 12 characters for the admin password.");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { error } = await client.auth.admin.createUser({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  email_confirm: true,
  app_metadata: {
    academy_role: "admin",
    account_code: process.env.ADMIN_CODE,
    full_name: process.env.ADMIN_NAME,
  },
});
if (error) {
  // Report the actual cause. Nothing here contains the password or the key.
  console.error("Bootstrap failed.");
  console.error(`Reason: ${error.message ?? "unknown error"}`);
  if (error.status) console.error(`HTTP status: ${error.status}`);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|certificate/i.test(error.message ?? ""))
    console.error(
      "The Supabase service could not be reached. Check that the stack is running (docker compose ps) and that SUPABASE_URL is correct.",
    );
  else if (error.status === 401 || error.status === 403)
    console.error("The service key was rejected. Check SERVICE_ROLE_KEY in .env.");
  else if (/already registered|already exists|duplicate/i.test(error.message ?? ""))
    console.error(
      "An account with this email or ID already exists, or an initial admin was already created.",
    );
  else
    console.error(
      "Check the account details, and whether an initial admin already exists.",
    );
  process.exitCode = 1;
} else
  console.log(
    "Initial admin created. Clear bootstrap environment variables and sign in through the portal.",
  );
