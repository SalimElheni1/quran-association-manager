import React from 'react';
import ReactDOM from 'react-dom/client';
import { Button, Card } from 'react-bootstrap';
import '@renderer/styles/custom-bootstrap.scss';
import '@renderer/styles/index.css';
import './web.css';

/** A centered card with the app's look, used by the web-only pages. */
export function AuthCard({ title, subtitle, wide, children }) {
  return (
    <div className="web-auth-page">
      <Card className={`web-auth-card${wide ? ' wide' : ''}`}>
        <Card.Body>
          <div className="web-auth-header">
            <img src="/g247.png" alt="" aria-hidden="true" />
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </Card.Body>
      </Card>
    </div>
  );
}

function MessagePage({ title, text, link, retry }) {
  return (
    <AuthCard title={title}>
      <p className="text-center">{text}</p>
      <div className="text-center d-flex gap-2 justify-content-center">
        {link && <Button href={link.href}>{link.label}</Button>}
        {retry && <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>}
      </div>
    </AuthCard>
  );
}

export function renderMessagePage(props) {
  ReactDOM.createRoot(document.getElementById('root')).render(<MessagePage {...props} />);
}

export default MessagePage;
