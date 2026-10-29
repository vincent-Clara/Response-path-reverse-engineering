// 各家 API 的請求組裝。所有請求都從瀏覽器直接送出。
window.PROVIDERS = {
  openai:    { kind: 'openai',    baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini:    { kind: 'gemini',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  anthropic: { kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  ollama:    { kind: 'openai',    baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
  lmstudio:  { kind: 'openai',    baseUrl: 'http://localhost:1234/v1', model: '' },
  koboldcpp: { kind: 'openai',    baseUrl: 'http://localhost:5001/v1', model: 'koboldcpp' },
  custom:    { kind: 'openai',    baseUrl: 'http://localhost:8000/v1', model: '' },
};

function trimSlash(u) { return (u || '').replace(/\/+$/, ''); }

// 回傳 { url, init } —— 方便測試
window.buildRequest = function (cfg, system, user) {
  const kind = PROVIDERS[cfg.provider]?.kind || 'openai';
  const base = trimSlash(cfg.baseUrl);
  const temp = Number(cfg.temperature);
  const max = Number(cfg.maxTokens) || 4096;
  if (kind === 'gemini') {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: temp, maxOutputTokens: max },
    };
    if (cfg.jsonMode) body.generationConfig.responseMimeType = 'application/json';
    return { url: `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey }, body: JSON.stringify(body) } };
  }
  if (kind === 'anthropic') {
    return { url: `${base}/messages`, init: { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: cfg.model, system, max_tokens: max, temperature: Math.min(temp, 1),
        messages: [{ role: 'user', content: user }] }) } };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  const body = { model: cfg.model, temperature: temp, max_tokens: max,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (cfg.jsonMode) body.response_format = { type: 'json_object' };
  return { url: `${base}/chat/completions`, init: { method: 'POST', headers, body: JSON.stringify(body) } };
};

window.extractText = function (cfg, data) {
  const kind = PROVIDERS[cfg.provider]?.kind || 'openai';
  if (kind === 'gemini') return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (kind === 'anthropic') return (data.content || []).map(c => c.text || '').join('');
  return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
};

window.callLLM = async function (cfg, system, user) {
  const { url, init } = buildRequest(cfg, system, user);
  let res;
  try { res = await fetch(url, init); }
  catch (e) { throw new Error('連線失敗（多半是 CORS 或伺服器沒開）：' + e.message); }
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}：${raw.slice(0, 400)}`);
  return extractText(cfg, JSON.parse(raw));
};

window.listModels = async function (cfg) {
  const kind = PROVIDERS[cfg.provider]?.kind || 'openai';
  const base = trimSlash(cfg.baseUrl);
  let url = `${base}/models`, headers = {};
  if (kind === 'gemini') headers['x-goog-api-key'] = cfg.apiKey;
  else if (kind === 'anthropic') Object.assign(headers, { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
  else if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
  const isLocal = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(base);
  const hint = cfg.provider === 'ollama'
    ? '。Ollama 預設會擋掉從網頁來的請求：請先設定環境變數 OLLAMA_ORIGINS=*（或此網頁網址）後重啟 Ollama'
    : cfg.provider === 'lmstudio' ? '。請在 LM Studio 的 Server 設定開啟「Enable CORS」並確認伺服器已啟動'
    : isLocal ? '。請確認本地伺服器已啟動並允許跨來源請求（CORS）' : '';
  let res;
  try { res = await fetch(url, { headers }); }
  catch (e) { throw new Error('連線失敗（伺服器沒開或被 CORS 擋下）' + hint); }
  if (!res.ok) throw new Error(`HTTP ${res.status}` + (res.status === 403 ? hint : ''));
  const d = await res.json();
  if (kind === 'gemini') return (d.models || []).map(m => m.name.replace(/^models\//, ''));
  if (Array.isArray(d.models)) return d.models.map(m => m.name || m.model);
  return (d.data || []).map(m => m.id);
};

// 從舊版移植：擷取第一個 { 到最後一個 } 之間的 JSON
window.parseAnalysis = function (text) {
  let t = (text || '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1) t = t.substring(a, b + 1);
  else t = t.replace(/^```(?:json)?/, '').replace(/```$/, '');
  return JSON.parse(t);
};

// 舊版是把 schema 交給 Gemini；通用端點不一定支援，所以把 schema 附在系統提示裡
window.buildUserContent = function (userPrompt, userContext) {
  return `
  使用者的提示詞 (Prompt):
  """
  ${userPrompt}
  """
  ${userContext ? `
  前置情境 / 角色設定 (Context/Persona):
  """
  ${userContext}
  """
  注意：請根據此 Context 調整對模型回應路徑的預測 (例如若設定為壞壞角色，則應預測不禮貌的回應)。
  ` : ''}`;
};
window.buildSystem = function (sys) {
  return sys + '\n\n**輸出 JSON 必須符合以下 JSON Schema：**\n' + JSON.stringify(RESPONSE_SCHEMA);
};
if (typeof module !== 'undefined') module.exports = window;
