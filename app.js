// app.js
// ============================================================
// Máquina de Ensaio de Tração — App Web
// Protocolo: G-code via Web Serial API (38400 8N1)
// Handshake ping-pong: aguarda "ok" antes do próximo comando
// Telemetria: t:<ms> D:<mm> F:<kgf>
// ============================================================

const $ = (id) => document.getElementById(id);

// ---------- Estado global ----------
const state = {
  port: null,
  reader: null,
  writer: null,
  readableStreamClosed: null,
  writableStreamClosed: null,
  connected: false,
  buffer: '',
  pendingResolve: null,        // resolve do próximo "ok"
  telemetry: [],               // histórico para export
  peakForce: 0,
  testActive: false,
  config: {
    slowVel: 20,
    fastVel: 500,
    slowDisp: 1,
    fastDisp: 10,
    testVel: 10,
  },
};

// ---------- Terminal UI ----------
function termLog(msg, cls = 'line-in') {
  const t = $('terminal');
  const line = document.createElement('div');
  line.className = cls;
  line.textContent = msg;
  t.appendChild(line);
  t.scrollTop = t.scrollHeight;
  // Limitar linhas para não travar
  while (t.childElementCount > 500) t.removeChild(t.firstChild);
}

// ---------- Conexão Serial ----------
async function connect() {
  if (!('serial' in navigator)) {
    alert('Web Serial API não suportada neste navegador. Use Chrome/Edge em desktop.');
    return;
  }
  try {
    state.port = await navigator.serial.requestPort();
    const baud = parseInt($('baudRate').value, 10);
    await state.port.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });

    const textDecoder = new TextDecoderStream();
    state.readableStreamClosed = state.port.readable.pipeTo(textDecoder.writable);
    state.reader = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    state.writableStreamClosed = textEncoder.readable.pipeTo(state.port.writable);
    state.writer = textEncoder.writable.getWriter();

    state.connected = true;
    setConnectedUI(true);
    termLog(`✓ Conectado a ${baud} baud`, 'line-info');
    readLoop();
  } catch (e) {
    termLog('✗ Erro ao conectar: ' + e.message, 'line-err');
  }
}

async function disconnect() {
  try {
    if (state.reader) { await state.reader.cancel(); state.reader = null; }
    if (state.writer) { await state.writer.close(); state.writer = null; }
    if (state.port) { await state.port.close(); state.port = null; }
  } catch (e) { /* ignore */ }
  state.connected = false;
  setConnectedUI(false);
  termLog('✓ Desconectado', 'line-info');
}

function setConnectedUI(connected) {
  const s = $('connStatus');
  s.textContent = connected ? '● Conectado' : '● Desconectado';
  s.className = 'status ' + (connected ? 'connected' : 'disconnected');
  $('btnConnect').textContent = connected ? '🔌 Desconectar' : '🔌 Conectar';
  ['btnHome','btnEmergency','btnUpSlow','btnUpFast','btnDownSlow','btnDownFast',
   'btnStart','btnConfig','cmdInput','btnSend'].forEach(id => $(id).disabled = !connected);
}

// ---------- Loop de leitura ----------
async function readLoop() {
  try {
    while (state.port && state.port.readable) {
      const { value, done } = await state.reader.read();
      if (done) break;
      if (value) {
        state.buffer += value;
        let idx;
        while ((idx = state.buffer.search(/\r?\n/)) >= 0) {
          const line = state.buffer.slice(0, idx).trim();
          state.buffer = state.buffer.slice(idx + 1).replace(/^\r?\n/, '');
          if (line) processLine(line);
        }
      }
    }
  } catch (e) {
    termLog('✗ Leitura interrompida: ' + e.message, 'line-err');
  } finally {
    if (state.connected) disconnect();
  }
}

// ---------- Processamento de linhas ----------
function processLine(line) {
  termLog('« ' + line);

  // Telemetria: t:1520 D:2.000 F:0.345
  const tm = line.match(/^t:(\d+)\s+D:([\-\d.]+)\s+F:([\-\w.]+)/i);
  if (tm) {
    const t = parseInt(tm[1], 10);
    const d = parseFloat(tm[2]);
    const fRaw = tm[3];
    const f = fRaw === 'ovf' ? NaN : parseFloat(fRaw);
    pushTelemetry(t, d, f);
    return;
  }

  if (line === 'ok') {
    if (state.pendingResolve) {
      const r = state.pendingResolve;
      state.pendingResolve = null;
      r();
    }
    return;
  }

  if (line === 'RUPTURE_DETECTED') {
    state.testActive = false;
    $('btnStart').textContent = '▶ Iniciar Teste (G02)';
    termLog('🔴 RUPTURA DETECTADA', 'line-err');
    return;
  }
  if (line === 'EMERGENCY_STOP') {
    state.testActive = false;
    termLog('⛔ PARADA DE EMERGÊNCIA', 'line-err');
    return;
  }
}

// ---------- Envio de comandos (com handshake) ----------
async function sendCommand(cmd, { awaitOk = true, timeoutMs = 30000 } = {}) {
  if (!state.connected) { termLog('✗ Não conectado', 'line-err'); return; }
  termLog('» ' + cmd, 'line-out');
  await state.writer.write(cmd + '\n');

  if (awaitOk) {
    return new Promise((resolve, reject) => {
      state.pendingResolve = resolve;
      setTimeout(() => {
        if (state.pendingResolve === resolve) {
          state.pendingResolve = null;
          termLog('⏱ Timeout aguardando ok', 'line-err');
          resolve();
        }
      }, timeoutMs);
    });
  }
}

// ---------- Telemetria e gráfico ----------
const chartData = { t: [], d: [], f: [] };
let chart;

function initChart() {
  const ctx = $('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Força (kgf)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.1)',
          yAxisID: 'yForce',
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        },
        {
          label: 'Deslocamento (mm)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.05)',
          yAxisID: 'yDisp',
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [4, 4],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e4e8ee' } },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Deslocamento (mm)', color: '#8b95a5' },
          ticks: { color: '#8b95a5' },
          grid: { color: '#2d3744' },
        },
        yDisp: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Deslocamento (mm)', color: '#f59e0b' },
          ticks: { color: '#f59e0b' },
          grid: { color: '#2d3744' },
        },
        yForce: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Força (kgf)', color: '#06b6d4' },
          ticks: { color: '#06b6d4' },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function pushTelemetry(t, d, f) {
  // Atualiza displays
  $('valDisp').textContent = d.toFixed(3) + ' mm';
  $('valForce').textContent = isNaN(f) ? 'ovf' : f.toFixed(3) + ' kgf';
  $('valTime').textContent = t + ' ms';
  if (!isNaN(f) && f > state.peakForce) {
    state.peakForce = f;
    $('valPeak').textContent = f.toFixed(3) + ' kgf';
  }

  // Armazena
  state.telemetry.push({ t, d, f });
  chartData.t.push(t);
  chartData.d.push(d);
  chartData.f.push(f);

  // Atualiza gráfico: X = deslocamento, Y1 = força, Y2 = deslocamento (temporal)
  chart.data.datasets[0].data.push({ x: d, y: f });
  chart.data.datasets[1].data.push({ x: d, y: d });

  // Limitar pontos para performance
  const MAX = 5000;
  if (chart.data.datasets[0].data.length > MAX) {
    chart.data.datasets.forEach(ds => ds.data.shift());
  }
  chart.update('none');
}

// ---------- Ações ----------
async function doHome() {
  state.peakForce = 0;
  $('valPeak').textContent = '0.000 kgf';
  await sendCommand('G28');
}

async function doMove(deltaMM, vel) {
  await sendCommand(`G01 X${deltaMM} F${vel}`);
}

async function doStartTest() {
  if (state.testActive) return;
  state.testActive = true;
  state.peakForce = 0;
  $('valPeak').textContent = '0.000 kgf';
  $('btnStart').textContent = '⏳ Teste em andamento...';
  // G02 não retorna ok até o fim (ruptura ou emergência)
  // Então NÃO aguardamos ok aqui — o ok vem junto com RUPTURE_DETECTED
  termLog('» G02 F' + state.config.testVel, 'line-out');
  await state.writer.write(`G02 F${state.config.testVel}\n`);
}

async function doEmergency() {
  // Emergência não espera ok no sentido convencional
  termLog('» !', 'line-out');
  await state.writer.write('!\n');
  state.testActive = false;
  $('btnStart').textContent = '▶ Iniciar Teste (G02)';
}

// ---------- Configurações ----------
function openConfig() {
  $('cfgSlow').value = state.config.slowVel;
  $('cfgFast').value = state.config.fastVel;
  $('cfgDispSlow').value = state.config.slowDisp;
  $('cfgDispFast').value = state.config.fastDisp;
  $('cfgTestVel').value = state.config.testVel;
  $('configModal').classList.remove('hidden');
}
function closeConfig() {
  state.config.slowVel = parseFloat($('cfgSlow').value) || 20;
  state.config.fastVel = parseFloat($('cfgFast').value) || 500;
  state.config.slowDisp = parseFloat($('cfgDispSlow').value) || 1;
  state.config.fastDisp = parseFloat($('cfgDispFast').value) || 10;
  state.config.testVel = parseFloat($('cfgTestVel').value) || 10;
  $('configModal').classList.add('hidden');
}

async function readM503() {
  await sendCommand('M503');
}

// ---------- Exportação ----------
function exportCSV() {
  if (state.telemetry.length === 0) { alert('Sem dados para exportar.'); return; }
  let csv = 't_ms;D_mm;F_kgf\n';
  state.telemetry.forEach(r => {
    csv += `${r.t};${r.d.toFixed(4)};${isNaN(r.f) ? 'ovf' : r.f.toFixed(4)}\n`;
  });
  downloadBlob(csv, 'ensaio_' + timestamp() + '.csv', 'text/csv;charset=utf-8');
}

function exportXLSX() {
  if (state.telemetry.length === 0) { alert('Sem dados para exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(state.telemetry.map(r => ({
    'Tempo (ms)': r.t,
    'Deslocamento (mm)': r.d,
    'Força (kgf)': isNaN(r.f) ? 'ovf' : r.f,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ensaio');
  XLSX.writeFile(wb, 'ensaio_' + timestamp() + '.xlsx');
}

function clearChart() {
  chart.data.datasets.forEach(ds => ds.data = []);
  chart.update();
  state.telemetry = [];
  $('valDisp').textContent = '0.000 mm';
  $('valForce').textContent = '0.000 kgf';
  $('valTime').textContent = '0 ms';
  state.peakForce = 0;
  $('valPeak').textContent = '0.000 kgf';
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ---------- Eventos ----------
$('btnConnect').onclick = () => state.connected ? disconnect() : connect();
$('btnHome').onclick = doHome;
$('btnEmergency').onclick = doEmergency;
$('btnUpSlow').onclick = () => doMove(state.config.slowDisp, state.config.slowVel);
$('btnUpFast').onclick = () => doMove(state.config.fastDisp, state.config.fastVel);
$('btnDownSlow').onclick = () => doMove(-state.config.slowDisp, state.config.slowVel);
$('btnDownFast').onclick = () => doMove(-state.config.fastDisp, state.config.fastVel);
$('btnStart').onclick = doStartTest;
$('btnConfig').onclick = openConfig;
$('btnCloseConfig').onclick = closeConfig;
$('btnReadM503').onclick = readM503;
$('btnExportCsv').onclick = exportCSV;
$('btnExportXlsx').onclick = exportXLSX;
$('btnClearChart').onclick = clearChart;

$('btnSend').onclick = () => {
  const v = $('cmdInput').value.trim();
  if (!v) return;
  sendCommand(v);
  $('cmdInput').value = '';
};
$('cmdInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btnSend').click();
});

// Atalho: tecla "E" para emergência (global)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') {
    if (state.connected && document.activeElement.tagName !== 'INPUT') doEmergency();
  }
});

// ---------- Init ----------
initChart();
termLog('App pronto. Clique em "Conectar" para selecionar a porta serial.', 'line-info');
termLog('Dica: a máquina deve estar em 38400 baud, 8N1.', 'line-info');