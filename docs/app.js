const cfg = window.__DASHBOARD_CONFIG__ ?? { dataEndpoint: "", pollMs: 300000 };

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

function getCollaboratorItems(metric) {
  if (Array.isArray(metric?.items)) {
    return metric.items
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        value: Number(item?.value ?? 0),
        team: normalizeTeamName(item?.team ?? "")
      }))
      .filter((item) => item.name && Number.isFinite(item.value) && item.team !== "SPCI");
  }

  const labels = Array.isArray(metric?.labels) ? metric.labels : [];
  const values = Array.isArray(metric?.values) ? metric.values : [];
  const teams = Array.isArray(metric?.teams) ? metric.teams : [];

  return labels
    .map((name, idx) => ({
      name: String(name ?? "").trim(),
      value: Number(values[idx] ?? 0),
      team: normalizeTeamName(teams[idx] ?? "")
    }))
    .filter((item) => item.name && Number.isFinite(item.value) && item.team !== "SPCI");
}

function compareToTargetText(result, target) {
  const res = Number(result ?? 0);
  const tgt = Number(target ?? 0);
  if (!(tgt > 0)) return "Meta não informada";
  if (res >= tgt) return "Meta atingida";
  return `${formatNumberPtBR((res / tgt) * 100, { digits: 0 })}% da meta`;
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

Chart.register(doughnutCenterTextPlugin);

function sampleData() {
  return {
    updatedAt: new Date().toISOString(),
    note: "Configure o endpoint para ver dados reais.",
    general: {
      accidents: [
        { label: "FAC", value: 0, lastRecord: "2022-12-31" },
        { label: "LSI", value: 0, lastRecord: "2022-12-31" },
        { label: "UTL", value: 0, lastRecord: "2022-12-31" }
      ],
      customerSatisfaction: {
        labels: ["jan", "fev", "mar"],
        bars: [87, 83, 72],
        line: [87, 83, 72]
      },
      sevenS: {
        labels: ["jan", "fev", "mar"],
        series: [
          { name: "Stihl", data: [87, 87, 87], color: "#ff4d00" },
          { name: "Manserv", data: [80, 80, 80], color: "#2e2e2e" }
        ]
      }
    },
    facilities: {
      tmaDays: 9.2,
      productivityPct: 30,
      reworkPct: 0.5,
      servicoExterno: 12,
      preventivas: 94,
      atendimentoZUS: {
        labels: ["00:00", "00:30", "01:00", "01:30", "02:00"],
        series: [
          { name: "Civil", color: "#2f80ed", data: [0.6, 1.2, 0.8, 1.4, 1.6] },
          { name: "Elétrica", color: "#f2994a", data: [0.4, 1.0, 0.9, 1.1, 1.3] },
          { name: "Refrigeração", color: "#27ae60", data: [0.3, 0.9, 0.6, 0.8, 1.1] }
        ],
        limit: 2.0
      },
      prioridadeAlta: {
        labels: ["Civil", "Elétrica", "Refrigeração", "Pintura"],
        values: [20, 28, 14, 2],
        colors: ["#2f80ed", "#f2994a", "#27ae60", "#ff4d00"]
      },
      avaliacoes: {
        labels: ["Alta", "Média", "Baixa", "Parada"],
        values: [42, 25, 18, 15],
        colors: ["#eb5757", "#f2c94c", "#2f80ed", "#27ae60"]
      },
      produtividadePorColaborador: {
        items: [
          { name: "ANDREY", value: 5.2, team: "Civil" },
          { name: "PIERRE", value: 8.0, team: "Elétrica" },
          { name: "RODRIGO", value: 1.0, team: "Pintura" },
          { name: "CRISTIANO", value: 8.5, team: "Refrigeração" },
          { name: "RAFAEL", value: 6.2, team: "Civil" },
          { name: "ALEXANDRE", value: 5.0, team: "Elétrica" }
        ],
        color: "#2f66ff"
      }
    },
    utilidades: {
      tmaDays: 7.6,
      productivityPct: 84,
      avaliacoes: 18,
      reworkPct: 1.1,
      preventivas: 93,
      atendimentoZUS: {
        labels: ["01/06", "02/06", "03/06", "04/06", "05/06"],
        series: [
          { name: "Utilidades", color: "#2f80ed", data: [1.2, 1.1, 1.4, 1.0, 0.9] }
        ]
      },
      produtividadePorColaborador: {
        items: [
          { name: "ANDRE", value: 7.2, team: "Elétrica" },
          { name: "CARLOS", value: 6.8, team: "Elétrica" },
          { name: "FERNANDA", value: 8.4, team: "Civil" },
          { name: "JOAO", value: 5.9, team: "Refrigeração" },
          { name: "MATEUS", value: 7.7, team: "Civil" },
          { name: "PABLO", value: 6.3, team: "Refrigeração" }
        ],
        color: "#2f66ff"
      }
    },
    spci: {
      tmaDays: 6.4,
      productivityPct: 76,
      avaliacoes: 12,
      reworkPct: 0.9,
      preventivas: 91,
      atendimentoZUS: {
        labels: ["01/06", "02/06", "03/06", "04/06", "05/06"],
        series: [
          { name: "SPCI", color: "#2e2e2e", data: [0.7, 0.8, 1.0, 0.9, 0.6] }
        ]
      },
      produtividadePorColaborador: {
        items: [
          { name: "ANA", value: 6.6, team: "SPCI" },
          { name: "BRUNO", value: 7.1, team: "SPCI" },
          { name: "DANILO", value: 5.8, team: "SPCI" },
          { name: "GUSTAVO", value: 8.2, team: "SPCI" },
          { name: "MARIA", value: 6.9, team: "SPCI" }
        ],
        color: "#2f66ff"
      }
    },
    lsi: {
      atendimentoZUS: {
        labels: ["01/06", "02/06", "03/06", "04/06", "05/06"],
        series: [
          { name: "Civil", color: "#2f80ed", data: [0.8, 1.1, 0.9, 1.3, 1.2] },
          { name: "Elétrica", color: "#f2994a", data: [0.7, 0.9, 1.0, 1.1, 1.0] },
          { name: "Refrigeração", color: "#27ae60", data: [0.6, 0.8, 0.7, 0.9, 0.8] }
        ],
        limit: 2
      },
      cronogramas: [
        { label: "Limpeza de Salas", result: 92, target: 95 },
        { label: "Limpeza de Banheiros", result: 89, target: 92 },
        { label: "Recolhimento Resíduos", result: 94, target: 96 },
        { label: "Limpeza de Piso", result: 90, target: 94 },
        { label: "Limpeza Técnica", result: 85, target: 90 },
        { label: "Jardinagem", result: 96, target: 94 }
      ],
      eficacia: [
        { label: "Jardinagem", evaluations: 18, result: 94 },
        { label: "Limpeza Técnica", evaluations: 21, result: 89 },
        { label: "Limpeza Convencional", evaluations: 26, result: 91 },
        { label: "Limpeza de Piso", evaluations: 14, result: 87 }
      ]
    }
  };
}

const store = {
  data: null,
  lastError: "",
  charts: new Map(),
  loading: false
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

function setNavActive(route) {
  for (const a of qsa(".nav-item")) {
    a.classList.toggle("is-active", a.getAttribute("data-route") === route);
  }
}

function fetchJsonp(urlString, { force = false } = {}) {
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
    }, 15000);

    document.head.appendChild(script);
  });
}

async function fetchDashboardData({ force = false } = {}) {
  if (store.loading) return store.data;
  store.loading = true;
  const refreshBtn = qs("#refreshBtn");
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const endpoint = String(cfg.dataEndpoint || "").trim();
    if (!endpoint) {
      store.data = sampleData();
      store.lastError = "";
      localStorage.setItem("dashboard:lastData", JSON.stringify(store.data));
      return store.data;
    }
    const transport = String(cfg.transport || "auto").toLowerCase();
    const url = new URL(endpoint);
    if (force) url.searchParams.set("force", String(Date.now()));

    let payload;
    if (transport === "jsonp") {
      payload = await fetchJsonp(url.toString(), { force });
    } else if (transport === "fetch") {
      const res = await fetch(url.toString(), { method: "GET", mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payload = await res.json();
    } else {
      try {
        const res = await fetch(url.toString(), { method: "GET", mode: "cors", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        payload = await res.json();
      } catch {
        payload = await fetchJsonp(url.toString(), { force });
      }
    }
    if (!payload || typeof payload !== "object") throw new Error("Resposta inválida");
    store.data = payload;
    store.lastError = "";
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
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function updateStatusLine() {
  const d = store.data?.updatedAt ? new Date(store.data.updatedAt) : null;
  const base = d && !Number.isNaN(d.getTime()) ? `Atualizado: ${formatDatePtBR(d)} ${String(d.toLocaleTimeString("pt-BR")).slice(0, 5)}` : "";
  const note = store.data?.note ? ` • ${store.data.note}` : "";
  const err = store.lastError ? ` • ${store.lastError}` : "";
  setLastUpdatedText(`${base}${note}${err}`.trim());
}

function mountGeneral(host, data) {
  const title = el("div", { class: "section-title", text: "Acidentes" });
  const top = el("div", { class: "grid-3" });

  const accidents = Array.isArray(data?.general?.accidents) ? data.general.accidents : [];
  for (const item of accidents.slice(0, 3)) {
    const card = el("div", { class: "card kpi-card" }, [
      el("div", { class: "kpi-top" }, [el("div", { class: "kpi-badge", text: item?.label ?? "" })]),
      el("div", { class: "kpi-value", text: formatNumberPtBR(item?.value ?? 0) }),
      el("div", { class: "kpi-foot", text: `último registro: ${formatDatePtBR(item?.lastRecord)}` })
    ]);
    top.append(card);
  }

  const bottom = el("div", { class: "grid-2", style: "margin-top:18px" });

  const csCard = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Histórico Satisfação Cliente" }),
    el("div", { class: "chart-wrap" }, [el("canvas", { id: "chartCustomerSatisfaction" })])
  ]);
  const s7Card = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Histórico 7S" }),
    el("div", { class: "chart-wrap" }, [el("canvas", { id: "chartSevenS" })])
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

function mountFacilities(host, data) {
  const f = data?.facilities ?? {};
  const teamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0"
  };
  const kpis = el("div", { class: "small-kpis" });
  const mkpi = (label, valueText) =>
    el("div", { class: "card mini-kpi" }, [
      el("div", { class: "card-title", text: label }),
      el("div", { class: "mini-value", text: valueText })
    ]);
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  kpis.append(
    mkpi("TMA em dias", formatNumberPtBR(f?.tmaDays ?? 0, { digits: 1 })),
    mkpi("Produtividade", `${formatNumberPtBR(f?.productivityPct ?? 0)}%`),
    mkpi("Retrabalho", `${formatNumberPtBR(f?.reworkPct ?? 0, { digits: 1 })}%`),
    mkpi("Serviços Externos", `${formatMetricValue(f?.servicoExterno ?? 0)}%`),
    mkpi("Preventivas", `${formatMetricValue(f?.preventivas ?? 0)}%`)
  );

  const chartsTop = el("div", { class: "grid-3" });
  const left = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartAtendimentoZUS" })])
  ]);
  const mid = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Prioridade alta" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartPrioridadeAlta" })])
  ]);
  const right = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Avaliações" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartAvaliacoes" })])
  ]);
  chartsTop.append(left, mid, right);

  const bottom = el("div", { class: "facilities-bottom" });
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  const prodChartWrap = el("div", { class: "chart-wrap wide productivity-chart-wrap" }, [el("canvas", { id: "chartProdColab" })]);
  const prodColab = el("div", { class: "card productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Produtividade por colaborador" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);

  bottom.append(prodColab);

  host.append(kpis, chartsTop, bottom);

  const az = f?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];

  const ctx1 = qs("#chartAtendimentoZUS")?.getContext("2d");
  if (ctx1) {
    const datasets = azSeries.map((s) => ({
      type: "line",
      label: s?.name ?? "",
      data: Array.isArray(s?.data) ? s.data : [],
      borderColor: s?.color ?? "#333",
      backgroundColor: s?.color ?? "#333",
      pointRadius: 2,
      tension: 0.35
    }));
    const chart = new Chart(ctx1, {
      type: "line",
      data: { labels: azLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { min: 0, max: 3, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartAtendimentoZUS", chart);
  }

  const pa = f?.prioridadeAlta ?? {};
  const paLabels = Array.isArray(pa.labels) ? pa.labels : [];
  const paValues = Array.isArray(pa.values) ? pa.values : [];
  const paColors = Array.isArray(pa.colors) ? pa.colors : [];

  const ctx2 = qs("#chartPrioridadeAlta")?.getContext("2d");
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

  const av = f?.avaliacoes ?? {};
  const avLabels = Array.isArray(av.labels) ? av.labels : [];
  const avValues = Array.isArray(av.values) ? av.values : [];
  const avColors = Array.isArray(av.colors) ? av.colors : [];

  const ctx3 = qs("#chartAvaliacoes")?.getContext("2d");
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
          barThickness: 14,
          maxBarThickness: 18,
          categoryPercentage: 0.72,
          barPercentage: 0.82
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
            ticks: { color: "#111", autoSkip: false }
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
      prodChartWrap.style.height = `${Math.max(340, filtered.length * 30 + 110)}px`;
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

function mountUtilidades(host, data) {
  const u = data?.utilidades ?? {};
  const baseTeamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0"
  };
  const fallbackPalette = ["#2f80ed", "#f2994a", "#27ae60", "#9b51e0", "#eb5757", "#56ccf2"];
  const collaboratorItems = getCollaboratorItems(u?.produtividadePorColaborador ?? {});
  const uniqueTeams = Array.from(new Set(collaboratorItems.map((item) => item.team).filter(Boolean)));
  const teamColors = { ...baseTeamColors };

  uniqueTeams.forEach((team, idx) => {
    if (!teamColors[team]) teamColors[team] = fallbackPalette[idx % fallbackPalette.length];
  });

  const kpis = el("div", { class: "small-kpis" });
  const mkpi = (label, valueText) =>
    el("div", { class: "card mini-kpi" }, [
      el("div", { class: "card-title", text: label }),
      el("div", { class: "mini-value", text: valueText })
    ]);
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  kpis.append(
    mkpi("TMA em dias", formatNumberPtBR(u?.tmaDays ?? 0, { digits: 1 })),
    mkpi("Produtividade", `${formatNumberPtBR(u?.productivityPct ?? 0)}%`),
    mkpi("Retrabalho", `${formatNumberPtBR(u?.reworkPct ?? 0, { digits: 1 })}%`),
    mkpi("Preventivas", `${formatMetricValue(u?.preventivas ?? 0)}%`)
  );

  const top = el("div", { class: "grid-2" });
  const zusCard = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartUtilidadesZUS" })])
  ]);
  const avaliacoesCard = el("div", { class: "card mini-kpi" }, [
    el("div", { class: "card-title", text: "Avaliações" }),
    el("div", { class: "mini-value", text: formatMetricValue(u?.avaliacoes ?? 0) }),
    el("div", { class: "kpi-foot", text: "Valor atual do indicador" })
  ]);
  top.append(zusCard, avaliacoesCard);

  const bottom = el("div", { class: "facilities-bottom" });
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  const prodChartWrap = el("div", { class: "chart-wrap wide productivity-chart-wrap" }, [el("canvas", { id: "chartUtilidadesProdColab" })]);
  const prodColab = el("div", { class: "card productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Apontamento por colaborador" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);
  bottom.append(prodColab);

  host.append(kpis, top, bottom);

  const az = u?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];
  const azMax = azSeries.reduce((max, series) => {
    const seriesMax = (Array.isArray(series?.data) ? series.data : []).reduce((innerMax, value) => Math.max(innerMax, Number(value ?? 0)), 0);
    return Math.max(max, seriesMax);
  }, 0);

  const ctx1 = qs("#chartUtilidadesZUS")?.getContext("2d");
  if (ctx1) {
    const datasets = azSeries.map((series) => ({
      type: "line",
      label: series?.name ?? "",
      data: Array.isArray(series?.data) ? series.data : [],
      borderColor: series?.color ?? "#2f80ed",
      backgroundColor: series?.color ?? "#2f80ed",
      pointRadius: 2,
      tension: 0.35
    }));
    const chart = new Chart(ctx1, {
      type: "line",
      data: { labels: azLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: {
            beginAtZero: true,
            suggestedMax: azMax > 0 ? Math.ceil(azMax * 1.2) : 5,
            grid: { color: "rgba(0,0,0,.08)" },
            ticks: { color: "#111" }
          }
        }
      }
    });
    store.charts.set("chartUtilidadesZUS", chart);
  }

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
          barThickness: 14,
          maxBarThickness: 18,
          categoryPercentage: 0.72,
          barPercentage: 0.82
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
            ticks: { color: "#111", autoSkip: false }
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
      prodChartWrap.style.height = `${Math.max(340, filtered.length * 30 + 110)}px`;
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

function mountSPCI(host, data) {
  const u = data?.spci ?? {};
  const baseTeamColors = {
    Civil: "#2f80ed",
    "Elétrica": "#f2994a",
    "Refrigeração": "#27ae60",
    Pintura: "#9b51e0",
    SPCI: "#2e2e2e"
  };
  const fallbackPalette = ["#2e2e2e", "#2f80ed", "#f2994a", "#27ae60", "#9b51e0", "#eb5757", "#56ccf2"];
  const collaboratorItems = getCollaboratorItems(u?.produtividadePorColaborador ?? {});
  const uniqueTeams = Array.from(new Set(collaboratorItems.map((item) => item.team).filter(Boolean)));
  const teamColors = { ...baseTeamColors };

  uniqueTeams.forEach((team, idx) => {
    if (!teamColors[team]) teamColors[team] = fallbackPalette[idx % fallbackPalette.length];
  });

  const kpis = el("div", { class: "small-kpis" });
  const mkpi = (label, valueText) =>
    el("div", { class: "card mini-kpi" }, [
      el("div", { class: "card-title", text: label }),
      el("div", { class: "mini-value", text: valueText })
    ]);
  const formatMetricValue = (value) => {
    const n = Number(value ?? 0);
    const digits = Math.abs(n % 1) > 0.001 ? 1 : 0;
    return formatNumberPtBR(n, { digits });
  };

  kpis.append(
    mkpi("TMA em dias", formatNumberPtBR(u?.tmaDays ?? 0, { digits: 1 })),
    mkpi("Produtividade", `${formatNumberPtBR(u?.productivityPct ?? 0)}%`),
    mkpi("Retrabalho", `${formatNumberPtBR(u?.reworkPct ?? 0, { digits: 1 })}%`),
    mkpi("Preventivas", `${formatMetricValue(u?.preventivas ?? 0)}%`)
  );

  const top = el("div", { class: "grid-2" });
  const zusCard = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartSpciZUS" })])
  ]);
  const avaliacoesCard = el("div", { class: "card mini-kpi" }, [
    el("div", { class: "card-title", text: "Avaliações" }),
    el("div", { class: "mini-value", text: formatMetricValue(u?.avaliacoes ?? 0) }),
    el("div", { class: "kpi-foot", text: "Valor atual do indicador" })
  ]);
  top.append(zusCard, avaliacoesCard);

  const bottom = el("div", { class: "facilities-bottom" });
  const filterBar = el("div", { class: "filter-chips" });
  const prodEmpty = el("div", { class: "productivity-empty", text: "Nenhum colaborador encontrado para esta equipe.", hidden: true });
  const prodChartWrap = el("div", { class: "chart-wrap wide productivity-chart-wrap" }, [el("canvas", { id: "chartSpciProdColab" })]);
  const prodColab = el("div", { class: "card productivity-card" }, [
    el("div", { class: "card-head" }, [
      el("div", { class: "card-title", text: "Apontamento por colaborador" }),
      filterBar
    ]),
    prodChartWrap,
    prodEmpty
  ]);
  bottom.append(prodColab);

  host.append(kpis, top, bottom);

  const az = u?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];
  const azMax = azSeries.reduce((max, series) => {
    const seriesMax = (Array.isArray(series?.data) ? series.data : []).reduce((innerMax, value) => Math.max(innerMax, Number(value ?? 0)), 0);
    return Math.max(max, seriesMax);
  }, 0);

  const ctx1 = qs("#chartSpciZUS")?.getContext("2d");
  if (ctx1) {
    const datasets = azSeries.map((series) => ({
      type: "line",
      label: series?.name ?? "",
      data: Array.isArray(series?.data) ? series.data : [],
      borderColor: series?.color ?? "#2e2e2e",
      backgroundColor: series?.color ?? "#2e2e2e",
      pointRadius: 2,
      tension: 0.35
    }));
    const chart = new Chart(ctx1, {
      type: "line",
      data: { labels: azLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: {
            beginAtZero: true,
            suggestedMax: azMax > 0 ? Math.ceil(azMax * 1.2) : 5,
            grid: { color: "rgba(0,0,0,.08)" },
            ticks: { color: "#111" }
          }
        }
      }
    });
    store.charts.set("chartSpciZUS", chart);
  }

  const pc = u?.produtividadePorColaborador ?? {};
  const pcColor = pc?.color ?? "#2f66ff";
  const filterOptions = [{ label: "Todos", value: "all" }].concat(uniqueTeams.map((team) => ({ label: team, value: team })));
  let activeFilter = "all";

  filterBar.hidden = uniqueTeams.length < 2;

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
          barThickness: 14,
          maxBarThickness: 18,
          categoryPercentage: 0.72,
          barPercentage: 0.82
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
            ticks: { color: "#111", autoSkip: false }
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
      prodChartWrap.style.height = `${Math.max(340, filtered.length * 30 + 110)}px`;
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

function mountLSI(host, data) {
  const lsi = data?.lsi ?? {};
  const az = lsi?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];
  const cronogramas = Array.isArray(lsi?.cronogramas) ? lsi.cronogramas : [];
  const eficacia = Array.isArray(lsi?.eficacia) ? lsi.eficacia : [];

  host.append(el("div", { class: "section-title", text: "LSI" }));

  const zusCard = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Atendimento ZUS" }),
    el("div", { class: "chart-wrap tall" }, [el("canvas", { id: "chartLsiAtendimentoZUS" })])
  ]);

  if (!azLabels.length || !azSeries.length) {
    zusCard.append(el("div", { class: "placeholder compact", text: "Nenhum atendimento ZUS configurado." }));
  }

  const cronTitle = el("div", { class: "section-title section-subtitle", text: "Cronogramas" });
  const cronGrid = el("div", { class: "lsi-grid cron-grid" });

  for (const metric of cronogramas) {
    const result = Number(metric?.result ?? 0);
    const target = Number(metric?.target ?? 0);
    const scale = Math.max(result, target, 100, 1);
    const fillPct = clamp((result / scale) * 100, 0, 100);
    const targetPct = clamp((target / scale) * 100, 0, 100);

    cronGrid.append(
      el("div", { class: `card lsi-progress-card${target > 0 && result >= target ? " is-on-target" : ""}` }, [
        el("div", { class: "card-title", text: metric?.label ?? "" }),
        el("div", { class: "lsi-metric-line" }, [
          el("span", { class: "lsi-metric-chip", text: `Resultado ${formatPercentValue(result)}` }),
          el("span", { class: "lsi-metric-chip is-muted", text: `Meta ${formatPercentValue(target)}` })
        ]),
        el("div", { class: "lsi-bullet-track" }, [
          el("div", { class: "lsi-bullet-fill", style: `width:${fillPct}%` }),
          el("div", { class: "lsi-bullet-target", style: `left:${targetPct}%` })
        ]),
        el("div", { class: "lsi-bullet-footer", text: compareToTargetText(result, target) })
      ])
    );
  }

  const effTitle = el("div", { class: "section-title section-subtitle", text: "Eficácia" });
  const effGrid = el("div", { class: "grid-2" });

  eficacia.forEach((metric, idx) => {
    effGrid.append(
      el("div", { class: "card lsi-chart-card" }, [
        el("div", { class: "card-title", text: metric?.label ?? "" }),
        el("div", { class: "lsi-chart-caption", text: `${formatNumberPtBR(metric?.evaluations ?? 0)} avaliações` }),
        el("div", { class: "lsi-chart-value", text: formatPercentValue(metric?.result ?? 0) }),
        el("div", { class: "chart-wrap medium" }, [el("canvas", { id: `chartLsiEficacia${idx}` })])
      ])
    );
  });

  if (!cronogramas.length) cronGrid.append(el("div", { class: "card placeholder compact", text: "Nenhum cronograma configurado." }));
  if (!eficacia.length) effGrid.append(el("div", { class: "card placeholder compact", text: "Nenhum indicador de eficácia configurado." }));

  host.append(zusCard, cronTitle, cronGrid, effTitle, effGrid);

  const ctxZus = qs("#chartLsiAtendimentoZUS")?.getContext("2d");
  if (ctxZus && azLabels.length && azSeries.length) {
    const datasets = azSeries.map((series) => ({
      type: "line",
      label: series?.name ?? "",
      data: Array.isArray(series?.data) ? series.data : [],
      borderColor: series?.color ?? "#333",
      backgroundColor: series?.color ?? "#333",
      pointRadius: 2,
      tension: 0.35
    }));
    const chart = new Chart(ctxZus, {
      type: "line",
      data: { labels: azLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12 } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#111" } },
          y: { min: 0, max: 3, grid: { color: "rgba(0,0,0,.08)" }, ticks: { color: "#111" } }
        }
      }
    });
    store.charts.set("chartLsiAtendimentoZUS", chart);
  }

  const eficaciaColors = {
    Jardinagem: "#ff4fa3",
    "Limpeza Técnica": "#3a3a3a",
    "Limpeza Convencional": "#7b3ff2",
    "Limpeza de Piso": "#810B38",
    "Limpeza de Pisos": "#810B38"
  };

  eficacia.forEach((metric, idx) => {
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
  destroyCharts();
  host.innerHTML = "";

  if (!store.data) store.data = sampleData();
  updateStatusLine();

  if (route === "geral") mountGeneral(host, store.data);
  else if (route === "facilities") mountFacilities(host, store.data);
  else if (route === "lsi") mountLSI(host, store.data);
  else if (route === "utilidades") mountUtilidades(host, store.data);
  else if (route === "spci") mountSPCI(host, store.data);
  else if (route === "programacao") {
    location.href = "./prog_sem.html";
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

  const poll = clamp(Number(cfg.pollMs ?? 300000), 15000, 3600000);
  setInterval(async () => {
    await fetchDashboardData();
    updateStatusLine();
    const route = getRoute();
    if (route !== "home") renderRoute(route);
  }, poll);
}

init();
