import "server-only";

import nodemailer from "nodemailer";

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  authUser: string;
  authPass: string;
  from: string;
  replyTo?: string;
};

function resolveEmailConfig(): { config: EmailConfig } | { error: string } {
  const host = process.env.SMTP_SERVER?.trim() || "smtp-relay.brevo.com";
  const portRaw = process.env.SMTP_PORT?.trim() || "587";
  const port = Number.parseInt(portRaw, 10);

  if (!Number.isFinite(port) || port <= 0) {
    return { error: "Invalid SMTP_PORT. Expected a positive integer." };
  }

  const authUser = process.env.SMTP_LOGIN?.trim() || "a2998b001@smtp-brevo.com";
  const authPass = process.env.SMTP_KEY?.trim() || "";

  if (!authPass) {
    return { error: "Missing SMTP_KEY." };
  }

  const from = process.env.EMAIL_FROM?.trim() || `Dormy <${authUser}>`;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

  return {
    config: {
      host,
      port,
      secure: port === 465,
      authUser,
      authPass,
      from,
      replyTo,
    },
  };
}

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransporterKey: string | null = null;

function getTransporter(): { transporter: nodemailer.Transporter; config: EmailConfig } | { error: string } {
  const resolved = resolveEmailConfig();
  if ("error" in resolved) {
    return { error: resolved.error };
  }

  const { config } = resolved;
  const key = [config.host, config.port, config.authUser].join("|");

  if (!cachedTransporter || cachedTransporterKey !== key) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.authUser,
        pass: config.authPass,
      },
    });
    cachedTransporterKey = key;
  }

  return { transporter: cachedTransporter, config };
}

export async function sendEmail(options: SendEmailOptions) {
  const transport = getTransporter();
  if ("error" in transport) {
    return { success: false as const, error: transport.error };
  }

  const { transporter, config } = transport;
  try {
    const info = await transporter.sendMail({
      from: config.from,
      replyTo: options.replyTo ?? config.replyTo,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    return { success: true as const, messageId: info.messageId };
  } catch (error) {
    return { success: false as const, error };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  const escaped = escapeHtml(value.trim());
  const lines = escaped.split(/\r?\n/);
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (buffer.length) {
        paragraphs.push(`<p style="margin:0 0 12px 0;">${buffer.join("<br/>")}</p>`);
        buffer = [];
      }
      continue;
    }
    buffer.push(line);
  }

  if (buffer.length) {
    paragraphs.push(`<p style="margin:0 0 12px 0;">${buffer.join("<br/>")}</p>`);
  }

  return paragraphs.join("");
}

function renderShell({
  title,
  bodyHtml,
}: {
  title: string;
  bodyHtml: string;
}) {
  const safeTitle = escapeHtml(title);
  return `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:#f8fafc; padding:24px;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">
      <div style="padding:18px 20px; border-bottom:1px solid #e2e8f0;">
        <div style="font-size:14px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b;">Dormy</div>
        <div style="font-size:20px; font-weight:700; margin-top:6px; color:#0f172a;">${safeTitle}</div>
      </div>
      <div style="padding:20px; color:#0f172a; font-size:14px; line-height:1.6;">
        ${bodyHtml}
        <div style="margin-top:18px; padding-top:14px; border-top:1px solid #e2e8f0; color:#64748b; font-size:12px;">
          This email was sent by Dormy. If you believe this is a mistake, please contact your dorm staff.
        </div>
      </div>
    </div>
  </div>
  `.trim();
}

function normalizePesos(amountPesos: number) {
  const formatted = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountPesos);
  return `PHP ${formatted}`;
}

export function renderPaymentReceiptEmail(input: {
  recipientName: string | null;
  amountPesos: number;
  paidAtIso: string;
  ledgerLabel: string;
  method: string | null;
  note: string | null;
  eventTitle: string | null;
  customMessage: string | null;
  subjectOverride?: string | null;
}) {
  const subject =
    input.subjectOverride?.trim() ||
    (input.eventTitle ? `Payment receipt: ${input.eventTitle}` : "Payment receipt");

  const paidAt = new Date(input.paidAtIso);
  const paidAtLabel = Number.isNaN(paidAt.getTime())
    ? input.paidAtIso
    : paidAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

  const messageHtml = input.customMessage?.trim()
    ? textToHtml(input.customMessage)
    : "";

  const greeting = input.recipientName?.trim()
    ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.trim())},</p>`
    : `<p style="margin:0 0 12px 0;">Hi,</p>`;

  const detailRows: Array<[string, string]> = [
    ["Amount", normalizePesos(input.amountPesos)],
    ["Ledger", escapeHtml(input.ledgerLabel)],
    ["Date", escapeHtml(paidAtLabel)],
  ];

  if (input.eventTitle?.trim()) {
    detailRows.splice(2, 0, ["Event", escapeHtml(input.eventTitle.trim())]);
  }
  if (input.method?.trim()) {
    detailRows.push(["Method", escapeHtml(input.method.trim())]);
  }
  if (input.note?.trim()) {
    detailRows.push(["Note", escapeHtml(input.note.trim())]);
  }

  const tableHtml = `
    <table role="presentation" style="width:100%; border-collapse:collapse; margin-top:12px;">
      <tbody>
        ${detailRows
          .map(
            ([label, value]) => `
            <tr>
              <td style="padding:10px 0; border-bottom:1px solid #e2e8f0; color:#64748b; width:140px;">${label}</td>
              <td style="padding:10px 0; border-bottom:1px solid #e2e8f0; font-weight:600; color:#0f172a;">${value}</td>
            </tr>
          `.trim()
          )
          .join("")}
      </tbody>
    </table>
  `.trim();

  const defaultMessageHtml = `<p style="margin:0 0 12px 0;">We received your payment. Thank you.</p>`;

  const bodyHtml = [
    greeting,
    messageHtml || defaultMessageHtml,
    tableHtml,
  ].join("");

  const textParts = [
    input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : "Hi,",
    input.customMessage?.trim() ? `\n${input.customMessage.trim()}\n` : "",
    input.customMessage?.trim() ? "" : `We received your payment. Thank you.`,
    `Amount: ${normalizePesos(input.amountPesos)}`,
    input.eventTitle?.trim() ? `Event: ${input.eventTitle.trim()}` : "",
    `Ledger: ${input.ledgerLabel}`,
    `Date: ${paidAtLabel}`,
    input.method?.trim() ? `Method: ${input.method.trim()}` : "",
    input.note?.trim() ? `Note: ${input.note.trim()}` : "",
  ].filter(Boolean);

  return {
    subject,
    html: renderShell({ title: "Payment receipt", bodyHtml }),
    text: textParts.join("\n"),
  };
}

export function renderAccountWelcomeEmail(input: {
  recipientEmail: string;
  recipientName: string | null;
  roleLabel: string;
  loginUrl: string;
}) {
  const greeting = input.recipientName?.trim()
    ? `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(input.recipientName.trim())},</p>`
    : `<p style="margin:0 0 12px 0;">Hi,</p>`;

  const bodyHtml = [
    greeting,
    `<p style="margin:0 0 12px 0;">Your Dormy account is ready.</p>`,
    `<p style="margin:0 0 12px 0;"><strong>Role:</strong> ${escapeHtml(input.roleLabel)}</p>`,
    `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(input.loginUrl)}" style="color:#2563eb; font-weight:600;">Open Dormy</a></p>`,
    `<p style="margin:0 0 12px 0; color:#64748b;">If you did not expect this email, you can ignore it.</p>`,
  ].join("");

  return {
    subject: "Welcome to Dormy",
    html: renderShell({ title: "Welcome", bodyHtml }),
    text: [
      input.recipientName?.trim() ? `Hi ${input.recipientName.trim()},` : "Hi,",
      "Your Dormy account is ready.",
      `Role: ${input.roleLabel}`,
      `Open Dormy: ${input.loginUrl}`,
    ].join("\n"),
  };
}

export function renderDormInviteEmail(input: {
  dormName: string;
  roleLabel: string;
  joinUrl: string;
  note: string | null;
}) {
  const bodyHtml = [
    `<p style="margin:0 0 12px 0;">You have been invited to join <strong>${escapeHtml(input.dormName)}</strong> in Dormy.</p>`,
    `<p style="margin:0 0 12px 0;"><strong>Role:</strong> ${escapeHtml(input.roleLabel)}</p>`,
    input.note?.trim() ? `<div style="margin:0 0 12px 0;">${textToHtml(input.note)}</div>` : "",
    `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(input.joinUrl)}" style="color:#2563eb; font-weight:600;">Go to Join page</a></p>`,
    `<p style="margin:0 0 12px 0; color:#64748b;">Sign in with Google using this email, then accept the invite.</p>`,
  ].filter(Boolean).join("");

  return {
    subject: `Dormy invite: ${input.dormName}`,
    html: renderShell({ title: "Dorm invite", bodyHtml }),
    text: [
      `You have been invited to join ${input.dormName} in Dormy.`,
      `Role: ${input.roleLabel}`,
      input.note?.trim() ? `Note: ${input.note.trim()}` : "",
      `Join: ${input.joinUrl}`,
      `Sign in with Google using this email, then accept the invite.`,
    ].filter(Boolean).join("\n"),
  };
}
