// Outgoing email (password reset, address verification) with nodemailer over any SMTP
// server — your own (Postfix, Mailcow…), your mailbox provider (Google Workspace, Zoho,
// Fastmail…) or a sending service. Configure either:
//   SMTP_HOST=mail.example.com  SMTP_PORT=587  SMTP_USER=…  SMTP_PASS=…  [SMTP_SECURE=true for 465]
// or one URL:  SMTP_URL=smtps://user:pass@mail.example.com:465
//   MAIL_FROM="Starring <hello@starring.dev>"
// Without either, nothing is sent: in development the email is printed to the server log
// so you can click the link; in production it's dropped with a warning.
import nodemailer from 'nodemailer';

const env = process.env;

/** nodemailer transport options from SMTP_* variables (SMTP_URL wins if both are set). */
export const smtpConfig = (e: NodeJS.ProcessEnv = env) => {
  if (e.SMTP_URL?.trim()) return e.SMTP_URL.trim();
  if (!e.SMTP_HOST?.trim()) return null;
  const port = Number(e.SMTP_PORT) || 587;
  return {
    host: e.SMTP_HOST.trim(),
    port,
    // implicit TLS on 465; otherwise STARTTLS is negotiated when the server offers it
    secure: e.SMTP_SECURE ? /^(1|true|yes)$/i.test(e.SMTP_SECURE) : port === 465,
    ...(e.SMTP_USER && { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS ?? '' } }),
  };
};

const config = smtpConfig();
const transport = config ? nodemailer.createTransport(config) : null;
const FROM = env.MAIL_FROM || 'Starring <no-reply@starring.dev>';

export const mailEnabled = !!transport;

export interface Mail {
  to: string;
  subject: string;
  heading: string;
  body: string;
  /** Optional label/value lines under the body (the weekly digest's numbers). */
  rows?: [string, string][];
  action: { label: string; url: string };
  footer: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain, readable HTML that survives every mail client; text part for the rest. */
const render = ({ heading, body, rows = [], action, footer }: Mail) => ({
  text: `${heading}\n\n${body}\n${rows.length ? `\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n` : ''}\n${action.label}: ${action.url}\n\n${footer}\n\n— Starring · https://starring.dev`,
  html: `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f2f0e9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" style="max-width:520px">
<tr><td style="padding-bottom:28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" valign="middle" style="background:#d4ff00;border-radius:7px;color:#0a0a0a;font:16px/28px Arial,sans-serif">&#10022;</td><td style="padding-left:10px;font:700 20px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:-0.5px;color:#f2f0e9">starring</td></tr></table></td></tr>
<tr><td style="font-size:28px;font-weight:700;line-height:1.2;padding-bottom:16px">${esc(heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.6;color:#c9c6bd;padding-bottom:28px">${esc(body)}</td></tr>
${rows.length ? `<tr><td style="padding-bottom:28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([k, v]) => `<tr><td style="font:12px monospace;letter-spacing:1px;text-transform:uppercase;color:#8a877e;padding:8px 0;border-bottom:1px solid #2a2926">${esc(k)}</td><td align="right" style="font-size:15px;color:#f2f0e9;padding:8px 0;border-bottom:1px solid #2a2926">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : ''}
<tr><td style="padding-bottom:28px"><a href="${esc(action.url)}" style="display:inline-block;background:#d4ff00;color:#0a0a0a;text-decoration:none;font:700 14px monospace;letter-spacing:1px;padding:14px 22px">${esc(action.label.toUpperCase())}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#8a877e">${esc(footer)}<br><br>If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${esc(action.url)}</span></td></tr>
</table></td></tr></table></body></html>`,
});

export async function sendMail(mail: Mail) {
  const { text, html } = render(mail);
  if (!transport) {
    if (env.NODE_ENV !== 'production') {
      console.log(`\n✉️  [mail not configured — dev log]\nTo: ${mail.to}\nSubject: ${mail.subject}\n${text}\n`);
    } else {
      console.warn(`[mail] SMTP is not configured (SMTP_HOST or SMTP_URL) — dropped "${mail.subject}" to ${mail.to}`);
    }
    return;
  }
  await transport.sendMail({ from: FROM, to: mail.to, subject: mail.subject, text, html, headers: mail.headers });
}

export const resetPasswordMail = (to: string, url: string): Mail => ({
  to,
  subject: 'Reset your Starring password',
  heading: 'Reset your password',
  body: 'Someone (hopefully you) asked to reset the password for your Starring account. The link works for one hour.',
  action: { label: 'Choose a new password', url },
  footer: "Didn't ask for this? Ignore this email — your password stays the same.",
});

export const verifyEmailMail = (to: string, url: string): Mail => ({
  to,
  subject: 'Confirm your email for Starring',
  heading: 'Confirm your email',
  body: 'One click and your Starring account is confirmed — so you can always get back in, even if you forget your password.',
  action: { label: 'Confirm email', url },
  footer: "Didn't sign up for Starring? Ignore this email and no account will be confirmed.",
});
