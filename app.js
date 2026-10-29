const $ = id => document.getElementById(id);
const LS = 'rpre.settings.v1';
const defaults = { provider: 'openai', baseUrl: PROVIDERS.openai.baseUrl, apiKey: '', model: PROVIDERS.openai.model,
  temperature: 0.7, maxTokens: 4096, jsonMode: true, context: '' };
let cfg = Object.assign({}, defaults, JSON.parse(localStorage.getItem(LS) || '{}'));
const fields = ['provider', 'baseUrl', 'apiKey', 'model', 'temperature', 'maxTokens', 'jsonMode'];
const icons = () => window.lucide && lucide.createIcons();
const save = () => localStorage.setItem(LS, JSON.stringify(cfg));

function load() {
  fields.forEach(f => { const el = $(f); if (el.type === 'checkbox') el.checked = !!cfg[f]; else el.value = cfg[f]; });
  $('context').value = $('contextSide').value = cfg.context;
  $('tempVal').textContent = cfg.temperature;
  $('engineLabel').textContent = $('footerModel').textContent = cfg.model || '未設定模型';
}
fields.forEach(f => $(f).addEventListener(f === 'jsonMode' ? 'change' : 'input', e => {
  const el = e.target; cfg[f] = el.type === 'checkbox' ? el.checked : el.value;
  if (f === 'provider') { cfg.baseUrl = PROVIDERS[cfg.provider].baseUrl; cfg.model = PROVIDERS[cfg.provider].model; }
  save(); load();
}));
['context', 'contextSide'].forEach(id => $(id).addEventListener('input', e => { cfg.context = e.target.value; save(); load(); }));

function setStatus(t, cls) { $('status').textContent = t; $('status').className = cls; }
$('input').addEventListener('input', () => { $('count').textContent = $('input').value.length + ' 字'; $('send').disabled = !$('input').value.trim(); });
$('toggleCtx').addEventListener('click', () => {
  const hidden = $('context').classList.toggle('hidden');
  $('ctxChevron').outerHTML = `<i id="ctxChevron" data-lucide="${hidden ? 'chevron-down' : 'chevron-up'}" class="w-3 h-3"></i>`; icons();
});
$('toggleSide').addEventListener('click', () => $('side').classList.toggle('hidden'));

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('input').value.trim(); if (!text) return;
  if (!cfg.model) { alert('請先在左側填模型名稱'); return; }
  $('error').classList.add('hidden'); $('results').innerHTML = '';
  $('send').disabled = $('input').disabled = true; $('sendLabel').textContent = '解構中...'; setStatus('ANALYZING', 'text-amber-400');
  let raw = '';
  try {
    raw = await callLLM(cfg, buildSystem(SYSTEM_INSTRUCTION), buildUserContent(text, cfg.context));
    let r; try { r = parseAnalysis(raw); } catch { throw new Error('分析失敗：模型輸出了無效的格式，請稍後再試。'); }
    $('intro').classList.add('hidden');
    $('results').innerHTML = renderResult(r); icons(); setStatus('ONLINE', 'text-emerald-500');
  } catch (err) {
    $('errorMsg').textContent = err.message || '分析過程中發生未知錯誤。';
    $('errorRaw').textContent = raw; $('errorRawBox').classList.toggle('hidden', !raw);
    $('error').classList.remove('hidden'); setStatus('ERROR', 'text-rose-500');
  }
  $('send').disabled = $('input').disabled = false; $('sendLabel').textContent = '注入提示詞';
});
$('fetchModels').addEventListener('click', async () => {
  try { const ms = await listModels(cfg); $('modelList').innerHTML = ms.map(m => `<option value="${esc(m)}">`).join(''); $('connMsg').textContent = `取得 ${ms.length} 個模型`; }
  catch (e) { $('connMsg').textContent = '取得模型失敗：' + e.message; }
});
$('testConn').addEventListener('click', async () => {
  $('connMsg').textContent = '測試中…';
  try { const t = await callLLM({ ...cfg, jsonMode: false, maxTokens: 32 }, 'Reply with OK.', 'ping'); $('connMsg').textContent = '✅ 已連線：' + t.slice(0, 40); setStatus('ONLINE', 'text-emerald-500'); }
  catch (e) { $('connMsg').textContent = '❌ ' + e.message.slice(0, 200); setStatus('ERROR', 'text-rose-500'); }
});
$('clearKey').addEventListener('click', () => { cfg.apiKey = ''; save(); load(); });
load(); $('send').disabled = true; icons();
