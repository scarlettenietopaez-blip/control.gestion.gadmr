const CSV_FILES = {
  pac: "data/pac_contratacion.csv",
  ordenanzas: "data/ordenanzas.csv",
  reuniones: "data/reuniones.csv",
  compromisos: "data/compromisos_alcalde.csv",
  apoyo: "data/apoyo_institucional.csv"
};

const WEIGHTS = {
  pac: 25,
  ordenanzas: 15,
  reuniones: 15,
  compromisos: 25,
  apoyo: 10,
  actualizacion: 10
};

const ASISTENCIA_PUNTAJE = {
  "Asiste Director/a": 100,
  "Asiste delegado/a autorizado/a": 75,
  "Justifica ausencia": 50,
  "No asiste": 0
};

let state = {
  pac: [], ordenanzas: [], reuniones: [], compromisos: [], apoyo: [], direccion: "TODAS"
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (cell.length || row.length) {
        row.push(cell.trim());
        rows.push(row);
      }
      cell = "";
      row = [];
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(c => c !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

async function loadCSV(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return parseCSV(await response.text());
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(String(value).replace("%", "").replace(",", ".")) || 0;
}

function avg(values) {
  const clean = values.map(toNumber).filter(v => !Number.isNaN(v));
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function normalize(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isCompleted(row) {
  const estado = normalize(row.Estado || row.Estado_General || "");
  return estado.includes("cumplido") || estado.includes("finalizado") || estado.includes("aprobada") || estado.includes("cerrado");
}

function isDelayed(row) {
  const estado = normalize(row.Estado || row.Estado_General || "");
  if (estado.includes("atrasado") || estado.includes("critico") || estado.includes("vencido")) return true;
  if (isCompleted(row)) return false;
  const fecha = row.Fecha_Limite || row.Fecha_Prevista || "";
  if (!fecha) return false;
  const date = new Date(`${fecha}T23:59:59`);
  if (Number.isNaN(date.getTime())) return false;
  return date < new Date();
}

function scoreToSemaforo(score) {
  if (score >= 85) return "verde";
  if (score >= 70) return "amarillo";
  if (score >= 50) return "naranja";
  if (score > 0) return "rojo";
  return "gris";
}

function semaforoLabel(score) {
  const s = scoreToSemaforo(score);
  return {
    verde: "Verde",
    amarillo: "Amarillo",
    naranja: "Naranja",
    rojo: "Rojo",
    gris: "Sin datos"
  }[s];
}

function getDirections() {
  const set = new Set();
  Object.values(state).forEach(dataset => {
    if (Array.isArray(dataset)) dataset.forEach(row => row.Direccion && set.add(row.Direccion));
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

function filteredRows(rows) {
  if (state.direccion === "TODAS") return rows;
  return rows.filter(row => row.Direccion === state.direccion);
}

function groupByDirection(rows) {
  return rows.reduce((acc, row) => {
    const key = row.Direccion || "Sin dirección";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function freshnessScore(rows) {
  const dates = rows.map(r => r.Ultima_Actualizacion).filter(Boolean).map(d => new Date(`${d}T00:00:00`)).filter(d => !Number.isNaN(d.getTime()));
  if (!dates.length) return 0;
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  const diffDays = Math.floor((new Date() - latest) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return 100;
  if (diffDays <= 15) return 70;
  if (diffDays <= 30) return 40;
  return 10;
}

function calculateDirectionScores() {
  const directions = getDirections();
  return directions.map(direction => {
    const pacRows = state.pac.filter(r => r.Direccion === direction);
    const ordRows = state.ordenanzas.filter(r => r.Direccion === direction);
    const reuRows = state.reuniones.filter(r => r.Direccion === direction);
    const compRows = state.compromisos.filter(r => r.Direccion === direction);
    const apoyoRows = state.apoyo.filter(r => r.Direccion === direction);
    const allRows = [...pacRows, ...ordRows, ...reuRows, ...compRows, ...apoyoRows];

    const pacScore = pacRows.length ? avg(pacRows.map(r => r.Porcentaje_PAC)) : 0;
    const ordScore = ordRows.length ? avg(ordRows.map(r => r.Porcentaje_Ordenanza)) : 0;
    const reuScore = reuRows.length ? avg(reuRows.map(r => r.Puntaje_Asistencia || ASISTENCIA_PUNTAJE[r.Resultado_Asistencia] || 0)) : 0;
    const compScore = compRows.length ? (compRows.filter(isCompleted).length / compRows.length) * 100 : 0;
    const apoyoScore = apoyoRows.length ? avg(apoyoRows.map(r => r.Porcentaje_Cumplimiento)) : 0;
    const actScore = freshnessScore(allRows);

    const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    const index = (
      pacScore * WEIGHTS.pac +
      ordScore * WEIGHTS.ordenanzas +
      reuScore * WEIGHTS.reuniones +
      compScore * WEIGHTS.compromisos +
      apoyoScore * WEIGHTS.apoyo +
      actScore * WEIGHTS.actualizacion
    ) / totalWeight;

    return {
      direction,
      pacScore,
      ordScore,
      reuScore,
      compScore,
      apoyoScore,
      actScore,
      index,
      alerts: [...pacRows, ...ordRows, ...compRows].filter(isDelayed).length
    };
  }).sort((a, b) => b.index - a.index);
}

function makeAlerts() {
  const alerts = [];
  filteredRows(state.pac).forEach(r => {
    if (isDelayed(r) || toNumber(r.Porcentaje_PAC) === 0) {
      alerts.push({ modulo: "PAC", direccion: r.Direccion, tema: r.Proyecto, problema: isDelayed(r) ? "Proceso vencido o atrasado" : "Proceso no iniciado", prioridad: r.Prioridad || "Media" });
    }
  });
  filteredRows(state.ordenanzas).forEach(r => {
    if (isDelayed(r) || toNumber(r.Porcentaje_Ordenanza) === 0) {
      alerts.push({ modulo: "Ordenanza", direccion: r.Direccion, tema: r.Nombre_Ordenanza, problema: isDelayed(r) ? "Ordenanza vencida o atrasada" : "Ordenanza no iniciada", prioridad: r.Prioridad || "Media" });
    }
  });
  filteredRows(state.reuniones).forEach(r => {
    const score = toNumber(r.Puntaje_Asistencia || ASISTENCIA_PUNTAJE[r.Resultado_Asistencia]);
    if (score === 0) {
      alerts.push({ modulo: "Reunión", direccion: r.Direccion, tema: r.Tema, problema: "Inasistencia no justificada", prioridad: "Alta" });
    }
  });
  filteredRows(state.compromisos).forEach(r => {
    if (isDelayed(r)) {
      alerts.push({ modulo: "Compromiso", direccion: r.Direccion, tema: r.Compromiso, problema: "Compromiso vencido", prioridad: r.Prioridad || "Alta" });
    }
  });
  filteredRows(state.apoyo).forEach(r => {
    if (toNumber(r.Porcentaje_Cumplimiento) < 70) {
      alerts.push({ modulo: "Apoyo", direccion: r.Direccion, tema: r.Actividad, problema: "Apoyo menor al 70% de lo solicitado", prioridad: r.Prioridad || "Media" });
    }
  });
  return alerts;
}

function formatPercent(value) {
  return `${Math.round(toNumber(value))}%`;
}

function renderKPIs() {
  const pac = filteredRows(state.pac);
  const ord = filteredRows(state.ordenanzas);
  const reu = filteredRows(state.reuniones);
  const comp = filteredRows(state.compromisos);
  const apoyo = filteredRows(state.apoyo);
  const alerts = makeAlerts();

  const kpis = [
    { label: "Avance promedio PAC", value: formatPercent(avg(pac.map(r => r.Porcentaje_PAC))), note: `${pac.length} proyectos registrados` },
    { label: "Avance ordenanzas", value: formatPercent(avg(ord.map(r => r.Porcentaje_Ordenanza))), note: `${ord.length} ordenanzas registradas` },
    { label: "Asistencia a reuniones", value: formatPercent(avg(reu.map(r => r.Puntaje_Asistencia || ASISTENCIA_PUNTAJE[r.Resultado_Asistencia] || 0))), note: `${reu.length} registros de asistencia` },
    { label: "Alertas críticas", value: alerts.length, note: "Casos que requieren seguimiento" },
    { label: "Compromisos cumplidos", value: formatPercent(comp.length ? (comp.filter(isCompleted).length / comp.length) * 100 : 0), note: `${comp.filter(isDelayed).length} compromisos atrasados` },
    { label: "Apoyo institucional", value: formatPercent(avg(apoyo.map(r => r.Porcentaje_Cumplimiento))), note: `${apoyo.length} actividades reportadas` },
    { label: "Direcciones monitoreadas", value: state.direccion === "TODAS" ? getDirections().length : 1, note: "Con datos en al menos un módulo" },
    { label: "Procesos no iniciados", value: pac.filter(r => toNumber(r.Porcentaje_PAC) === 0).length + ord.filter(r => toNumber(r.Porcentaje_Ordenanza) === 0).length, note: "PAC y ordenanzas en 0%" }
  ];

  document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-note">${k.note}</div>
    </div>
  `).join("");
}

function renderRanking() {
  let scores = calculateDirectionScores();
  if (state.direccion !== "TODAS") scores = scores.filter(s => s.direction === state.direccion);

  if (!scores.length) {
    document.getElementById("rankingTable").innerHTML = `<div class="empty">No hay datos para mostrar.</div>`;
    return;
  }

  document.getElementById("rankingTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Dirección</th><th>Índice</th><th>Semáforo</th><th>PAC</th><th>Ordenanzas</th><th>Reuniones</th><th>Compromisos</th><th>Alertas</th>
        </tr>
      </thead>
      <tbody>
        ${scores.map(s => `
          <tr>
            <td><strong>${s.direction}</strong></td>
            <td class="score">${formatPercent(s.index)}</td>
            <td><span class="badge ${scoreToSemaforo(s.index)}">${semaforoLabel(s.index)}</span></td>
            <td>${formatPercent(s.pacScore)}</td>
            <td>${formatPercent(s.ordScore)}</td>
            <td>${formatPercent(s.reuScore)}</td>
            <td>${formatPercent(s.compScore)}</td>
            <td>${s.alerts}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSemaforo() {
  let scores = calculateDirectionScores();
  if (state.direccion !== "TODAS") scores = scores.filter(s => s.direction === state.direccion);
  document.getElementById("semaforoList").innerHTML = scores.map(s => `
    <div class="semaforo-item">
      <div>
        <strong>${s.direction}</strong>
        <div class="progress"><span style="width:${Math.max(0, Math.min(100, s.index))}%"></span></div>
      </div>
      <span class="badge ${scoreToSemaforo(s.index)}">${formatPercent(s.index)}</span>
    </div>
  `).join("") || `<div class="empty">No hay datos.</div>`;
}

function renderAlerts() {
  const alerts = makeAlerts();
  if (!alerts.length) {
    document.getElementById("alertsTable").innerHTML = `<div class="empty">No existen alertas críticas con el filtro actual.</div>`;
    return;
  }
  document.getElementById("alertsTable").innerHTML = `
    <table>
      <thead><tr><th>Módulo</th><th>Dirección</th><th>Tema</th><th>Problema</th><th>Prioridad</th></tr></thead>
      <tbody>
        ${alerts.map(a => `
          <tr>
            <td><span class="badge rojo">${a.modulo}</span></td>
            <td>${a.direccion || "Sin dirección"}</td>
            <td>${a.tema || "Sin tema"}</td>
            <td>${a.problema}</td>
            <td>${a.prioridad}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderBars(containerId, rows, field, labelField) {
  const grouped = groupByDirection(filteredRows(rows));
  const data = Object.entries(grouped).map(([direction, items]) => ({
    direction,
    value: avg(items.map(i => i[field]))
  })).sort((a, b) => b.value - a.value);

  document.getElementById(containerId).innerHTML = data.map(d => `
    <div class="bar-row">
      <div class="bar-meta"><span class="bar-label">${d.direction}</span><span>${formatPercent(d.value)}</span></div>
      <div class="progress"><span style="width:${Math.max(0, Math.min(100, d.value))}%"></span></div>
    </div>
  `).join("") || `<div class="empty">No hay datos.</div>`;
}

function renderAll() {
  renderKPIs();
  renderRanking();
  renderSemaforo();
  renderAlerts();
  renderBars("pacBars", state.pac, "Porcentaje_PAC", "Proyecto");
  renderBars("ordenanzaBars", state.ordenanzas, "Porcentaje_Ordenanza", "Nombre_Ordenanza");
  renderBars("reunionBars", state.reuniones.map(r => ({...r, Score: r.Puntaje_Asistencia || ASISTENCIA_PUNTAJE[r.Resultado_Asistencia] || 0})), "Score", "Tema");
  renderBars("compromisoBars", state.compromisos.map(r => ({...r, Cumplimiento: isCompleted(r) ? 100 : 0})), "Cumplimiento", "Compromiso");
}

function setupFilter() {
  const select = document.getElementById("direccionFilter");
  const options = getDirections().map(d => `<option value="${d}">${d}</option>`).join("");
  select.innerHTML = `<option value="TODAS">Todas las direcciones</option>${options}`;
  select.addEventListener("change", e => {
    state.direccion = e.target.value;
    renderAll();
  });
}

async function init() {
  try {
    const [pac, ordenanzas, reuniones, compromisos, apoyo] = await Promise.all([
      loadCSV(CSV_FILES.pac),
      loadCSV(CSV_FILES.ordenanzas),
      loadCSV(CSV_FILES.reuniones),
      loadCSV(CSV_FILES.compromisos),
      loadCSV(CSV_FILES.apoyo)
    ]);
    state = { ...state, pac, ordenanzas, reuniones, compromisos, apoyo };
    setupFilter();
    renderAll();
  } catch (error) {
    document.querySelector(".main").innerHTML = `
      <div class="panel">
        <h2>No se pudieron cargar los CSV</h2>
        <p>${error.message}</p>
        <p>Abre el proyecto desde GitHub Pages o desde un servidor local, no directamente con doble clic. En VS Code puedes usar Live Server.</p>
      </div>
    `;
  }
}

init();
