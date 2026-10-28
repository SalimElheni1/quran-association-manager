// The browser's stand-in for Electron's renderer modules. src/main/preload.js is bundled as is
// (vite.config.mjs swaps its `require('electron')` for this module), so window.electronAPI has
// exactly the desktop's methods; each ipcRenderer.invoke becomes an HTTP call to the branch's
// RPC endpoint. Desktop file dialogs become a file picker + upload (open) and a browser download
// (save).

import { toast } from 'react-toastify';
import { imageSrc } from '@renderer/utils/platform';
import { apiFetch, pickFile } from './http';

const listeners = new Map();

function emit(channel, ...args) {
  for (const handler of listeners.get(channel) || []) {
    try {
      handler({ sender: null }, ...args);
    } catch (error) {
      console.error(`[ipc] listener for ${channel} failed`, error);
    }
  }
}

const apiBase = () => window.__QAM_BRANCH__.apiBase;

// Channels whose desktop handler opens a file dialog: the browser asks for the file first.
const UPLOAD_CHANNELS = {
  'settings:uploadLogo': {
    accept: 'image/png,image/jpeg,image/gif',
    cancel: { success: false, message: 'No file selected.' },
  },
  'import:execute': {
    accept: '.xlsx',
    cancel: { success: false, message: 'Import canceled by user.' },
  },
};

function acceptFromFilters(filters) {
  const exts = new Set();
  for (const filter of filters || []) {
    for (const ext of filter.extensions || []) {
      if (ext && ext !== '*') exts.add(`.${String(ext).toLowerCase()}`);
    }
  }
  return [...exts].join(',');
}

async function upload(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`${apiBase()}/uploads`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'تعذر رفع الملف.');
  return body;
}

function download({ id, name }) {
  const a = document.createElement('a');
  a.href = `${apiBase()}/downloads/${encodeURIComponent(id)}`;
  // An empty download attribute: the server's Content-Disposition names the file (it keeps
  // Arabic names, which the attribute does not always).
  a.setAttribute('download', '');
  a.title = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function rpc(channel, args, uploads = []) {
  // Trailing undefined arguments are left out, as JSON would turn them into null.
  const list = [...args];
  while (list.length && list[list.length - 1] === undefined) list.pop();
  const res = await apiFetch(`${apiBase()}/rpc/${encodeURIComponent(channel)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: list, uploads }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.status === 401) {
    emit('force-logout');
    throw new Error((body && body.error) || 'انتهت الجلسة. سجّل الدخول من جديد.');
  }
  if (res.status === 403 && body && /موقوف/.test(body.error || '')) {
    window.location.reload();
  }
  if (!body || !body.ok)
    throw new Error((body && body.error) || `خطأ في الاتصال بالخادم (${res.status}).`);
  for (const file of body.downloads || []) download(file);
  for (const event of body.events || []) {
    if (event.channel === 'ui:show-error-toast') toast.error(event.args[0]);
    else if (event.channel === 'ui:show-success-toast') toast.success(event.args[0]);
    else emit(event.channel, ...(event.args || []));
  }
  let result = body.result;
  if (channel === 'settings:getLogo' && result && result.path) {
    result = { ...result, path: imageSrc(result.path) };
  }
  return result;
}

async function login(credentials) {
  const res = await apiFetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false, message: body.error || 'فشل تسجيل الدخول' };
  return body;
}

async function logout() {
  try {
    await apiFetch(`${apiBase()}/auth/logout`, { method: 'POST' });
  } catch {
    // the session ends on the server anyway when it expires
  }
}

export const ipcRenderer = {
  async invoke(channel, ...args) {
    if (channel === 'auth:login') return login(args[0]);
    if (channel === 'app:relaunch') {
      window.location.reload();
      return true;
    }
    if (channel === 'dialog:openFile') {
      const options = args[0] || {};
      const file = await pickFile(acceptFromFilters(options.filters));
      if (!file) return { canceled: true, filePaths: [] };
      const uploaded = await upload(file);
      return { canceled: false, filePaths: [uploaded.id] };
    }
    if (UPLOAD_CHANNELS[channel]) {
      const file = await pickFile(UPLOAD_CHANNELS[channel].accept);
      if (!file) return UPLOAD_CHANNELS[channel].cancel;
      const uploaded = await upload(file);
      return rpc(channel, args, [uploaded.id]);
    }
    return rpc(channel, args);
  },
  send(channel, ...args) {
    if (channel === 'logout') {
      logout();
    } else if (channel === 'ui:show-error-toast') {
      toast.error(args[0]);
    } else if (channel === 'ui:show-success-toast') {
      toast.success(args[0]);
    }
  },
  on(channel, handler) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(handler);
    return ipcRenderer;
  },
  once(channel, handler) {
    const wrapped = (...args) => {
      ipcRenderer.removeListener(channel, wrapped);
      handler(...args);
    };
    return ipcRenderer.on(channel, wrapped);
  },
  removeListener(channel, handler) {
    const set = listeners.get(channel);
    if (set) set.delete(handler);
    return ipcRenderer;
  },
  removeAllListeners(channel) {
    listeners.delete(channel);
    return ipcRenderer;
  },
};

export const contextBridge = {
  exposeInMainWorld(key, api) {
    window[key] = api;
  },
};

/** Calls a web-only channel (invitations, sessions, audit log). */
export const webCall = (channel, ...args) => rpc(channel, args);

export default { ipcRenderer, contextBridge };
