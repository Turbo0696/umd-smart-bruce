import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SITE = "https://umd-smart-bruce.vercel.app";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const testEmail = `confirm-smoke-${Date.now()}@example.com`;
const testPassword = "smoke-test-password-123";

const { data: created, error: createErr } =
  await admin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: false,
  });
if (createErr) throw createErr;
console.log("created unconfirmed user:", created.user.id);

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink(
  {
    type: "signup",
    email: testEmail,
    password: testPassword,
    options: { redirectTo: `${SITE}/auth/confirm` },
  },
);
if (linkErr) throw linkErr;
console.log("action link redirect target:", linkData.properties.action_link);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto(linkData.properties.action_link, { waitUntil: "networkidle" });
console.log("landed on:", page.url());
await page.waitForSelector(`text=${testEmail}`, { timeout: 10000 });
console.log("CONFIRM FLOW OK — logged in immediately after clicking link");
await page.screenshot({ path: "confirm-check.png", fullPage: true });

console.log("page errors:", errors);

await browser.close();
await admin.auth.admin.deleteUser(created.user.id);
console.log("cleanup done");
