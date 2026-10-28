// The home page: branches are not listed (one branch should not learn which others exist);
// people open their branch's address, or type its code here.

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Alert, Button, Form, InputGroup } from 'react-bootstrap';
import { AuthCard } from './MessagePage';

function Home() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const go = (e) => {
    e.preventDefault();
    const slug = code.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      setError('رمز الفرع يتكوّن من حروف لاتينية صغيرة وأرقام وشرطات، كما في رابط فرعك.');
      return;
    }
    window.location.assign(`/b/${slug}/`);
  };

  return (
    <AuthCard
      title="منصة الجمعيات القرآنية"
      subtitle="إدارة الطلاب والمعلمين والحلقات والمالية لكل فرع"
    >
      <Form onSubmit={go}>
        <Form.Label htmlFor="branch-code">رمز الفرع</Form.Label>
        <InputGroup className="mb-2">
          <Form.Control
            id="branch-code"
            dir="ltr"
            placeholder="sousse"
            value={code}
            autoCapitalize="none"
            onChange={(e) => {
              setCode(e.target.value);
              setError('');
            }}
          />
          <Button type="submit">دخول</Button>
        </InputGroup>
        <Form.Text className="text-muted d-block mb-3">
          تجده في رابط فرعك: <span dir="ltr">…/b/رمز-الفرع</span>. إن لم يكن لديك حساب، اطلب دعوة من
          مدير النظام في فرعك.
        </Form.Text>
        {error && <Alert variant="danger">{error}</Alert>}
      </Form>
      <hr />
      <div className="text-center small">
        <a href="/platform">دخول إدارة المنصة</a>
      </div>
    </AuthCard>
  );
}

export function start() {
  document.title = 'منصة الجمعيات القرآنية';
  ReactDOM.createRoot(document.getElementById('root')).render(<Home />);
}
