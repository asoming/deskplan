'use strict';
const api = window.fourfold, input = document.querySelector('#quick-title');
let saving = false, composing = false;
input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });
input.addEventListener('keydown', e => { if (e.key === 'Enter' && (composing || e.isComposing)) e.preventDefault(); });
const hide = () => api.call('quick:hide');
document.querySelector('#close').onclick = hide;
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
document.querySelector('#capture').onsubmit = async e => {
  e.preventDefault(); if (saving || composing || !input.value.trim()) return;
  saving = true;
  try { await api.call('quick:create', { title: input.value.trim() }); input.value = ''; document.querySelector('#quick-error').textContent = '回车存入收集箱 · 稍后再安排'; }
  catch (error) { document.querySelector('#quick-error').textContent = error.message; }
  finally { saving = false; }
};
api.onQuickFocus(() => input.focus());
