/**
 * Notification dispatch + in-app inbox.
 *
 * Ported 2026-05-12 from api/dispatch.py.
 *   POST /api/notifications/send             — render + dispatch (multi-channel)
 *   GET  /api/notifications/inbox            — current user's in-app inbox
 *   POST /api/notifications/inbox/{id}/read  — mark in-app notification opened
 *
 * Channels: email (Resend), in_app (just log row), sms (Twilio),
 * web_push (deferred — marked 'skipped' with reason).
 *
 * Caller passes the pre-loaded HTML template; substrate's notification
 * shim loads from legos/<lego>/emails/<template>.html before invocation.
 */

import { randomUUID } from "node:crypto";
import { err, ok } from "./_lib/handler";
import type { HandlerContext, HandlerResult } from "./_lib/handler";

const RESEND_API = "https://api.resend.com";
const TWILIO_API = "https://api.twilio.com/2010-04-01";

export interface NotificationsConfig {
  readonly default_channels?: string[];
  readonly resend_from_email?: string;
  readonly twilio_messaging_service_sid?: string;
}

interface DispatchResult {
  readonly success: boolean;
  readonly messageId: string | null;
  readonly error: string | null;
}

// ── template rendering ────────────────────────────────────────────────────

function renderTemplate(
  templateName: string,
  variables: Record<string, unknown>,
  htmlBody: string,
): { subject: string; html: string } {
  let rendered = htmlBody;
  for (const [k, v] of Object.entries(variables)) {
    const value = String(v);
    rendered = rendered.split(`{{${k}}}`).join(value);
    rendered = rendered.split(`{{ ${k} }}`).join(value);
  }
  const match = rendered.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const subject = (match ? match[1].trim() : templateName)
    .replace(/\n/g, " ")
    .slice(0, 200);
  return { subject, html: rendered };
}

// ── channel dispatchers ───────────────────────────────────────────────────

async function sendResend(
  toEmail: string,
  fromEmail: string,
  subject: string,
  html: string,
  apiKey: string,
): Promise<DispatchResult> {
  try {
    const resp = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await resp.json()) as Record<string, unknown>;
    if (resp.status >= 400) {
      return {
        success: false,
        messageId: null,
        error: (body.message as string) || `resend status ${resp.status}`,
      };
    }
    return { success: true, messageId: (body.id as string) || null, error: null };
  } catch (e) {
    return { success: false, messageId: null, error: String(e) };
  }
}

async function sendTwilioSms(
  toNumber: string,
  body: string,
  accountSid: string,
  authToken: string,
  messagingServiceSid: string | undefined,
): Promise<DispatchResult> {
  if (!accountSid || !authToken) {
    return { success: false, messageId: null, error: "twilio not configured" };
  }
  const url = `${TWILIO_API}/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: toNumber, Body: body });
  if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const bodyJson = (await resp.json()) as Record<string, unknown>;
    if (resp.status >= 400) {
      return {
        success: false,
        messageId: null,
        error: (bodyJson.message as string) || `twilio status ${resp.status}`,
      };
    }
    return {
      success: true,
      messageId: (bodyJson.sid as string) || null,
      error: null,
    };
  } catch (e) {
    return { success: false, messageId: null, error: String(e) };
  }
}

// ── db helpers ────────────────────────────────────────────────────────────

async function getUserChannels(
  ctx: HandlerContext,
  userId: string,
  category: string,
): Promise<string[]> {
  const rows = await ctx.db.query<{ channel: string; enabled: boolean }>(
    "SELECT channel, enabled FROM notification_preferences WHERE user_id = $1::uuid AND category = $2",
    userId,
    category,
  );
  return rows.filter((r) => r.enabled).map((r) => r.channel);
}

async function persistLog(
  ctx: HandlerContext,
  userId: string,
  templateName: string,
  category: string,
  channel: string,
  status: string,
  providerMessageId: string | null,
  failureReason: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  const logId = randomUUID();
  await ctx.db.execute(
    "INSERT INTO notification_log " +
      "(id, user_id, template_name, category, channel, status, " +
      "provider_message_id, failure_reason, payload, dispatched_at) " +
      "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())",
    logId,
    userId,
    templateName,
    category,
    channel,
    status,
    providerMessageId,
    failureReason,
    JSON.stringify(payload),
  );
  return logId;
}

// ── handler: send notification ────────────────────────────────────────────

export interface SendNotificationInput {
  readonly body: {
    user_id?: string;
    template_name?: string;
    category?: string;
    variables?: Record<string, unknown>;
    to_email?: string;
    to_phone?: string;
    html_template?: string;
  };
  readonly config: NotificationsConfig;
  readonly ctx: HandlerContext;
}

export async function handleSendNotification({
  body,
  config,
  ctx,
}: SendNotificationInput): Promise<HandlerResult> {
  const userId = body.user_id || "";
  const templateName = body.template_name || "";
  const category = body.category || "transactional";
  const variables = body.variables || {};
  const toEmail = body.to_email || "";
  const toPhone = body.to_phone || "";
  const htmlTemplate = body.html_template || "";

  if (!userId || !templateName || !htmlTemplate) {
    return err(400, "user_id, template_name, html_template required");
  }

  let channels = await getUserChannels(ctx, userId, category);
  if (channels.length === 0) {
    channels = [...(config.default_channels || [])];
  }

  const { subject, html } = renderTemplate(templateName, variables, htmlTemplate);

  const dispatched: Array<{ channel: string; status: string; log_id: string }> = [];
  const skipped: Array<{ channel: string; reason: string; log_id?: string }> = [];

  if (channels.includes("email")) {
    if (!toEmail) {
      skipped.push({ channel: "email", reason: "no_to_email" });
    } else {
      const fromEmail = config.resend_from_email || "";
      const apiKey = process.env.RESEND_API_KEY || "";
      if (!fromEmail || !apiKey) {
        skipped.push({ channel: "email", reason: "resend_not_configured" });
      } else {
        const result = await sendResend(toEmail, fromEmail, subject, html, apiKey);
        const status = result.success ? "dispatched" : "failed";
        const logId = await persistLog(
          ctx,
          userId,
          templateName,
          category,
          "email",
          status,
          result.messageId,
          result.error,
          { to: toEmail, subject },
        );
        dispatched.push({ channel: "email", status, log_id: logId });
      }
    }
  }

  if (channels.includes("in_app")) {
    const logId = await persistLog(
      ctx,
      userId,
      templateName,
      category,
      "in_app",
      "delivered",
      null,
      null,
      { subject, body: html.slice(0, 2000) },
    );
    dispatched.push({ channel: "in_app", status: "delivered", log_id: logId });
  }

  if (channels.includes("sms")) {
    if (!toPhone) {
      skipped.push({ channel: "sms", reason: "no_to_phone" });
    } else {
      const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      const authToken = process.env.TWILIO_AUTH_TOKEN || "";
      const msgServiceSid = config.twilio_messaging_service_sid;
      const smsBody =
        subject + ": " + html.slice(0, 140).replace(/[<>]/g, "");
      const result = await sendTwilioSms(
        toPhone,
        smsBody,
        accountSid,
        authToken,
        msgServiceSid,
      );
      const status = result.success ? "dispatched" : "failed";
      const logId = await persistLog(
        ctx,
        userId,
        templateName,
        category,
        "sms",
        status,
        result.messageId,
        result.error,
        { to: toPhone, body_preview: smsBody.slice(0, 80) },
      );
      dispatched.push({ channel: "sms", status, log_id: logId });
    }
  }

  if (channels.includes("web_push")) {
    const logId = await persistLog(
      ctx,
      userId,
      templateName,
      category,
      "web_push",
      "skipped",
      null,
      "web_push_dispatcher_not_yet_implemented",
      { subject },
    );
    skipped.push({
      channel: "web_push",
      reason: "dispatcher_deferred",
      log_id: logId,
    });
  }

  await ctx.events.publish("notifications.dispatched", {
    user_id: userId,
    template_name: templateName,
    category,
    dispatched_count: dispatched.length,
    skipped_count: skipped.length,
  });

  return ok({ dispatched, skipped });
}

// ── handler: inbox ────────────────────────────────────────────────────────

export interface InboxInput {
  readonly userId: string | null;
  readonly ctx: HandlerContext;
}

interface InboxRow {
  id: string;
  template_name: string;
  category: string;
  payload: string | Record<string, unknown>;
  opened_at: string | null;
  created_at: string;
}

function parsePayload(p: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof p === "string") {
    try {
      return JSON.parse(p);
    } catch {
      return {};
    }
  }
  return p || {};
}

export async function handleInbox({
  userId,
  ctx,
}: InboxInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");

  const rows = await ctx.db.query<InboxRow>(
    "SELECT id, template_name, category, payload, opened_at, created_at " +
      "FROM notification_log WHERE user_id = $1::uuid AND channel = 'in_app' " +
      "ORDER BY created_at DESC LIMIT 100",
    userId,
  );

  const items = rows.map((r) => {
    const payload = parsePayload(r.payload);
    return {
      id: r.id,
      template_name: r.template_name,
      category: r.category,
      subject: payload.subject as string | undefined,
      body: payload.body as string | undefined,
      is_read: r.opened_at !== null,
      created_at: r.created_at,
    };
  });
  const unreadCount = items.filter((i) => !i.is_read).length;
  return ok({ items, unread_count: unreadCount });
}

// ── handler: mark in-app notification read ────────────────────────────────

export interface MarkReadInput {
  readonly userId: string | null;
  readonly notificationId: string;
  readonly ctx: HandlerContext;
}

export async function handleMarkRead({
  userId,
  notificationId,
  ctx,
}: MarkReadInput): Promise<HandlerResult> {
  if (!userId) return err(401, "authentication required");
  if (!notificationId) return err(400, "notification id required");

  const updated = await ctx.db.query<{ id: string }>(
    "UPDATE notification_log SET opened_at = NOW(), status = 'opened' " +
      "WHERE id = $1::uuid AND user_id = $2::uuid AND opened_at IS NULL RETURNING id",
    notificationId,
    userId,
  );

  if (updated.length > 0) {
    await ctx.events.publish("notifications.user_marked_read", {
      user_id: userId,
      notification_id: notificationId,
    });
  }

  return ok({ marked_read: updated.length > 0 });
}
