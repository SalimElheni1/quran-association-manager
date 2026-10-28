// fetch for the API: same-origin cookies and the X-QAM header every state-changing call needs.

export function apiFetch(url, options = {}) {
  return fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'X-QAM': '1', ...(options.headers || {}) },
  });
}

/** JSON call; throws an Error with the server's message when the answer is not OK. */
export async function apiJson(url, { method = 'GET', body } = {}) {
  const res = await apiFetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error((data && data.error) || `خطأ في الاتصال بالخادم (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/** Opens the browser's file picker; resolves to the chosen File, or null when cancelled. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () =>
      finish(input.files && input.files[0] ? input.files[0] : null),
    );
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}
