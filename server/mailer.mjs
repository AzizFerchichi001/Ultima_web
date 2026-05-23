import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS.replace(/\s/g, ""),
  },
});

// Verify SMTP connection at startup so misconfiguration surfaces immediately.
transporter.verify()
  .then(() => console.log("[mailer] SMTP connection verified — ready to send"))
  .catch((err) => console.error("[mailer] SMTP connection FAILED:", err.message));

const SMTP_FROM = String(process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "").trim();

function splitCode(code) {
  return String(code).padStart(6, "0").split("");
}

function renderDigitBoxes(code) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
      <tr>
        ${splitCode(code)
          .map(
            (d) => `<td style="padding:0 4px;">
          <div style="width:44px;height:56px;background:#071827;border:2px solid #00D8F0;border-radius:10px;text-align:center;line-height:56px;font-size:26px;font-weight:800;color:#00E5FF;font-family:Courier New,monospace;letter-spacing:0;">${d}</div>
        </td>`
          )
          .join("")}
      </tr>
    </table>`;
}

function renderEmail({ title, preheaderText, headerIcon, bodyHtml, footerNote }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]><style>table{border-collapse:collapse}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#070D1A;font-family:'Segoe UI',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#070D1A;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">

          <!-- Header strip -->
          <tr>
            <td style="background:linear-gradient(135deg,#003D5C 0%,#00223A 50%,#001428 100%);border-radius:16px 16px 0 0;padding:32px 36px;border:1px solid #0A3654;border-bottom:none;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.3);border-radius:8px;padding:6px 14px;margin-bottom:20px;">
                      <span style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#00E5FF;font-weight:700;">ULTIMA PLATFORM</span>
                    </div>
                    <div style="font-size:36px;margin-bottom:10px;">${headerIcon}</div>
                    <h1 style="margin:0;font-size:24px;font-weight:700;color:#FFFFFF;line-height:1.3;">${title}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#0C1A2E;border:1px solid #0A3654;border-top:none;border-bottom:none;padding:32px 36px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#070D1A;border:1px solid #0A3654;border-top:2px solid #0A3654;border-radius:0 0 16px 16px;padding:20px 36px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;font-size:12px;color:#4A6A80;line-height:1.5;">${footerNote ?? "If you did not request this, you can safely ignore this email."}</p>
                    <p style="margin:0;font-size:11px;color:#2E4A5E;">
                      &copy; 2025 Ultima Platform &nbsp;&bull;&nbsp; Smart Sports Analytics
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    throw new Error("SMTP is not configured. Check SMTP_HOST and SMTP_FROM in .env");
  }
  console.log(`[mailer] Sending email to: ${to}`);
  await transporter.sendMail({ from: SMTP_FROM, to, subject, html, text });
  console.log(`[mailer] Email sent successfully to: ${to}`);
}

export async function sendPasswordResetCodeEmail({ to, code }) {
  console.log("Sending reset email to:", to);
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: "Your Password Reset Code",
    html: `
      <h2>Password Reset</h2>
      <p>Your reset code is:</p>
      <h1 style="letter-spacing:8px;">${code}</h1>
      <p>This code expires in 15 minutes.</p>
    `,
  });
  console.log("Reset email sent successfully to:", to);
}

export async function sendVerificationCodeEmail({ to, firstName, code, verifyLink = null }) {
  const safeName = firstName ? ` ${firstName}` : "";
  const subject = "Verify your ULTIMA account ✓";
  const html = renderEmail({
    title: "Verify Your Email",
    headerIcon: "✉️",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:15px;color:#B8D4E8;">Welcome${safeName}!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#B8D4E8;line-height:1.6;">
        Thanks for joining Ultima Platform. Enter the code below in the app to verify your email address and activate your account.
      </p>

      <div style="background:#071827;border:1px solid #0A3654;border-radius:14px;padding:28px 24px;text-align:center;margin-bottom:24px;">
        <p style="margin:0 0 16px;font-size:13px;color:#5A8AA8;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Verification code</p>
        ${renderDigitBoxes(code)}
        <p style="margin:18px 0 0;font-size:12px;color:#4A6A80;">Valid for <strong style="color:#00C4D8;">24 hours</strong> &nbsp;&bull;&nbsp; Single use only</p>
      </div>

      ${
        verifyLink
          ? `<div style="text-align:center;margin-bottom:20px;">
          <a href="${verifyLink}" style="display:inline-block;background:linear-gradient(135deg,#00B4CC,#0084A8);color:#FFFFFF;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:10px;letter-spacing:0.5px;">Verify with Link &rarr;</a>
          <p style="margin:10px 0 0;font-size:11px;color:#3A5A70;word-break:break-all;">${verifyLink}</p>
        </div>`
          : ""
      }

      <div style="background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.15);border-radius:10px;padding:14px 18px;">
        <p style="margin:0;font-size:12px;color:#4A8090;line-height:1.6;">
          <strong style="color:#00B4CC;">Why verify?</strong> Email verification keeps your account secure and enables match notifications, coaching updates, and more.
        </p>
      </div>
    `,
    footerNote: "If you did not create an Ultima account, you can safely ignore this email.",
  });
  const text = `Welcome${safeName},\n\nYour ULTIMA email verification code is: ${code}\nIt expires in 24 hours.\n${verifyLink ? `\nVerify link: ${verifyLink}\n` : ""}\nIf you did not create this account, ignore this email.`;
  return sendMail({ to, subject, html, text });
}

export async function sendPasswordResetEmail({ to, firstName, resetLink }) {
  const safeName = firstName ? ` ${firstName}` : "";
  const subject = "Reset your ULTIMA password";
  const html = renderEmail({
    title: "Password Reset Request",
    headerIcon: "🔑",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:15px;color:#B8D4E8;">Hi${safeName},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#B8D4E8;line-height:1.6;">
        We received a request to reset the password for your account. Click the button below to set a new password.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#00B4CC,#0084A8);color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:15px 36px;border-radius:12px;letter-spacing:0.5px;">Reset My Password &rarr;</a>
      </div>
      <p style="margin:0 0 16px;font-size:12px;color:#3A5A70;word-break:break-all;text-align:center;">${resetLink}</p>
      <div style="background:rgba(255,160,0,0.07);border:1px solid rgba(255,160,0,0.2);border-radius:10px;padding:14px 18px;">
        <p style="margin:0;font-size:12px;color:#B08030;line-height:1.6;">
          <strong style="color:#D4A040;">Security tip:</strong> This link expires in 20 minutes. We will never ask for this link or your password.
        </p>
      </div>
    `,
    footerNote: "If you did not request a password reset, no action is needed. Your account remains secure.",
  });
  const text = `Hi${safeName},\n\nReset your ULTIMA password:\n${resetLink}\n\nIf you did not request this, ignore this email.`;
  return sendMail({ to, subject, html, text });
}

export async function sendVerificationEmail({ to, firstName, verifyLink }) {
  const safeName = firstName ? ` ${firstName}` : "";
  const subject = "Verify your ULTIMA email";
  const html = renderEmail({
    title: "Verify Your Email Address",
    headerIcon: "✉️",
    bodyHtml: `
      <p style="margin:0 0 8px;font-size:15px;color:#B8D4E8;">Welcome${safeName}!</p>
      <p style="margin:0 0 24px;font-size:15px;color:#B8D4E8;line-height:1.6;">
        Click the button below to confirm your email address and activate your Ultima account.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${verifyLink}" style="display:inline-block;background:linear-gradient(135deg,#00B4CC,#0084A8);color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:15px 36px;border-radius:12px;letter-spacing:0.5px;">Verify My Email &rarr;</a>
      </div>
      <p style="margin:0 0 16px;font-size:12px;color:#3A5A70;word-break:break-all;text-align:center;">${verifyLink}</p>
    `,
    footerNote: "If you did not create an Ultima account, you can safely ignore this email.",
  });
  const text = `Welcome${safeName},\n\nVerify your ULTIMA email:\n${verifyLink}\n\nIf you did not create this account, ignore this email.`;
  return sendMail({ to, subject, html, text });
}

export function isMailerConfigured() {
  return Boolean(transporter);
}
