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
  direccion: "TODAS",
  warnings: []
};

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
  const response = await fetch(path, { cache: "no-store" });
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

function formatMoney(value) {
  const n = toNumber(value);
  return n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
  const interactions = toNumber(get(row, ["Nro de Interacciones", "Nro. de Interacciones", "N° Interacciones", "Interacciones", "Número de Interacciones"]));
  return interactions > 0 ? 100 : 0;
}

function eventosScore(row) {
  const personas = toNumber(get(row, ["Cantidad de personas", "Personas asistentes", "Nro de personas", "Número de personas", "Asistentes"]));
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
    redes: ["Direcciones que comparten", "Dirección", "Direccion"],
    eventos: ["Direcciones que Asisten", "Direcciones que asisten", "Dirección", "Direccion"],
    apoyo: ["Direcciones que apoyan", "Dirección", "Direccion"]
  };
  return get(row, fields[module] || ["Direccion", "Dirección"]);
}

function splitDirections(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(/\s*(?:;|\||\n|\r)\s*/g)
    .map(v => v.trim())
    .filter(Boolean);
}

function getDirectionsFromRow(row, module) {
  const list = splitDirections(getRawDirection(row, module));
  return list.length ? list : ["Sin dirección"];
}

function getDirection(row, module) {
  return getDirectionsFromRow(row, module)[0] || "Sin dirección";
}

function rowMatchesDirection(row, module, direction) {
  if (direction === "TODAS") return true;
  return getDirectionsFromRow(row, module).includes(direction);
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

function filteredRows(rows, module) {
  return rows.filter(row => rowMatchesDirection(row, module, state.direccion));
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

function rowsByDirection(rows, module, direction) {
  return rows.filter(r => getDirectionsFromRow(r, module).includes(direction));
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

    const index = (
      pacAvg * WEIGHTS.pac +
      ordAvg * WEIGHTS.ordenanzas +
      reuAvg * WEIGHTS.reuniones +
      redAvg * WEIGHTS.redes +
      eveAvg * WEIGHTS.eventos +
      apoAvg * WEIGHTS.apoyo +
      actScore * WEIGHTS.actualizacion
    ) / totalWeight;

    const alerts = pacRows.filter(r => isDelayed(r, "pac") || pacScore(r) === 0).length +
      ordRows.filter(r => isDelayed(r, "ordenanzas") || ordenanzaScore(r) === 0).length +
      reuRows.filter(r => reunionScore(r) === 0).length;

    return { direction, pacScore: pacAvg, ordScore: ordAvg, reuScore: reuAvg, redScore: redAvg, eveScore: eveAvg, apoScore: apoAvg, actScore, index, alerts };
  }).sort((a, b) => b.index - a.index);
}

function pacBudgetTotals(rows) {
  const presupuesto = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Presupuestado", "Presupuesto"])), 0);
  const contratado = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Contratado", "Contratado"])), 0);
  const devengado = rows.reduce((sum, row) => sum + toNumber(get(row, ["Monto Devengado", "Monto devengado", "Devengado"])), 0);
  return { presupuesto, contratado, devengado, ejecucion: presupuesto ? (devengado / presupuesto) * 100 : 0, contratacion: presupuesto ? (contratado / presupuesto) * 100 : 0 };
}

function makeAlerts() {
  const alerts = [];

  filteredRows(state.pac, "pac").forEach(r => {
    if (pacScore(r) === 0) alerts.push({ modulo: "PAC", direccion: getDirection(r, "pac"), tema: getTema(r, "pac"), problema: "Proceso no iniciado", prioridad: "Media" });
    else if (isDelayed(r, "pac")) alerts.push({ modulo: "PAC", direccion: getDirection(r, "pac"), tema: getTema(r, "pac"), problema: "Proceso vencido o atrasado", prioridad: "Alta" });
    if (!getEvidence(r)) alerts.push({ modulo: "PAC", direccion: getDirection(r, "pac"), tema: getTema(r, "pac"), problema: "Sin evidencia registrada", prioridad: "Baja" });
  });

  filteredRows(state.ordenanzas, "ordenanzas").forEach(r => {
    if (ordenanzaScore(r) === 0) alerts.push({ modulo: "Ordenanza", direccion: getDirection(r, "ordenanzas"), tema: getTema(r, "ordenanzas"), problema: "Ordenanza no iniciada", prioridad: "Media" });
    else if (isDelayed(r, "ordenanzas")) alerts.push({ modulo: "Ordenanza", direccion: getDirection(r, "ordenanzas"), tema: getTema(r, "ordenanzas"), problema: "Ordenanza vencida o atrasada", prioridad: "Alta" });
    if (!getEvidence(r)) alerts.push({ modulo: "Ordenanza", direccion: getDirection(r, "ordenanzas"), tema: getTema(r, "ordenanzas"), problema: "Sin evidencia registrada", prioridad: "Baja" });
  });

  filteredRows(state.reuniones, "reuniones").forEach(r => {
    if (reunionScore(r) === 0) alerts.push({ modulo: "Reunión", direccion: getDirection(r, "reuniones"), tema: getTema(r, "reuniones"), problema: "Inasistencia no justificada", prioridad: "Alta" });
  });

  filteredRows(state.redes, "redes").forEach(r => {
    if (redesScore(r) === 0) alerts.push({ modulo: "Redes", direccion: getDirection(r, "redes"), tema: getTema(r, "redes"), problema: "Sin interacciones registradas", prioridad: "Baja" });
  });

  filteredRows(state.eventos, "eventos").forEach(r => {
    if (eventosScore(r) === 0) alerts.push({ modulo: "Eventos", direccion: getDirection(r, "eventos"), tema: getTema(r, "eventos"), problema: "Sin cantidad de asistentes registrada", prioridad: "Media" });
  });

  filteredRows(state.apoyo, "apoyo").forEach(r => {
    if (apoyoScore(r) === 0) alerts.push({ modulo: "Apoyo", direccion: getDirection(r, "apoyo"), tema: getTema(r, "apoyo"), problema: "Sin apoyo entregado registrado", prioridad: "Media" });
  });

  return alerts;
}

function formatPercent(value) {
  return `${Math.round(toNumber(value))}%`;
}

function renderWarnings() {
  if (!state.warnings.length) return "";
  return `<div class="panel warning-panel"><strong>Advertencias de carga:</strong><br>${state.warnings.join("<br>")}</div>`;
}

function renderKPIs() {
  const pac = filteredRows(state.pac, "pac");
  const ord = filteredRows(state.ordenanzas, "ordenanzas");
  const reu = filteredRows(state.reuniones, "reuniones");
  const red = filteredRows(state.redes, "redes");
  const eve = filteredRows(state.eventos, "eventos");
  const apo = filteredRows(state.apoyo, "apoyo");
  const alerts = makeAlerts();
  const interactions = red.reduce((sum, row) => sum + toNumber(get(row, ["Nro de Interacciones", "Nro. de Interacciones", "N° Interacciones", "Interacciones", "Número de Interacciones"])), 0);
  const asistentes = eve.reduce((sum, row) => sum + toNumber(get(row, ["Cantidad de personas", "Personas asistentes", "Nro de personas", "Número de personas", "Asistentes"])), 0);
  const budget = pacBudgetTotals(pac);

  const kpis = [
    { label: "Avance promedio PAC", value: formatPercent(avg(pac.map(pacScore))), note: `${pac.length} proyectos registrados` },
    { label: "Ejecución presupuestaria", value: formatPercent(budget.ejecucion), note: `${formatMoney(budget.devengado)} devengado de ${formatMoney(budget.presupuesto)}` },
    { label: "Monto contratado PAC", value: formatMoney(budget.contratado), note: `${formatPercent(budget.contratacion)} del presupuesto registrado` },
    { label: "Avance ordenanzas", value: formatPercent(avg(ord.map(ordenanzaScore))), note: `${ord.length} ordenanzas registradas` },
    { label: "Asistencia a reuniones", value: formatPercent(avg(reu.map(reunionScore))), note: `${reu.length} registros de asistencia` },
    { label: "Interacciones en redes", value: interactions.toLocaleString("es-EC"), note: `${red.length} publicaciones registradas` },
    { label: "Asistencia a eventos", value: asistentes.toLocaleString("es-EC"), note: `${eve.length} eventos registrados` },
    { label: "Apoyo institucional", value: formatPercent(avg(apo.map(apoyoScore))), note: `${apo.length} actividades reportadas` },
    { label: "Direcciones monitoreadas", value: state.direccion === "TODAS" ? getDirections().length : 1, note: "Con datos en al menos un módulo" },
    { label: "Alertas críticas", value: alerts.length, note: "Casos que requieren seguimiento" }
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
          <th>Dirección</th><th>Índice</th><th>Semáforo</th><th>PAC</th><th>Ordenanzas</th><th>Reuniones</th><th>Redes</th><th>Eventos</th><th>Apoyo</th><th>Alertas</th>
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
            <td>${formatPercent(s.redScore)}</td>
            <td>${formatPercent(s.eveScore)}</td>
            <td>${formatPercent(s.apoScore)}</td>
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

function renderBars(containerId, rows, module, scoreFunction) {
  const grouped = groupByDirection(filteredRows(rows, module), module, scoreFunction);
  const data = Object.entries(grouped).map(([direction, values]) => ({ direction, value: avg(values) })).sort((a, b) => b.value - a.value);

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
  renderBars("pacBars", state.pac, "pac", pacScore);
  renderBars("ordenanzaBars", state.ordenanzas, "ordenanzas", ordenanzaScore);
  renderBars("reunionBars", state.reuniones, "reuniones", reunionScore);
  renderBars("redesBars", state.redes, "redes", redesScore);
  renderBars("eventosBars", state.eventos, "eventos", eventosScore);
  renderBars("apoyoBars", state.apoyo, "apoyo", apoyoScore);
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
    const [pac, ordenanzas, reuniones, redes, eventos, apoyo] = await Promise.all([
      loadCSV(CSV_FILES.pac),
      loadCSV(CSV_FILES.ordenanzas),
      loadCSV(CSV_FILES.reuniones),
      loadCSV(CSV_FILES.redes),
      loadCSV(CSV_FILES.eventos),
      loadCSV(CSV_FILES.apoyo)
    ]);
    state = { ...state, pac, ordenanzas, reuniones, redes, eventos, apoyo };
    setupFilter();
    const main = document.querySelector(".main");
    if (state.warnings.length) main.insertAdjacentHTML("afterbegin", renderWarnings());
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
