const DEFAULTS = {
  SPREADSHEET_ID: "",
  SOURCE_SHEET: "prisma_source",
  APPS_SCRIPT_TOKEN: "",
  API_URL: "",
  API_METHOD: "GET",
  API_HEADERS_JSON: "{}",
  API_PAYLOAD_JSON: "",
  REQUEST_VERIFICATION_TOKEN: "",
  SIGNALR_ID_CONNECTION: "",
  COOKIE: "",
  ALLOW_EMPTY_UPDATE: "false",
  TARGET_DATA_COLUMNS: "20",
  WRITE_CHUNK_SIZE: "50000",
  ENABLE_DEBUG_SHEET: "false",
  CLEAR_EXCESS_ROWS: "false",
  FAST_WRITE_MODE: "true",
  ENABLE_PAGED_SYNC: "false",
  PAGE_SIZE: "20000",
  STAGING_SHEET: "prisma_source_staging",
  APPLY_DATE_NUMBER_FORMAT: "false",
  ENABLE_RESUME_SYNC: "false",
  RESUME_STATE_PREFIX: "RESUME_",
  CATCHUP_ENABLED: "false",
  CATCHUP_DELAY_MS: "120000"
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
  const current = props.getProperties();
  const merged = Object.assign({}, DEFAULTS, current, cfg || {});
  props.setProperties(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v ?? "")])));
}

function replaceConfig(cfg) {
  const props = PropertiesService.getScriptProperties();
  const merged = Object.assign({}, DEFAULTS, cfg || {});
  props.setProperties(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v ?? "")])));
}

function getConfig_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.assign({}, DEFAULTS, props);
}

function requireSpreadsheetId_() {
  const cfg = getConfig_();
  const id = String(cfg.SPREADSHEET_ID || "").trim();
  if (!id) throw new Error("SPREADSHEET_ID ausente");
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) throw new Error("SPREADSHEET_ID inválido");
  return id;
}

function openSpreadsheet_() {
  const id = requireSpreadsheetId_();
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureGrid_(sheet, minRows, minCols) {
  const needRows = Math.max(1, Number(minRows || 1));
  const needCols = Math.max(1, Number(minCols || 1));
  const curRows = sheet.getMaxRows();
  const curCols = sheet.getMaxColumns();
  if (curRows < needRows) sheet.insertRowsAfter(curRows, needRows - curRows);
  if (curCols < needCols) sheet.insertColumnsAfter(curCols, needCols - curCols);
}

function fetchApi_() {
  const cfg = getConfig_();
  return fetchApiWithPayload_(cfg.API_PAYLOAD_JSON);
}

function normalizeHeaders_(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const s = String(v);
    if (!s) continue;
    out[String(k)] = s;
  }
  return out;
}

function fetchApiWithPayload_(payloadOverride) {
  const cfg = getConfig_();
  if (!cfg.API_URL) throw new Error("API_URL ausente");
  const headers = safeJson_(cfg.API_HEADERS_JSON, {});
  const method = String(cfg.API_METHOD || "GET").toUpperCase();
  const origin = (() => {
    try { return new URL(String(cfg.API_URL)).origin; } catch { return ""; }
  })();
  const mergedHeaders = Object.assign(
    {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    headers
  );
  if (origin && !mergedHeaders.Origin && !mergedHeaders.origin) mergedHeaders.Origin = origin;
  if (origin && !mergedHeaders.Referer && !mergedHeaders.referer) mergedHeaders.Referer = origin + "/Prisma4/";
  if (cfg.REQUEST_VERIFICATION_TOKEN && !mergedHeaders.RequestVerificationToken && !mergedHeaders["X-RequestVerificationToken"]) {
    mergedHeaders.RequestVerificationToken = String(cfg.REQUEST_VERIFICATION_TOKEN);
  }
  if (cfg.SIGNALR_ID_CONNECTION && !mergedHeaders["X-SignalR-ConnectionId"]) {
    mergedHeaders["X-SignalR-ConnectionId"] = String(cfg.SIGNALR_ID_CONNECTION);
  }
  if (cfg.COOKIE && !mergedHeaders.Cookie) {
    mergedHeaders.Cookie = String(cfg.COOKIE);
  }
  const cleanHeaders = normalizeHeaders_(mergedHeaders);
  const options = {
    method,
    muteHttpExceptions: true,
    followRedirects: false,
    headers: cleanHeaders
  };
  let payload = String(payloadOverride || "");
  if (method !== "GET") {
    if (cfg.REQUEST_VERIFICATION_TOKEN) payload = appendFormField_(payload, "__RequestVerificationToken", String(cfg.REQUEST_VERIFICATION_TOKEN));
    if (cfg.SIGNALR_ID_CONNECTION) payload = appendFormField_(payload, "connectionId", String(cfg.SIGNALR_ID_CONNECTION));
    if (payload) options.payload = payload;
  }

  const res = UrlFetchApp.fetch(cfg.API_URL, options);
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 300 && code < 400) {
    const location = (() => {
      try {
        const h = res.getHeaders();
        return h && (h.Location || h.location) ? String(h.Location || h.location) : "";
      } catch {
        return "";
      }
    })();
    if (code === 302 && (location.endsWith("/Prisma4/") || location === "/Prisma4/")) {
      throw new Error("HTTP 302: sessão expirada (login). Atualize COOKIE e REQUEST_VERIFICATION_TOKEN.");
    }
    throw new Error("HTTP " + code + (location ? " location=" + location : ""));
  }
  if (code < 200 || code >= 300) throw new Error("HTTP " + code + " " + text.slice(0, 400));
  if (/^\s*</.test(text) && /<html/i.test(text)) throw new Error("Resposta HTML (provável login/sessão expirada). Atualize COOKIE e REQUEST_VERIFICATION_TOKEN.");
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
  if (!String(cfg.SPREADSHEET_ID || "").trim()) return;
  const ss = openSpreadsheet_();
  const sh = ensureSheet_(ss, "_debug_last");
  sh.clearContents();
  const first = records.length ? normalizeRecordObject_(records[0]) : null;
  const scan = scanCFields_(records, 100);
  const missingExpected = ["c16", "c17", "c18", "c19"].filter((k) => !scan.present[k]).join(", ");
  const dateSample = {};
  if (first) {
    dateSample.c16 = first.c16 ?? "";
    dateSample.c17 = first.c17 ?? "";
    dateSample.c18 = first.c18 ?? "";
    dateSample.c19 = first.c19 ?? "";
  }
  const lines = [
    ["updated_at", new Date().toISOString()],
    ["payload_type", Array.isArray(payload) ? "array" : typeof payload],
    ["records_count", records.length],
    ["detected_max_c", scan.maxC],
    ["missing_expected_c16_c19", missingExpected],
    ["payload_top_keys", payload && typeof payload === "object" ? Object.keys(payload).slice(0, 50).join(", ") : ""],
    ["first_record_keys", first ? Object.keys(first).slice(0, 50).join(", ") : ""],
    ["first_record_sample", first ? JSON.stringify(Object.fromEntries(Object.entries(first).slice(0, 6))) : ""],
    ["c16_c19_sample", JSON.stringify(dateSample)]
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

function parseDateForSheet_(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const n = value;
    if (!Number.isFinite(n)) return "";
    if (n > 0 && n < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + n * 24 * 60 * 60 * 1000);
    }
    if (n > 1e12) return new Date(n);
    if (n > 1e9) return new Date(n * 1000);
    return "";
  }
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (/^\d{4,5}(?:[.,]\d+)?$/.test(s)) {
    const serial = Number(s.replace(",", "."));
    if (Number.isFinite(serial) && serial > 0) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
    }
  }
  const m1 = s.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//i) || s.match(/Date\((-?\d+)([+-]\d{4})?\)/i);
  if (m1) {
    const ms = Number(m1[1]);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    const year = Number(m2[3]);
    const hh = Number(m2[4] || 0);
    const mm = Number(m2[5] || 0);
    const ss = Number(m2[6] || 0);
    const d = new Date(year, month, day, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return "";
}

function parseHeader_(raw, colIndex) {
  const s = String(raw || "").trim();
  const m = s.match(/\b(c\d+)\b/i);
  const explicitField = m ? String(m[1]).toLowerCase() : "";
  const base = s.includes("-") ? s.split("-")[0].trim() : s;
  const fallback = "c" + colIndex;
  return { raw: s, base, explicitField, fallback };
}

function buildColSpecs_(headers) {
  const specs = [];
  for (let c = 0; c < headers.length; c++) {
    const { base, explicitField, fallback } = parseHeader_(headers[c], c);
    const mapped = PRISMA_SOURCE_HEADER_TO_FIELD[base];
    const field = explicitField || mapped || fallback;
    const isHours = base === "horas_mo" || field === "c15";
    const isDate = !!PRISMA_SOURCE_DATE_HEADERS[base] || field === "c16" || field === "c17" || field === "c18" || field === "c19";
    specs.push({ field, base, isHours, isDate });
  }
  return specs;
}

function valueFromRecord_(record, field) {
  if (!record) return undefined;
  if (Array.isArray(record)) {
    const m = String(field).match(/^c(\d+)$/i);
    if (!m) return undefined;
    return record[Number(m[1])];
  }
  if (typeof record !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(record, field)) return record[field];
  const lower = String(field).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(record, lower)) return record[lower];
  const upper = String(field).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(record, upper)) return record[upper];
  return undefined;
}

function updatePrismaSource(records) {
  const cfg = getConfig_();
  const clearExcessRows = String(cfg.CLEAR_EXCESS_ROWS || "false").toLowerCase() === "true";
  const fast = String(cfg.FAST_WRITE_MODE || "true").toLowerCase() === "true";
  if (fast) return writePrismaSourceFast_(records, { clearExcessRows });
  return writeRecordsToSheet_(cfg.SOURCE_SHEET, records, 2, { clearExcessRows });
}

function writePrismaSourceFast_(records, { clearExcessRows } = {}) {
  const cfg = getConfig_();
  const ss = openSpreadsheet_();
  const sh = ensureSheet_(ss, cfg.SOURCE_SHEET);

  const targetCols = Math.max(1, Number(cfg.TARGET_DATA_COLUMNS || 20));
  const writeChunkSize = Math.max(200, Number(cfg.WRITE_CHUNK_SIZE || 50000));
  const applyDateFormat = String(cfg.APPLY_DATE_NUMBER_FORMAT || "false").toLowerCase() === "true";
  const dataRows = Array.isArray(records) ? records : [];

  const values = [];
  let written = 0;
  let currentRow = 2;
  const fields = Array.from({ length: targetCols }, (_, i) => "c" + i);
  const flushChunk = () => {
    if (!values.length) return;
    sh.getRange(currentRow, 1, values.length, targetCols).setValues(values);
    currentRow += values.length;
    written += values.length;
    values.length = 0;
  };

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i];
    if (!raw) continue;
    const row = new Array(targetCols).fill("");
    if (Array.isArray(raw)) {
      for (let c = 0; c < targetCols; c++) row[c] = raw[c] == null ? "" : raw[c];
    } else if (typeof raw === "object") {
      for (let c = 0; c < targetCols; c++) {
        const k = fields[c];
        const v = raw[k] ?? raw[k.toUpperCase()];
        row[c] = v == null ? "" : v;
      }
    }

    values.push(row);
    if (values.length >= writeChunkSize) flushChunk();
  }

  const allowEmpty = String(cfg.ALLOW_EMPTY_UPDATE || "false").toLowerCase() === "true";
  if (!values.length && written === 0 && !allowEmpty) return 0;
  flushChunk();

  if (applyDateFormat && targetCols >= 20 && written > 0) sh.getRange(2, 17, written, 4).setNumberFormat("dd/MM/yyyy HH:mm");

  if (clearExcessRows) {
    const lastRow = sh.getLastRow();
    const keepRows = written;
    const extraRows = Math.max(0, (lastRow - 1) - keepRows);
    if (extraRows > 0) sh.getRange(2 + keepRows, 1, extraRows, targetCols).clearContent();
  }
  return written;
}

function writeRecordsToSheet_(sheetName, records, startRow, { clearExcessRows } = {}) {
  const cfg = getConfig_();
  const ss = openSpreadsheet_();
  const sh = ensureSheet_(ss, sheetName);

  const targetCols = Math.max(1, Number(cfg.TARGET_DATA_COLUMNS || 20));
  const writeChunkSize = Math.max(200, Number(cfg.WRITE_CHUNK_SIZE || 3000));
  const headers = sh.getRange(1, 1, 1, targetCols).getValues()[0].map((h) => String(h || "").trim());
  const colSpecs = buildColSpecs_(headers);
  const dataRows = Array.isArray(records) ? records : [];

  const values = [];
  let written = 0;
  let currentRow = Math.max(2, Number(startRow || 2));
  const flushChunk = () => {
    if (!values.length) return;
    sh.getRange(currentRow, 1, values.length, targetCols).setValues(values);
    currentRow += values.length;
    written += values.length;
    values.length = 0;
  };

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i];
    if (!raw) continue;
    const row = new Array(targetCols).fill("");
    for (let c = 0; c < targetCols; c++) {
      const spec = colSpecs[c];
      let v = valueFromRecord_(raw, spec.field);
      if (spec.isHours && v != null && v !== "") {
        const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
        v = Number.isFinite(n) ? n / 3600 : v;
      }
      if (spec.isDate && v != null && v !== "") {
        v = formatDateTimePtBR_(v);
      }
      row[c] = v == null ? "" : v;
    }
    values.push(row);
    if (values.length >= writeChunkSize) flushChunk();
  }

  const allowEmpty = String(cfg.ALLOW_EMPTY_UPDATE || "false").toLowerCase() === "true";
  if (!values.length && written === 0 && !allowEmpty) return 0;
  flushChunk();

  const shouldClear = !!clearExcessRows;
  if (shouldClear) {
    const lastRow = sh.getLastRow();
    const keepRows = written + (Math.max(2, Number(startRow || 2)) - 2);
    const extraRows = Math.max(0, (lastRow - 1) - keepRows);
    if (extraRows > 0) sh.getRange(2 + keepRows, 1, extraRows, targetCols).clearContent();
  }
  return written;
}

function runFetchAndUpdate() {
  try {
    const cfg = getConfig_();
    if (String(cfg.ENABLE_RESUME_SYNC || "false").toLowerCase() === "true") return runFetchAndUpdateResume_();
    const payload = fetchApi_();
    const records = normalizeRecords_(payload);
    if (String(cfg.ENABLE_DEBUG_SHEET || "false").toLowerCase() === "true") writeDebugInfo_(payload, records);
    const written = updatePrismaSource(records);
    if (written > 0) {
      PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
      PropertiesService.getScriptProperties().deleteProperty("LAST_ERROR");
    }
    return { ok: true, records: records.length, written };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Falha ao atualizar";
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", msg);
    writeDebugInfo_({ error: msg }, []);
    throw new Error(msg);
  }
}

function setSingleRunMode() {
  setConfig({
    ENABLE_RESUME_SYNC: "false",
    CATCHUP_ENABLED: "false",
    FAST_WRITE_MODE: "true",
    WRITE_CHUNK_SIZE: "50000",
    TARGET_DATA_COLUMNS: "20",
    APPLY_DATE_NUMBER_FORMAT: "false",
    CLEAR_EXCESS_ROWS: "false",
    ENABLE_DEBUG_SHEET: "false"
  });
  resetResumeState();
  return { ok: true };
}

function runFetchAndUpdateCatchup() {
  return runFetchAndUpdate();
}

function ensureCatchupTrigger_() {
  const cfg = getConfig_();
  if (String(cfg.CATCHUP_ENABLED || "true").toLowerCase() !== "true") return false;
  const delayMs = Math.max(30000, Number(cfg.CATCHUP_DELAY_MS || 120000));
  const existing = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "runFetchAndUpdateCatchup");
  if (existing.length) return true;
  ScriptApp.newTrigger("runFetchAndUpdateCatchup").timeBased().after(delayMs).create();
  return true;
}

function clearCatchupTriggers_() {
  const existing = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "runFetchAndUpdateCatchup");
  for (const t of existing) ScriptApp.deleteTrigger(t);
}

function runFetchAndUpdateResume_() {
  const cfg = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const prefix = String(cfg.RESUME_STATE_PREFIX || "RESUME_");

  const pageSize = Math.max(1000, Number(cfg.PAGE_SIZE || 20000));
  const targetCols = Math.max(1, Number(cfg.TARGET_DATA_COLUMNS || 20));
  const ss = openSpreadsheet_();
  const sh = ensureSheet_(ss, cfg.SOURCE_SHEET);

  const from = Math.max(1, Number(props.getProperty(prefix + "FROM") || "1"));
  const to = from + pageSize - 1;
  const payloadStr = setFromToInPayload_(cfg.API_PAYLOAD_JSON, from, to);
  const payload = fetchApiWithPayload_(payloadStr);
  const records = normalizeRecords_(payload);

  if (!records.length) {
    clearCatchupTriggers_();
    return { ok: true, mode: "resume", wrote: 0, from, to, note: "no records" };
  }

  if (from === 1 && props.getProperty(prefix + "INIT") !== "true") {
    const lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, targetCols).clearContent();
    props.setProperty(prefix + "INIT", "true");
  }

  const startRow = 2 + (from - 1);
  ensureGrid_(sh, startRow + records.length + 5, targetCols);
  const wrote = writeRecordsToSheetRaw_(sh, records, startRow, targetCols);

  const total = Number(payload && typeof payload === "object" ? (payload.totalRows ?? payload.TotalRows ?? payload.total ?? payload.Total ?? "") : "");
  const nextFrom = from + wrote;
  if (Number.isFinite(total) && total > 0 && nextFrom > total) {
    props.deleteProperty(prefix + "FROM");
    props.deleteProperty(prefix + "INIT");
    clearCatchupTriggers_();
    props.setProperty("LAST_UPDATE_ISO", new Date().toISOString());
    props.deleteProperty("LAST_ERROR");
    return { ok: true, mode: "resume", complete: true, total, wrote };
  }

  props.setProperty(prefix + "FROM", String(nextFrom));
  if (wrote > 0) ensureCatchupTrigger_();
  return { ok: true, mode: "resume", complete: false, total: Number.isFinite(total) && total > 0 ? total : null, wrote, nextFrom };
}

function writeRecordsToSheetRaw_(sheet, records, startRow, targetCols) {
  const cfg = getConfig_();
  const writeChunkSize = Math.max(200, Number(cfg.WRITE_CHUNK_SIZE || 50000));
  const dataRows = Array.isArray(records) ? records : [];
  const fields = Array.from({ length: targetCols }, (_, i) => "c" + i);

  const values = [];
  let written = 0;
  let currentRow = Math.max(2, Number(startRow || 2));
  const flush = () => {
    if (!values.length) return;
    ensureGrid_(sheet, currentRow + values.length - 1, targetCols);
    sheet.getRange(currentRow, 1, values.length, targetCols).setValues(values);
    currentRow += values.length;
    written += values.length;
    values.length = 0;
  };

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i];
    if (!raw) continue;
    const row = new Array(targetCols).fill("");
    if (Array.isArray(raw)) {
      for (let c = 0; c < targetCols; c++) row[c] = raw[c] == null ? "" : raw[c];
    } else if (typeof raw === "object") {
      for (let c = 0; c < targetCols; c++) {
        const k = fields[c];
        const v = raw[k] ?? raw[k.toUpperCase()];
        row[c] = v == null ? "" : v;
      }
    }
    values.push(row);
    if (values.length >= writeChunkSize) flush();
  }
  flush();
  return written;
}

function runFetchAndUpdateDebug() {
  try {
    const payload = fetchApi_();
    const records = normalizeRecords_(payload);
    writeDebugInfo_(payload, records);
    const first = records.length ? normalizeRecordObject_(records[0]) : null;
    const sample = {};
    if (first && typeof first === "object") {
      const keys = Object.keys(first).slice(0, 6);
      for (const k of keys) sample[k] = first[k];
    }
    const written = updatePrismaSource(records);
    if (written > 0) {
      PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
      PropertiesService.getScriptProperties().deleteProperty("LAST_ERROR");
    }
    return {
      ok: true,
      records: records.length,
      written,
      payloadType: Array.isArray(payload) ? "array" : typeof payload,
      payloadTopKeys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 20) : [],
      firstRecordKeys: first ? Object.keys(first).slice(0, 25) : [],
      firstRecordSample: sample
    };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "Falha ao atualizar";
    PropertiesService.getScriptProperties().setProperty("LAST_ERROR", msg);
    writeDebugInfo_({ error: msg }, []);
    return { ok: false, error: msg };
  }
}

function runFetchAndUpdatePaged_() {
  const cfg = getConfig_();
  const maxMs = Math.max(60000, Number(cfg.MAX_RUNTIME_MS || 330000));
  const deadline = Date.now() + maxMs;

  const pageSize = Math.max(1000, Number(cfg.PAGE_SIZE || 20000));
  const stagingName = String(cfg.STAGING_SHEET || "prisma_source_staging");
  const props = PropertiesService.getScriptProperties();

  const ss = openSpreadsheet_();
  const main = ensureSheet_(ss, cfg.SOURCE_SHEET);
  const staging = ensureSheet_(ss, stagingName);
  const targetCols = Math.max(1, Number(cfg.TARGET_DATA_COLUMNS || 20));

  const runId = props.getProperty("SYNC_RUN_ID") || String(Date.now());
  if (!props.getProperty("SYNC_RUN_ID")) props.setProperty("SYNC_RUN_ID", runId);

  const syncState = props.getProperty("SYNC_STATE") || "building";
  if (syncState === "publishing") {
    if (staging.getLastRow() < 2) {
      resetSyncState();
      props.setProperty("SYNC_RUN_ID", String(Date.now()));
      props.setProperty("SYNC_STATE", "building");
    } else {
      const published = publishStagingToMain_(stagingName, deadline);
      return { ok: true, mode: "publishing", published };
    }
  }

  if (!props.getProperty("SYNC_INIT")) {
    const stagingLastRow = staging.getLastRow();
    if (stagingLastRow > 1) staging.getRange(2, 1, stagingLastRow - 1, targetCols).clearContent();
    const headerValues = main.getRange(1, 1, 1, targetCols).getValues();
    staging.getRange(1, 1, 1, targetCols).setValues(headerValues);
    props.setProperty("SYNC_INIT", "true");
    props.setProperty("SYNC_FROM", "1");
    props.deleteProperty("SYNC_TOTAL");
    props.setProperty("SYNC_STATE", "building");
  }

  if (props.getProperty("SYNC_INIT") === "true" && Number(props.getProperty("SYNC_FROM") || 1) > 1 && staging.getLastRow() < 2) {
    props.setProperty("SYNC_FROM", "1");
    props.deleteProperty("SYNC_TOTAL");
  }

  let from = Math.max(1, Number(props.getProperty("SYNC_FROM") || 1));
  let total = Number(props.getProperty("SYNC_TOTAL") || "");
  if (!Number.isFinite(total) || total <= 0) total = 0;

  let pages = 0;
  let writtenTotal = 0;
  while (Date.now() < deadline) {
    const to = total ? Math.min(total, from + pageSize - 1) : from + pageSize - 1;
    const payloadStr = setFromToInPayload_(cfg.API_PAYLOAD_JSON, from, to);
    const payload = fetchApiWithPayload_(payloadStr);

    if (!total && payload && typeof payload === "object") {
      const t = Number(payload.totalRows ?? payload.TotalRows ?? payload.total ?? payload.Total ?? "");
      if (Number.isFinite(t) && t > 0) {
        total = t;
        props.setProperty("SYNC_TOTAL", String(t));
      }
    }

    const records = normalizeRecords_(payload);
    if (!records.length) break;

    const startRow = 2 + (from - 1);
    const written = writeRecordsToSheet_(stagingName, records, startRow, deadline, { clearExcessRows: false });
    writtenTotal += written;
    pages += 1;

    from = to + 1;
    props.setProperty("SYNC_FROM", String(from));

    if (total && from > total) {
      props.setProperty("SYNC_STATE", "publishing");
      props.deleteProperty("SYNC_FROM");
      return { ok: true, mode: "built", pages, written: writtenTotal, total };
    }
    if (written === 0) break;
    if (Date.now() > deadline) break;
  }

  return { ok: true, mode: "building", pages, written: writtenTotal, nextFrom: from, total: total || null };
}

function getSyncStatus() {
  const cfg = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const ss = String(cfg.SPREADSHEET_ID || "").trim() ? openSpreadsheet_() : null;
  const main = ss ? ss.getSheetByName(cfg.SOURCE_SHEET) : null;
  const staging = ss ? ss.getSheetByName(String(cfg.STAGING_SHEET || "prisma_source_staging")) : null;
  return {
    enablePagedSync: String(cfg.ENABLE_PAGED_SYNC || "false"),
    syncState: props.getProperty("SYNC_STATE") || "",
    syncInit: props.getProperty("SYNC_INIT") || "",
    syncFrom: props.getProperty("SYNC_FROM") || "",
    syncTotal: props.getProperty("SYNC_TOTAL") || "",
    lastError: props.getProperty("LAST_ERROR") || "",
    mainSheetExists: !!main,
    stagingSheetExists: !!staging,
    mainRows: main ? main.getLastRow() : 0,
    stagingRows: staging ? staging.getLastRow() : 0
  };
}

function getResumeStatus() {
  const cfg = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const prefix = String(cfg.RESUME_STATE_PREFIX || "RESUME_");
  const ss = String(cfg.SPREADSHEET_ID || "").trim() ? openSpreadsheet_() : null;
  const main = ss ? ss.getSheetByName(cfg.SOURCE_SHEET) : null;
  const catchupTriggers = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "runFetchAndUpdateCatchup").length;
  return {
    enableResumeSync: String(cfg.ENABLE_RESUME_SYNC || "false"),
    pageSize: String(cfg.PAGE_SIZE || ""),
    nextFrom: props.getProperty(prefix + "FROM") || "1",
    init: props.getProperty(prefix + "INIT") || "",
    catchupEnabled: String(cfg.CATCHUP_ENABLED || "false"),
    catchupDelayMs: String(cfg.CATCHUP_DELAY_MS || ""),
    catchupTriggers,
    lastError: props.getProperty("LAST_ERROR") || "",
    mainRows: main ? main.getLastRow() : 0,
    mainMaxRows: main ? main.getMaxRows() : 0,
    mainMaxCols: main ? main.getMaxColumns() : 0
  };
}

function resetResumeState() {
  const cfg = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const prefix = String(cfg.RESUME_STATE_PREFIX || "RESUME_");
  props.deleteProperty(prefix + "FROM");
  props.deleteProperty(prefix + "INIT");
  clearCatchupTriggers_();
  return { ok: true };
}

function resetSyncState() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("SYNC_RUN_ID");
  props.deleteProperty("SYNC_INIT");
  props.deleteProperty("SYNC_FROM");
  props.deleteProperty("SYNC_TOTAL");
  props.deleteProperty("SYNC_STATE");
  return { ok: true };
}

function debugConfig() {
  const cfg = getConfig_();
  const id = String(cfg.SPREADSHEET_ID || "").trim();
  return {
    hasSpreadsheetId: !!id,
    spreadsheetIdLooksValid: !!id && /^[a-zA-Z0-9-_]{20,}$/.test(id),
    sourceSheet: String(cfg.SOURCE_SHEET || ""),
    apiUrlSet: !!String(cfg.API_URL || "").trim(),
    method: String(cfg.API_METHOD || ""),
    hasCookie: !!String(cfg.COOKIE || "").trim(),
    payloadLen: String(cfg.API_PAYLOAD_JSON || "").length,
    enablePagedSync: String(cfg.ENABLE_PAGED_SYNC || "false"),
    pageSize: String(cfg.PAGE_SIZE || ""),
    stagingSheet: String(cfg.STAGING_SHEET || "")
  };
}

function setFromToInPayload_(payload, from, to) {
  let p = String(payload || "");
  if (!p) return p;
  if (p.match(/FromRecord=\d+/)) p = p.replace(/FromRecord=\d+/g, "FromRecord=" + String(from));
  else p = appendFormField_(p, "FromRecord", String(from));
  if (p.match(/ToRecord=\d+/)) p = p.replace(/ToRecord=\d+/g, "ToRecord=" + String(to));
  else p = appendFormField_(p, "ToRecord", String(to));
  return p;
}

function publishStagingToMain_(stagingName, deadlineMs) {
  const cfg = getConfig_();
  const ss = openSpreadsheet_();
  const main = ensureSheet_(ss, cfg.SOURCE_SHEET);
  const staging = ensureSheet_(ss, stagingName);

  const targetCols = Math.max(1, Number(cfg.TARGET_DATA_COLUMNS || 20));
  const chunk = Math.max(500, Number(cfg.WRITE_CHUNK_SIZE || 20000));

  const stagingLastRow = staging.getLastRow();
  if (stagingLastRow < 2) return 0;

  const totalRows = stagingLastRow - 1;
  let offset = 0;
  while (offset < totalRows && (!deadlineMs || Date.now() < deadlineMs)) {
    const size = Math.min(chunk, totalRows - offset);
    const vals = staging.getRange(2 + offset, 1, size, targetCols).getValues();
    main.getRange(2 + offset, 1, size, targetCols).setValues(vals);
    offset += size;
  }
  if (offset >= totalRows) {
    const mainLastRow = main.getLastRow();
    const extra = Math.max(0, (mainLastRow - 1) - totalRows);
    if (extra > 0) main.getRange(2 + totalRows, 1, extra, targetCols).clearContent();
    PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
    PropertiesService.getScriptProperties().deleteProperty("LAST_ERROR");
    PropertiesService.getScriptProperties().deleteProperty("SYNC_RUN_ID");
    PropertiesService.getScriptProperties().deleteProperty("SYNC_INIT");
    PropertiesService.getScriptProperties().deleteProperty("SYNC_TOTAL");
    PropertiesService.getScriptProperties().deleteProperty("SYNC_STATE");
  } else {
    PropertiesService.getScriptProperties().setProperty("SYNC_STATE", "publishing");
  }
  return offset;
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

function getA1_(ss, sheetName, a1) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return null;
  return sh.getRange(String(a1)).getValue();
}

function getRangeA1_(ss, sheetName, a1) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return null;
  return sh.getRange(String(a1)).getValues();
}

function normalizePercent_(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.includes("%")) {
      const n = Number(s.replace("%", "").replace(".", "").replace(",", ".").trim());
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n >= 0 && n <= 2) return n * 100;
  return n;
}

function normalizeTeamName_(value) {
  const raw = String(value == null ? "" : value).trim();
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!key) return "";
  if (key.indexOf("civil") === 0) return "Civil";
  if (key.indexOf("eletric") === 0) return "Elétrica";
  if (key.indexOf("refrig") === 0) return "Refrigeração";
  if (key.indexOf("pint") === 0) return "Pintura";
  if (key === "spci") return "SPCI";
  return raw;
}

function isSpciLabel_(value) {
  return normalizeTeamName_(value) === "SPCI";
}

function buildLsiPayload_(ss) {
  const zu = getRangeA1_(ss, "dash", "A102:AF105");
  const zuParsed = parseSeriesMatrix_(zu || []);

  return {
    atendimentoZUS: {
      labels: zuParsed.labels,
      series: zuParsed.series.map((s, idx) => ({
        name: s.name,
        data: s.data,
        color: ["#2f80ed", "#f2994a", "#27ae60", "#eb5757"][idx % 4]
      })),
      limit: zuParsed.limit
    },
    cronogramas: [
      { label: "Limpeza de Salas", result: normalizePercent_(getA1_(ss, "dash", "B114")), target: normalizePercent_(getA1_(ss, "dash", "C114")) },
      { label: "Limpeza de Banheiros", result: normalizePercent_(getA1_(ss, "dash", "B115")), target: normalizePercent_(getA1_(ss, "dash", "C115")) },
      { label: "Recolhimento Resíduos", result: normalizePercent_(getA1_(ss, "dash", "B116")), target: normalizePercent_(getA1_(ss, "dash", "C116")) },
      { label: "Limpeza de Piso", result: normalizePercent_(getA1_(ss, "dash", "B117")), target: normalizePercent_(getA1_(ss, "dash", "C117")) },
      { label: "Limpeza Técnica", result: normalizePercent_(getA1_(ss, "dash", "B118")), target: normalizePercent_(getA1_(ss, "dash", "C118")) },
      { label: "Jardinagem", result: normalizePercent_(getA1_(ss, "dash", "B119")), target: normalizePercent_(getA1_(ss, "dash", "C119")) }
    ],
    eficacia: [
      { label: "Jardinagem", evaluations: toNumber_(getA1_(ss, "dash", "B108")), result: normalizePercent_(getA1_(ss, "dash", "C108")) },
      { label: "Limpeza Técnica", evaluations: toNumber_(getA1_(ss, "dash", "B109")), result: normalizePercent_(getA1_(ss, "dash", "C109")) },
      { label: "Limpeza Convencional", evaluations: toNumber_(getA1_(ss, "dash", "B110")), result: normalizePercent_(getA1_(ss, "dash", "C110")) },
      { label: "Limpeza de Piso", evaluations: toNumber_(getA1_(ss, "dash", "B111")), result: normalizePercent_(getA1_(ss, "dash", "C111")) }
    ]
  };
}

function buildUtilidadesPayload_(ss) {
  const zuLabels = getRangeA1_(ss, "dash", "A24:AF24");
  const zuValues = getRangeA1_(ss, "dash", "A29:AF29");
  const prodColab = getRangeA1_(ss, "dash", "A73:D78");
  const pcParsed = parseProdColab_(prodColab || []);

  const labelsRow = Array.isArray(zuLabels) && zuLabels.length ? zuLabels[0] : [];
  const valuesRow = Array.isArray(zuValues) && zuValues.length ? zuValues[0] : [];
  const labels = [];
  const values = [];

  for (let i = 0; i < Math.max(labelsRow.length, valuesRow.length); i++) {
    const rawLabel = labelsRow[i];
    const label = rawLabel instanceof Date
      ? Utilities.formatDate(rawLabel, "America/Sao_Paulo", "dd/MM")
      : String(rawLabel == null ? "" : rawLabel).trim();
    if (!label) continue;
    labels.push(label);
    values.push(toNumber_(valuesRow[i]));
  }

  return {
    tmaDays: toNumber_(getA1_(ss, "dash", "E21")),
    productivityPct: normalizePercent_(getA1_(ss, "dash", "E22")),
    avaliacoes: toNumber_(getA1_(ss, "dash", "B44")),
    reworkPct: normalizePercent_(getA1_(ss, "dash", "B83")),
    preventivas: normalizePercent_(getA1_(ss, "dash", "B93")),
    atendimentoZUS: {
      labels,
      series: [{ name: "Utilidades", data: values, color: "#2f80ed" }],
      limit: 2
    },
    produtividadePorColaborador: pcParsed
  };
}

function buildSpciPayload_(ss) {
  const zuLabels = getRangeA1_(ss, "dash", "A24:AF24");
  const zuValues = getRangeA1_(ss, "dash", "A28:AF28");
  const prodColab = getRangeA1_(ss, "dash", "A68:D72");
  const pcParsed = parseProdColab_(prodColab || []);

  const labelsRow = Array.isArray(zuLabels) && zuLabels.length ? zuLabels[0] : [];
  const valuesRow = Array.isArray(zuValues) && zuValues.length ? zuValues[0] : [];
  const labels = [];
  const values = [];

  for (let i = 0; i < Math.max(labelsRow.length, valuesRow.length); i++) {
    const rawLabel = labelsRow[i];
    const label = rawLabel instanceof Date
      ? Utilities.formatDate(rawLabel, "America/Sao_Paulo", "dd/MM")
      : String(rawLabel == null ? "" : rawLabel).trim();
    if (!label) continue;
    labels.push(label);
    values.push(toNumber_(valuesRow[i]));
  }

  return {
    tmaDays: toNumber_(getA1_(ss, "dash", "H21")),
    productivityPct: normalizePercent_(getA1_(ss, "dash", "H22")),
    avaliacoes: toNumber_(getA1_(ss, "dash", "B42")),
    reworkPct: normalizePercent_(getA1_(ss, "dash", "B83")),
    preventivas: normalizePercent_(getA1_(ss, "dash", "B94")),
    atendimentoZUS: {
      labels,
      series: [{ name: "SPCI", data: values, color: "#2e2e2e" }],
      limit: 2
    },
    produtividadePorColaborador: pcParsed
  };
}

function rowSeries_(sheet, rowNumber) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 2) return [];
  const row = sheet.getRange(Number(rowNumber), 2, 1, lastCol - 1).getValues()[0];
  const out = [];
  for (const v of row) {
    if (v == null || v === "") break;
    out.push(v);
  }
  return out;
}

function toNumber_(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatDatePtBrOnly_(value) {
  const parsed = parseDateForSheet_(value);
  if (!parsed || !(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return "";
  return Utilities.formatDate(parsed, "America/Sao_Paulo", "dd/MM/yyyy");
}

function normalizeSearchValue_(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchValue_(value) {
  return normalizeSearchValue_(value).replace(/\s+/g, "");
}

function escapeRegex_(value) {
  return String(value == null ? "" : value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesTokenInText_(text, token) {
  const safeText = normalizeSearchValue_(text);
  const safeToken = compactSearchValue_(token);
  if (!safeToken) return false;
  const boundaryPattern = new RegExp(`(^|[^A-Z0-9])${escapeRegex_(safeToken)}([^A-Z0-9]|$)`);
  if (boundaryPattern.test(safeText.replace(/\s+/g, " "))) return true;
  return safeText.replace(/\s+/g, "").indexOf(safeToken) >= 0;
}

function buildClientOsMatchFromRow_(sheet, rowNumber, matchField) {
  if (!sheet || !rowNumber || rowNumber < 2) return null;

  const readColumnCount = Math.max(20, Math.min(sheet.getLastColumn(), 32));
  const headers = sheet.getRange(1, 1, 1, readColumnCount).getValues()[0] || [];
  const colSpecs = buildColSpecs_(headers);
  const row = sheet.getRange(rowNumber, 1, 1, readColumnCount).getValues()[0] || [];
  const record = {};

  for (let c = 0; c < colSpecs.length; c++) {
    record[colSpecs[c].field] = row[c];
  }

  const c0Value = valueFromRecord_(record, "c0");
  const c1Value = valueFromRecord_(record, "c1");
  const c5Value = valueFromRecord_(record, "c5");
  const c6Value = valueFromRecord_(record, "c6");
  const estadoRaw = valueFromRecord_(record, "c7");
  const prioridadeRaw = valueFromRecord_(record, "c9");
  const dataAberturaRaw = valueFromRecord_(record, "c16");
  let dataPrevistaRaw = valueFromRecord_(record, "c17");
  let dataFechamentoRaw = valueFromRecord_(record, "c19");
  const colunaO = row[14];
  const colunaP = row[15];
  const colunaR = row[17];
  const colunaAC = row[28];
  const colunaAD = row[29];
  const colunaAF = row[31];
  let dataAberturaFinal = formatDatePtBrOnly_(dataAberturaRaw);
  const dataPrevistaMapeada = formatDatePtBrOnly_(dataPrevistaRaw);
  const dataFechamentoMapeado = formatDatePtBrOnly_(dataFechamentoRaw);
  const parOP = {
    abertura: formatDatePtBrOnly_(colunaO),
    prevista: formatDatePtBrOnly_(colunaP),
    fechamento: formatDatePtBrOnly_(colunaR),
    aberturaRaw: colunaO,
    previstaRaw: colunaP,
    fechamentoRaw: colunaR,
  };
  const parADAF = {
    abertura: formatDatePtBrOnly_(colunaAD),
    prevista: formatDatePtBrOnly_(colunaAF),
    fechamento: formatDatePtBrOnly_(colunaAC),
    aberturaRaw: colunaAD,
    previstaRaw: colunaAF,
    fechamentoRaw: colunaAC,
  };

  if (!dataPrevistaMapeada) {
    if (dataAberturaFinal && dataAberturaFinal === parOP.abertura && parOP.prevista) {
      dataPrevistaRaw = parOP.previstaRaw;
    } else if (dataAberturaFinal && dataAberturaFinal === parADAF.abertura && parADAF.prevista) {
      dataPrevistaRaw = parADAF.previstaRaw;
    } else if (parOP.abertura && parOP.prevista) {
      dataAberturaFinal = parOP.abertura;
      dataPrevistaRaw = parOP.previstaRaw;
    } else if (parADAF.abertura && parADAF.prevista) {
      dataAberturaFinal = parADAF.abertura;
      dataPrevistaRaw = parADAF.previstaRaw;
    }
  }

  if (!dataFechamentoMapeado) {
    if (dataAberturaFinal && dataAberturaFinal === parOP.abertura && parOP.fechamento) {
      dataFechamentoRaw = parOP.fechamentoRaw;
    } else if (dataAberturaFinal && dataAberturaFinal === parADAF.abertura && parADAF.fechamento) {
      dataFechamentoRaw = parADAF.fechamentoRaw;
    } else if (parOP.abertura && parOP.fechamento) {
      dataAberturaFinal = parOP.abertura;
      dataFechamentoRaw = parOP.fechamentoRaw;
    } else if (parADAF.abertura && parADAF.fechamento) {
      dataAberturaFinal = parADAF.abertura;
      dataFechamentoRaw = parADAF.fechamentoRaw;
    }
  }

  return {
    score: matchField === "c0" ? 300 : matchField === "c1" ? 250 : 100,
    rowNumber,
    matchField,
    numeroOs: String(c0Value == null ? "" : c0Value).trim(),
    osCliente: String(c1Value == null ? "" : c1Value).trim(),
    titulo: String(c5Value == null ? "" : c5Value).trim(),
    descricao: String(c6Value == null ? "" : c6Value).trim(),
    estadoCodigo: Math.floor(toNumber_(estadoRaw)),
    prioridadeCodigo: Math.floor(toNumber_(prioridadeRaw)),
    dataAbertura: dataAberturaFinal,
    dataPrevista: formatDatePtBrOnly_(dataPrevistaRaw),
    dataFechamento: formatDatePtBrOnly_(dataFechamentoRaw)
  };
}

function findClientOsExactMatchRow_(sheet, query, normalizedQuery) {
  if (!sheet) return null;

  const findByTextFinder_ = (column) => {
    try {
      const range = sheet.getRange(2, column, Math.max(sheet.getLastRow() - 1, 0), 1);
      if (range.getNumRows() <= 0) return null;
      const found = range
        .createTextFinder(String(query == null ? "" : query).trim())
        .matchEntireCell(true)
        .findNext();
      return found ? found.getRow() : null;
    } catch (_) {
      return null;
    }
  };

  const rowOnC1 = findByTextFinder_(2);
  if (rowOnC1) return { rowNumber: rowOnC1, matchField: "c1", scanned: 1 };

  const rowOnC0 = findByTextFinder_(1);
  if (rowOnC0) return { rowNumber: rowOnC0, matchField: "c0", scanned: 2 };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const c1Values = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  for (let idx = 0; idx < c1Values.length; idx++) {
    if (compactSearchValue_(c1Values[idx][0]) === normalizedQuery) {
      return { rowNumber: idx + 2, matchField: "c1", scanned: idx + 1 };
    }
  }

  const c0Values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let idx = 0; idx < c0Values.length; idx++) {
    if (compactSearchValue_(c0Values[idx][0]) === normalizedQuery) {
      return { rowNumber: idx + 2, matchField: "c0", scanned: c1Values.length + idx + 1 };
    }
  }

  return null;
}

function findClientOsDescriptionMatchRow_(sheet, normalizedQuery) {
  if (!sheet || !normalizedQuery) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const descriptions = sheet.getRange(2, 7, lastRow - 1, 1).getDisplayValues();
  for (let idx = 0; idx < descriptions.length; idx++) {
    if (matchesTokenInText_(descriptions[idx][0], normalizedQuery)) {
      return { rowNumber: idx + 2, matchField: "c6", scanned: idx + 1 };
    }
  }

  return null;
}

function buildClientOsPayload_(e) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");

  const token = e && e.parameter
    ? String(e.parameter.token || e.parameter.access_token || e.parameter.api_token || "").trim()
    : "";
  const requiredToken = String(cfg.APPS_SCRIPT_TOKEN || "").trim();
  if (requiredToken && token !== requiredToken) {
    return {
      ok: false,
      found: false,
      error: "Token inválido.",
      item: null,
      meta: { authorized: false }
    };
  }

  const query = e && e.parameter
    ? String(e.parameter.os || e.parameter.osNumber || e.parameter.q || e.parameter.numero || "").trim()
    : "";
  if (!query) {
    return {
      ok: false,
      found: false,
      error: "Parâmetro os ausente.",
      item: null,
      meta: { authorized: true }
    };
  }

  const stateMap = {
    0: "ABERTA",
    20: "PLANEJADA",
    30: "AGUARDANDO AVALIAÇÃO",
    31: "AVALIADO",
    38: "AGUARDANDO APROVAÇÃO RIC",
    39: "IMPEDIMENTO - FORNECEDOR",
    40: "IMPEDIMENTO - MATERIAL",
    41: "IMPEDIMENTO - FERRAMENTA",
    42: "IMPEDIMENTO - LIBERAÇÃO",
    43: "IMPEDIMENTO - MATERIAL ESTOQUE",
    44: "PARADA PROGRAMADA",
    45: "IMPEDIMENTO - VERBA",
    46: "NECESSÁRIO SERVIÇO EXTERNO",
    47: "DISPONÍVEL PARA PROGRAMAR",
    48: "AGUARDANDO ORÇAMENTO",
    49: "REQUISIÇÃO CRIADA",
    50: "PROGRAMADA",
    55: "EM EXECUÇÃO",
    59: "PEDIDO CRIADO",
    60: "PROATIVA",
    77: "EXECUTADA",
    90: "APROVADA",
    95: "NÃO CONCLUIDO",
    96: "CANCELADA",
    97: "REABERTA",
    98: "RECUSADA",
    99: "ENCERRADA"
  };

  const priorityMap = {
    1: "Urgente",
    2: "Alta",
    3: "Média",
    4: "Baixa",
    5: "Parada programada",
    6: "Visita"
  };

  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(cfg.SOURCE_SHEET || "prisma_source");
  const normalizedQuery = compactSearchValue_(query);
  const cache = CacheService.getScriptCache();
  const cacheKey = `cliente_os:${cfg.SPREADSHEET_ID}:${normalizedQuery}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const putCacheIfFits_ = (value) => {
    try {
      const json = JSON.stringify(value);
      if (json.length <= 95000) cache.put(cacheKey, json, 120);
    } catch {}
  };

  if (!sheet) {
    const payload = {
      ok: false,
      found: false,
      error: "Aba prisma_source não encontrada.",
      item: null,
      meta: { authorized: true }
    };
    putCacheIfFits_(payload);
    return payload;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    const payload = {
      ok: true,
      found: false,
      query,
      item: null,
      meta: { authorized: true, scanned: 0, sheet: sheet.getName() }
    };
    putCacheIfFits_(payload);
    return payload;
  }

  let scanned = 0;
  let bestMatch = null;

  const exactMatch = findClientOsExactMatchRow_(sheet, query, normalizedQuery);
  if (exactMatch) {
    scanned += Number(exactMatch.scanned || 0);
    bestMatch = buildClientOsMatchFromRow_(sheet, exactMatch.rowNumber, exactMatch.matchField);
  }

  if (!bestMatch) {
    const descriptionMatch = findClientOsDescriptionMatchRow_(sheet, normalizedQuery);
    if (descriptionMatch) {
      scanned += Number(descriptionMatch.scanned || 0);
      bestMatch = buildClientOsMatchFromRow_(sheet, descriptionMatch.rowNumber, descriptionMatch.matchField);
    } else {
      scanned += Math.max(lastRow - 1, 0);
    }
  }

  if (!bestMatch) {
    const payload = {
      ok: true,
      found: false,
      query,
      item: null,
      meta: {
        authorized: true,
        scanned,
        sheet: sheet.getName()
      }
    };
    putCacheIfFits_(payload);
    return payload;
  }

  const estadoCodigo = Number(bestMatch.estadoCodigo || 0);
  const prioridadeCodigo = Number(bestMatch.prioridadeCodigo || 0);
  const item = {
    matchField: bestMatch.matchField,
    numeroOs: bestMatch.numeroOs,
    osCliente: bestMatch.osCliente,
    titulo: bestMatch.titulo,
    descricao: bestMatch.descricao,
    estado: {
      codigo: estadoCodigo,
      label: stateMap[estadoCodigo] || `ESTADO ${estadoCodigo}`
    },
    prioridade: {
      codigo: prioridadeCodigo,
      label: priorityMap[prioridadeCodigo] || ""
    },
    dataAbertura: bestMatch.dataAbertura,
    dataPrevista: bestMatch.dataPrevista,
    dataFechamento: bestMatch.dataFechamento,
    encerrada: estadoCodigo === 96 || estadoCodigo === 99,
    cancelada: estadoCodigo === 96
  };

  const payload = {
    ok: true,
    found: true,
    query,
    item,
    meta: {
      authorized: true,
      scanned,
      sheet: sheet.getName(),
      rowNumber: bestMatch.rowNumber
    }
  };
  putCacheIfFits_(payload);
  return payload;
}

function monthLabels_(values) {
  return (values || []).map((v) => {
    if (v instanceof Date) return Utilities.formatDate(v, "America/Sao_Paulo", "MMM/yy");
    return String(v ?? "").trim();
  }).filter((s) => s);
}

function dashCustomerSatisfaction_(sheet) {
  const labels = monthLabels_(rowSeries_(sheet, 7));
  const vals = rowSeries_(sheet, 8).slice(0, labels.length).map(toNumber_);
  return { labels, bars: vals, line: vals };
}

function dashSevenS_(sheet) {
  const labels = monthLabels_(rowSeries_(sheet, 15));
  const stihl = rowSeries_(sheet, 16).slice(0, labels.length).map(toNumber_);
  const manserv = rowSeries_(sheet, 17).slice(0, labels.length).map(toNumber_);
  const series = [{ name: "Stihl", data: stihl, color: "#ff4d00" }];
  if (manserv.some((n) => n !== 0)) series.push({ name: "Manserv", data: manserv, color: "#2e2e2e" });
  return { labels, series };
}

function parsePairs_(values) {
  const out = [];
  if (!Array.isArray(values)) return out;
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r || r.length < 2) continue;
    const label = String(r[0] ?? "").trim();
    if (!label) continue;
    const value = r[1];
    const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(n)) {
      if (i === 0) continue;
      continue;
    }
    out.push({ label, value: n });
  }
  return out;
}

function parseSeriesMatrix_(values) {
  const empty = { labels: [], series: [], limit: undefined };
  if (!Array.isArray(values) || !values.length) return empty;
  const fmt = (v) => {
    if (v instanceof Date) return Utilities.formatDate(v, "America/Sao_Paulo", "dd/MM");
    if (v == null) return "";
    const s = String(v).trim();
    return s;
  };
  const labels = values[0].slice(1).map(fmt).filter((s) => String(s).trim() !== "");
  const labelCount = labels.length;
  const series = [];
  let limit;
  for (let r = 1; r < values.length; r++) {
    const row = values[r] || [];
    const name = String(row[0] ?? "").trim();
    if (!name) continue;
    const data = row.slice(1, 1 + labelCount).map((v) => (v == null || v === "" ? null : Number(v))).map((v) => (Number.isFinite(v) ? v : 0));
    const lower = name.toLowerCase();
    if (lower === "limite" || lower === "limit" || lower === "meta") {
      const n = data.find((x) => Number.isFinite(Number(x)));
      if (n != null) limit = Number(n);
      continue;
    }
    series.push({ name, data });
  }
  return { labels, series, limit };
}

function parseProdColab_(values) {
  const out = { labels: [], values: [], teams: [], items: [], color: "#2f66ff" };
  if (!Array.isArray(values) || !values.length) return out;
  const rows = values;
  for (const r of rows) {
    if (!r || !r.length) continue;
    const a = r[0];
    const b = r[1];
    const c = r[2];
    const d = r[3];
    const label = String((b ?? a) ?? "").trim();
    const team = normalizeTeamName_(c || a || "");
    if (!label) continue;
    const num = typeof d === "number" ? d : Number(String(d ?? "").replace(",", "."));
    if (!Number.isFinite(num)) continue;
    if (team === "SPCI") continue;
    out.labels.push(label);
    out.values.push(Number(num));
    out.teams.push(team);
    out.items.push({ name: label, value: Number(num), team: team });
  }
  return out;
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

function buildGeneralAccidentsFromDash_(ss) {
  return [
    { label: "Facilities", value: toNumber_(getA1_(ss, "dash", "B3")), lastRecord: "" },
    { label: "LSI (Limpeza)", value: toNumber_(getA1_(ss, "dash", "B4")), lastRecord: "" },
    { label: "Utilidades", value: toNumber_(getA1_(ss, "dash", "B5")), lastRecord: "" },
    { label: "SPCI", value: toNumber_(getA1_(ss, "dash", "B6")), lastRecord: "" }
  ];
}

function normalizeAccidentLabel_(value) {
  const raw = String(value == null ? "" : value).trim();
  const key = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!key) return "";
  if (key === "facilities" || key === "facility" || key === "fac") return "Facilities";
  if (key === "lsi" || key.indexOf("lsi") === 0) return "LSI (Limpeza)";
  if (key === "utilidades" || key === "utl" || key === "utilidade") return "Utilidades";
  if (key === "spci") return "SPCI";
  return raw;
}

function ensureGeneralAccidents_(accidents, ss) {
  const base = Array.isArray(accidents) ? accidents : [];
  const merged = new Map();

  base.forEach((item) => {
    const label = normalizeAccidentLabel_(item && item.label);
    if (!label) return;
    merged.set(label, {
      label,
      value: toNumber_(item && item.value),
      lastRecord: item && item.lastRecord ? item.lastRecord : ""
    });
  });

  buildGeneralAccidentsFromDash_(ss).forEach((item) => {
    if (merged.has(item.label)) return;
    merged.set(item.label, item);
  });

  return ["Facilities", "LSI (Limpeza)", "Utilidades", "SPCI"]
    .map((label) => merged.get(label))
    .filter(Boolean);
}

function buildDashboardPayload_() {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);

  const last = PropertiesService.getScriptProperties().getProperty("LAST_UPDATE_ISO") || new Date().toISOString();

  const dashSheet = ss.getSheetByName("dash");
  if (dashSheet) {
    const accidents = buildGeneralAccidentsFromDash_(ss);
    const customerSatisfaction = dashCustomerSatisfaction_(dashSheet);
    const sevenS = dashSevenS_(dashSheet);
    const tma = getA1_(ss, "dash", "B21");
    const prod = getA1_(ss, "dash", "B22");
    const retrabalho = getA1_(ss, "dash", "B81");
    const servExt = getA1_(ss, "dash", "B86");
    const portasRapidasPendentes = getA1_(ss, "dash", "E86");
    const preventivas = getA1_(ss, "dash", "B92");
    const zu = getRangeA1_(ss, "dash", "A24:AF27");
    const prio = getRangeA1_(ss, "dash", "A32:B36");
    const aval = getRangeA1_(ss, "dash", "A37:B42");
    const prodColab = getRangeA1_(ss, "dash", "A47:D67");

    const zuParsed = parseSeriesMatrix_(zu || []);
    const prioPairs = parsePairs_(prio || []);
    const avalPairs = parsePairs_(aval || []);
    const pcParsed = parseProdColab_(prodColab || []);
    const filteredZuSeries = zuParsed.series.filter((s) => !isSpciLabel_(s.name));
    const filteredPrioPairs = prioPairs.filter((p) => !isSpciLabel_(p.label));
    const filteredAvalPairs = avalPairs.filter((p) => !isSpciLabel_(p.label));

    return {
      updatedAt: last,
      general: { accidents, customerSatisfaction, sevenS },
      facilities: {
        tmaDays: Number(tma ?? 0),
        productivityPct: normalizePercent_(prod),
        reworkPct: normalizePercent_(retrabalho),
        servicoExterno: normalizePercent_(servExt),
        preventivas: normalizePercent_(preventivas),
        atendimentoZUS: {
          labels: zuParsed.labels,
          series: filteredZuSeries.map((s, idx) => ({
            name: s.name,
            data: s.data,
            color: ["#2f80ed", "#f2994a", "#27ae60", "#eb5757", "#2e2e2e"][idx % 5]
          })),
          limit: zuParsed.limit
        },
        prioridadeAlta: {
          labels: filteredPrioPairs.map((p) => p.label),
          values: filteredPrioPairs.map((p) => Number(p.value ?? 0)),
          colors: []
        },
        portasRapidasPendentes: {
          labels: ["Pendentes"],
          values: [Number(portasRapidasPendentes ?? 0)],
          colors: ["#ff4d00"]
        },
        avaliacoes: {
          labels: filteredAvalPairs.map((p) => p.label),
          values: filteredAvalPairs.map((p) => Number(p.value ?? 0)),
          colors: []
        },
        produtividadePorColaborador: pcParsed
      },
      utilidades: buildUtilidadesPayload_(ss),
      spci: buildSpciPayload_(ss),
      lsi: buildLsiPayload_(ss)
    };
  }

  const accValues = getSheetValues_(ss, "general_accidents");
  const csValues = getSheetValues_(ss, "general_customer_satisfaction");
  const s7Values = getSheetValues_(ss, "general_7s");

  const accValues2 = accValues;
  const csValues2 = csValues;
  const s7Values2 = s7Values;

  const accidents2 = ensureGeneralAccidents_(accValues2 ? asTable_(accValues2).map((r) => ({
    label: String(r.label ?? r.Label ?? r.area ?? r.Area ?? ""),
    value: Number(r.value ?? r.Value ?? 0),
    lastRecord: r.lastRecord ?? r.last_record ?? r.last ?? ""
  })).filter((x) => x.label) : [], ss);

  const csRows2 = csValues2 ? asTable_(csValues2) : [];
  const csLabels2 = csRows2.map((r) => String(r.month ?? r.Mes ?? r.label ?? ""));
  const csBars2 = csRows2.map((r) => Number(r.value ?? r.valor ?? 0));
  const csLine2 = csRows2.map((r) => Number(r.line ?? r.linha ?? r.value ?? r.valor ?? 0));

  const s7Rows2 = s7Values2 ? asTable_(s7Values2) : [];
  const s7Labels2 = s7Rows2.map((r) => String(r.month ?? r.Mes ?? r.label ?? ""));
  const s7Stihl2 = s7Rows2.map((r) => Number(r.stihl ?? r.Stihl ?? r.sth ?? 0));
  const s7Manserv2 = s7Rows2.map((r) => Number(r.manserv ?? r.Manserv ?? r.mans ?? 0));

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
  const seriesNames = ["Civil", "Elétrica", "Refrigeração"];
  const seriesKeys = [
    ["civil", "Civil"],
    ["eletrica", "Elétrica", "Eletrica"],
    ["refrigeracao", "Refrigeração", "Refrigeracao"]
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
  const paFilteredRows = paRows.filter((r) => !isSpciLabel_(r.label ?? r.nome ?? ""));
  const avFilteredRows = avRows.filter((r) => !isSpciLabel_(r.label ?? r.nome ?? ""));
  const portasRapidasPendentes = Number(
    fk.portasRapidasPendentes ??
    fk.portas_rapidas_pendentes ??
    fk.portasRapidas ??
    fk.portas_rapidas ??
    fk.portasRapidasPendente ??
    fk.portas_rapidas_pendente ??
    0
  );
  const pcItems = pcRows.map((r) => ({
    name: String(r.name ?? r.nome ?? "").trim(),
    value: Number(r.value ?? r.valor ?? 0),
    team: normalizeTeamName_(r.team ?? r.equipe ?? r.area ?? r.setor ?? "")
  })).filter((item) => item.name && Number.isFinite(item.value) && item.team !== "SPCI");

  return {
    updatedAt: last,
    general: {
      accidents: accidents2,
      customerSatisfaction: { labels: csLabels2, bars: csBars2, line: csLine2 },
      sevenS: {
        labels: s7Labels2,
        series: [
          { name: "Stihl", data: s7Stihl2, color: "#ff4d00" },
          { name: "Manserv", data: s7Manserv2, color: "#2e2e2e" }
        ]
      }
    },
    facilities: {
      tmaDays: Number(fk.tmaDays ?? fk.tma_days ?? fk.tma ?? 0),
      productivityPct: Number(fk.productivityPct ?? fk.productivity_pct ?? fk.produtividade ?? 0),
      reworkPct: Number(fk.reworkPct ?? fk.rework_pct ?? fk.retrabalho ?? 0),
      servicoExterno: Number(fk.servicoExterno ?? fk.servico_externo ?? fk.servicosExternos ?? fk.servicos_externos ?? 0),
      preventivas: Number(fk.preventivas ?? fk.preventiva ?? 0),
      atendimentoZUS: { labels: azLabels, series: azSeries, limit: Number.isFinite(azLimit) ? azLimit : undefined },
      prioridadeAlta: {
        labels: paFilteredRows.map((r) => String(r.label ?? r.nome ?? "")),
        values: paFilteredRows.map((r) => Number(r.value ?? r.valor ?? 0)),
        colors: paFilteredRows.map((r) => String(r.color ?? r.cor ?? "")).filter((c) => c)
      },
      portasRapidasPendentes: {
        labels: ["Pendentes"],
        values: [portasRapidasPendentes],
        colors: ["#ff4d00"]
      },
      avaliacoes: {
        labels: avFilteredRows.map((r) => String(r.label ?? r.nome ?? "")),
        values: avFilteredRows.map((r) => Number(r.value ?? r.valor ?? 0)),
        colors: avFilteredRows.map((r) => String(r.color ?? r.cor ?? "")).filter((c) => c)
      },
      produtividadePorColaborador: {
        labels: pcItems.map((item) => item.name),
        values: pcItems.map((item) => item.value),
        teams: pcItems.map((item) => item.team),
        items: pcItems,
        color: String((pcRows[0] && (pcRows[0].color ?? pcRows[0].cor)) || "#2f66ff")
      }
    },
    utilidades: buildUtilidadesPayload_(ss),
    spci: buildSpciPayload_(ss),
    lsi: buildLsiPayload_(ss)
  };
}

function buildProgSemPayload_(e) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sheet = ss.getSheetByName("prisma_source");

  const parseIsoDate_ = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const s = String(value).trim();
    if (!s) return null;
    const asIso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
    if (Number.isNaN(asIso.getTime())) return null;
    asIso.setHours(0, 0, 0, 0);
    return asIso;
  };

  const getMonday_ = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const parseHours_ = (value) => {
    if (value == null || value === "") return 0;
    if (value instanceof Date) {
      return Number(value.getHours()) + Number(value.getMinutes() || 0) / 60;
    }
    if (typeof value === "number") {
      if (value > 0 && value <= 1) return value * 24;
      return value;
    }
    const s = String(value).trim().replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const parseExecutantes_ = (value) => {
    const s = String(value == null ? "" : value).trim();
    if (!s) return 1;
    const up = s.toUpperCase();
    if (up.startsWith("P") || up.startsWith("I")) return 1;
    const digits = up.replace(/[^\d]/g, "");
    const n = Number(digits || up);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  };

  const now = new Date();
  const paramWeekStart = e && e.parameter ? String(e.parameter.weekStart || "").trim() : "";
  const weekStart = parseIsoDate_(paramWeekStart) || getMonday_(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(0, 0, 0, 0);
  const weekStartIso = Utilities.formatDate(weekStart, "America/Sao_Paulo", "yyyy-MM-dd");
  const weekEndIso = Utilities.formatDate(weekEnd, "America/Sao_Paulo", "yyyy-MM-dd");
  const cache = CacheService.getScriptCache();
  const cacheKey = `prog_sem:${cfg.SPREADSHEET_ID}:${weekStartIso}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const putCacheIfFits_ = (value) => {
    try {
      const json = JSON.stringify(value);
      if (json.length <= 95000) cache.put(cacheKey, json, 120);
    } catch {}
  };

  const mkEmptyData_ = () => ({
    civil: [],
    elet: [],
    refrig: [],
    pintura: [],
    util: { t1: [], t2: [], t2a: [], t3: [] },
    spci: [],
    limpTec: [],
    jardim: [],
    limpConv: { t1: [], t2: [], t3: [] }
  });

  if (!sheet) {
    const payload = {
      updatedAt: new Date().toISOString(),
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      data: mkEmptyData_(),
      meta: { error: "Aba prisma_source não encontrada." }
    };
    putCacheIfFits_(payload);
    return payload;
  }

  const lastRow = sheet.getLastRow();
  const readColumnCount = 16; // A:P cobre todos os campos usados pela programação.
  if (lastRow < 2) {
    const payload = {
      updatedAt: new Date().toISOString(),
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      data: mkEmptyData_(),
      meta: { scanned: 0 }
    };
    putCacheIfFits_(payload);
    return payload;
  }

  const COL = {
    numero_os: 0,
    oficina: 4,
    denominacao_os: 5,
    descricao_os: 6,
    estado_os: 7,
    duracao_prevista: 8,
    procedimento: 10,
    tipo_servico: 11,
    turno_previsto: 13,
    data_prevista: 15
  };

  const officeMap = {
    CIV: "civil",
    ELE: "elet",
    REF: "refrig",
    PIN: "pintura",
    ELM: "util",
    SPI: "spci",
    LTE: "limpTec",
    JAR: "jardim",
    LCO: "limpConv"
  };

  const allowedStates = new Set([30, 50, 55, 77, 96, 99]);
  const statusFromEstado = (estado) => {
    const n = Number(estado || 0);
    if (n === 30) return "evaluation";
    if (n === 55) return "progress";
    if (n === 77 || n === 99) return "done";
    return "pending";
  };

  const out = mkEmptyData_();
  const values = sheet.getRange(2, 1, lastRow - 1, readColumnCount).getValues();
  let scanned = 0;
  let kept = 0;

  for (const row of values) {
    scanned++;

    const rawOffice = String(row[COL.oficina] || "").trim().toUpperCase();
    const oficinaId = officeMap[rawOffice] || "";
    if (!oficinaId) continue;

    const datePrev = parseIsoDate_(row[COL.data_prevista]);
    if (!datePrev) continue;
    if (datePrev < weekStart || datePrev > weekEnd) continue;

    const estado = Number(row[COL.estado_os] || 0);
    if (!allowedStates.has(estado)) continue;

    const turnoRaw = String(row[COL.turno_previsto] || "").trim().toUpperCase();
    let subteamId = "";
    if (oficinaId === "util") {
      if (turnoRaw === "T2A") subteamId = "t2a";
      else if (turnoRaw === "T1") subteamId = "t1";
      else if (turnoRaw === "T2") subteamId = "t2";
      else if (turnoRaw === "T3") subteamId = "t3";
      else subteamId = "t1";
    } else if (oficinaId === "limpConv") {
      if (turnoRaw === "T1") subteamId = "t1";
      else if (turnoRaw === "T2" || turnoRaw === "T2E") subteamId = "t2";
      else if (turnoRaw === "T3" || turnoRaw === "T3E") subteamId = "t3";
      else subteamId = "t1";
    }

    const codeRaw = row[COL.numero_os];
    const titleRaw = row[COL.denominacao_os];
    const descriptionRaw = row[COL.descricao_os];
    const code = String(codeRaw == null ? "" : codeRaw).trim() || `OS-${scanned}`;
    const title = String(titleRaw == null ? "" : titleRaw).trim() || "Ordem de Serviço";
    const description = String(descriptionRaw == null ? "" : descriptionRaw).trim();

    const exec = parseExecutantes_(row[COL.procedimento]);
    const tipoServico = Number(row[COL.tipo_servico] || 0);

    const hh = parseHours_(row[COL.duracao_prevista]);

    const dateIso = Utilities.formatDate(datePrev, "America/Sao_Paulo", "yyyy-MM-dd");
    const order = {
      date: dateIso,
      code,
      title,
      description,
      hh,
      exec,
      tipoServico,
      estado,
      status: statusFromEstado(estado),
      resources: []
    };

    if (oficinaId === "util") out.util[subteamId].push(order);
    else if (oficinaId === "limpConv") out.limpConv[subteamId].push(order);
    else out[oficinaId].push(order);
    kept++;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    data: out,
    meta: { scanned, kept }
  };
  putCacheIfFits_(payload);
  return payload;
}

function buildLsiRotinasPayload_(e) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");

  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sheet = ss.getSheetByName("LSI") || ss.getSheetByName("lsi");
  const tz = "America/Sao_Paulo";
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const parseIsoDate_ = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(`${s}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const parts = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (parts) {
      const dd = Number(parts[1]);
      const mm = Number(parts[2]);
      const yyRaw = Number(parts[3] || now.getFullYear());
      const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
      const d = new Date(yy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const fallback = new Date(s);
    if (Number.isNaN(fallback.getTime())) return null;
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  };

  const parseSheetDate_ = (value, yearHint) => {
    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const s = String(value == null ? "" : value).trim();
    if (!s) return null;
    const parts = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (parts) {
      const dd = Number(parts[1]);
      const mm = Number(parts[2]);
      const yyRaw = Number(parts[3] || yearHint || now.getFullYear());
      const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
      const d = new Date(yy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    return parseIsoDate_(s);
  };

  const toIsoDate_ = (date) => Utilities.formatDate(date, tz, "yyyy-MM-dd");
  const toPtDate_ = (date) => Utilities.formatDate(date, tz, "dd/MM/yyyy");
  const normalizeText_ = (value) => String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const slugify_ = (value) => normalizeText_(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const parseDayList_ = (value) => Array.from(new Set(
    String(value == null ? "" : value)
      .split(/[^\d]+/)
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
  )).sort((a, b) => a - b);
  const parseTurnList_ = (value) => {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return [];
    const split = raw
      .replace(/\s+e\s+/gi, ";")
      .split(/[;,/|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const out = split.length ? split : [raw];
    return Array.from(new Set(out));
  };
  const weekdayCode_ = (date) => {
    const jsDay = date.getDay();
    return jsDay === 0 ? 7 : jsDay;
  };
  const T1_START_MINUTES = 22 * 60 + 35;
  const countDirectReads_ = (value) => {
    if (value == null || value === "") return 0;
    if (value instanceof Date) return 1;
    if (typeof value === "number") {
      if (value > 0 && value < 1) return 1;
      return value > 0 ? Math.max(1, Math.floor(value)) : 0;
    }
    const text = String(value).trim();
    if (!text) return 0;
    const timeMatches = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g);
    if (timeMatches && timeMatches.length) return timeMatches.length;
    const lineParts = text
      .split(/\r?\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (lineParts.length > 1) return lineParts.length;
    const inlineParts = text
      .split(/[;,|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (inlineParts.length > 1) return inlineParts.length;
    const numeric = Number(text.replace(",", "."));
    if (Number.isFinite(numeric) && numeric > 0) {
      if (numeric > 0 && numeric < 1) return 1;
      return Math.max(1, Math.floor(numeric));
    }
    return 1;
  };
  const extractReadTimes_ = (value) => {
    if (value == null || value === "") return [];
    if (value instanceof Date) {
      return [Number(value.getHours()) * 60 + Number(value.getMinutes() || 0)];
    }
    if (typeof value === "number") {
      if (value > 0 && value < 1) return [Math.round(value * 24 * 60)];
      return [];
    }
    const text = String(value).trim();
    if (!text) return [];
    const matches = Array.from(text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g));
    return matches.map((match) => Number(match[1]) * 60 + Number(match[2]));
  };
  const countOperationalDayReads_ = (currentValues, previousValues, useNightShiftRule) => {
    const currentList = Array.isArray(currentValues) ? currentValues : [];
    const previousList = Array.isArray(previousValues) ? previousValues : [];

    if (!useNightShiftRule) {
      return currentList.reduce((sum, value) => sum + countDirectReads_(value), 0);
    }

    let total = 0;
    currentList.forEach((value) => {
      const times = extractReadTimes_(value);
      if (times.length) {
        total += times.filter((minutes) => minutes < T1_START_MINUTES).length;
      } else {
        total += countDirectReads_(value);
      }
    });
    previousList.forEach((value) => {
      const times = extractReadTimes_(value);
      if (times.length) {
        total += times.filter((minutes) => minutes >= T1_START_MINUTES).length;
      }
    });
    return total;
  };
  const isScheduledToday_ = (days, frequencyCode) => {
    if (frequencyCode === 6) return false;
    if (Array.isArray(days) && days.length) return days.indexOf(weekdayCode_(selectedDate)) >= 0;
    return frequencyCode === 3;
  };
  const expectedReads_ = (frequencyCode, dueToday, turnos) => {
    if (!dueToday || frequencyCode === 6) return 0;
    if (frequencyCode === 1) {
      const turnCount = Array.isArray(turnos) ? turnos.filter(Boolean).length : 0;
      return Math.max(1, turnCount || 1);
    }
    if (frequencyCode === 2) return 2;
    return 1;
  };
  const statusFromCounts_ = (actual, expected) => {
    if (!(expected > 0)) return "green";
    if (actual >= expected) return "green";
    if (actual > 0) return "yellow";
    return "red";
  };
  const statusRank_ = (status) => {
    if (status === "red") return 2;
    if (status === "yellow") return 1;
    return 0;
  };
  const rankStatus_ = (rank) => {
    if (rank >= 2) return "red";
    if (rank === 1) return "yellow";
    return "green";
  };
  const frequencyLabel_ = (frequencyCode) => ({
    1: "Turnario",
    2: "2x por dia",
    3: "Diario",
    4: "Alternado",
    5: "Semanal",
    6: "Sob demanda"
  }[frequencyCode] || "Nao informado");
  const dayLabels_ = (days) => {
    const map = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sab", 7: "Dom" };
    return (days || []).map((day) => map[day] || String(day));
  };

  const selectedDateParam = e && e.parameter ? String(e.parameter.date || "").trim() : "";
  const selectedDate = parseIsoDate_(selectedDateParam) || now;
  const selectedDateIso = toIsoDate_(selectedDate);
  const cache = CacheService.getScriptCache();
  const cacheKey = `lsi_rotinas:${cfg.SPREADSHEET_ID}:${selectedDateIso}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const putCacheIfFits_ = (value) => {
    try {
      const json = JSON.stringify(value);
      if (json.length <= 95000) cache.put(cacheKey, json, 120);
    } catch {}
  };

  const emptyPayload = (meta) => ({
    updatedAt: new Date().toISOString(),
    selectedDate: selectedDateIso,
    selectedDateLabel: toPtDate_(selectedDate),
    availableDates: [],
    filters: {
      ambientes: [],
      cronogramas: [
        { id: "salas", label: "Limpeza de Salas" },
        { id: "banheiros", label: "Limpeza de Banheiros" },
        { id: "residuos", label: "Recolhimento de Residuos" },
        { id: "piso", label: "Limpeza de Piso" }
      ],
      turnos: []
    },
    items: [],
    ambientes: [],
    summary: {
      totalAmbientes: 0,
      green: 0,
      yellow: 0,
      red: 0,
      totalExpected: 0,
      totalActual: 0
    },
    meta: meta || {}
  });

  if (!sheet) {
    const payload = emptyPayload({ error: "Aba LSI nao encontrada." });
    putCacheIfFits_(payload);
    return payload;
  }

  const lastCol = sheet.getLastColumn();
  if (lastCol < 9) {
    const payload = emptyPayload({ error: "Nao ha colunas de leitura na aba LSI." });
    putCacheIfFits_(payload);
    return payload;
  }

  const dateHeaderRow = sheet.getRange(6, 9, 1, lastCol - 8).getValues()[0] || [];
  const availableDates = [];
  const seenDates = new Set();
  const columnsByDate = new Map();

  dateHeaderRow.forEach((value, idx) => {
    const parsed = parseSheetDate_(value, selectedDate.getFullYear());
    if (!parsed) return;
    const iso = toIsoDate_(parsed);
    if (!seenDates.has(iso)) {
      seenDates.add(iso);
      availableDates.push(iso);
    }
    if (!columnsByDate.has(iso)) columnsByDate.set(iso, []);
    columnsByDate.get(iso).push(idx + 9);
  });
  const previousDate = new Date(selectedDate);
  previousDate.setDate(previousDate.getDate() - 1);
  previousDate.setHours(0, 0, 0, 0);
  const previousDateIso = toIsoDate_(previousDate);
  const selectedColumns = columnsByDate.get(selectedDateIso) || [];
  const previousColumns = columnsByDate.get(previousDateIso) || [];

  const cronogramas = [
    { id: "salas", label: "Limpeza de Salas", startRow: 7, endRow: 470 },
    { id: "banheiros", label: "Limpeza de Banheiros", startRow: 472, endRow: 591 },
    { id: "residuos", label: "Recolhimento de Residuos", startRow: 593, endRow: 744 },
    { id: "piso", label: "Limpeza de Piso", startRow: 746, endRow: 766 }
  ];

  const ambienteSet = new Set();
  const turnoSet = new Set();
  const items = [];
  let scanned = 0;
  let kept = 0;
  let ignoredOnDemand = 0;

  for (const bloco of cronogramas) {
    const rowCount = bloco.endRow - bloco.startRow + 1;
    const baseRows = sheet.getRange(bloco.startRow, 2, rowCount, 6).getValues();
    const readRows = sheet.getRange(bloco.startRow, 9, rowCount, lastCol - 8).getValues();

    for (let idx = 0; idx < baseRows.length; idx++) {
      const row = baseRows[idx] || [];
      const readRow = readRows[idx] || [];
      scanned++;

      const ambiente = String(row[0] == null ? "" : row[0]).trim();
      if (!ambiente) continue;

      const dayCodes = parseDayList_(row[3]);
      const frequencyCode = Math.floor(toNumber_(row[4]));
      const turnos = parseTurnList_(row[5]);
      const currentReadValues = selectedColumns.map((column) => readRow[column - 9]);
      const previousReadValues = previousColumns.map((column) => readRow[column - 9]);
      const useNightShiftRule = bloco.id === "banheiros" && turnos.indexOf("T1") >= 0;
      const actual = countOperationalDayReads_(currentReadValues, previousReadValues, useNightShiftRule);
      const dueToday = isScheduledToday_(dayCodes, frequencyCode);
      const expected = expectedReads_(frequencyCode, dueToday, turnos);
      const status = statusFromCounts_(actual, expected);
      const rowNumber = bloco.startRow + idx;

      if (frequencyCode === 6) ignoredOnDemand++;

      const item = {
        rowNumber,
        ambiente,
        ambienteKey: slugify_(ambiente),
        cronogramaId: bloco.id,
        cronogramaLabel: bloco.label,
        dias: dayCodes,
        diasLabel: dayLabels_(dayCodes),
        frequencyCode,
        frequencyLabel: frequencyLabel_(frequencyCode),
        turnos,
        actual,
        expected,
        dueToday,
        countsInSchedule: frequencyCode !== 6,
        status
      };

      items.push(item);
      ambienteSet.add(ambiente);
      turnos.forEach((turno) => turnoSet.add(turno));
      kept++;
    }
  }

  const grouped = new Map();
  items.forEach((item) => {
    if (!grouped.has(item.ambiente)) {
      grouped.set(item.ambiente, {
        ambiente: item.ambiente,
        ambienteKey: item.ambienteKey,
        status: "green",
        totalExpected: 0,
        totalActual: 0,
        dueItems: 0,
        worstStatusRank: 0,
        items: []
      });
    }
    const entry = grouped.get(item.ambiente);
    entry.items.push(item);
    if (item.countsInSchedule && item.dueToday) {
      entry.totalExpected += item.expected;
      entry.totalActual += item.actual;
      entry.dueItems++;
      entry.worstStatusRank = Math.max(entry.worstStatusRank, statusRank_(item.status));
    }
  });

  const ambientes = Array.from(grouped.values())
    .map((entry) => {
      entry.status = rankStatus_(entry.worstStatusRank);
      entry.itemCount = entry.items.length;
      entry.turnos = Array.from(new Set(
        entry.items.flatMap((item) => Array.isArray(item.turnos) ? item.turnos : []).filter(Boolean)
      ));
      entry.cronogramas = Array.from(new Set(entry.items.map((item) => item.cronogramaLabel)));
      return entry;
    })
    .sort((a, b) => a.ambiente.localeCompare(b.ambiente, "pt-BR"));

  const summary = ambientes.reduce((acc, ambiente) => {
    acc.totalAmbientes += 1;
    acc[ambiente.status] += 1;
    acc.totalExpected += ambiente.totalExpected;
    acc.totalActual += ambiente.totalActual;
    return acc;
  }, {
    totalAmbientes: 0,
    green: 0,
    yellow: 0,
    red: 0,
    totalExpected: 0,
    totalActual: 0
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    selectedDate: selectedDateIso,
    selectedDateLabel: toPtDate_(selectedDate),
    availableDates: availableDates.sort(),
    filters: {
      ambientes: Array.from(ambienteSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
      cronogramas: cronogramas.map((item) => ({ id: item.id, label: item.label })),
      turnos: Array.from(turnoSet).sort((a, b) => a.localeCompare(b, "pt-BR"))
    },
    items,
    ambientes,
    summary,
    meta: {
      scanned,
      kept,
      ignoredOnDemand,
      selectedDateFound: selectedColumns.length > 0,
      sheet: sheet.getName()
    }
  };

  putCacheIfFits_(payload);
  return payload;
}

function buildClientSchedulePayload_(e) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");

  const token = e && e.parameter
    ? String(e.parameter.token || e.parameter.access_token || e.parameter.api_token || "").trim()
    : "";
  const requiredToken = String(cfg.APPS_SCRIPT_TOKEN || "").trim();
  if (requiredToken && token !== requiredToken) {
    return {
      ok: false,
      found: false,
      error: "Token invalido.",
      query: "",
      matches: [],
      selected: null,
      meta: { authorized: false }
    };
  }

  const query = e && e.parameter
    ? String(e.parameter.query || e.parameter.q || e.parameter.ambiente || "").trim()
    : "";
  const selectedKey = e && e.parameter
    ? String(e.parameter.environmentKey || e.parameter.ambienteKey || "").trim()
    : "";

  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sheet = ss.getSheetByName("LSI") || ss.getSheetByName("lsi");
  const now = new Date();
  const tz = "America/Sao_Paulo";

  const normalizeText_ = (value) => String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const slugify_ = (value) => normalizeText_(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const parseDayList_ = (value) => Array.from(new Set(
    String(value == null ? "" : value)
      .split(/[^\d]+/)
      .map((part) => Number(part))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 7)
  )).sort((a, b) => a - b);
  const parseTurnList_ = (value) => {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return [];
    return Array.from(new Set(
      raw
        .replace(/\s+e\s+/gi, ";")
        .split(/[;,/|]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    ));
  };
  const frequencyLabel_ = (frequencyCode) => ({
    1: "Turnario",
    2: "2x por dia",
    3: "Diario",
    4: "Dias alternados",
    5: "Semanal",
    6: "Sob demanda"
  }[frequencyCode] || "Nao informado");
  const dayLabels_ = (days) => {
    const map = { 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sab", 7: "Dom" };
    return (days || []).map((day) => map[day] || String(day));
  };
  const parseSheetDate_ = (value, yearHint) => {
    if (value instanceof Date) {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const s = String(value == null ? "" : value).trim();
    if (!s) return null;
    const serial = Number(String(s).replace(",", "."));
    if (Number.isFinite(serial) && serial > 0 && serial < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const parts = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (parts) {
      const dd = Number(parts[1]);
      const mm = Number(parts[2]);
      const yyRaw = Number(parts[3] || yearHint || now.getFullYear());
      const yy = yyRaw < 100 ? 2000 + yyRaw : yyRaw;
      const d = new Date(yy, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    const fallback = new Date(s);
    if (Number.isNaN(fallback.getTime())) return null;
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  };
  const toIsoDate_ = (date) => Utilities.formatDate(date, tz, "yyyy-MM-dd");
  const toPtDate_ = (date) => Utilities.formatDate(date, tz, "dd/MM/yyyy");
  const matchesQuery_ = (ambiente) => {
    if (!query) return true;
    return normalizeText_(ambiente).indexOf(normalizeText_(query)) >= 0;
  };

  const emptyPayload_ = (meta) => ({
    ok: true,
    found: false,
    query,
    matches: [],
    selected: null,
    meta: Object.assign({ authorized: true }, meta || {})
  });

  if (!sheet) {
    return emptyPayload_({ error: "Aba LSI nao encontrada." });
  }

  const lastCol = sheet.getLastColumn();
  if (lastCol < 9) {
    return emptyPayload_({ error: "Nao ha colunas de rotina na aba LSI." });
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `cliente_cronograma:${cfg.SPREADSHEET_ID}:${normalizeText_(query)}:${selectedKey}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const putCacheIfFits_ = (value) => {
    try {
      const json = JSON.stringify(value);
      if (json.length <= 95000) cache.put(cacheKey, json, 120);
    } catch {}
  };

  const dateHeaders = sheet.getRange(6, 9, 1, lastCol - 8).getValues()[0] || [];
  const dateByColumn = {};
  for (let idx = 0; idx < dateHeaders.length; idx++) {
    const parsed = parseSheetDate_(dateHeaders[idx], now.getFullYear());
    if (parsed) dateByColumn[idx + 9] = parsed;
  }

  const cronogramas = [
    { id: "salas", label: "Limpeza de Salas", startRow: 7, endRow: 469 },
    { id: "banheiros", label: "Limpeza de Banheiros", startRow: 471, endRow: 590 },
    { id: "residuos", label: "Recolhimento de Residuos", startRow: 592, endRow: 743 },
    { id: "piso", label: "Limpeza de Piso", startRow: 745, endRow: 765 }
  ];

  const grouped = new Map();
  let scanned = 0;

  for (const bloco of cronogramas) {
    const rowCount = bloco.endRow - bloco.startRow + 1;
    const baseRows = sheet.getRange(bloco.startRow, 2, rowCount, 6).getValues();
    const routineRows = sheet.getRange(bloco.startRow, 9, rowCount, lastCol - 8).getValues();

    for (let idx = 0; idx < baseRows.length; idx++) {
      const row = baseRows[idx] || [];
      const rotina = routineRows[idx] || [];
      scanned++;

      const ambiente = String(row[0] == null ? "" : row[0]).trim();
      if (!ambiente) continue;

      const environmentKey = slugify_(ambiente);
      const days = parseDayList_(row[3]);
      const frequencyCode = Math.floor(toNumber_(row[4]));
      const shifts = parseTurnList_(row[5]);

      let lastRoutineDate = null;
      for (let colOffset = rotina.length - 1; colOffset >= 0; colOffset--) {
        const value = rotina[colOffset];
        const numeric = typeof value === "number" ? value : Number(String(value == null ? "" : value).replace(",", "."));
        if (!Number.isFinite(numeric) || numeric <= 0) continue;
        lastRoutineDate = dateByColumn[colOffset + 9] || null;
        if (lastRoutineDate) break;
      }

      const entry = {
        rowNumber: bloco.startRow + idx,
        cronogramaId: bloco.id,
        cronogramaLabel: bloco.label,
        days,
        daysLabel: dayLabels_(days),
        frequencyCode,
        frequencyLabel: frequencyLabel_(frequencyCode),
        shifts,
        onDemand: frequencyCode === 6 || !days.length,
        lastRoutineAt: lastRoutineDate ? toIsoDate_(lastRoutineDate) : null,
        lastRoutineLabel: lastRoutineDate ? toPtDate_(lastRoutineDate) : null
      };

      if (!grouped.has(environmentKey)) {
        grouped.set(environmentKey, {
          environmentKey,
          environmentName: ambiente,
          entries: []
        });
      }

      grouped.get(environmentKey).entries.push(entry);
    }
  }

  const matches = Array.from(grouped.values())
    .filter((item) => matchesQuery_(item.environmentName))
    .map((item) => ({
      environmentKey: item.environmentKey,
      environmentName: item.environmentName,
      scheduleLabels: Array.from(new Set(item.entries.map((entry) => entry.cronogramaLabel))),
      shifts: Array.from(new Set(item.entries.flatMap((entry) => entry.shifts || []).filter(Boolean)))
    }))
    .sort((a, b) => a.environmentName.localeCompare(b.environmentName, "pt-BR"))
    .slice(0, 20);

  let selected = null;
  if (selectedKey && grouped.has(selectedKey)) {
    const source = grouped.get(selectedKey);
    const entries = source.entries.slice().sort((a, b) => a.rowNumber - b.rowNumber);
    const allDays = Array.from(new Set(entries.flatMap((entry) => entry.days || []))).sort((a, b) => a - b);
    const allShifts = Array.from(new Set(entries.flatMap((entry) => entry.shifts || []).filter(Boolean)));
    const allFrequencies = Array.from(new Set(entries.map((entry) => entry.frequencyLabel).filter(Boolean)));
    const scheduleLabels = Array.from(new Set(entries.map((entry) => entry.cronogramaLabel).filter(Boolean)));
    const datedEntries = entries.filter((entry) => entry.lastRoutineAt);
    const latestEntry = datedEntries.sort((a, b) => String(a.lastRoutineAt).localeCompare(String(b.lastRoutineAt))).slice(-1)[0] || null;

    selected = {
      environmentKey: source.environmentKey,
      environmentName: source.environmentName,
      scheduleLabels,
      days: allDays,
      daysLabel: dayLabels_(allDays),
      shifts: allShifts,
      frequencyLabels: allFrequencies,
      lastRoutineAt: latestEntry ? latestEntry.lastRoutineAt : null,
      lastRoutineLabel: latestEntry ? latestEntry.lastRoutineLabel : null,
      entries
    };
  }

  const payload = {
    ok: true,
    found: !!selected,
    query,
    matches,
    selected,
    meta: {
      authorized: true,
      sheet: sheet.getName(),
      scanned,
      totalMatches: matches.length
    }
  };
  putCacheIfFits_(payload);
  return payload;
}

function doGet(e) {
  const view = e && e.parameter ? String(e.parameter.view || "").trim() : "";
  let payload;
  if (view === "prog_sem") payload = buildProgSemPayload_(e);
  else if (view === "lsi_rotinas") payload = buildLsiRotinasPayload_(e);
  else if (view === "cliente_cronograma") payload = buildClientSchedulePayload_(e);
  else if (view === "cliente_os") payload = buildClientOsPayload_(e);
  else payload = buildDashboardPayload_();
  const cb = e && e.parameter ? e.parameter.callback : "";
  if (cb) {
    const out = cb + "(" + JSON.stringify(payload) + ");";
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
