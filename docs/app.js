const cfg = window.__DASHBOARD_CONFIG__ ?? { dataEndpoint: "" };

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatDatePtBR(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}/${mm}/${yy}`;
}

function formatNumberPtBR(value, { digits = 0 } = {}) {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return String(value ?? "");
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function stripAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTeamName(value) {
  const raw = String(value ?? "").trim();
  const key = stripAccents(raw).toLowerCase();
  if (!key) return "";
  if (key.startsWith("civil")) return "Civil";
  if (key.startsWith("eletric")) return "Elétrica";
  if (key.startsWith("refrig")) return "Refrigeração";
  if (key.startsWith("pint")) return "Pintura";
  if (key === "spci") return "SPCI";
  return raw;
}

function formatPercentValue(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  const safe = Number.isFinite(n) ? n : 0;
  const digits = Math.abs(safe % 1) > 0.001 ? 1 : 0;
  return `${formatNumberPtBR(safe, { digits })}%`;
}

function getCollaboratorItems(metric, { excludeSpci = true } = {}) {
  if (Array.isArray(metric?.items)) {
    return metric.items
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        value: Number(item?.value ?? 0),
        team: normalizeTeamName(item?.team ?? ""),
        os: String(item?.os ?? "").trim()
      }))
      .filter((item) => item.name && Number.isFinite(item.value) && (!excludeSpci || item.team !== "SPCI"));
  }

  const labels = Array.isArray(metric?.labels) ? metric.labels : [];
  const values = Array.isArray(metric?.values) ? metric.values : [];
  const teams = Array.isArray(metric?.teams) ? metric.teams : [];
  const oss = Array.isArray(metric?.os) ? metric.os : [];

  return labels
    .map((name, idx) => ({
      name: String(name ?? "").trim(),
      value: Number(values[idx] ?? 0),
      team: normalizeTeamName(teams[idx] ?? ""),
      os: String(oss[idx] ?? "").trim()
    }))
    .filter((item) => item.name && Number.isFinite(item.value) && (!excludeSpci || item.team !== "SPCI"));
}

function compareToTargetText(result, target) {
  const res = Number(result ?? 0);
  const tgt = Number(target ?? 0);
  if (!(tgt > 0)) return "Meta não informada";
  if (res >= tgt) return "Meta atingida";
  return `${formatNumberPtBR((res / tgt) * 100, { digits: 0 })}% da meta`;
}

function buildKpiClasses(isOnTarget) {
  return `card mini-kpi${isOnTarget ? " is-target-ok" : " is-target-bad"}`;
}

function renderKpi(label, valueText, { target, targetLabel, isOnTarget, direction = "gte" }) {
  return el("div", { class: buildKpiClasses(Boolean(isOnTarget)) }, [
    el("div", { class: "card-title", text: label }),
    el("div", { class: "mini-value", text: valueText }),
    el("div", { class: "mini-target", text: targetLabel ? `Meta: ${targetLabel}` : "" })
  ]);
}

function evaluateKpi(value, { target, direction = "gte" }) {
  const v = Number(value ?? 0);
  const t = Number(target ?? 0);
  if (direction === "lte") return v <= t;
  if (direction === "lt") return v < t;
  if (direction === "gt") return v > t;
  return v >= t;
}

const CRONOGRAMA_LEVEL_CONFIG = {
  "Limpeza de Salas": {
    targets: [80, 90],
    thresholds: [
      { max: 80, color: "red", label: "abaixo 80%" },
      { min: 80, max: 90, color: "yellow", label: "80%–90%" },
      { min: 90, color: "green", label: "acima 90%" }
    ]
  },
  "Limpeza de Banheiros": {
    targets: [85, 95, 100],
    thresholds: [
      { max: 85, color: "red", label: "abaixo 85%" },
      { min: 85, max: 95, color: "orange", label: "85%–95%" },
      { min: 95, max: 100, color: "yellow", label: "95%–99,9%" },
      { min: 100, color: "green", label: "100%" }
    ]
  },
  "Recolhimento Resíduos": {
    targets: [85, 95, 100],
    thresholds: [
      { max: 85, color: "red", label: "abaixo 85%" },
      { min: 85, max: 95, color: "orange", label: "85%–95%" },
      { min: 95, max: 100, color: "yellow", label: "95%–99,9%" },
      { min: 100, color: "green", label: "100%" }
    ]
  },
  "Limpeza de Piso": {
    targets: [85, 95, 100],
    thresholds: [
      { max: 85, color: "red", label: "abaixo 85%" },
      { min: 85, max: 95, color: "orange", label: "85%–95%" },
      { min: 95, max: 100, color: "yellow", label: "95%–99,9%" },
      { min: 100, color: "green", label: "100%" }
    ]
  },
  "Limpeza Técnica": {
    targets: [90],
    thresholds: [
      { max: 90, color: "red", label: "abaixo 90%" },
      { min: 90, color: "green", label: "acima 90%" }
    ]
  },
  "Jardinagem": {
    targets: [90],
    thresholds: [
      { max: 90, color: "red", label: "abaixo 90%" },
      { min: 90, color: "green", label: "acima 90%" }
    ]
  }
};

function getCronogramaConfig(label) {
  const key = String(label ?? "").trim();
  if (CRONOGRAMA_LEVEL_CONFIG[key]) return CRONOGRAMA_LEVEL_CONFIG[key];
  return {
    targets: [90],
    thresholds: [
      { max: 90, color: "red", label: "abaixo 90%" },
      { min: 90, color: "green", label: "acima 90%" }
    ]
  };
}

function getCronogramaLevel(label, result) {
  const cfg = getCronogramaConfig(label);
  const value = Number(result ?? 0);
  for (const t of cfg.thresholds) {
    const aboveMin = t.min == null || value >= t.min;
    const belowMax = t.max == null || value < t.max;
    const atMax = t.max != null && value >= 100 && t.min >= 100;
    if (aboveMin && (belowMax || atMax)) return { color: t.color, label: t.label, targets: cfg.targets };
  }
  const last = cfg.thresholds[cfg.thresholds.length - 1];
  return { color: last?.color || "green", label: last?.label || "", targets: cfg.targets };
}

function darkenColor(color, amount = 0.2) {
  const value = String(color ?? "").trim();
  const hex = value.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return value || "#111";

  const clampChannel = (channel) => Math.max(0, Math.min(255, Math.round(channel * (1 - amount))));
  const r = clampChannel(parseInt(hex.slice(0, 2), 16));
  const g = clampChannel(parseInt(hex.slice(2, 4), 16));
  const b = clampChannel(parseInt(hex.slice(4, 6), 16));

  return `rgb(${r}, ${g}, ${b})`;
}

const doughnutCenterTextPlugin = {
  id: "doughnutCenterText",
  afterDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.text) return;
    const meta = chart.getDatasetMeta(0);
    const firstArc = meta?.data?.[0];
    if (!firstArc) return;

    const { ctx } = chart;
    const x = firstArc.x;
    const y = firstArc.y;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = pluginOptions.color || "#111";
    ctx.font = pluginOptions.font || "600 22px Inter, system-ui, sans-serif";
    ctx.fillText(String(pluginOptions.text), x, y);
    ctx.restore();
  }
};

const doughnutTargetMarkerPlugin = {
  id: "doughnutTargetMarker",
  afterDraw(chart, _args, pluginOptions) {
    const meta = chart.getDatasetMeta(0);
    const firstArc = meta?.data?.[0];
    const targetPct = Number(pluginOptions?.targetPct);
    if (!firstArc || !Number.isFinite(targetPct)) return;

    const clampedTarget = clamp(targetPct, 0, 100);
    const totalCircumference = (meta?.data || []).reduce(
      (sum, arc) => sum + Number(arc?.circumference || 0),
      0
    );
    if (!(totalCircumference > 0)) return;

    const angle = firstArc.startAngle + (totalCircumference * (clampedTarget / 100));
    const strokeColor = pluginOptions?.color || "#111";
    const lineWidth = Number(pluginOptions?.lineWidth) || 4;
    const innerRadius = Math.max(0, (firstArc.innerRadius || 0) - 2);
    const outerRadius = (firstArc.outerRadius || 0) + 2;
    const x = firstArc.x;
    const y = firstArc.y;

    const startX = x + Math.cos(angle) * innerRadius;
    const startY = y + Math.sin(angle) * innerRadius;
    const endX = x + Math.cos(angle) * outerRadius;
    const endY = y + Math.sin(angle) * outerRadius;

    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }
};

const zusThresholdPlugin = {
  id: "zusThreshold",
  beforeDatasetsDraw(chart, _args, pluginOptions) {
    const limit = Number(pluginOptions?.limit);
    const chartArea = chart?.chartArea;
    const yScale = chart?.scales?.y;
    if (!Number.isFinite(limit) || !chartArea || !yScale) return;

    const thresholdY = yScale.getPixelForValue(limit);
    if (!Number.isFinite(thresholdY) || thresholdY <= chartArea.top) return;

    const fillBottom = Math.min(thresholdY, chartArea.bottom);
    if (fillBottom <= chartArea.top) return;

    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = pluginOptions?.backgroundColor || "rgba(255, 77, 79, 0.10)";
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, fillBottom - chartArea.top);
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const limit = Number(pluginOptions?.limit);
    const chartArea = chart?.chartArea;
    const yScale = chart?.scales?.y;
    if (!Number.isFinite(limit) || !chartArea || !yScale) return;

    const thresholdY = yScale.getPixelForValue(limit);
    if (!Number.isFinite(thresholdY) || thresholdY < chartArea.top || thresholdY > chartArea.bottom) return;

    const { ctx } = chart;
    ctx.save();
    ctx.strokeStyle = pluginOptions?.lineColor || "#d7263d";
    ctx.lineWidth = pluginOptions?.lineWidth || 2;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, thresholdY);
    ctx.lineTo(chartArea.right, thresholdY);
    ctx.stroke();
    ctx.restore();
  }
};

Chart.register(doughnutCenterTextPlugin, doughnutTargetMarkerPlugin, zusThresholdPlugin);

function getZusLimit(metric, fallbackLimit = 2) {
  const limit = Number(metric?.limit);
  return Number.isFinite(limit) ? limit : fallbackLimit;
}

function getZusScaleMax(metric, { fallbackLimit = 2, minMax = 3 } = {}) {
  const limit = getZusLimit(metric, fallbackLimit);
  const series = Array.isArray(metric?.series) ? metric.series : [];
  const maxValue = series.reduce((outerMax, item) => {
    const seriesMax = (Array.isArray(item?.data) ? item.data : []).reduce(
      (innerMax, value) => Math.max(innerMax, Number(value ?? 0)),
      0
    );
    return Math.max(outerMax, seriesMax);
  }, 0);
  return Math.max(minMax, Math.ceil(Math.max(limit + 0.6, maxValue * 1.15, 1)));
}

function renderZusChart(canvasSelector, storeKey, metric, { defaultColor = "#333", fallbackLimit = 2, minMax = 3 } = {}) {
  const ctx = qs(canvasSelector)?.getContext("2d");
  if (!ctx) return;

  const labels = Array.isArray(metric?.labels) ? metric.labels : [];
  const series = Array.isArray(metric?.series) ? metric.series : [];
  const limit = getZusLimit(metric, fallbackLimit);
  const yMax = getZusScaleMax(metric, { fallbackLimit, minMax });
  const datasets = series.map((item) => ({
    type: "line",
    label: item?.name ?? "",
    data: Array.isArray(item?.data) ? item.data : [],
    borderColor: item?.color ?? defaultColor,
    backgroundColor: item?.color ?? defaultColor,
    pointRadius: 2,
    pointHoverRadius: 4,
    borderWidth: 2,
    tension: 0.35
  }));

  const chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } },
        zusThreshold: {
          limit,
          backgroundColor: "rgba(255, 77, 79, 0.12)",
          lineColor: "#d7263d",
          lineWidth: 2
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#111" } },
        y: {
          beginAtZero: true,
          max: yMax,
          grid: { color: "rgba(0,0,0,.08)" },
          ticks: { color: "#111" }
        }
      }
    }
  });

  store.charts.set(storeKey, chart);
}

function sampleData() {
  const zusLabels = [
    "ZUs","01/09","02/09","03/09","04/09","05/09","06/09","07/09","08/09","09/09",
    "10/09","11/09","12/09","13/09","14/09","15/09","16/09","17/09","18/09","19/09",
    "20/09","21/09","22/09","23/09","24/09","25/09","26/09","27/09","28/09","29/09",
    "30/09","01/10"
  ];

  return {
    updatedAt: new Date().toISOString(),
    note: "Visualização com valores fixos (branch view).",
    general: {
      accidents: [
        { label: "FAC", value: 0, lastRecord: "2026-09-01" },
        { label: "LSI", value: 0, lastRecord: "2026-09-01" },
        { label: "UTL", value: 0, lastRecord: "2026-09-01" },
        { label: "SPCI", value: 0, lastRecord: "2026-09-01" }
      ],
      customerSatisfaction: {
        labels: ["jan./26","fev./26","mar./26","abr./26","mai./26","jun./26","jul./26","ago./26","set./26"],
        bars: [86,86,72,84,95,89,98,93,100],
        line: [86,86,72,84,95,89,98,93,100]
      },
      sevenS: {
        labels: ["jan./26","fev./26","mar./26","abr./26","mai./26","jun./26","jul./26","ago./26","set./26"],
        series: [
          { name: "Stihl", data: [85,94,90,92,91,96,92,88,100], color: "#ff4d00" },
          { name: "Manserv", data: [85,74,91,93,93,91,96,92,90], color: "#2e2e2e" }
        ]
      }
    },
    facilities: {
      tmaDays: 5.3,
      productivityPct: 77,
      reworkPct: 0.2,
      servicoExterno: 93.6,
      preventivas: 100,
      atendimentoZUS: {
        labels: zusLabels,
        series: [
          { name: "Civil", color: "#2f80ed", data: [
            0.9, 0.9, 0.8, 0.5, 0.4, 0.0, -0.1, -0.1, 0.8, 0.6,
            1.0, 0.8, -0.1, -0.1, 0.0, 1.0, 1.4, 1.6, 0.9, 0.0,
           -0.1, -0.1, 0.6, 0.8, 0.4, 0.3, -0.1, 0.0, 0.6, 0.2,
            0.1, 0.0
          ]},
          { name: "Elétrica", color: "#f2994a", data: [
            0.2, 0.2, 0.5, 0.8, 0.9, 0.1, -0.1, 0.0, 0.9, 0.7,
            0.6, 1.1, 0.2, -0.1, 0.0, 0.5, 0.5, 1.2, 0.7, 0.4,
            0.2, 0.1, 0.6, 0.6, 0.3, 0.2, 0.0, 0.1, 0.7, 1.1,
            0.1, 0.0
          ]},
          { name: "Refrigeração", color: "#27ae60", data: [
            0.0, 0.0, 0.4, 0.1, 0.7, 0.0, 0.0, 0.0, -0.1, 1.4,
            0.8, 1.2, 0.9, 0.1, 0.0, 0.1, 1.3, 1.1, 1.1, 0.9,
           -0.1, 0.0, 0.6, 0.9, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0,
            1.2, 0.0
          ]}
        ],
        limit: 2.0
      },
      prioridadeAlta: {
        labels: ["Civil", "Elétrica", "Refrigeração", "Pintura"],
        values: [0, 0, 0, 0],
        colors: ["#eb5757", "#eb5757", "#2f80ed", "#27ae60"]
      },
      portasRapidasPendentes: {
        labels: ["Portas Rápidas", "Alpinistas"],
        values: [0, 0],
        colors: ["#eb5757", "#eb5757"]
      },
      avaliacoes: {
        labels: ["Civil", "Elétrica", "Refrigeração"],
        values: [28, 65, 7],
        colors: ["#eb5757", "#2f80ed", "#27ae60"]
      },
      produtividadePorColaborador: {
        items: [
          { name: "Andrey Hipolito", value: 7.8, team: "Civil" },
          { name: "Alexandre Magalhães", value: 7.5, team: "Civil" },
          { name: "Vanderlei Santos", value: 7.2, team: "Civil" },
          { name: "Luan Neves", value: 8.0, team: "Civil" },
          { name: "Rafael Pereira", value: 6.8, team: "Civil" },
          { name: "Rodrigo Soares", value: 7.0, team: "Civil" },
          { name: "Adelar Fernandes", value: 7.9, team: "Elétrica" },
          { name: "Izaquiel Bitelo", value: 6.6, team: "Elétrica" },
          { name: "Cleoton Lima", value: 7.4, team: "Elétrica" },
          { name: "Anderson Padilha", value: 7.7, team: "Elétrica" },
          { name: "Raffael da Rosa", value: 7.1, team: "Elétrica" },
          { name: "Valdir dos Santos", value: 8.1, team: "Refrigeração" },
          { name: "Walmorcy Neto", value: 7.3, team: "Refrigeração" },
          { name: "Henrique Pisaroglo", value: 6.9, team: "Refrigeração" },
          { name: "Eder Evaldt", value: 7.6, team: "Refrigeração" },
          { name: "Alejandro Brito", value: 7.2, team: "Refrigeração" },
          { name: "Arthur Cadore", value: 6.7, team: "Refrigeração" },
          { name: "Mick Santos", value: 8.0, team: "Refrigeração" },
          { name: "Lucas Schmitzhaus", value: 7.7, team: "Pintura" },
          { name: "Peterson da Costa", value: 6.8, team: "Pintura" }
        ],
        color: "#2f66ff"
      }
    },
    utilidades: {
      tmaDays: 22.1,
      productivityPct: 62,
      avaliacoes: 7,
      reworkPct: 0.0,
      preventivas: 83.1,
      atendimentoZUS: {
        labels: zusLabels,
        series: [
          { name: "Utilidades", color: "#2f80ed", data: [
            0.0, 0.0, 0.0, -0.1, 0.0, -0.3, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.2, 0.1, 0.0, 0.0, 0.2, 0.1, 0.0,
            0.4, 0.0
          ]}
        ],
        limit: 2
      },
      produtividadePorColaborador: {
        items: [
          { name: "Fabio Dutra", value: 7.9, team: "Utilidades" },
          { name: "Vitor da Silva", value: 7.2, team: "Utilidades" },
          { name: "Renato Leske", value: 8.0, team: "Utilidades" },
          { name: "Wendel Santana", value: 6.7, team: "Utilidades" },
          { name: "Rodrigo Finger", value: 7.5, team: "Utilidades" }
        ],
        color: "#2f66ff"
      }
    },
    spci: {
      tmaDays: 4.2,
      productivityPct: 78,
      avaliacoes: 5,
      reworkPct: 0.0,
      preventivas: 100,
      atendimentoZUS: {
        labels: zusLabels,
        series: [
          { name: "SPCI", color: "#2e2e2e", data: [
            0, 1.2, 1.3, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.9,
            0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.6, 0.1, 0.0, 0.0,
            0.0, 0.0, 1.2, 1.3, 0.5, 0.3, 0.0, 0.0, 0.0, 0.0,
            0.3, 0.1
          ]}
        ],
        limit: 2
      },
      produtividadePorColaborador: {
        items: [
          { name: "Rodrigo Ascal", value: 8.1, team: "SPCI", os: "56403" },
          { name: "Gabriel Bender", value: 7.9, team: "SPCI", os: "58653" },
          { name: "Roberto Prestes", value: 7.6, team: "SPCI", os: "33967" },
          { name: "Igor Martins", value: 7.2, team: "SPCI", os: "58871" },
          { name: "Luis Carlos", value: 6.6, team: "SPCI", os: "64855" }
        ],
        osFilters: ["56403", "58653", "33967", "58871", "64855"],
        color: "#2f66ff"
      }
    },
    lsi: {
      atendimentoZUS: {
        labels: zusLabels,
        series: [
          { name: "Limpeza Conv", color: "#2f80ed", data: [
            0.1, 0.6, 1.8, 0.1, 0.0, 0.0, 0.0, 0.0, 1.0, 0.7,
            0.0, 0.8, 0.0, 0.0, 0.5, 0.0, 1.3, 0.0, 0.8, 0.0,
            0.0, 0.0, 1.3, 0.7, 0.6, 1.1, 0.3, 0.0, 0.0, 0.9,
            0.1, 0.0
          ]},
          { name: "Limpeza Técnica", color: "#f2994a", data: new Array(zusLabels.length).fill(0) },
          { name: "Jardinagem", color: "#27ae60", data: new Array(zusLabels.length).fill(0) }
        ],
        limit: 2
      },
      cronogramas: [
        { label: "Limpeza de Salas", result: 97.2, target: 90 },
        { label: "Limpeza de Banheiros", result: 99.4, target: 100 },
        { label: "Recolhimento Resíduos", result: 97.8, target: 100 },
        { label: "Limpeza de Piso", result: 100, target: 100 },
        { label: "Limpeza Técnica", result: 93.9, target: 90 },
        { label: "Jardinagem", result: 93.7, target: 90 }
      ],
      eficacia: [
        { label: "Jardinagem", evaluations: 68, result: 95.1 },
        { label: "Limpeza Técnica", evaluations: 74, result: 85.1 },
        { label: "Limpeza Convencional", evaluations: 68, result: 94.0 },
        { label: "Limpeza de Piso", evaluations: 75, result: 89.3 }
      ]
    }
  };
}

const store = {
  data: null,
  lastError: "",
  charts: new Map(),
  loading: false,
  lastFetchAt: null
};

function destroyCharts() {
  for (const chart of store.charts.values()) {
    try { chart.destroy(); } catch {}
  }
  store.charts.clear();
}

function setLastUpdatedText(text) {
  const node = qs("#lastUpdated");
  if (node) node.textContent = text || "";
}

function setDashboardLoading(loading) {
  const refreshBtn = qs("#refreshBtn");
  const viewHost = qs("#viewHost");
  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.classList.toggle("is-loading", loading);
    refreshBtn.setAttribute("aria-busy", loading ? "true" : "false");
  }
  if (viewHost) {
    viewHost.classList.toggle("is-loading", loading);
    viewHost.setAttribute("aria-busy", loading ? "true" : "false");
  }
}

function setNavActive(route) {
  for (const a of qsa(".nav-item")) {
    a.classList.toggle("is-active", a.getAttribute("data-route") === route);
  }
}

function toggleSidebar(show) {
  const sidebar = qs(".sidebar");
  const shell = qs(".shell");
  if (sidebar && shell) {
    sidebar.style.display = show ? "flex" : "none";
    shell.style.gridTemplateColumns = show ? "260px 1fr" : "1fr";
  }
}

let slideshowInterval = null;
let slideshowResizeHandler = null;
let currentSlideshowIndex = 0;
function clearSlideshowInterval() {
  if (!slideshowInterval) return;
  clearInterval(slideshowInterval);
  slideshowInterval = null;
}

function clearSlideshowResizeHandler() {
  if (!slideshowResizeHandler) return;
  window.removeEventListener("resize", slideshowResizeHandler);
  slideshowResizeHandler = null;
}

function resizeVisibleCharts() {
  for (const chart of store.charts.values()) {
    try { chart.resize(); } catch {}
  }
}

function syncSlideshowViewportMetrics(slideHost) {
  if (!slideHost) return;
  const rect = slideHost.getBoundingClientRect();
  const safeHeight = Math.max(320, Math.round(rect.height - 8));
  slideHost.style.setProperty("--tv-slide-height", `${safeHeight}px`);
  resizeVisibleCharts();
}

function setTvMode(active) {
  toggleSidebar(!active);
  const main = qs(".main");
  const viewHost = qs("#viewHost");
  if (main) {
    main.classList.toggle("tv-mode", !!active);
    if (!active) main.scrollTop = 0;
  }
  if (viewHost) {
    viewHost.classList.toggle("tv-mode", !!active);
  }
}

function applyTvSlideLayout(host, ...classes) {
  host.classList.add("tv-slide-layout", ...classes.filter(Boolean));
}

function getSlideshowSlides(data) {
  return [
    {
      key: "geral",
      title: "Geral",
      render: (host) => mountGeneral(host, data, { tvMode: true })
    },
    {
      key: "facilities-overview",
      title: "Facilities",
      render: (host) => mountFacilities(host, data, { mode: "overview", tvMode: true })
    },
    {
      key: "facilities-productivity",
      title: "Facilities",
      render: (host) => mountFacilities(host, data, { mode: "productivity", tvMode: true })
    },
    {
      key: "lsi-overview",
      title: "LSI",
      render: (host) => mountLSI(host, data, { mode: "overview", tvMode: true })
    },
    {
      key: "lsi-eficacia",
      title: "LSI",
      render: (host) => mountLSI(host, data, { mode: "eficacia", tvMode: true })
    },
    {
      key: "utilidades",
      title: "Utilidades",
      render: (host) => mountUtilidades(host, data, { tvMode: true })
    },
    {
      key: "spci",
      title: "SPCI",
      render: (host) => mountSPCI(host, data, { tvMode: true })
    }
  ];
}

function mountSlideshow(host, data) {
  setTvMode(true);
  clearSlideshowInterval();
  clearSlideshowResizeHandler();

  const slides = getSlideshowSlides(data);
  const titleNode = el("h2", { class: "slideshow-title", text: slides[0]?.title ?? "Dashboard" });
  const backBtn = el("button", {
    class: "slideshow-back-btn",
    type: "button",
    text: "← Voltar",
    onclick: () => {
      clearSlideshowInterval();
      setTvMode(false);
      location.hash = "#/geral";
    }
  });

  const slideshowContainer = el("div", { class: "slideshow-container" });
  const slideshowHeader = el("div", { class: "slideshow-header" }, [
    el("div", { class: "slideshow-header-main" }, [backBtn, titleNode])
  ]);
  const slideHost = el("div", { class: "slideshow-slide", id: "slideshow-slide-host" });
  const indicatorContainer = el("div", { class: "slideshow-indicators" });

  const renderCurrentSlide = () => {
    destroyCharts();
    slideHost.innerHTML = "";
    slideHost.className = "slideshow-slide";
    const slide = slides[currentSlideshowIndex] || slides[0];
    titleNode.textContent = slide?.title ?? "Dashboard";

    qsa(".slideshow-indicator", indicatorContainer).forEach((ind, idx) => {
      ind.classList.toggle("is-active", idx === currentSlideshowIndex);
    });

    if (slide && typeof slide.render === "function") slide.render(slideHost);
    slideHost.scrollTop = 0;
    requestAnimationFrame(() => syncSlideshowViewportMetrics(slideHost));
  };

  slides.forEach((slide, index) => {
    const indicator = el("button", {
      class: "slideshow-indicator",
      type: "button",
      text: index + 1,
      title: slide.title,
      onclick: () => {
        currentSlideshowIndex = index;
        renderCurrentSlide();
      }
    });
    indicatorContainer.append(indicator);
  });

  slideshowContainer.append(slideshowHeader, slideHost, indicatorContainer);
  host.append(slideshowContainer);

  slideshowResizeHandler = () => syncSlideshowViewportMetrics(slideHost);
  window.addEventListener("resize", slideshowResizeHandler);

  renderCurrentSlide();
  slideshowInterval = setInterval(() => {
    currentSlideshowIndex = (currentSlideshowIndex + 1) % slides.length;
    renderCurrentSlide();
  }, 20000);
}

const FETCH_TIMEOUT_MS = 60000;
const FETCH_MAX_RETRIES = 3;
const FETCH_RETRY_BASE_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(fn, { maxRetries = FETCH_MAX_RETRIES, baseDelay = FETCH_RETRY_BASE_DELAY_MS, onRetry } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries) break;
      const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      if (typeof onRetry === "function") {
        try { onRetry(err, attempt + 1, maxRetries, delay); } catch {}
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

function fetchJsonp(urlString, { force = false, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const cbParam = String(cfg.jsonpCallbackParam || "callback");
    const cbName = `__jsonp_cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const url = new URL(urlString);
    url.searchParams.set(cbParam, cbName);
    if (force) url.searchParams.set("force", String(Date.now()));

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { delete window[cbName]; } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    window[cbName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    const script = document.createElement("script");
    script.src = url.toString();
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("Falha no JSONP"));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout no JSONP"));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  const opts = signal ? { ...options, signal } : { ...options };

  let timeoutId = null;
  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch {}
      }
      reject(new Error("Timeout na requisição"));
    }, timeoutMs);
  });

  return Promise.race([
    fetch(url, opts).finally(cleanup),
    timeoutPromise
  ]);
}

async function fetchDashboardData({ force = false } = {}) {
  if (store.loading) return store.data;
  store.loading = true;
  setDashboardLoading(true);
  try {
    const useMock = Boolean(cfg.dashboardMockOnly);
    const endpoint = String(cfg.dataEndpoint || "").trim();
    if (useMock || !endpoint) {
      store.data = sampleData();
      store.lastError = "";
      store.lastFetchAt = new Date();
      localStorage.setItem("dashboard:lastData", JSON.stringify(store.data));
      return store.data;
    }
    const transport = String(cfg.transport || "auto").toLowerCase();
    const baseUrl = new URL(endpoint);
    if (force) baseUrl.searchParams.set("force", String(Date.now()));

    let retryInfo = "";
    const onRetry = (_err, attempt, max, delay) => {
      retryInfo = ` (tentativa ${attempt}/${max} em ${(delay/1000).toFixed(1)}s)`;
      setLastUpdatedText(`Carregando${retryInfo}...`);
    };

    const payload = await withRetries(async () => {
      const url = new URL(baseUrl.toString());
      let result;
      if (transport === "jsonp") {
        result = await fetchJsonp(url.toString(), { force });
      } else if (transport === "fetch") {
        const res = await fetchWithTimeout(url.toString(), { method: "GET", mode: "cors", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        result = await res.json();
      } else {
        try {
          const res = await fetchWithTimeout(url.toString(), { method: "GET", mode: "cors", cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          result = await res.json();
        } catch (fetchErr) {
          result = await fetchJsonp(url.toString(), { force });
        }
      }
      if (!result || typeof result !== "object") throw new Error("Resposta inválida");
      return result;
    }, { onRetry });

    store.data = payload;
    store.lastError = "";
    store.lastFetchAt = new Date();
    localStorage.setItem("dashboard:lastData", JSON.stringify(store.data));
    return store.data;
  } catch (e) {
    store.lastError = e?.message ? String(e.message) : "Falha ao buscar dados";
    const cached = localStorage.getItem("dashboard:lastData");
    if (cached) {
      try { store.data = JSON.parse(cached); } catch {}
    }
    if (!store.data) store.data = sampleData();
    return store.data;
  } finally {
    store.loading = false;
    setDashboardLoading(false);
  }
}

function updateStatusLine() {
  const err = store.lastError ? store.lastError : "";
  setLastUpdatedText(err.trim());
}

function mountGeneral(host, data, options = {}) {
  const { tvMode = false } = options;
  if (tvMode) applyTvSlideLayout(host, "tv-slide-general");
  const title = el("div", { class: "section-title", text: "Acidentes" });
  const top = el("div", { class: `general-accidents-grid${tvMode ? " is-tv" : ""}` });

  const accidents = Array.isArray(data?.general?.accidents) ? data.general.accidents : [];
  for (const item of accidents) {
    const lastRecord = item?.lastRecord ? `último registro: ${formatDatePtBR(item.lastRecord)}` : "sem data informada";
    const card = el("div", { class: "card kpi-card" }, [
      el("div", { class: "kpi-top" }, [el("div", { class: "kpi-badge", text: item?.label ?? "" })]),
      el("div", { class: "kpi-value", text: formatNumberPtBR(item?.value ?? 0) }),
      el("div", { class: "kpi-foot", text: lastRecord })
    ]);
    top.append(card);
  }

  const bottom = el("div", { class: "general-charts-stack" });

  const csCard = el("div", { class: "card chart-panel" }, [
    el("div", { class: "card-title", text: "Histórico Satisfação Cliente" }),
    el("div", { class: "chart-wrap general-chart-wrap" }, [el("canvas", { id: "chartCustomerSatisfaction" })])
  ]);
  const s7Card = el("div", { class: "card chart-panel" }, [
    el("div", { class: "card-title", text: "Histórico 7S" }),
    el("div", { class: "chart-wrap general-chart-wrap general-chart-wrap-compact" }, [el("canvas", { id: "chartSevenS" })])
  ]);

  bottom.append(csCard, s7Card);
  host.append(title, top, bottom);

  const cs = data?.general?.customerSatisfaction ?? {};
  const csLabels = Array.isArray(cs.labels) ? cs.labels : [];
  const csBars = Array.isArray(cs.bars) ? cs.bars : [];
  const csLine = Array.isArray(cs.line) ? cs.line : csBars;

  const ctx1 = qs("#chartCustomerSatisfaction")?.getContext("2d");
  if (ctx1) {
    const chart = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: csLabels,
        datasets: [
          { type: "bar", label: "Satisfação", data: csBars, backgroundColor: "#ff4d00" },
          { type: "line", label: "", data: csLine, borderColor: "#666", pointBackgroundColor: "#666", tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartCustomerSatisfaction", chart);
  }

  const s7 = data?.general?.sevenS ?? {};
  const s7Labels = Array.isArray(s7.labels) ? s7.labels : [];
  const s7Series = Array.isArray(s7.series) ? s7.series : [];

  const ctx2 = qs("#chartSevenS")?.getContext("2d");
  if (ctx2) {
    const chart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: s7Labels,
        datasets: s7Series.slice(0, 2).map((s) => ({
          label: s?.name ?? "",
          data: Array.isArray(s?.data) ? s.data : [],
          backgroundColor: s?.color ?? "#333"
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartSevenS", chart);
  }
}

function mountFacilities(host, data, options = {}) {
  const { mode = "full", tvMode = false } = options;
  const showOverview = mode !== "productivity";
  const showProductivity = mode !== "overview";
  if (tvMode) applyTvSlideLayout(host, mode === "productivity" ? "tv-slide-facilities-productivity" : "tv-slide-facilities-overview");
  const f = data?.facilities ?? {};
  const teamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0"
  };
  const kpis = el("div", { class: "small-kpis" });
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  const tma = Number(f?.tmaDays ?? 0);
  const prod = Number(f?.productivityPct ?? 0);
  const rework = Number(f?.reworkPct ?? 0);
  const ext = Number(f?.servicoExterno ?? 0);
  const prev = Number(f?.preventivas ?? 0);

  kpis.append(
    renderKpi("TMA em dias", `${formatNumberPtBR(tma, { digits: 1 })} dias`, {
      target: 10,
      targetLabel: "≤ 10 dias",
      isOnTarget: evaluateKpi(tma, { target: 10, direction: "lte" })
    }),
    renderKpi("Produtividade", `${formatNumberPtBR(prod)}%`, {
      target: 70,
      targetLabel: "≥ 70%",
      isOnTarget: evaluateKpi(prod, { target: 70, direction: "gte" })
    }),
    renderKpi("Retrabalho", `${formatNumberPtBR(rework, { digits: 1 })}%`, {
      target: 1,
      targetLabel: "< 1%",
      isOnTarget: evaluateKpi(rework, { target: 1, direction: "lt" })
    }),
    renderKpi("Serviços Externos", `${formatMetricValue(ext)}%`, {
      target: 90,
      targetLabel: "≥ 90%",
      isOnTarget: evaluateKpi(ext, { target: 90, direction: "gte" })
    }),
    renderKpi("Preventivas", `${formatMetricValue(prev)}%`, {
      target: 100,
      targetLabel: "= 100%",
      isOnTarget: evaluateKpi(prev, { target: 100, direction: "gte" })
    })
  );

  const layout = el("div", { class: "stack-lg" });
  let prodChartWrap = null;
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  if (showOverview) {
    const zusCard = el("div", { class: "card chart-panel chart-card-full" }, [
      el("div", { class: "card-title", text: "Atendimento ZUS" }),
      el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartAtendimentoZUS" })])
    ]);
    const metricsRow = el("div", { class: "facility-priority-row" });
    const priorityCard = el("div", { class: "card chart-panel" }, [
      el("div", { class: "card-title", text: "Prioridade alta" }),
      el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartPrioridadeAlta" })])
    ]);
    const portasRapidasCard = el("div", { class: "card chart-panel" }, [
      el("div", { class: "card-title", text: "Acompanhamentos" }),
      el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartPortasRapidasPendentes" })])
    ]);
    const evaluationsCard = el("div", { class: "card chart-panel" }, [
      el("div", { class: "card-title", text: "Avaliações" }),
      el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartAvaliacoes" })])
    ]);
    metricsRow.append(priorityCard, portasRapidasCard, evaluationsCard);
    layout.append(zusCard, metricsRow);
  }

  prodChartWrap = el("div", { class: `chart-wrap wide productivity-chart-wrap${tvMode ? " is-tv" : ""}` }, [el("canvas", { id: "chartProdColab" })]);
  const prodColab = el("div", { class: "card chart-panel productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Apontamento Dia Anterior" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);

  if (showProductivity) {
    if (mode !== "productivity") {
      const bottom = el("div", { class: "facilities-bottom" });
      bottom.append(prodColab);
      layout.append(bottom);
    }
  }

  if (showOverview) host.append(kpis, layout);
  if (mode === "productivity") host.append(prodColab);

  const az = f?.atendimentoZUS ?? {};
  if (showOverview) renderZusChart("#chartAtendimentoZUS", "chartAtendimentoZUS", az, { defaultColor: "#333", fallbackLimit: 2, minMax: 3 });

  const pa = f?.prioridadeAlta ?? {};
  const paLabels = Array.isArray(pa.labels) ? pa.labels : [];
  const paValues = Array.isArray(pa.values) ? pa.values : [];
  const paColors = Array.isArray(pa.colors) ? pa.colors : [];

  const ctx2 = showOverview ? qs("#chartPrioridadeAlta")?.getContext("2d") : null;
  if (ctx2) {
    const chart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: paLabels,
        datasets: [
          {
            label: "",
            data: paValues,
            backgroundColor: paColors.length ? paColors : "#ff4d00"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartPrioridadeAlta", chart);
  }

  const prp = f?.portasRapidasPendentes ?? {};
  const prpLabels = Array.isArray(prp.labels) ? prp.labels : [];
  const prpValues = Array.isArray(prp.values) ? prp.values : [];
  const prpColors = Array.isArray(prp.colors) ? prp.colors : [];

  const ctxPortasRapidas = showOverview ? qs("#chartPortasRapidasPendentes")?.getContext("2d") : null;
  if (ctxPortasRapidas) {
    const chart = new Chart(ctxPortasRapidas, {
      type: "bar",
      data: {
        labels: prpLabels,
        datasets: [
          {
            label: "",
            data: prpValues,
            backgroundColor: prpColors.length ? prpColors : "#ff4d00"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartPortasRapidasPendentes", chart);
  }

  const av = f?.avaliacoes ?? {};
  const avLabels = Array.isArray(av.labels) ? av.labels : [];
  const avValues = Array.isArray(av.values) ? av.values : [];
  const avColors = Array.isArray(av.colors) ? av.colors : [];

  const ctx3 = showOverview ? qs("#chartAvaliacoes")?.getContext("2d") : null;
  if (ctx3) {
    const chart = new Chart(ctx3, {
      type: "pie",
      data: {
        labels: avLabels,
        datasets: [{ data: avValues, backgroundColor: avColors.length ? avColors : ["#ff4d00", "#2f80ed", "#27ae60", "#eb5757"] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "left", labels: { boxWidth: 12, boxHeight: 12 } } }
      }
    });
    store.charts.set("chartAvaliacoes", chart);
  }

  const pc = f?.produtividadePorColaborador ?? {};
  const pcColor = pc?.color ?? "#2f66ff";
  const collaboratorItems = getCollaboratorItems(pc);
  const filterOptions = [
    { label: "Todas", value: "all" },
    { label: "Civil", value: "Civil" },
    { label: "Elétrica", value: "Elétrica" },
    { label: "Refrigeração", value: "Refrigeração" },
    { label: "Pintura", value: "Pintura" }
  ];
  let activeFilter = "all";

  const ctx4 = qs("#chartProdColab")?.getContext("2d");
  if (ctx4) {
    const chart = new Chart(ctx4, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: pcColor,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: tvMode ? 10 : 14,
          maxBarThickness: tvMode ? 12 : 18,
          categoryPercentage: tvMode ? 0.92 : 0.72,
          barPercentage: tvMode ? 0.9 : 0.82
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        layout: { padding: { right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${formatMetricValue(context.raw ?? 0)}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: "10%",
            grid: { color: "rgba(0,0,0,.08)" },
            ticks: { color: "#111" }
          },
          y: {
            grid: { display: false },
            ticks: { color: "#111", autoSkip: false, font: tvMode ? { size: 11 } : undefined }
          }
        }
      }
    });

    const renderTeam = (teamName) => {
      activeFilter = teamName;
      const filtered = collaboratorItems
        .filter((item) => activeFilter === "all" || item.team === activeFilter)
        .sort((a, b) => b.value - a.value);

      chart.data.labels = filtered.map((item) => item.name);
      chart.data.datasets[0].data = filtered.map((item) => item.value);
      chart.data.datasets[0].backgroundColor = filtered.map((item) => teamColors[item.team] ?? pcColor);
      if (!tvMode) {
        const chartHeight = Math.max(340, filtered.length * 30 + 110);
        prodChartWrap.style.height = `${chartHeight}px`;
      } else {
        prodChartWrap.style.height = "";
      }
      prodEmpty.hidden = filtered.length > 0;
      chart.update();

      for (const btn of qsa(".filter-chip", filterBar)) {
        btn.classList.toggle("is-active", btn.getAttribute("data-team") === activeFilter);
      }
    };

    for (const option of filterOptions) {
      filterBar.append(
        el("button", {
          class: `filter-chip${option.value === activeFilter ? " is-active" : ""}`,
          type: "button",
          "data-team": option.value,
          text: option.label,
          onclick: () => renderTeam(option.value)
        })
      );
    }

    renderTeam(activeFilter);
    store.charts.set("chartProdColab", chart);
  }
}

function mountUtilidades(host, data, options = {}) {
  const { tvMode = false } = options;
  if (tvMode) applyTvSlideLayout(host, "tv-slide-utilidades");
  const u = data?.utilidades ?? {};
  const baseTeamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0",
    Utilidades: "#2f80ed"
  };
  const fallbackPalette = ["#2f80ed", "#f2994a", "#27ae60", "#9b51e0", "#eb5757", "#56ccf2"];
  const collaboratorItems = getCollaboratorItems(u?.produtividadePorColaborador ?? {});
  const uniqueTeams = Array.from(new Set(collaboratorItems.map((item) => item.team).filter(Boolean)));
  const teamColors = { ...baseTeamColors };

  uniqueTeams.forEach((team, idx) => {
    if (!teamColors[team]) teamColors[team] = fallbackPalette[idx % fallbackPalette.length];
  });

  const kpis = el("div", { class: "small-kpis" });
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  const tma = Number(u?.tmaDays ?? 0);
  const prod = Number(u?.productivityPct ?? 0);
  const rework = Number(u?.reworkPct ?? 0);
  const prev = Number(u?.preventivas ?? 0);
  const aval = Number(u?.avaliacoes ?? 0);

  kpis.append(
    renderKpi("TMA em dias", `${formatNumberPtBR(tma, { digits: 1 })} dias`, {
      target: null,
      targetLabel: "—",
      isOnTarget: true
    }),
    renderKpi("Produtividade", `${formatNumberPtBR(prod)}%`, {
      target: null,
      targetLabel: "—",
      isOnTarget: true
    }),
    renderKpi("Avaliações", formatMetricValue(aval), {
      target: null,
      targetLabel: "—",
      isOnTarget: true
    }),
    renderKpi("Retrabalho", `${formatNumberPtBR(rework, { digits: 1 })}%`, {
      target: 1,
      targetLabel: "< 1%",
      isOnTarget: evaluateKpi(rework, { target: 1, direction: "lt" })
    }),
    renderKpi("Preventivas", `${formatMetricValue(prev)}%`, {
      target: 70,
      targetLabel: "≥ 70%",
      isOnTarget: evaluateKpi(prev, { target: 70, direction: "gte" })
    })
  );

  const layout = el("div", { class: "stack-lg" });
  const zusCard = el("div", { class: "card chart-panel chart-card-full" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartUtilidadesZUS" })])
  ]);

  const bottom = el("div", { class: "facilities-bottom" });
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  const prodChartWrap = el("div", { class: `chart-wrap wide productivity-chart-wrap${tvMode ? " is-tv" : ""}` }, [el("canvas", { id: "chartUtilidadesProdColab" })]);
  const prodColab = el("div", { class: "card chart-panel productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Apontamento Dia Anterior" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);
  bottom.append(prodColab);

  layout.append(zusCard, bottom);
  host.append(kpis, layout);

  const az = u?.atendimentoZUS ?? {};
  renderZusChart("#chartUtilidadesZUS", "chartUtilidadesZUS", az, { defaultColor: "#2f80ed", fallbackLimit: 2, minMax: 3 });

  const pc = u?.produtividadePorColaborador ?? {};
  const pcColor = pc?.color ?? "#2f66ff";
  const filterOptions = [{ label: "Todos", value: "all" }].concat(uniqueTeams.map((team) => ({ label: team, value: team })));
  let activeFilter = "all";

  filterBar.hidden = uniqueTeams.length < 2;

  const ctx2 = qs("#chartUtilidadesProdColab")?.getContext("2d");
  if (ctx2) {
    const chart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: pcColor,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: tvMode ? 10 : 14,
          maxBarThickness: tvMode ? 12 : 18,
          categoryPercentage: tvMode ? 0.92 : 0.72,
          barPercentage: tvMode ? 0.9 : 0.82
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        layout: { padding: { right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${formatMetricValue(context.raw ?? 0)}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: "10%",
            grid: { color: "rgba(0,0,0,.08)" },
            ticks: { color: "#111" }
          },
          y: {
            grid: { display: false },
            ticks: { color: "#111", autoSkip: false, font: tvMode ? { size: 11 } : undefined }
          }
        }
      }
    });

    const renderTeam = (teamName) => {
      activeFilter = teamName;
      const filtered = collaboratorItems
        .filter((item) => activeFilter === "all" || item.team === activeFilter)
        .sort((a, b) => b.value - a.value);

      chart.data.labels = filtered.map((item) => item.name);
      chart.data.datasets[0].data = filtered.map((item) => item.value);
      chart.data.datasets[0].backgroundColor = filtered.map((item) => teamColors[item.team] ?? pcColor);
      if (!tvMode) {
        const chartHeight = Math.max(340, filtered.length * 30 + 110);
        prodChartWrap.style.height = `${chartHeight}px`;
      } else {
        prodChartWrap.style.height = "";
      }
      prodEmpty.hidden = filtered.length > 0;
      chart.update();

      for (const btn of qsa(".filter-chip", filterBar)) {
        btn.classList.toggle("is-active", btn.getAttribute("data-team") === activeFilter);
      }
    };

    for (const option of filterOptions) {
      filterBar.append(
        el("button", {
          class: `filter-chip${option.value === activeFilter ? " is-active" : ""}`,
          type: "button",
          "data-team": option.value,
          text: option.label,
          onclick: () => renderTeam(option.value)
        })
      );
    }

    renderTeam(activeFilter);
    store.charts.set("chartUtilidadesProdColab", chart);
  }
}

function mountSPCI(host, data, options = {}) {
  const { tvMode = false } = options;
  if (tvMode) applyTvSlideLayout(host, "tv-slide-spci");
  const u = data?.spci ?? {};
  const baseTeamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0",
    SPCI: "#2e2e2e"
  };
  const fallbackPalette = ["#2e2e2e", "#2f80ed", "#f2994a", "#27ae60", "#9b51e0", "#eb5757", "#56ccf2"];
  const collaboratorItems = getCollaboratorItems(u?.produtividadePorColaborador ?? {}, { excludeSpci: false });
  const uniqueTeams = Array.from(new Set(collaboratorItems.map((item) => item.team).filter(Boolean)));
  const teamColors = { ...baseTeamColors };

  uniqueTeams.forEach((team, idx) => {
    if (!teamColors[team]) teamColors[team] = fallbackPalette[idx % fallbackPalette.length];
  });

  const kpis = el("div", { class: "small-kpis" });
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  const tma = Number(u?.tmaDays ?? 0);
  const prod = Number(u?.productivityPct ?? 0);
  const rework = Number(u?.reworkPct ?? 0);
  const prev = Number(u?.preventivas ?? 0);
  const aval = Number(u?.avaliacoes ?? 0);

  kpis.append(
    renderKpi("TMA em dias", `${formatNumberPtBR(tma, { digits: 1 })} dias`, {
      target: 10,
      targetLabel: "≤ 10 dias",
      isOnTarget: evaluateKpi(tma, { target: 10, direction: "lte" })
    }),
    renderKpi("Produtividade", `${formatNumberPtBR(prod)}%`, {
      target: 70,
      targetLabel: "≥ 70%",
      isOnTarget: evaluateKpi(prod, { target: 70, direction: "gte" })
    }),
    renderKpi("Avaliações", formatMetricValue(aval), {
      target: null,
      targetLabel: "—",
      isOnTarget: true
    }),
    renderKpi("Retrabalho", `${formatNumberPtBR(rework, { digits: 1 })}%`, {
      target: 1,
      targetLabel: "< 1%",
      isOnTarget: evaluateKpi(rework, { target: 1, direction: "lt" })
    }),
    renderKpi("Preventivas", `${formatMetricValue(prev)}%`, {
      target: 100,
      targetLabel: "= 100%",
      isOnTarget: evaluateKpi(prev, { target: 100, direction: "gte" })
    })
  );

  const layout = el("div", { class: "stack-lg" });
  const zusCard = el("div", { class: "card chart-panel chart-card-full" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartSpciZUS" })])
  ]);

  const bottom = el("div", { class: "facilities-bottom" });
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  const prodChartWrap = el("div", { class: `chart-wrap wide productivity-chart-wrap${tvMode ? " is-tv" : ""}` }, [el("canvas", { id: "chartSpciProdColab" })]);
  const prodColab = el("div", { class: "card chart-panel productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Apontamento Dia Anterior" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);
  bottom.append(prodColab);

  layout.append(zusCard, bottom);
  host.append(kpis, layout);

  const az = u?.atendimentoZUS ?? {};
  renderZusChart("#chartSpciZUS", "chartSpciZUS", az, { defaultColor: "#2e2e2e", fallbackLimit: 2, minMax: 3 });

  const pc = u?.produtividadePorColaborador ?? {};
  const pcColor = pc?.color ?? "#2f66ff";
  const hasOsFilters = Array.isArray(pc?.osFilters) && pc.osFilters.length > 0;
  const filterOptions = hasOsFilters
    ? [{ label: "Todos", value: "all" }].concat(pc.osFilters.map((os) => ({ label: String(os), value: String(os) })))
    : [{ label: "Todos", value: "all" }].concat(uniqueTeams.map((team) => ({ label: team, value: team })));
  let activeFilter = "all";

  filterBar.hidden = hasOsFilters ? false : uniqueTeams.length < 2;

  const ctx2 = qs("#chartSpciProdColab")?.getContext("2d");
  if (ctx2) {
    const chart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: pcColor,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: tvMode ? 10 : 14,
          maxBarThickness: tvMode ? 12 : 18,
          categoryPercentage: tvMode ? 0.92 : 0.72,
          barPercentage: tvMode ? 0.9 : 0.82
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        layout: { padding: { right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${formatMetricValue(context.raw ?? 0)}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grace: "10%",
            grid: { color: "rgba(0,0,0,.08)" },
            ticks: { color: "#111" }
          },
          y: {
            grid: { display: false },
            ticks: { color: "#111", autoSkip: false, font: tvMode ? { size: 11 } : undefined }
          }
        }
      }
    });

    const renderTeam = (teamName) => {
      activeFilter = teamName;
      const filtered = collaboratorItems
        .filter((item) => {
          if (activeFilter === "all") return true;
          if (hasOsFilters) return item.os === activeFilter;
          return item.team === activeFilter;
        })
        .sort((a, b) => b.value - a.value);

      chart.data.labels = filtered.map((item) => item.name);
      chart.data.datasets[0].data = filtered.map((item) => item.value);
      chart.data.datasets[0].backgroundColor = filtered.map((item) => teamColors[item.team] ?? pcColor);
      if (!tvMode) {
        const chartHeight = Math.max(340, filtered.length * 30 + 110);
        prodChartWrap.style.height = `${chartHeight}px`;
      } else {
        prodChartWrap.style.height = "";
      }
      prodEmpty.hidden = filtered.length > 0;
      chart.update();

      for (const btn of qsa(".filter-chip", filterBar)) {
        btn.classList.toggle("is-active", btn.getAttribute("data-team") === activeFilter);
      }
    };

    for (const option of filterOptions) {
      filterBar.append(
        el("button", {
          class: `filter-chip${option.value === activeFilter ? " is-active" : ""}`,
          type: "button",
          "data-team": option.value,
          text: option.label,
          onclick: () => renderTeam(option.value)
        })
      );
    }

    renderTeam(activeFilter);
    store.charts.set("chartSpciProdColab", chart);
  }
}

function mountLSI(host, data, options = {}) {
  const { mode = "full", tvMode = false } = options;
  const showOverview = mode !== "eficacia";
  const showEficacia = mode !== "overview";
  if (tvMode) applyTvSlideLayout(host, showOverview ? "tv-slide-lsi-overview" : "tv-slide-lsi-eficacia");
  const lsi = data?.lsi ?? {};
  const az = lsi?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];
  const cronogramas = Array.isArray(lsi?.cronogramas) ? lsi.cronogramas : [];
  const eficacia = Array.isArray(lsi?.eficacia) ? lsi.eficacia : [];

  if (!tvMode) host.append(el("div", { class: "section-title", text: "LSI" }));

  const zusCard = showOverview ? el("div", { class: "card chart-panel" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: `chart-wrap${tvMode ? " medium" : " tall"}` }, [el("canvas", { id: "chartLsiAtendimentoZUS" })])
  ]) : null;

  if (zusCard && (!azLabels.length || !azSeries.length)) {
    zusCard.append(el("div", { class: "placeholder compact", text: "Nenhum atendimento ZUS configurado." }));
  }

  const cronTitle = showOverview ? el("div", { class: "section-title section-subtitle", text: "Cronogramas" }) : null;
  const cronGrid = showOverview ? el("div", { class: "lsi-grid cron-grid" }) : null;

  for (const metric of showOverview ? cronogramas : []) {
    const label = String(metric?.label ?? "");
    const result = Number(metric?.result ?? 0);
    const level = getCronogramaLevel(label, result);
    const targets = Array.isArray(level.targets) && level.targets.length ? level.targets : [Number(metric?.target ?? 90)];
    const scale = 100;
    const fillPct = clamp(result, 0, 100);
    const highestTarget = targets[targets.length - 1];
    const isOnTarget = result >= highestTarget;
    const fillColorClass = ` is-${level.color || "green"}`;

    const targetMarkers = targets.map((tgt, idx) => {
      const leftPct = clamp(Number(tgt) / scale * 100, 0, 100);
      const levelClass = idx === 0 ? " is-level-1" : idx === 1 ? " is-level-2" : " is-level-3";
      return el("div", {
        class: `lsi-bullet-target${levelClass}`,
        style: `left:${leftPct}%`,
        title: `Meta ${idx + 1}: ${formatPercentValue(tgt)}`
      });
    });

    const thresholdItems = (getCronogramaConfig(label).thresholds || []).map((t) => {
      const dotColor =
        t.color === "red" ? "#d94b44" :
        t.color === "orange" ? "#ff7b2e" :
        t.color === "yellow" ? "#f5c231" :
        "#6ec140";
      return el("span", { class: "lsi-bullet-legend-item" }, [
        el("span", { class: "lsi-bullet-legend-dot", style: `background:${dotColor}` }),
        el("span", { text: t.label })
      ]);
    });

    const bulletChildren = [
      el("div", { class: `lsi-bullet-fill${fillColorClass}`, style: `width:${fillPct}%` }),
      ...targetMarkers
    ];

    const footerText = (() => {
      if (result >= highestTarget) return "Maior meta atingida";
      const reached = targets.filter((t) => result >= t).length;
      if (reached === 0) return `Abaixo da 1ª meta (${formatPercentValue(targets[0])})`;
      const next = targets[reached];
      return `${reached} de ${targets.length} meta(s) — próxima: ${formatPercentValue(next)}`;
    })();

    const cardChildren = [
      el("div", { class: "card-title", text: label }),
      el("div", { class: "lsi-metric-line" }, [
        el("span", { class: "lsi-metric-chip", text: `Resultado ${formatPercentValue(result)}` })
      ]),
      el("div", { class: "lsi-bullet-track" }, bulletChildren),
      el("div", { class: "lsi-bullet-legend" }, thresholdItems),
      el("div", { class: "lsi-bullet-footer", text: footerText })
    ];

    cronGrid.append(
      el("div", { class: `card lsi-progress-card${isOnTarget ? " is-on-target" : ""}` }, cardChildren)
    );
  }

  const effTitle = showEficacia ? el("div", { class: "section-title section-subtitle", text: "Eficácia" }) : null;
  const effGrid = showEficacia ? el("div", { class: "grid-2" }) : null;

  (showEficacia ? eficacia : []).forEach((metric, idx) => {
    effGrid.append(
      el("div", { class: "card chart-panel lsi-chart-card" }, [
        el("div", { class: "card-title", text: metric?.label ?? "" }),
        el("div", { class: "lsi-chart-caption", text: `${formatNumberPtBR(metric?.evaluations ?? 0)} avaliações` }),
        el("div", { class: "lsi-chart-value", text: formatPercentValue(metric?.result ?? 0) }),
        el("div", { class: "chart-wrap medium" }, [el("canvas", { id: `chartLsiEficacia${idx}` })])
      ])
    );
  });

  if (cronGrid && !cronogramas.length) cronGrid.append(el("div", { class: "card placeholder compact", text: "Nenhum cronograma configurado." }));
  if (effGrid && !eficacia.length) effGrid.append(el("div", { class: "card placeholder compact", text: "Nenhum indicador de eficácia configurado." }));

  if (zusCard) host.append(zusCard);
  if (cronTitle && cronGrid) host.append(cronTitle, cronGrid);
  if (effTitle && effGrid) host.append(effTitle, effGrid);

  if (showOverview && azLabels.length && azSeries.length) {
    renderZusChart("#chartLsiAtendimentoZUS", "chartLsiAtendimentoZUS", az, { defaultColor: "#333", fallbackLimit: 2, minMax: 3 });
  }

  const eficaciaColors = {
    Jardinagem: "#ff4fa3",
    "Limpeza Técnica": "#3a3a3a",
    "Limpeza Convencional": "#7b3ff2",
    "Limpeza de Piso": "#810B38",
    "Limpeza de Pisos": "#810B38"
  };

  (showEficacia ? eficacia : []).forEach((metric, idx) => {
    const ctx = qs(`#chartLsiEficacia${idx}`)?.getContext("2d");
    if (!ctx) return;

    const value = clamp(Number(metric?.result ?? 0), 0, 100);
    const chartId = `chartLsiEficacia${idx}`;
    const metricLabel = String(metric?.label ?? "");
    const accentColor = eficaciaColors[metricLabel] ?? "#2f80ed";
    const chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Resultado", "Restante"],
        datasets: [{ data: [value, Math.max(0, 100 - value)], backgroundColor: [accentColor, "#edf2f7"], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          doughnutCenterText: {
            text: formatPercentValue(value),
            color: accentColor
          },
          doughnutTargetMarker: {
            targetPct: 85,
            color: darkenColor(accentColor, 0.3),
            lineWidth: 4
          }
        }
      }
    });

    store.charts.set(chartId, chart);
  });
}

function mountPlaceholder(host, title) {
  host.append(el("div", { class: "section-title", text: title }), el("div", { class: "card placeholder", text: "Tela em construção" }));
}

function getRoute() {
  const h = String(location.hash || "");
  if (!h.startsWith("#/")) return "home";
  const route = h.slice(2).split("?")[0].replace(/\/+$/, "");
  return route || "geral";
}

function renderRoute(route) {
  const host = qs("#viewHost");
  if (!host) return;
  clearSlideshowInterval();
  destroyCharts();
  host.innerHTML = "";

  if (!store.data) store.data = sampleData();
  updateStatusLine();
  if (route !== "slideshow") setTvMode(false);

  if (route === "geral") mountGeneral(host, store.data);
  else if (route === "facilities") mountFacilities(host, store.data);
  else if (route === "lsi") mountLSI(host, store.data);
  else if (route === "utilidades") mountUtilidades(host, store.data);
  else if (route === "spci") mountSPCI(host, store.data);
  else if (route === "programacao") {
    location.replace("./prog_sem.html");
    return;
  }
  else if (route === "rotinas-limpeza") {
    location.replace("./rotinas_limpeza.html");
    return;
  }
  else if (route === "slideshow") {
    mountSlideshow(host, store.data);
    setNavActive(route);
    return;
  }
  else mountPlaceholder(host, "Dashboard");
  setNavActive(route);
}

function showShell() {
  const home = qs("#home");
  const shell = qs("#shell");
  if (!shell) return;
  if (home) home.hidden = true;
  shell.hidden = false;
  shell.classList.add("is-entering");
  requestAnimationFrame(() => {
    shell.classList.add("is-entered");
    shell.classList.remove("is-entering");
  });
}

function showHome() {
  const home = qs("#home");
  const shell = qs("#shell");
  if (shell) shell.hidden = true;
  if (home) {
    home.hidden = false;
    home.classList.add("is-active");
  }
}

async function goToDashboard(defaultRoute = "geral") {
  const home = qs("#home");
  const btn = qs("#startBtn");
  if (btn) btn.classList.add("is-leaving");
  if (home) home.classList.add("is-leaving");
  await new Promise((r) => setTimeout(r, 360));
  showShell();
  if (!location.hash.startsWith("#/")) location.hash = `#/${defaultRoute}`;
  await fetchDashboardData();
  updateStatusLine();
  renderRoute(getRoute());
}

async function init() {
  const startBtn = qs("#startBtn");
  const refreshBtn = qs("#refreshBtn");

  if (startBtn) startBtn.addEventListener("click", () => goToDashboard("geral"));
  if (refreshBtn) refreshBtn.addEventListener("click", async () => {
    await fetchDashboardData({ force: true });
    updateStatusLine();
    renderRoute(getRoute());
  });

  window.addEventListener("hashchange", async () => {
    const route = getRoute();
    if (route === "home") {
      showHome();
      return;
    }
    showShell();
    if (!store.data) await fetchDashboardData();
    updateStatusLine();
    renderRoute(route);
  });

  const initialRoute = getRoute();
  if (initialRoute === "home") {
    showHome();
    return;
  }
  showShell();
  await fetchDashboardData();
  updateStatusLine();
  renderRoute(initialRoute);

}

init();
