type SupabaseAdminClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  };
};

export type GoogleIndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export interface GoogleIndexingJob {
  id: string;
  employer_id?: string | null;
}

export interface GoogleIndexingResult {
  ok: boolean;
  configured: boolean;
  status: "sent" | "skipped" | "error";
  url: string;
  notificationType: GoogleIndexingNotificationType;
  error?: string;
  googleResponse?: unknown;
}

interface GoogleCredentials {
  clientEmail: string;
  privateKey: string;
}

interface NotifyGoogleIndexingOptions {
  supabaseAdmin?: SupabaseAdminClient;
  job: GoogleIndexingJob;
  notificationType: GoogleIndexingNotificationType;
  requestedBy?: string | null;
  reason?: string;
}

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish";

function siteOrigin() {
  return (Deno.env.get("PUBLIC_SITE_URL") || "https://hireflownow.com").replace(/\/+$/, "");
}

function jobUrl(jobId: string) {
  return `${siteOrigin()}/candidate/job/${encodeURIComponent(jobId)}`;
}

function toBase64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function truncate(value: string, length = 500) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function getGoogleCredentials(): GoogleCredentials | null {
  const serviceAccountJson = Deno.env.get("GOOGLE_INDEXING_SERVICE_ACCOUNT_JSON");
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson);
    const clientEmail = String(parsed.client_email ?? "").trim();
    const privateKey = String(parsed.private_key ?? "").trim();
    if (clientEmail && privateKey) return { clientEmail, privateKey };
  }

  const clientEmail = (Deno.env.get("GOOGLE_INDEXING_CLIENT_EMAIL") ?? "").trim();
  const privateKey = (Deno.env.get("GOOGLE_INDEXING_PRIVATE_KEY") ?? "").trim();
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey };
}

async function signJwt(credentials: GoogleCredentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.clientEmail,
    scope: INDEXING_SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credentials.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  return `${unsigned}.${toBase64Url(signature)}`;
}

async function getAccessToken(credentials: GoogleCredentials) {
  const assertion = await signJwt(credentials);
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google OAuth failed (${response.status}): ${truncate(text)}`);
  }

  const body = JSON.parse(text);
  const accessToken = String(body.access_token ?? "");
  if (!accessToken) throw new Error("Google OAuth response did not include an access token.");
  return accessToken;
}

async function publishToGoogle(
  credentials: GoogleCredentials,
  url: string,
  notificationType: GoogleIndexingNotificationType,
) {
  const accessToken = await getAccessToken(credentials);
  const response = await fetch(INDEXING_PUBLISH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: notificationType }),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`Google Indexing API failed (${response.status}): ${truncate(text)}`);
  }

  return body;
}

async function recordAttempt(
  supabaseAdmin: SupabaseAdminClient | undefined,
  row: {
    jobId: string;
    employerId?: string | null;
    requestedBy?: string | null;
    notificationType: GoogleIndexingNotificationType;
    url: string;
    status: "sent" | "skipped" | "error";
    errorMessage?: string | null;
    googleResponse?: unknown;
    reason?: string;
  },
) {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin.from("google_indexing_notifications").insert({
    job_id: row.jobId,
    employer_id: row.employerId ?? null,
    requested_by: row.requestedBy ?? null,
    notification_type: row.notificationType,
    url: row.url,
    status: row.status,
    error_message: row.errorMessage ?? null,
    google_response: row.googleResponse ?? null,
    reason: row.reason ?? null,
  });

  if (error) {
    console.warn("[google-indexing] failed to record attempt", error.message ?? error);
  }
}

export async function notifyGoogleIndexing(
  options: NotifyGoogleIndexingOptions,
): Promise<GoogleIndexingResult> {
  const url = jobUrl(options.job.id);
  const disabled = (Deno.env.get("GOOGLE_INDEXING_DISABLED") ?? "").toLowerCase() === "true";

  if (disabled) {
    await recordAttempt(options.supabaseAdmin, {
      jobId: options.job.id,
      employerId: options.job.employer_id,
      requestedBy: options.requestedBy,
      notificationType: options.notificationType,
      url,
      status: "skipped",
      errorMessage: "Google Indexing notifications are disabled.",
      reason: options.reason,
    });
    return {
      ok: true,
      configured: false,
      status: "skipped",
      url,
      notificationType: options.notificationType,
      error: "Google Indexing notifications are disabled.",
    };
  }

  let credentials: GoogleCredentials | null = null;
  try {
    credentials = getGoogleCredentials();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Google service account JSON.";
    await recordAttempt(options.supabaseAdmin, {
      jobId: options.job.id,
      employerId: options.job.employer_id,
      requestedBy: options.requestedBy,
      notificationType: options.notificationType,
      url,
      status: "error",
      errorMessage: message,
      reason: options.reason,
    });
    return { ok: false, configured: true, status: "error", url, notificationType: options.notificationType, error: message };
  }

  if (!credentials) {
    const message = "Google Indexing service account secrets are not configured.";
    await recordAttempt(options.supabaseAdmin, {
      jobId: options.job.id,
      employerId: options.job.employer_id,
      requestedBy: options.requestedBy,
      notificationType: options.notificationType,
      url,
      status: "skipped",
      errorMessage: message,
      reason: options.reason,
    });
    return {
      ok: true,
      configured: false,
      status: "skipped",
      url,
      notificationType: options.notificationType,
      error: message,
    };
  }

  try {
    const googleResponse = await publishToGoogle(credentials, url, options.notificationType);
    await recordAttempt(options.supabaseAdmin, {
      jobId: options.job.id,
      employerId: options.job.employer_id,
      requestedBy: options.requestedBy,
      notificationType: options.notificationType,
      url,
      status: "sent",
      googleResponse,
      reason: options.reason,
    });
    return {
      ok: true,
      configured: true,
      status: "sent",
      url,
      notificationType: options.notificationType,
      googleResponse,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Indexing notification failed.";
    await recordAttempt(options.supabaseAdmin, {
      jobId: options.job.id,
      employerId: options.job.employer_id,
      requestedBy: options.requestedBy,
      notificationType: options.notificationType,
      url,
      status: "error",
      errorMessage: message,
      reason: options.reason,
    });
    return { ok: false, configured: true, status: "error", url, notificationType: options.notificationType, error: message };
  }
}

