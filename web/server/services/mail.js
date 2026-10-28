// Invitation emails. Without SMTP_URL nothing is sent: the person inviting always gets the
// link to share (copy, WhatsApp).

const { config } = require('../config');

let transport = null;

function isConfigured() {
  return !!config.smtpUrl;
}

function getTransport() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport(config.smtpUrl);
  }
  return transport;
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @returns {Promise<boolean>} Whether the email was sent.
 */
async function sendInvitation({ to, inviteeName, branchName, roleLabel, link, expiresAt, invitedBy }) {
  if (!isConfigured() || !to) return false;
  const date = new Date(expiresAt).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' });
  const greeting = inviteeName ? `السلام عليكم ${inviteeName}،` : 'السلام عليكم،';
  const text = [
    greeting,
    '',
    `تمت دعوتك للانضمام إلى «${branchName}» في منصة إدارة الجمعيات القرآنية بصفة: ${roleLabel}.`,
    invitedBy ? `صاحب الدعوة: ${invitedBy}` : '',
    '',
    'لإنشاء حسابك، افتح الرابط التالي واختر اسم المستخدم وكلمة المرور:',
    link,
    '',
    `هذا الرابط صالح لمرة واحدة حتى ${date}. إن لم تكن تنتظر هذه الدعوة فتجاهل هذه الرسالة.`,
  ]
    .filter((line) => line !== null)
    .join('\n');
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8">
  <p>${escapeHtml(greeting)}</p>
  <p>تمت دعوتك للانضمام إلى «<strong>${escapeHtml(branchName)}</strong>» في منصة إدارة الجمعيات القرآنية بصفة: <strong>${escapeHtml(roleLabel)}</strong>.</p>
  ${invitedBy ? `<p>صاحب الدعوة: ${escapeHtml(invitedBy)}</p>` : ''}
  <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f6f4a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">إنشاء الحساب</a></p>
  <p style="color:#666;font-size:13px">هذا الرابط صالح لمرة واحدة حتى ${escapeHtml(date)}. إن لم تكن تنتظر هذه الدعوة فتجاهل هذه الرسالة.</p>
</div>`;
  await getTransport().sendMail({
    from: config.mailFrom,
    to,
    subject: `دعوة للانضمام إلى ${branchName}`,
    text,
    html,
  });
  return true;
}

module.exports = { isConfigured, sendInvitation };
