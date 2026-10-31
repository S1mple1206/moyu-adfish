const $ = id => document.getElementById(id);
let state, settingsSaveTimer, pendingSetting;
async function command(action, value) {
  const result = await window.browser.command(action, value);
  if (result?.error) {
    if (action === 'save') $('settings-error').textContent = result.error;
    else showAddressError(result.error);
  }
  return result;
}
window.browser.onState(next => {
  const tabChanged = state?.tabs?.find(tab => tab.active)?.id !== next.tabs?.find(tab => tab.active)?.id;
  state = next;
  document.documentElement.dataset.theme = next.config.theme;
  $('menu-button').setAttribute('aria-expanded', String(next.menuOpen));
  $('back').disabled = !next.back;
  $('forward').disabled = !next.forward;
  $('reload').disabled = !next.url;
  document.title = next.config.title;
  renderTabs(next.tabs);
  $('error-panel').hidden = !next.failure;
  $('error-detail').textContent = next.failure;
  $('quick-close-error').textContent = next.quickCloseError || '';
  if (tabChanged && document.activeElement === $('address')) $('address').blur();
  if (tabChanged || document.activeElement !== $('address')) {
    $('address').value = next.url;
    clearAddressError();
  }
  if (!next.settings && $('settings-dialog').open) $('settings-dialog').close();
});
let renderedActiveTab;
function renderTabs(tabs) {
  if (!tabs) return;
  const container = $('tabs');
  for (const element of [...container.children]) {
    if (!tabs.some(tab => String(tab.id) === element.dataset.id)) element.remove();
  }
  for (const tab of tabs) {
    let element = [...container.children].find(item => item.dataset.id === String(tab.id));
    if (!element) {
      element = document.createElement('div');
      element.dataset.id = tab.id; element.className = 'browser-tab';
      const select = document.createElement('button');
      select.className = 'tab-select'; select.setAttribute('role', 'tab');
      select.onclick = () => command('tab-select', tab.id);
      const close = document.createElement('button');
      close.className = 'tab-close'; close.textContent = '×';
      close.onclick = () => command('tab-close', tab.id);
      element.append(select, close); container.append(element);
    }
    element.classList.toggle('active', tab.active);
    const select = element.querySelector('.tab-select');
    select.textContent = tab.title;
    select.title = (tab.loading ? '正在加载：' : '') + tab.title;
    select.setAttribute('aria-selected', String(tab.active));
    select.tabIndex = tab.active ? 0 : -1;
    element.querySelector('.tab-close').setAttribute('aria-label', `关闭标签页：${tab.title}`);
    if (tab.active && renderedActiveTab !== tab.id) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' }); renderedActiveTab = tab.id;
    }
  }
}
$('new-tab').onclick = () => command('tab-new');
new ResizeObserver(() => {
  document.querySelector('.browser-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}).observe($('tabs'));
$('tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = state.tabs, index = tabs.findIndex(tab => tab.active);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length;
  command('tab-select', tabs[next].id);
});
function clearAddressError() {
  $('address').setCustomValidity('');
  $('address').removeAttribute('aria-invalid');
  $('address').title = '网址或搜索';
  $('address-error').textContent = '';
}
function showAddressError(message) {
  $('address-error').textContent = message;
  $('address').setCustomValidity(message);
  $('address').setAttribute('aria-invalid', 'true');
  $('address').title = message;
}
window.browser.onFocusAddress(async () => {
  if ($('settings-dialog').open) await closeSettings();
  clearAddressError();
  $('address').focus(); $('address').select();
});
$('address').oninput = clearAddressError;
$('address').onfocus = () => command('address-focus', true);
$('address').onblur = () => {
  command('address-focus', false);
  if (!$('address').hasAttribute('aria-invalid')) $('address').value = state?.url || '';
};
$('address').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    clearAddressError(); $('address').value = state?.url || ''; $('address').blur();
  }
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); command('focus-address'); }
});
$('address-form').onsubmit = async event => {
  event.preventDefault();
  clearAddressError();
  const result = await command('navigate', $('address').value);
  if (result?.error) $('address').reportValidity();
  else $('address').blur();
};
for (const action of ['minimize', 'close']) $(action).onclick = () => command(action);
$('menu-button').onclick = () => command('menu');
$('go-home').onclick = () => command('home');
for (const action of ['back', 'forward', 'reload']) $(action).onclick = () => command(action);
$('retry').onclick = () => command('reload');
async function openSettings() {
  if ($('settings-dialog').open) return;
  const form = $('settings-form');
  for (const key of ['width', 'height', 'title', 'home', 'theme']) form.elements[key].value = state.config[key];
  form.elements.autoScale.checked = state.config.autoScale;
  form.elements.stealthMode.checked = state.config.stealthMode;
  form.elements.pauseOnLeave.checked = state.config.pauseOnLeave;
  form.elements.quickClose.checked = state.config.quickClose;
  form.elements.quickCloseKey.value = state.config.quickCloseKey;
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '修改后自动保存';
  await command('settings', true); $('settings-dialog').showModal();
}
window.browser.onOpenSettings(openSettings);
window.browser.onQuickClose(async () => { await saveSetting(); await command('close'); });
const quickCloseKey = $('quick-close-key');
quickCloseKey.onfocus = () => command('quick-close-capture', true);
quickCloseKey.onblur = () => command('quick-close-capture', false);
quickCloseKey.onkeydown = event => {
  event.preventDefault(); event.stopPropagation();
  if (event.repeat) return;
  const key = event.code === 'Space' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!/^(Alt|Control|Shift|Meta|Escape|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Left|Right|Up|Down)|[A-Z0-9]|F([1-9]|1[0-9]|2[0-4]))$/.test(key)) return;
  if (key === 'Alt') { $('settings-error').textContent = 'Alt 已用于手动隐身，请选择其他快速关闭按键'; return; }
  quickCloseKey.value = key;
  quickCloseKey.dispatchEvent(new Event('input', { bubbles: true }));
  quickCloseKey.dispatchEvent(new Event('change', { bubbles: true }));
};
async function saveSetting() {
  clearTimeout(settingsSaveTimer);
  const input = pendingSetting;
  pendingSetting = undefined;
  if (!input) return;
  if (!input.checkValidity()) {
    $('settings-error').textContent = `${input.closest('label').firstChild.textContent.trim()}：${input.validationMessage}`;
    $('settings-save-status').textContent = '此项未保存，请填写有效值';
    return;
  }
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '正在保存…';
  const result = await command('save', { [input.name]: input.type === 'checkbox' ? input.checked : input.value });
  $('settings-save-status').textContent = result?.error ? '此项未保存' : '已自动保存';
}
async function closeSettings() {
  await saveSetting();
  await command('quick-close-capture', false);
  await command('settings', false);
}
$('cancel-settings').onclick = closeSettings;
$('settings-dialog').addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
$('settings-form').addEventListener('input', event => {
  if (!event.target.name) return;
  pendingSetting = event.target;
  clearTimeout(settingsSaveTimer);
  $('settings-error').textContent = '';
  $('settings-save-status').textContent = '等待自动保存…';
  settingsSaveTimer = setTimeout(saveSetting, 400);
});
$('settings-form').addEventListener('change', event => {
  if (pendingSetting !== event.target) return;
  saveSetting();
});
$('settings-form').onsubmit = event => {
  event.preventDefault();
  saveSetting();
};
command('ready');
