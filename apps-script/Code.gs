const DEFAULTS = {
  SPREADSHEET_ID: "",
  SOURCE_SHEET: "prisma_source",
  API_URL: "",
  API_METHOD: "GET",
  API_HEADERS_JSON: "{}",
  API_PAYLOAD_JSON: ""
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
  const options = {
    method,
    muteHttpExceptions: true,
    headers
  };
  const payload = String(cfg.API_PAYLOAD_JSON || "");
  if (payload) options.payload = payload;

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

function normalizeRecords_(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
  }
  return [];
}

function updatePrismaSource(records) {
  const cfg = getConfig_();
  if (!cfg.SPREADSHEET_ID) throw new Error("SPREADSHEET_ID ausente");
  const ss = SpreadsheetApp.openById(cfg.SPREADSHEET_ID);
  const sh = ensureSheet_(ss, cfg.SOURCE_SHEET);

  const rows = Array.isArray(records) ? records : [];
  const keys = [];
  const keySet = {};
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    for (const k of Object.keys(r)) {
      if (keySet[k]) continue;
      keySet[k] = true;
      keys.push(k);
    }
  }
  sh.clearContents();
  if (!keys.length) {
    sh.getRange(1, 1).setValue("empty");
    PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
    return;
  }

  const values = [keys];
  for (const r of rows) {
    const row = keys.map((k) => (r && typeof r === "object" ? r[k] : ""));
    values.push(row);
  }
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  PropertiesService.getScriptProperties().setProperty("LAST_UPDATE_ISO", new Date().toISOString());
}

function runFetchAndUpdate() {
  const payload = fetchApi_();
  const records = normalizeRecords_(payload);
  updatePrismaSource(records);
  return { ok: true, records: records.length };
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
