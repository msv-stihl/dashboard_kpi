const DEFAULTS = {
  SPREADSHEET_ID: "",
  SOURCE_SHEET: "prisma_source",
  API_URL: "",
  API_METHOD: "GET",
  API_HEADERS_JSON: "{}",
  API_PAYLOAD_JSON: "",
  REQUEST_VERIFICATION_TOKEN: "",
  SIGNALR_ID_CONNECTION: "",
  COOKIE: ""
};

const PRISMA_SOURCE_HEADER_TO_FIELD = {
  numero_os: "c0",
  os_cliente: "c1",
  equipamento: "c2",
  ativo: "c3",
  oficina: "c4",
  denominacao_os: "c5",
  descricao_os: "c6",
  estado_os: "c7",
  origem_os: "c8",
  prioridade: "c9",
  procedimento: "c10",
  tipo_servico: "c11",
  descricao_tipo_servico: "c12",
  tecnico: "c13",
  numero_planejamento: "c14",
  horas_mo: "c15",
  data_criacao: "c16",
  data_prevista: "c17",
  data_1o_atendimento: "c18",
  data_fechamento: "c19"
};

const PRISMA_SOURCE_DATE_HEADERS = {
  data_criacao: true,
  data_prevista: true,
  data_1o_atendimento: true,
  data_fechamento: true
};

function setConfig(cfg) {
  const props = PropertiesService.getScriptProperties();
  const merged = Object.assign({}, DEFAULTS, cfg || {});
  props.setProperties(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v ?? "")])));
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.assign({}, DEFAULTS, props);
}

function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function fetchApi_() {
  const cfg = getConfig_();
  if (!cfg.API_URL) throw new Error("API_URL ausente");
  const headers = safeJson_(cfg.API_HEADERS_JSON, {});
  const method = String(cfg.API_METHOD || "GET").toUpperCase();
  const mergedHeaders = Object.assign(
    {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    headers
  );
  if (cfg.REQUEST_VERIFICATION_TOKEN && !mergedHeaders.RequestVerificationToken && !mergedHeaders["X-RequestVerificationToken"]) {
    mergedHeaders.RequestVerificationToken = String(cfg.REQUEST_VERIFICATION_TOKEN);
  }
  if (cfg.SIGNALR_ID_CONNECTION && !mergedHeaders["X-SignalR-ConnectionId"]) {
    mergedHeaders["X-SignalR-ConnectionId"] = String(cfg.SIGNALR_ID_CONNECTION);
  }
  if (cfg.COOKIE && !mergedHeaders.Cookie) {
    mergedHeaders.Cookie = String(cfg.COOKIE);
  }
  const options = {
    method,
    muteHttpExceptions: true,
    followRedirects: true,
    headers: mergedHeaders
  };
  let payload = String(cfg.API_PAYLOAD_JSON || "");
  if (method !== "GET") {
    if (cfg.REQUEST_VERIFICATION_TOKEN) payload = appendFormField_(payload, "__RequestVerificationToken", String(cfg.REQUEST_VERIFICATION_TOKEN));
    if (cfg.SIGNALR_ID_CONNECTION) payload = appendFormField_(payload, "connectionId", String(cfg.SIGNALR_ID_CONNECTION));
    if (payload) options.payload = payload;
  }

  const res = UrlFetchApp.fetch(cfg.API_URL, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error("HTTP " + code + " " + text.slice(0, 400));
  const parsed = safeJson_(text, null);
  if (parsed == null) throw new Error("Resposta não JSON");
  return parsed;
}

function safeJson_(text, fallback) {
  try { return JSON.parse(String(text)); } catch { return fallback; }
}

function appendFormField_(payload, key, value) {
  const p = String(payload || "");
  const k = encodeURIComponent(String(key));
  if (p.includes(k + "=")) return p;
  const v = encodeURIComponent(String(value));
  if (!p) return `${k}=${v}`;
  return `${p}&${k}=${v}`;
}

function normalizeRecords_(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const directKeys = ["data", "Data", "items", "Items", "rows", "Rows", "records", "Records"];
    for (const k of directKeys) {
      if (Array.isArray(payload[k])) return payload[k];
    }
    const nestedKeys = ["result", "Result", "response", "Response"];
    for (const k of nestedKeys) {
      const v = payload[k];
      if (!v || typeof v !== "object") continue;
      for (const kk of directKeys) {
        if (Array.isArray(v[kk])) return v[kk];
      }
    }
    const discovered = findRecordsArrayDeep_(payload, 0, 5);
    if (discovered) return discovered;
  }
  return [];
}

function findRecordsArrayDeep_(node, depth, maxDepth) {
  if (depth > maxDepth || node == null) return null;
  if (Array.isArray(node)) {
    if (!node.length) return null;
    const first = node[0];
    if (Array.isArray(first)) return node;
    if (first && typeof first === "object") {
      const keys = Object.keys(first);
      if (keys.some((k) => /^c\d+$/i.test(k))) return node;
      if (keys.length >= 4) return node;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const entries = Object.entries(node);
  for (const [, v] of entries) {
    const found = findRecordsArrayDeep_(v, depth + 1, maxDepth);
    if (found) return found;
  }
  return null;
}

function writeDebugInfo_(payload, records) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) return;
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sh = ensureSheet_(ss, "_debug_last");
  sh.clearContents();
  const first = records.length ? normalizeRecordObject_(records[0]) : null;
  const scan = scanCFields_(records, 100);
  const missingExpected = ["c16", "c17", "c18", "c19"].filter((k) => !scan.present[k]).join(", ");
  const lines = [
    ["updated_at", new Date().toISOString()],
    ["payload_type", Array.isArray(payload) ? "array" : typeof payload],
    ["records_count", records.length],
    ["detected_max_c", scan.maxC],
    ["missing_expected_c16_c19", missingExpected],
    ["payload_top_keys", payload && typeof payload === "object" ? Object.keys(payload).slice(0, 50).join(", ") : ""],
    ["first_record_keys", first ? Object.keys(first).slice(0, 50).join(", ") : ""],
    ["first_record_sample", first ? JSON.stringify(Object.fromEntries(Object.entries(first).slice(0, 6))) : ""]
  ];
  sh.getRange(1, 1, lines.length, 2).setValues(lines);
}

function scanCFields_(records, limit) {
  const present = {};
  let maxC = -1;
  const n = Math.min(Number(limit) || 0, Array.isArray(records) ? records.length : 0);
  for (let i = 0; i < n; i++) {
    const r = normalizeRecordObject_(records[i]);
    if (!r) continue;
    for (const k of Object.keys(r)) {
      const key = String(k).toLowerCase();
      present[key] = true;
      const m = key.match(/^c(\d+)$/);
      if (m) maxC = Math.max(maxC, Number(m[1]));
    }
  }
  return { present, maxC };
}

function normalizeRecordObject_(record) {
  if (!record) return null;
  if (Array.isArray(record)) {
    const obj = {};
    for (let i = 0; i < record.length; i++) obj["c" + i] = record[i];
    return obj;
  }
  if (typeof record === "object") {
    const obj = {};
    for (const [k, v] of Object.entries(record)) obj[String(k).toLowerCase()] = v;
    return obj;
  }
  return null;
}

function formatDateTimePtBR_(value) {
  if (value == null || value === "") return "";
  let d = null;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") {
    const n = value;
    if (n > 1e12) d = new Date(n);
    else if (n > 1e9) d = new Date(n * 1000);
  } else if (typeof value === "string") {
    const s = value.trim();
    const m1 = s.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//i) || s.match(/Date\((-?\d+)([+-]\d{4})?\)/i);
    if (m1) d = new Date(Number(m1[1]));
    if (!d) {
      const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (m2) {
        const day = Number(m2[1]);
        const month = Number(m2[2]) - 1;
        const year = Number(m2[3]);
        const hh = Number(m2[4] || 0);
        const mm = Number(m2[5] || 0);
        const ss = Number(m2[6] || 0);
        d = new Date(year, month, day, hh, mm, ss);
      }
    }
    if (!d) {
      const dt = new Date(s);
      if (!Number.isNaN(dt.getTime())) d = dt;
    }
  }
  if (!d || Number.isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, "America/Sao_Paulo", "dd/MM/yyyy HH:mm");
}

function parseHeader_(raw, colIndex) {
  const s = String(raw || "").trim();
  const m = s.match(/\b(c\d+)\b/i);
  const explicitField = m ? String(m[1]).toLowerCase() : "";
  const base = s.includes("-") ? s.split("-")[0].trim() : s;
  const fallback = "c" + colIndex;
  return { raw: s, base, explicitField, fallback };
}

function updatePrismaSource(records) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sh = ensureSheet_(ss, cfg.SOURCE_SHEET);

  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || "").trim());
  const dataRows = Array.isArray(records) ? records : [];

  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();

  if (!dataRows.length) {
    PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
    return;
  }

  const values = [];
  for (const raw of dataRows) {
    const r = normalizeRecordObject_(raw);
    if (!r) continue;
    const row = new Array(lastCol).fill("");
    for (let c = 0; c < lastCol; c++) {
      const { base, explicitField, fallback } = parseHeader_(headers[c], c);
      const mapped = PRISMA_SOURCE_HEADER_TO_FIELD[base];
      const field = explicitField || mapped || fallback;
      let v = r[field];
      if (base === "horas_mo" || field === "c15") {
        const n = typeof v === "number" ? v : Number(String(v || "").replace(",", "."));
        v = Number.isFinite(n) ? n / 3600 : v;
      }
      if (PRISMA_SOURCE_DATE_HEADERS[base] || field === "c16" || field === "c17" || field === "c18" || field === "c19") {
        v = formatDateTimePtBR_(v);
      }
      row[c] = v == null ? "" : v;
    }
    values.push(row);
  }
  if (values.length) sh.getRange(2, 1, values.length, lastCol).setValues(values);
  PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
}

function runFetchAndUpdate() {
  const payload = fetchApi_();
  const records = normalizeRecords_(payload);
  writeDebugInfo_(payload, records);
  updatePrismaSource(records);
  return { ok: true, records: records.length };
}

function runFetchAndUpdateDebug() {
  const payload = fetchApi_();
  const records = normalizeRecords_(payload);
  writeDebugInfo_(payload, records);
  const first = records.length ? normalizeRecordObject_(records[0]) : null;
  const sample = {};
  if (first && typeof first === "object") {
    const keys = Object.keys(first).slice(0, 6);
    for (const k of keys) sample[k] = first[k];
  }
  updatePrismaSource(records);
  return {
    ok: true,
    records: records.length,
    payloadType: Array.isArray(payload) ? "array" : typeof payload,
    payloadTopKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
    firstRecordKeys: first ? Object.keys(first).slice(0, 25) : [],
    firstRecordSample: sample
  };
}

function createEvery30MinTrigger() {
  const handlers = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "runFetchAndUpdate");
  for (const t of handlers) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger("runFetchAndUpdate").timeBased().everyMinutes(30).create();
}

function getSheetValues_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return null;
  const range = sh.getDataRange();
  const values = range.getValues();
  if (!values || values.length < 2) return null;
  return values;
}

function asTable_(values) {
  const headers = values[0].map((h) => String(h || "").trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const v = row[c];
      if (v !== "" && v != null) hasAny = true;
      obj[key] = v;
    }
    if (hasAny) rows.push(obj);
  }
  return rows;
}

function kvFromTable_(values) {
  const rows = values.slice(1);
  const out = {};
  for (const r of rows) {
    const k = String(r[0] || "").trim();
    if (!k) continue;
    out[k] = r[1];
  }
  return out;
}

function buildDashboardPayload_() {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);

  const last = PropertiesService.getScriptProperties().getProperty("LAST_UPDATE_ISO") || new Date().toISOString();

  const accValues = getSheetValues_(ss, "general_accidents");
  const csValues = getSheetValues_(ss, "general_customer_satisfaction");
  const s7Values = getSheetValues_(ss, "general_7s");

  const accidents = accValues ? asTable_(accValues).map((r) => ({
    label: String(r.label ?? r.Label ?? r.area ?? r.Area ?? ""),
    value: Number(r.value ?? r.Value ?? 0),
    lastRecord: r.lastRecord ?? r.last_record ?? r.last ?? ""
  })).filter((x) => x.label) : [];

  const csRows = csValues ? asTable_(csValues) : [];
  const csLabels = csRows.map((r) => String(r.month ?? r.Mes ?? r.label ?? ""));
  const csBars = csRows.map((r) => Number(r.value ?? r.valor ?? 0));
  const csLine = csRows.map((r) => Number(r.line ?? r.linha ?? r.value ?? r.valor ?? 0));

  const s7Rows = s7Values ? asTable_(s7Values) : [];
  const s7Labels = s7Rows.map((r) => String(r.month ?? r.Mes ?? r.label ?? ""));
  const s7Stihl = s7Rows.map((r) => Number(r.stihl ?? r.Stihl ?? r.sth ?? 0));
  const s7Manserv = s7Rows.map((r) => Number(r.manserv ?? r.Manserv ?? r.mans ?? 0));

  const fkValues = getSheetValues_(ss, "facilities_kpis");
  let fk = {};
  if (fkValues) {
    const headers = fkValues[0].map((h) => String(h || "").trim());
    if (headers.length >= 2 && headers[0] && headers[1] && headers[0].toLowerCase() === "key") fk = kvFromTable_(fkValues);
    else fk = (asTable_(fkValues)[0] || {});
  }

  const azValues = getSheetValues_(ss, "facilities_atendimento_zus");
  const azRows = azValues ? asTable_(azValues) : [];
  const azLabels = azRows.map((r) => String(r.time ?? r.hora ?? r.label ?? ""));
  const seriesNames = ["Civil", "Elétrica", "Refrigeração", "SPCI"];
  const seriesKeys = [
    ["civil", "Civil"],
    ["eletrica", "Elétrica", "Eletrica"],
    ["refrigeracao", "Refrigeração", "Refrigeracao"],
    ["spci", "SPCI"]
  ];
  const azSeries = seriesKeys.map((keys, idx) => ({
    name: seriesNames[idx],
    color: ["#2f80ed", "#f2994a", "#27ae60", "#eb5757"][idx],
    data: azRows.map((r) => Number(keys.map((k) => r[k]).find((v) => v != null && v !== "") ?? 0))
  }));
  const azLimit = Number(azRows.length ? (azRows[0].limit ?? azRows[0].limite ?? "") : "");

  const paValues = getSheetValues_(ss, "facilities_prioridade_alta");
  const paRows = paValues ? asTable_(paValues) : [];

  const avValues = getSheetValues_(ss, "facilities_avaliacoes");
  const avRows = avValues ? asTable_(avValues) : [];

  const pcValues = getSheetValues_(ss, "facilities_prod_colab");
  const pcRows = pcValues ? asTable_(pcValues) : [];

  return {
    updatedAt: last,
    general: {
      accidents,
      customerSatisfaction: { labels: csLabels, bars: csBars, line: csLine },
      sevenS: {
        labels: s7Labels,
        series: [
          { name: "Stihl", data: s7Stihl, color: "#ff4d00" },
          { name: "Manserv", data: s7Manserv, color: "#2e2e2e" }
        ]
      }
    },
    facilities: {
      tmaDays: Number(fk.tmaDays ?? fk.tma_days ?? fk.tma ?? 0),
      productivityPct: Number(fk.productivityPct ?? fk.productivity_pct ?? fk.produtividade ?? 0),
      reworkPct: Number(fk.reworkPct ?? fk.rework_pct ?? fk.retrabalho ?? 0),
      atendimentoZUS: { labels: azLabels, series: azSeries, limit: Number.isFinite(azLimit) ? azLimit : undefined },
      prioridadeAlta: {
        labels: paRows.map((r) => String(r.label ?? r.nome ?? "")),
        values: paRows.map((r) => Number(r.value ?? r.valor ?? 0)),
        colors: paRows.map((r) => String(r.color ?? r.cor ?? "")).filter((c) => c)
      },
      avaliacoes: {
        labels: avRows.map((r) => String(r.label ?? r.nome ?? "")),
        values: avRows.map((r) => Number(r.value ?? r.valor ?? 0)),
        colors: avRows.map((r) => String(r.color ?? r.cor ?? "")).filter((c) => c)
      },
      produtividadePorColaborador: {
        labels: pcRows.map((r) => String(r.name ?? r.nome ?? "")),
        values: pcRows.map((r) => Number(r.value ?? r.valor ?? 0)),
        color: String((pcRows[0] && (pcRows[0].color ?? pcRows[0].cor)) || "#2f66ff")
      }
    }
  };
}

function doGet(e) {
  const payload = buildDashboardPayload_();
  const cb = e && e.parameter ? e.parameter.callback : "";
  if (cb) {
    const out = cb + "(" + JSON.stringify(payload) + ");";
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
