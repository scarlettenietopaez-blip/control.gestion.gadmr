const CSV_FILES = {
  pac: "data/pac_contratacion.csv",
  ordenanzas: "data/ordenanzas.csv",
  reuniones: "data/reuniones.csv",
  redes: "data/redes_institucionales.csv",
  eventos: "data/eventos.csv",
  apoyo: "data/apoyo_institucional.csv"
};

const WEIGHTS = {
  pac: 25,
  ordenanzas: 15,
  reuniones: 15,
  redes: 10,
  eventos: 15,
  apoyo: 10,
  actualizacion: 10
};

const ASISTENCIA_PUNTAJE = {
  "asiste director/a": 100,
  "asiste director": 100,
  "asiste directora": 100,
  "asiste delegado/a autorizado/a": 75,
  "asiste delegado autorizado": 75,
  "asiste delegado": 75,
  "asiste delegada": 75,
  "justifica ausencia": 50,
  "no asiste": 0,
  "inasistencia": 0
};

const ETAPAS_PAC = {
  "no empieza el proceso": 0,
  "no empiezan el proceso": 0,
  "sin iniciar": 0,
  "no iniciado": 0,
  "no inicia": 0,
  "preparatoria": 25,
  "precontractual": 50,
  "contractual": 75,
  "adjudicado": 75,
  "contratado": 75,
  "finalizado": 100,
  "recibido": 100,
  "cerrado": 100,
  "finalizado / recibido / cerrado": 100,
  "liquidado": 100
};

const ETAPAS_ORDENANZA = {
  "no empieza el proceso": 0,
  "no empiezan el proceso": 0,
  "sin iniciar": 0,
  "no iniciado": 0,
  "no inicia": 0,
  "en elaboracion tecnica": 25,
  "elaboracion tecnica": 25,
  "en revision juridica": 40,
  "revision juridica": 40,
  "primer debate": 60,
  "en ajustes / subsanacion": 75,
  "ajustes / subsanacion": 75,
  "subsanacion": 75,
  "segundo debate": 90,
  "aprobada / sancionada": 100,
  "aprobada": 100,
  "sancionada": 100
};

let state = {
  pac: [],
  ordenanzas: [],
  reuniones: [],
  redes: [],
  eventos: [],
  apoyo: [],
  selectedDirection: "",
  warnings: []
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;"
  }[char]));
}

function parseCSV(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
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
    } else if ((char === "," || char === ";") && !inQuotes) {
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
  const headers = rows.shift().map(h => String(h || "").replace(/^\uFEFF/, "").trim());
  return rows
    .filter(r => r.some(c => String(c || "").trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

async function loadCSV(path, optional = true) {
  const url = `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (optional) {
      state.warnings.push(`No se encontró ${path}. El dashboard continuará sin ese módulo.`);
      return [];
    }
    throw new Error(`No se pudo cargar ${path}`);
  }
  return parseCSV(await response.text());
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function get(row, candidates) {
  for (const candidate of candidates) {
    if (row[candidate] !== undefined) return row[candidate];
  }
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const found = entries.find(([key]) => normalize(key) === normalizedCandidate);
    if (found) return found[1];
  }
  return "";
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  let s = String(value).trim().replace(/\s/g, "").replace(/[$%]/g, "");
  if (!s) return 0;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1) {
    if (comma > dot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (comma > -1) {
    s = s.replace(",", ".");
  }
  s = s.replace(/[^\d.-]/g, "");
  return Number(s) || 0;
}

function avg(values) {
  const clean = values.map(toNumber).filter(v => !Number.isNaN(v));
  if (!clean.length) return 0;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const n = Number(value);
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400 * 1000));
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    return new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  }
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const d = parseDate(value);
  if (!d) return escapeHTML(value || "-");
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMoney(value) {
  const n = toNumber(value);
  return n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPercent(value) {
  return `${Math.round(toNumber(value))}%`;
}

function etapaScore(value, dictionary) {
  const etapa = normalize(value);
  if (!etapa) return 0;
  if (dictionary[etapa] !== undefined) return dictionary[etapa];
  for (const [key, score] of Object.entries(dictionary)) {
    if (etapa.includes(key)) return score;
  }
  return Math.max(0, Math.min(100, toNumber(value)));
}

function pacScore(row) {
  return etapaScore(get(row, ["Etapa Actual", "Etapa_PAC", "Etapa", "Estado del proceso"]), ETAPAS_PAC);
}

function ordenanzaScore(row) {
  return etapaScore(get(row, ["Etapa Actual", "Etapa_Ordenanza", "Etapa", "Estado"]), ETAPAS_ORDENANZA);
}

function reunionScore(row) {
  const asistencia = get(row, ["Asistencia", "Resultado_Asistencia", "Resultado de asistencia"]);
  const exact = ASISTENCIA_PUNTAJE[normalize(asistencia)];
  if (exact !== undefined) return exact;
  const normalized = normalize(asistencia);
  if (normalized.includes("director")) return 100;
  if (normalized.includes("deleg")) return 75;
  if (normalized.includes("justifica")) return 50;
  if (normalized.includes("no asiste") || normalized.includes("inasistencia")) return 0;
  return Math.max(0, Math.min(100, toNumber(asistencia)));
}

function redesScore(row) {
  const interactions = toNumber(get(row, ["Nro de Interacciones", "Nro. de Interacciones", "N° Interacciones", "Nº Interacciones", "Número de Interacciones", "Interacciones", "Nro Interacciones", "Cantidad de Interacciones"]));
  return interactions > 0 ? 100 : 0;
}

function eventosScore(row) {
  const personas = toNumber(get(row, ["Cantidad de personas", "Cantidad de Personas", "Personas asistentes", "Nro de personas", "N° Personas", "Nº Personas", "Número de personas", "Asistentes"]));
  return personas > 0 ? 100 : 0;
}

function apoyoScore(row) {
  const apoyo = get(row, ["Apoyo Entregado", "Cantidad", "Porcentaje_Cumplimiento", "% Cumplimiento"]);
  if (String(apoyo).includes("%")) return Math.max(0, Math.min(100, toNumber(apoyo)));
  if (toNumber(apoyo) > 0) return 100;
  return String(apoyo || "").trim() ? 100 : 0;
}

function getRawDirection(row, module) {
  const fields = {
    pac: ["Dirección Responsable", "Direccion Responsable", "Direccion", "Dirección"],
    ordenanzas: ["Dirección Responsable", "Direccion Responsable", "Direccion", "Dirección"],
    reuniones: ["Direcciones Convocadas", "Dirección Convocada", "Direccion Convocada", "Direccion", "Dirección"],
    redes: ["Direcciones que comparten", "Dirección que comparte", "Direccion que comparte", "Dirección", "Direccion"],
    eventos: ["Direcciones que Asisten", "Direcciones que asisten", "Dirección que Asiste", "Dirección que asiste", "Direccion que asiste", "Dirección", "Direccion"],
    apoyo: ["Direcciones que apoyan", "Dirección que apoya", "Direccion que apoya", "Dirección", "Direccion"]
  };
  return get(row, fields[module] || ["Direccion", "Dirección"]);
}

function splitDirections(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text.split(/\s*(?:;|\||\n|\r)\s*/g).map(v => v.trim()).filter(Boolean);
}

function getDirectionsFromRow(row, module) {
  const list = splitDirections(getRawDirection(row, module));
  return list.length ? list : ["Sin dirección"];
}

function getDirection(row, module) {
  return getDirectionsFromRow(row, module)[0] || "Sin dirección";
}

function rowsByDirection(rows, module, direction) {
  return rows.filter(r => getDirectionsFromRow(r, module).includes(direction));
}

function getTema(row, module) {
  const fields = {
    pac: ["Nombre del Proyecto", "Proyecto", "Objeto de contratación", "Objeto de Contratación", "Código", "Codigo"],
    ordenanzas: ["Tema", "Nombre_Ordenanza", "Nro. Ordenanza", "Nro Ordenanza", "# Trámite"],
    reuniones: ["Tema Tratado", "Tema"],
    redes: ["Tema de publicación", "Publicación", "Publicacion"],
    eventos: ["Nombre del evento", "Evento"],
    apoyo: ["Actividad"]
  };
  return get(row, fields[module] || ["Tema"]);
}

function getDate(row, module) {
  const fields = {
    pac: ["Fecha límite", "Fecha Limite", "Fecha_Limite", "Fecha de inicio", "Fecha Inicio"],
    ordenanzas: ["Fecha de finalización", "Fecha de finalizacion", "Fecha_Prevista", "Fecha de asignación", "Fecha de asignacion"],
    reuniones: ["Fecha"],
    redes: ["Fecha de Publicación", "Fecha de Publicacion", "Fecha"],
    eventos: ["Fecha"],
    apoyo: ["Fecha"]
  };
  return get(row, fields[module] || ["Fecha"]);
}

function getEvidence(row) {
  return get(row, ["Evidencias", "Evidencia", "Enlace", "Link"]);
}

function getObservation(row) {
  return get(row, ["Observaciones", "Observacion", "Observación", "Novedad"]);
}

function isFinalStage(row, module) {
  const status = normalize(get(row, ["Estado", "Estado_General", "Etapa Actual", "Etapa"]));
  if (module === "pac") return pacScore(row) >= 100 || status.includes("finalizado") || status.includes("recibido") || status.includes("cerrado") || status.includes("liquidado");
  if (module === "ordenanzas") return ordenanzaScore(row) >= 100 || status.includes("aprobada") || status.includes("sancionada");
  return status.includes("cumplido") || status.includes("finalizado") || status.includes("cerrado");
}

function isDelayed(row, module) {
  const estado = normalize(get(row, ["Estado", "Estado_General", "Etapa Actual", "Etapa"]));
  if (estado.includes("atrasado") || estado.includes("critico") || estado.includes("vencido")) return true;
  if (isFinalStage(row, module)) return false;
  const parsed = parseDate(getDate(row, module));
  if (!parsed) return false;
  return parsed < new Date();
}

function scoreToSemaforo(score) {
  if (score >= 85) return "verde";
  if (score >= 70) return "amarillo";
  if (score >= 50) return "naranja";
  if (score > 0) return "rojo";
  return "gris";
}

function semaforoLabel(score) {
  return { verde: "Verde", amarillo: "Amarillo", naranja: "Naranja", rojo: "Rojo", gris: "Sin datos" }[scoreToSemaforo(score)];
}

function getDirections() {
  const set = new Set();
  for (const module of ["pac", "ordenanzas", "reuniones", "redes", "eventos", "apoyo"]) {
    state[module].forEach(row => getDirectionsFromRow(row, module).forEach(d => d && d !== "Sin dirección" && set.add(d)));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function groupByDirection(rows, module, scoreFunction) {
  return rows.reduce((acc, row) => {
    for (const key of getDirectionsFromRow(row, module)) {
      if (!acc[key]) acc[key] = [];
      acc[key].push(scoreFunction(row));
    }
    return acc;
  }, {});
}

function freshnessScore(rows) {
  const dates = rows
    .map(r => get(r, ["Última Actualización", "Ultima Actualizacion", "Ultima_Actualizacion", "Fecha de Publicación", "Fecha de Publicacion", "Fecha", "Fecha límite", "Fecha Limite", "Fecha de finalización", "Fecha de finalizacion"]))
    .map(parseDate)
    .filter(Boolean);
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
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  return directions.map(direction => {
    const pacRows = rowsByDirection(state.pac, "pac", direction);
    const ordRows = rowsByDirection(state.ordenanzas, "ordenanzas", direction);
    const reuRows = rowsByDirection(state.reuniones, "reuniones", direction);
    const redRows = rowsByDirection(state.redes, "redes", direction);
    const eveRows = rowsByDirection(state.eventos, "eventos", direction);
    const apoRows = rowsByDirection(state.apoyo, "apoyo", direction);
    const allRows = [...pacRows, ...ordRows, ...reuRows, ...redRows, ...eveRows, ...apoRows];

    const pacAvg = pacRows.length ? avg(pacRows.map(pacScore)) : 0;
    const ordAvg = ordRows.length ? avg(ordRows.map(ordenanzaScore)) : 0;
    const reuAvg = reuRows.length ? avg(reuRows.map(reunionScore)) : 0;
    const redAvg = redRows.length ? avg(redRows.map(redesScore)) : 0;
    const eveAvg = eveRows.length ? avg(eveRows.map(eventosScore)) : 0;
    const apoAvg = apoRows.length ? avg(apoRows.map(apoyoScore)) : 0;
    const actScore = freshnessScore(allRows);

    const index = allRows.length ? (
      pacAvg * WEIGHTS.pac +
      ordAvg * WEIGHTS.ordenanzas +
      reuAvg * WEIGHTS.reuniones +
      redAvg * WEIGHTS.redes +
      eveAvg * WEIGHTS.eventos +
      apoAvg * WEIGHTS.apoyo +
      actScore * WEIGHTS.actualizacion
    ) / totalWeight : 0;

    const alerts = makeAlerts(direction).length;

    return {
      direction,
      pacRows, ordRows, reuRows, redRows, eveRows, apoRows, allRows,
      pacScore: pacAvg,
      ordScore: ordAvg,
      reuScore: reuAvg,
      redScore: redAvg,
      eveScore: eveAvg,
      apoScore: apoAvg,
      actScore,
      index,
      alerts
    };
  }).sort((a, b) => b.index - a.index);
}

function pacBudgetTotals(rows) {
  const presupuesto = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Presupuestado", "Presupuesto"])), 0);
  const contratado = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Contratado", "Contratado"])), 0);
  const devengado = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Devengado", "Monto devengado", "Devengado"])), 0);
  return { presupuesto, contratado, devengado, ejecucion: presupuesto ? (devengado / presupuesto) * 100 : 0, contratacion: presupuesto ? (contratado / presupuesto) * 100 : 0 };
}

function rowsForDirectionOrAll(rows, module, direction) {
  return direction ? rowsByDirection(rows, module, direction) : rows;
}

function makeAlerts(direction = "") {
  const alerts = [];
  const push = (moduleLabel, moduleKey, row, problem, priority) => alerts.push({
    modulo: moduleLabel,
    direccion: getDirection(row, moduleKey),
    tema: getTema(row, moduleKey),
    problema: problem,
    prioridad: priority
  });

  rowsForDirectionOrAll(state.pac, "pac", direction).forEach(r => {
    if (pacScore(r) === 0) push("PAC", "pac", r, "Proceso no iniciado", "Media");
    else if (isDelayed(r, "pac")) push("PAC", "pac", r, "Proceso vencido o atrasado", "Alta");
    if (!getEvidence(r)) push("PAC", "pac", r, "Sin evidencia registrada", "Baja");
  });

  rowsForDirectionOrAll(state.ordenanzas, "ordenanzas", direction).forEach(r => {
    if (ordenanzaScore(r) === 0) push("Ordenanza", "ordenanzas", r, "Ordenanza no iniciada", "Media");
    else if (isDelayed(r, "ordenanzas")) push("Ordenanza", "ordenanzas", r, "Ordenanza vencida o atrasada", "Alta");
    if (!getEvidence(r)) push("Ordenanza", "ordenanzas", r, "Sin evidencia registrada", "Baja");
  });

  rowsForDirectionOrAll(state.reuniones, "reuniones", direction).forEach(r => {
    if (reunionScore(r) === 0) push("Reunión", "reuniones", r, "Inasistencia no justificada", "Alta");
  });

  rowsForDirectionOrAll(state.redes, "redes", direction).forEach(r => {
    if (redesScore(r) === 0) push("Redes", "redes", r, "Sin interacciones registradas", "Baja");
  });

  rowsForDirectionOrAll(state.eventos, "eventos", direction).forEach(r => {
    if (eventosScore(r) === 0) push("Eventos", "eventos", r, "Sin cantidad de asistentes registrada", "Media");
  });

  rowsForDirectionOrAll(state.apoyo, "apoyo", direction).forEach(r => {
    if (apoyoScore(r) === 0) push("Apoyo", "apoyo", r, "Sin apoyo entregado registrado", "Media");
  });

  return alerts;
}

function moduleMetrics(direction = "") {
  const pacRows = rowsForDirectionOrAll(state.pac, "pac", direction);
  const ordRows = rowsForDirectionOrAll(state.ordenanzas, "ordenanzas", direction);
  const reuRows = rowsForDirectionOrAll(state.reuniones, "reuniones", direction);
  const redRows = rowsForDirectionOrAll(state.redes, "redes", direction);
  const eveRows = rowsForDirectionOrAll(state.eventos, "eventos", direction);
  const apoRows = rowsForDirectionOrAll(state.apoyo, "apoyo", direction);
  const budget = pacBudgetTotals(pacRows);
  const interactions = redRows.reduce((sum, row) => sum + toNumber(get(row, ["Nro de Interacciones", "Nro. de Interacciones", "N° Interacciones", "Nº Interacciones", "Número de Interacciones", "Interacciones", "Nro Interacciones", "Cantidad de Interacciones"])), 0);
  const asistentes = eveRows.reduce((sum, row) => sum + toNumber(get(row, ["Cantidad de personas", "Cantidad de Personas", "Personas asistentes", "Nro de personas", "N° Personas", "Nº Personas", "Número de personas", "Asistentes"])), 0);

  return [
    { key: "pac", label: "PAC / Contratación", score: avg(pacRows.map(pacScore)), count: pacRows.length, note: `${pacRows.length} proyectos`, value: formatPercent(avg(pacRows.map(pacScore))) },
    { key: "presupuesto", label: "Ejecución presupuestaria", score: budget.ejecucion, count: pacRows.length, note: `${formatMoney(budget.devengado)} de ${formatMoney(budget.presupuesto)}`, value: formatPercent(budget.ejecucion) },
    { key: "ordenanzas", label: "Ordenanzas", score: avg(ordRows.map(ordenanzaScore)), count: ordRows.length, note: `${ordRows.length} registros`, value: formatPercent(avg(ordRows.map(ordenanzaScore))) },
    { key: "reuniones", label: "Reuniones", score: avg(reuRows.map(reunionScore)), count: reuRows.length, note: `${reuRows.length} asistencias`, value: formatPercent(avg(reuRows.map(reunionScore))) },
    { key: "redes", label: "Redes institucionales", score: redRows.length ? 100 : 0, count: redRows.length, note: `${redRows.length} publicaciones`, value: interactions.toLocaleString("es-EC") },
    { key: "eventos", label: "Eventos", score: eveRows.length ? 100 : 0, count: eveRows.length, note: `${eveRows.length} eventos`, value: asistentes.toLocaleString("es-EC") },
    { key: "apoyo", label: "Apoyo institucional", score: avg(apoRows.map(apoyoScore)), count: apoRows.length, note: `${apoRows.length} actividades`, value: formatPercent(avg(apoRows.map(apoyoScore))) }
  ];
}

function renderWarnings() {
  if (!state.warnings.length) return "";
  return `<div class="panel warning-panel"><strong>Advertencias de carga:</strong><br>${state.warnings.map(escapeHTML).join("<br>")}</div>`;
}

function renderKPIs() {
  const metrics = moduleMetrics();
  const budget = pacBudgetTotals(state.pac);
  const alerts = makeAlerts();
  const scores = calculateDirectionScores();
  const generalIndex = scores.length ? avg(scores.map(s => s.index)) : 0;
  const kpis = [
    { label: "Índice general", value: formatPercent(generalIndex), note: "Promedio ponderado municipal" },
    { label: "Avance promedio PAC", value: metrics[0].value, note: metrics[0].note },
    { label: "Ejecución presupuestaria", value: metrics[1].value, note: metrics[1].note },
    { label: "Monto contratado PAC", value: formatMoney(budget.contratado), note: `${formatPercent(budget.contratacion)} del presupuesto registrado` },
    { label: "Avance ordenanzas", value: metrics[2].value, note: metrics[2].note },
    { label: "Asistencia a reuniones", value: metrics[3].value, note: metrics[3].note },
    { label: "Interacciones en redes", value: metrics[4].value, note: metrics[4].note },
    { label: "Asistencia a eventos", value: metrics[5].value, note: metrics[5].note },
    { label: "Direcciones monitoreadas", value: getDirections().length, note: "Con datos en al menos un módulo" },
    { label: "Alertas", value: alerts.length, note: "Casos que requieren seguimiento", alert: true }
  ];

  document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.alert ? "alert" : ""}">
      <div class="kpi-label">${escapeHTML(k.label)}</div>
      <div class="kpi-value">${escapeHTML(k.value)}</div>
      <div class="kpi-note">${escapeHTML(k.note)}</div>
    </div>
  `).join("");
}

function renderModuleOverview() {
  const metrics = moduleMetrics().filter(m => m.key !== "presupuesto");
  document.getElementById("moduleOverview").innerHTML = metrics.map(m => `
    <div class="module-row">
      <strong>${escapeHTML(m.label)}</strong>
      <div class="progress"><span style="width:${Math.max(0, Math.min(100, m.score))}%"></span></div>
      <span class="score">${escapeHTML(m.value)}</span>
    </div>
  `).join("") || `<div class="empty">No hay datos por módulo.</div>`;
}

function renderTopAlerts() {
  const alerts = makeAlerts().slice(0, 8);
  document.getElementById("topAlerts").innerHTML = alerts.map(a => `
    <div class="compact-item">
      <strong>${escapeHTML(a.modulo)} · ${escapeHTML(a.problema)}</strong>
      <small>${escapeHTML(a.direccion || "Sin dirección")} — ${escapeHTML(a.tema || "Sin tema")}</small>
    </div>
  `).join("") || `<div class="empty">No existen alertas registradas.</div>`;
}

function renderRanking() {
  const scores = calculateDirectionScores();
  const top = scores.slice(0, 3);
  document.getElementById("topThree").innerHTML = top.map((s, index) => `
    <div class="podium-card">
      <div class="podium-rank">${index + 1}</div>
      <h3>${escapeHTML(s.direction)}</h3>
      <span class="badge ${scoreToSemaforo(s.index)}">${semaforoLabel(s.index)}</span>
      <div class="podium-value">${formatPercent(s.index)}</div>
      <p>${s.allRows.length} registros evaluados · ${s.alerts} alertas</p>
    </div>
  `).join("") || `<div class="empty">No hay direcciones para mostrar.</div>`;

  document.getElementById("rankingTable").innerHTML = scores.length ? `
    <table>
      <thead>
        <tr>
          <th>Posición</th><th>Dirección</th><th>Índice</th><th>Semáforo</th><th>PAC</th><th>Ordenanzas</th><th>Reuniones</th><th>Redes</th><th>Eventos</th><th>Apoyo</th><th>Alertas</th>
        </tr>
      </thead>
      <tbody>
        ${scores.map((s, i) => `
          <tr>
            <td><span class="badge azul">${i + 1}</span></td>
            <td><strong>${escapeHTML(s.direction)}</strong></td>
            <td class="score">${formatPercent(s.index)}</td>
            <td><span class="badge ${scoreToSemaforo(s.index)}">${semaforoLabel(s.index)}</span></td>
            <td>${formatPercent(s.pacScore)}</td>
            <td>${formatPercent(s.ordScore)}</td>
            <td>${formatPercent(s.reuScore)}</td>
            <td>${formatPercent(s.redScore)}</td>
            <td>${formatPercent(s.eveScore)}</td>
            <td>${formatPercent(s.apoScore)}</td>
            <td>${s.alerts}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty">No hay datos para mostrar.</div>`;
}

function detailRowsForDirection(direction) {
  const modules = [
    { key: "pac", label: "PAC", score: pacScore },
    { key: "ordenanzas", label: "Ordenanzas", score: ordenanzaScore },
    { key: "reuniones", label: "Reuniones", score: reunionScore },
    { key: "redes", label: "Redes", score: redesScore },
    { key: "eventos", label: "Eventos", score: eventosScore },
    { key: "apoyo", label: "Apoyo", score: apoyoScore }
  ];
  return modules.flatMap(m => rowsByDirection(state[m.key], m.key, direction).map(row => ({
    modulo: m.label,
    fecha: getDate(row, m.key),
    tema: getTema(row, m.key),
    avance: m.score(row),
    observacion: getObservation(row)
  })));
}

function renderDirectionProfile() {
  const container = document.getElementById("directionProfile");
  const direction = state.selectedDirection;
  if (!direction) {
    container.className = "direction-profile empty-state";
    container.innerHTML = "Seleccione una Dirección para ver su resumen ejecutivo, desempeño por módulo, alertas y registros asociados.";
    return;
  }
  container.className = "direction-profile";
  const score = calculateDirectionScores().find(s => s.direction === direction);
  if (!score) {
    container.innerHTML = `<div class="empty">No hay datos para la Dirección seleccionada.</div>`;
    return;
  }

  const metrics = moduleMetrics(direction);
  const alerts = makeAlerts(direction);
  const details = detailRowsForDirection(direction).slice(0, 20);

  container.innerHTML = `
    <div class="profile-header">
      <div>
        <p class="eyebrow blue">Resumen individual</p>
        <h3>${escapeHTML(direction)}</h3>
        <p>Consolidado según los registros asociados a esta Dirección en la matriz.</p>
      </div>
      <div>
        <span class="badge ${scoreToSemaforo(score.index)}">${semaforoLabel(score.index)}</span>
        <div class="podium-value">${formatPercent(score.index)}</div>
      </div>
    </div>

    <div class="profile-grid">
      <div class="mini-card"><span>Registros evaluados</span><strong>${score.allRows.length}</strong></div>
      <div class="mini-card"><span>Alertas</span><strong>${alerts.length}</strong></div>
      <div class="mini-card"><span>PAC</span><strong>${formatPercent(score.pacScore)}</strong></div>
      <div class="mini-card"><span>Ordenanzas</span><strong>${formatPercent(score.ordScore)}</strong></div>
      <div class="mini-card"><span>Reuniones</span><strong>${formatPercent(score.reuScore)}</strong></div>
      <div class="mini-card"><span>Redes</span><strong>${formatPercent(score.redScore)}</strong></div>
      <div class="mini-card"><span>Eventos</span><strong>${formatPercent(score.eveScore)}</strong></div>
      <div class="mini-card"><span>Apoyo</span><strong>${formatPercent(score.apoScore)}</strong></div>
    </div>

    <div class="profile-sections">
      <div class="panel">
        <h3>Desempeño por módulo</h3>
        <div class="module-overview" style="margin-top:14px;">
          ${metrics.filter(m => m.key !== "presupuesto").map(m => `
            <div class="module-row">
              <strong>${escapeHTML(m.label)}</strong>
              <div class="progress"><span style="width:${Math.max(0, Math.min(100, m.score))}%"></span></div>
              <span class="score">${escapeHTML(m.value)}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="panel">
        <h3>Alertas de la Dirección</h3>
        <div class="compact-list" style="margin-top:14px;">
          ${alerts.slice(0, 10).map(a => `
            <div class="compact-item">
              <strong>${escapeHTML(a.modulo)} · ${escapeHTML(a.problema)}</strong>
              <small>${escapeHTML(a.tema || "Sin tema")}</small>
            </div>
          `).join("") || `<div class="empty">No existen alertas para esta Dirección.</div>`}
        </div>
      </div>
    </div>

    <div class="panel mt-24">
      <h3>Registros asociados</h3>
      <div class="table-wrap" style="margin-top:14px;">
        ${details.length ? `
          <table class="detail-table">
            <thead><tr><th>Módulo</th><th>Fecha</th><th>Tema</th><th>Avance/Puntaje</th><th>Observación</th></tr></thead>
            <tbody>
              ${details.map(d => `
                <tr>
                  <td>${escapeHTML(d.modulo)}</td>
                  <td>${formatDate(d.fecha)}</td>
                  <td>${escapeHTML(d.tema || "Sin tema")}</td>
                  <td><span class="badge ${scoreToSemaforo(d.avance)}">${formatPercent(d.avance)}</span></td>
                  <td>${escapeHTML(d.observacion || "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : `<div class="empty">No hay registros asociados para mostrar.</div>`}
      </div>
    </div>
  `;
}

function setupTabs() {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(`tab-${button.dataset.tab}`).classList.add("active");
    });
  });
}

function setupDirectionSearch() {
  const select = document.getElementById("direccionSearch");
  const options = getDirections().map(d => `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join("");
  select.innerHTML = `<option value="">Seleccione una dirección</option>${options}`;
  select.addEventListener("change", e => {
    state.selectedDirection = e.target.value;
    renderDirectionProfile();
  });
}

function renderAll() {
  renderKPIs();
  renderModuleOverview();
  renderTopAlerts();
  renderRanking();
  setupDirectionSearch();
  renderDirectionProfile();
}

async function init() {
  try {
    setupTabs();
    const [pac, ordenanzas, reuniones, redes, eventos, apoyo] = await Promise.all([
      loadCSV(CSV_FILES.pac),
      loadCSV(CSV_FILES.ordenanzas),
      loadCSV(CSV_FILES.reuniones),
      loadCSV(CSV_FILES.redes),
      loadCSV(CSV_FILES.eventos),
      loadCSV(CSV_FILES.apoyo)
    ]);
    state = { ...state, pac, ordenanzas, reuniones, redes, eventos, apoyo };
    console.log("Dashboard Alcaldía - filas cargadas", { pac: pac.length, ordenanzas: ordenanzas.length, reuniones: reuniones.length, redes: redes.length, eventos: eventos.length, apoyo: apoyo.length });
    const content = document.querySelector(".content");
    if (state.warnings.length) content.insertAdjacentHTML("afterbegin", renderWarnings());
    renderAll();
  } catch (error) {
    document.querySelector(".content").innerHTML = `
      <div class="panel">
        <h2>No se pudieron cargar los CSV</h2>
        <p>${escapeHTML(error.message)}</p>
        <p>Abre el proyecto desde GitHub Pages o desde un servidor local, no directamente con doble clic. En VS Code puedes usar Live Server.</p>
      </div>
    `;
  }
}

init();
