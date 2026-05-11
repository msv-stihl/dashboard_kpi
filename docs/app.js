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
      atendimentoZUS: {
        labels: ["00:00", "00:30", "01:00", "01:30", "02:00"],
        series: [
          { name: "Civil", color: "#2f80ed", data: [0.6, 1.2, 0.8, 1.4, 1.6] },
          { name: "Elétrica", color: "#f2994a", data: [0.4, 1.0, 0.9, 1.1, 1.3] },
          { name: "Refrigeração", color: "#27ae60", data: [0.3, 0.9, 0.6, 0.8, 1.1] },
          { name: "SPCI", color: "#eb5757", data: [0.2, 0.7, 0.5, 0.9, 1.2] }
        ],
        limit: 2.0
      },
      prioridadeAlta: {
        labels: ["Civil", "Elétrica", "Refrigeração", "SPCI", "Pintura"],
        values: [20, 28, 14, 10, 2],
        colors: ["#2f80ed", "#f2994a", "#27ae60", "#eb5757", "#ff4d00"]
      },
      avaliacoes: {
        labels: ["Alta", "Média", "Baixa", "Parada"],
        values: [42, 25, 18, 15],
        colors: ["#eb5757", "#f2c94c", "#2f80ed", "#27ae60"]
      },
      produtividadePorColaborador: {
        labels: ["ANDREY", "PIERRE", "RODRIGO", "CRISTIANO", "RAFAEL", "ALEXANDRE"],
        values: [5.2, 8.0, 1.0, 8.5, 6.2, 5.0],
        color: "#2f66ff"
      }
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
  const kpis = el("div", { class: "small-kpis" });
  const mkpi = (label, valueText) =>
    el("div", { class: "card mini-kpi" }, [
      el("div", { class: "card-title", text: label }),
      el("div", { class: "mini-value", text: valueText })
    ]);

  kpis.append(
    mkpi("TMA em dias", formatNumberPtBR(f?.tmaDays ?? 0, { digits: 1 })),
    mkpi("Produtividade", `${formatNumberPtBR(f?.productivityPct ?? 0)}%`),
    mkpi("Retrabalho", `${formatNumberPtBR(f?.reworkPct ?? 0, { digits: 1 })}%`)
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

  const bottom = el("div", { class: "grid-bottom" });
  const prodColab = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "Produtividade por colaborador" }),
    el("div", { class: "chart-wrap short" }, [el("canvas", { id: "chartProdColab" })])
  ]);
  const filler = el("div", { class: "card" }, [
    el("div", { class: "card-title", text: "" }),
    el("div", { class: "placeholder", text: "Espaço reservado para próximos gráficos" })
  ]);

  bottom.append(prodColab, filler);

  host.append(kpis, chartsTop, bottom);

  const az = f?.atendimentoZUS ?? {};
  const azLabels = Array.isArray(az.labels) ? az.labels : [];
  const azSeries = Array.isArray(az.series) ? az.series : [];

  const ctx1 = qs("#chartAtendimentoZUS")?.getContext("2d");
  if (ctx1) {
    const limit = Number.isFinite(Number(az.limit)) ? Number(az.limit) : null;
    const limitLine = limit == null ? [] : azLabels.map(() => limit);
    const datasets = azSeries.map((s) => ({
      type: "line",
      label: s?.name ?? "",
      data: Array.isArray(s?.data) ? s.data : [],
      borderColor: s?.color ?? "#333",
      backgroundColor: s?.color ?? "#333",
      pointRadius: 2,
      tension: 0.35
    }));
    if (limit != null) {
      datasets.push({
        type: "line",
        label: "",
        data: limitLine,
        borderColor: "#111",
        borderWidth: 1,
        pointRadius: 0,
        tension: 0
      });
    }
    const chart = new Chart(ctx1, {
      type: "line",
      data: { labels: azLabels, datasets },
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
  const pcLabels = Array.isArray(pc.labels) ? pc.labels : [];
  const pcValues = Array.isArray(pc.values) ? pc.values : [];
  const pcColor = pc?.color ?? "#2f66ff";

  const ctx4 = qs("#chartProdColab")?.getContext("2d");
  if (ctx4) {
    const chart = new Chart(ctx4, {
      type: "bar",
      data: { labels: pcLabels, datasets: [{ data: pcValues, backgroundColor: pcColor }] },
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
    store.charts.set("chartProdColab", chart);
  }
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
  else if (route === "lsi") mountPlaceholder(host, "LSI");
  else if (route === "utilidades") mountPlaceholder(host, "Utilidades");
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
