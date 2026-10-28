// The branch app: the desktop renderer, unchanged, with window.electronAPI talking to the server.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { apiJson } from '@web/http';
import { renderMessagePage } from '@web/common/MessagePage';

export async function start(slug) {
  const apiBase = `/api/b/${slug}`;
  window.__QAM_BRANCH__ = { slug, apiBase, name: '' };

  let me;
  try {
    me = await apiJson(`${apiBase}/auth/me`);
  } catch (error) {
    if (error.status === 404) {
      renderMessagePage({
        title: 'الفرع غير موجود',
        text: 'تأكد من رابط الفرع، أو اطلبه من المسؤول عن فرعك.',
        link: { href: '/', label: 'الصفحة الرئيسية' },
      });
    } else if (error.status === 403) {
      renderMessagePage({ title: 'الفرع موقوف', text: error.message });
    } else {
      renderMessagePage({
        title: 'تعذر الاتصال بالخادم',
        text: 'تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة.',
        retry: true,
      });
    }
    return;
  }

  window.__QAM_BRANCH__.name = me.branch.name;
  document.title = `${me.branch.name} — إدارة الفرع`;

  // window.electronAPI: the desktop preload, over HTTP.
  const { webCall } = await import('@web/electronRenderer');
  await import('@main/preload.js');
  window.electronAPI.webCall = webCall;

  const [{ HashRouter }, { ToastContainer }, { default: App }, { AuthProvider }] =
    await Promise.all([
      import('react-router-dom'),
      import('react-toastify'),
      import('@renderer/App'),
      import('@renderer/contexts/AuthContext'),
      import('@renderer/styles/custom-bootstrap.scss'),
      import('@renderer/styles/index.css'),
    ]);

  if (!me.user && window.location.hash && window.location.hash !== '#/login') {
    window.location.hash = '#/login';
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider initialUser={me.user}>
        <HashRouter>
          <App />
        </HashRouter>
      </AuthProvider>
      <ToastContainer
        position="top-right"
        autoClose={8000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={true}
        theme="colored"
      />
    </React.StrictMode>,
  );
}
