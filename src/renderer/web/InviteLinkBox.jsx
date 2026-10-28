import React, { useState } from 'react';
import { Alert, Button, Form, InputGroup } from 'react-bootstrap';

/**
 * Shows a new invitation link once (it cannot be shown again: only its fingerprint is kept)
 * with copy and WhatsApp buttons.
 * @param {{link: string, emailed?: boolean, email?: string, branchName?: string, roleLabel?: string}} props
 */
function InviteLinkBox({ link, emailed, email, branchName, roleLabel }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.getElementById('invite-link-input');
      if (input) {
        input.select();
        document.execCommand('copy');
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const message = `السلام عليكم، هذه دعوة للانضمام إلى «${branchName || 'الفرع'}»${
    roleLabel ? ` بصفة ${roleLabel}` : ''
  } في منصة إدارة الجمعيات القرآنية. افتح الرابط لإنشاء حسابك (صالح لمرة واحدة):\n${link}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <Alert variant="success" className="mb-0">
      <div className="fw-bold mb-2">تم إنشاء الدعوة.</div>
      {emailed ? (
        <div className="small mb-2">أُرسلت الدعوة إلى {email}. يمكنك أيضاً مشاركة الرابط:</div>
      ) : (
        <div className="small mb-2">
          شارك هذا الرابط مع الشخص المدعو (لن يظهر مرة أخرى). هو صالح لمرة واحدة:
        </div>
      )}
      <InputGroup size="sm" className="mb-2">
        <Form.Control
          id="invite-link-input"
          value={link}
          readOnly
          dir="ltr"
          onFocus={(e) => e.target.select()}
        />
        <Button variant="outline-secondary" onClick={copy}>
          {copied ? 'تم النسخ ✓' : 'نسخ'}
        </Button>
      </InputGroup>
      <Button variant="success" size="sm" href={whatsapp} target="_blank" rel="noopener noreferrer">
        إرسال عبر واتساب
      </Button>
    </Alert>
  );
}

export default InviteLinkBox;
