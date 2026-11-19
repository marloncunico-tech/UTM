// app.js
// ============================================================
// Máquina de Ensaio de Tração — App Web
// Comunicação: USB Serial (Web Serial API) ou Bluetooth BLE (Web Bluetooth API)
// Protocolo: G-code com handshake "ping-pong" (aguarda "ok")
// Telemetria: t:<ms> D:<mm> F:<kgf> (convertido para gf no app)
// Gráfico: Eixo X = Deslocamento (mm), Eixo Y = Força (gf)
// ============================================================

const $ = (id) => document.getElementById(id);

// UUIDs do HM-10 (BLE UART transparente)
const BLE_UART_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
const BLE_UART_CHAR    = '0000ffe1-0000-1000-8000-00805f9b34fb';

// Fator de conversão: firmware envia kgf, app exibe gf
const KGF_TO_GF = 1000;

// ---------- Estado global ----------
const state = {
  mode: 'usb',           // 'usb' ou 'ble'
  connected: false,

  // USB Serial
  serialPort: null,
  serialReader: null,
  serialWriter: null,

  // Bluetooth BLE
  bleDevice: null,
  bleServer: null,
  bleChar: null,
  bleMtu: 20,

  buffer: '',
  pendingResolve: null,
  telemetry: [],
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
  while (t.childElementCount > 500) t.removeChild(t.firstChild);
}

// ============================================================
// CONEXÃO USB (Web Serial API)
// ============================================================
async function connectUsb() {
  if (!('serial' in navigator)) {
    alert('Web Serial API não suportada. Use Chrome/Edge em desktop.');
    return;
  }
  try {
    state.serialPort = await navigator.serial.requestPort();
    const baud = parseInt($('baudRate').value, 10);
    await state.serialPort.open({ baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' });

    const textDecoder = new TextDecoderStream();
    state.serialPort.readable.pipeTo(textDecoder.writable);
    state.serialReader = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(state.serialPort.writable);
    state.serialWriter = textEncoder.writable.getWriter();

    state.mode = 'usb';
    state.connected = true;
    setConnectedUI(true);
    $('devName').textContent = 'USB Serial';
    $('devMtu').textContent = baud + ' baud';
    termLog(`✓ Conectado via USB a ${baud} baud`, 'line-info');
    readLoopUsb();
  } catch (e) {
    termLog('✗ Erro ao conectar USB: ' + e.message, 'line-err');
  }
}

async function readLoopUsb() {
  try {
    while (state.serialPort && state.serialPort.readable) {
      const { value, done } = await state.serialReader.read();
      if (done) break;
      if (value) processIncoming(value);
    }
  } catch (e) {
    termLog('✗ Leitura USB interrompida: ' + e.message, 'line-err');
  } finally {
    if (state.connected && state.mode === 'usb') disconnect();
  }
}

async function writeUsb(text) {
  await state.serialWriter.write(text);
}

// ============================================================
// CONEXÃO BLUETOOTH BLE (Web Bluetooth API)
// ============================================================
async function connectBle() {
  if (!navigator.bluetooth) {
    alert('Web Bluetooth API não suportada. Use Chrome/Edge (desktop ou Android).');
    return;
  }
  try {
    termLog('🔎 Procurando dispositivos BLE...', 'line-info');
    state.bleDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BLE_UART_SERVICE],
    });

    state.bleDevice.addEventListener('gattserverdisconnected', onBleDisconnected);

    termLog(`📲 Conectando a ${state.bleDevice.name || 'dispositivo'}...`, 'line-info');
    state.bleServer = await state.bleDevice.gatt.connect();

    termLog('🔗 Obtendo serviço UART (0xFFE0)...', 'line-info');
    const service = await state.bleServer.getPrimaryService(BLE_UART_SERVICE);
    state.bleChar = await service.getCharacteristic(BLE_UART_CHAR);

    try {
      if (state.bleServer.mtu) state.bleMtu = state.bleServer.mtu;
    } catch (e) { /* ignora */ }

    await state.bleChar.startNotifications();
    state.bleChar.addEventListener('characteristicvaluechanged', onBleData);

    state.mode = 'ble';
    state.connected = true;
    setConnectedUI(true);
    $('devName').textContent = state.bleDevice.name || '(sem nome)';
    $('devMtu').textContent = 'MTU ' + state.bleMtu + ' bytes';
    termLog(`✓ Conectado via BLE (MTU ${state.bleMtu})`, 'line-info');
  } catch (e) {
    termLog('✗ Erro ao conectar BLE: ' + e.message, 'line-err');
    console.error(e);
  }
}

function onBleData(event) {
  const text = new TextDecoder().decode(event.value);
  processIncoming(text);
}

function onBleDisconnected() {
  if (state.connected && state.mode === 'ble') {
    state.connected = false;
    state.bleChar = null;
    setConnectedUI(false);
    termLog('✓ BLE desconectado', 'line-info');
  }
}

async function writeBle(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const chunkSize = Math.max(1, state.bleMtu - 3);
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await state.bleChar.writeValue(chunk);
  }
}

// ============================================================
// PROCESSAMENTO DE DADOS RECEBIDOS (comum a USB e BLE)
// ============================================================
function processIncoming(text) {
  state.buffer += text;
  let idx;
  while ((idx = state.buffer.search(/\r?\n/)) >= 0) {
    const line = state.buffer.slice(0, idx).trim();
    state.buffer = state.buffer.slice(idx + 1).replace(/^\r?\n/, '');
    if (line) processLine(line);
  }
}

function processLine(line) {
  termLog('« ' + line);

  // Telemetria: t:1520 D:2.000 F:0.345 (F em kgf)
  const tm = line.match(/^t:(\d+)\s+D:([\-\d.]+)\s+F:([\-\w.]+)/i);
  if (tm) {
    const t = parseInt(tm[1], 10);
    const d = parseFloat(tm[2]);
    const fKgfRaw = tm[3];
    const fKgf = fKgfRaw === 'ovf' ? NaN : parseFloat(fKgfRaw);
    // Converte kgf → gf
    const fGf = isNaN(fKgf) ? NaN : fKgf * KGF_TO_GF;
    pushTelemetry(t, d, fGf);
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

// ============================================================
// ENVIO DE COMANDOS (abstrai USB/BLE)
// ============================================================
async function writeRaw(text) {
  if (state.mode === 'usb') await writeUsb(text);
  else if (state.mode === 'ble') await writeBle(text);
}

async function sendCommand(cmd, { awaitOk = true, timeoutMs = 30000 } = {}) {
  if (!state.connected) {
    termLog('✗ Não conectado', 'line-err');
    return;
  }
  termLog('» ' + cmd, 'line-out');
  await writeRaw(cmd + '\n');

  if (awaitOk) {
    return new Promise((resolve) => {
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

// ============================================================
// DESCONECTAR
// ============================================================
async function disconnect() {
  try {
    if (state.mode === 'usb') {
      if (state.serialReader) { try { await state.serialReader.cancel(); } catch(e){} state.serialReader = null; }
      if (state.serialWriter) { try { await state.serialWriter.close(); } catch(e){} state.serialWriter = null; }
      if (state.serialPort)   { try { await state.serialPort.close();   } catch(e){} state.serialPort = null; }
    } else if (state.mode === 'ble') {
      if (state.bleChar) {
        try { await state.bleChar.stopNotifications(); } catch(e) {}
      }
      if (state.bleDevice && state.bleDevice.gatt.connected) {
        state.bleDevice.gatt.disconnect();
      }
      state.bleChar = null;
    }
  } catch (e) { /* ignora */ }
  state.connected = false;
  setConnectedUI(false);
  termLog('✓ Desconectado', 'line-info');
}

function setConnectedUI(connected) {
  const s = $('connStatus');
  s.textContent = connected ? '● Conectado' : '● Desconectado';
  s.className = 'status ' + (connected ? 'connected' : 'disconnected');

  const btn = $('btnConnect');
  if (connected) {
    btn.textContent = '⏏ Desconectar';
    btn.classList.remove('primary');
    btn.classList.add('disconnect');
  } else {
    const mode = document.querySelector('input[name="connMode"]:checked').value;
    btn.textContent = mode === 'usb' ? '🔌 Conectar USB' : '📡 Conectar BLE';
    btn.classList.add('primary');
    btn.classList.remove('disconnect');
  }

  $('connModeBox').style.display = connected ? 'none' : 'flex';
  $('usbOptions').classList.toggle('hidden', connected || state.mode === 'ble');
  $('bleOptions').classList.toggle('hidden', connected || state.mode === 'usb');
  $('baudRate').disabled = connected;

  ['btnHome','btnEmergency','btnUpSlow','btnUpFast','btnDownSlow','btnDownFast',
   'btnStart','btnConfig','cmdInput','btnSend'].forEach(id => $(id).disabled = !connected);

  if (!connected) {
    $('devName').textContent = '—';
    $('devMtu').textContent = '—';
  }
}

// ============================================================
// GRÁFICO: Eixo X = Deslocamento (mm), Eixo Y = Força (gf)
// ============================================================
let chart;

function initChart() {
  const ctx = $('chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Força × Deslocamento',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.15)',
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { labels: { color: '#e4e8ee' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const p = ctx.raw;
              return `D: ${p.x.toFixed(3)} mm | F: ${p.y.toFixed(1)} gf`;
            }
          }
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Deslocamento (mm)', color: '#e4e8ee', font: { weight: 'bold' } },
          ticks: { color: '#8b95a5' },
          grid: { color: '#2d3744' },
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Força (gf)', color: '#e4e8ee', font: { weight: 'bold' } },
          ticks: { color: '#8b95a5' },
          grid: { color: '#2d3744' },
          beginAtZero: true,
        },
      },
    },
  });
}

function pushTelemetry(t, d, fGf) {
  // Atualiza displays (fGf já está em gf)
  $('valDisp').textContent = d.toFixed(3) + ' mm';
  $('valForce').textContent = isNaN(fGf) ? 'ovf' : fGf.toFixed(1) + ' gf';
  $('valTime').textContent = t + ' ms';
  if (!isNaN(fGf) && fGf > state.peakForce) {
    state.peakForce = fGf;
    $('valPeak').textContent = fGf.toFixed(1) + ' gf';
  }

  // Armazena para exportação (em gf)
  state.telemetry.push({ t, d, f: fGf });

  // Atualiza gráfico: X = deslocamento, Y = força (gf)
  if (!isNaN(fGf)) {
    chart.data.datasets[0].data.push({ x: d, y: fGf });

    const MAX = 10000;
    if (chart.data.datasets[0].data.length > MAX) {
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }
}

// ============================================================
// AÇÕES
// ============================================================
async function doHome() {
  state.peakForce = 0;
  $('valPeak').textContent = '0.0 gf';
  await sendCommand('G28');
}

async function doMove(deltaMM, vel) {
  await sendCommand(`G01 X${deltaMM} F${vel}`);
}

async function doStartTest() {
  if (state.testActive) return;
  state.testActive = true;
  state.peakForce = 0;
  $('valPeak').textContent = '0.0 gf';
  $('btnStart').textContent = '⏳ Teste em andamento...';
  termLog('» G02 F' + state.config.testVel, 'line-out');
  await writeRaw(`G02 F${state.config.testVel}\n`);
}

async function doEmergency() {
  termLog('» !', 'line-out');
  await writeRaw('!\n');
  state.testActive = false;
  $('btnStart').textContent = '▶ Iniciar Teste (G02)';
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================
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

// ============================================================
// EXPORTAÇÃO
// ============================================================
function exportCSV() {
  if (state.telemetry.length === 0) { alert('Sem dados para exportar.'); return; }
  let csv = 't_ms;D_mm;F_gf\n';
  state.telemetry.forEach(r => {
    csv += `${r.t};${r.d.toFixed(4)};${isNaN(r.f) ? 'ovf' : r.f.toFixed(2)}\n`;
  });
  downloadBlob(csv, 'ensaio_' + timestamp() + '.csv', 'text/csv;charset=utf-8');
}

function exportXLSX() {
  if (state.telemetry.length === 0) { alert('Sem dados para exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(state.telemetry.map(r => ({
    'Tempo (ms)': r.t,
    'Deslocamento (mm)': r.d,
    'Força (gf)': isNaN(r.f) ? 'ovf' : r.f,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ensaio');
  XLSX.writeFile(wb, 'ensaio_' + timestamp() + '.xlsx');
}

function clearChart() {
  chart.data.datasets[0].data = [];
  chart.update();
  state.telemetry = [];
  $('valDisp').textContent = '0.000 mm';
  $('valForce').textContent = '0.0 gf';
  $('valTime').textContent = '0 ms';
  state.peakForce = 0;
  $('valPeak').textContent = '0.0 gf';
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

// ============================================================
// EVENTOS
// ============================================================
$('btnConnect').onclick = () => {
  if (state.connected) {
    disconnect();
  } else {
    const mode = document.querySelector('input[name="connMode"]:checked').value;
    if (mode === 'usb') connectUsb();
    else connectBle();
  }
};

document.querySelectorAll('input[name="connMode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (state.connected) return;
    const mode = e.target.value;
    $('usbOptions').classList.toggle('hidden', mode !== 'usb');
    $('bleOptions').classList.toggle('hidden', mode !== 'ble');
    $('btnConnect').textContent = mode === 'usb' ? '🔌 Conectar USB' : '📡 Conectar BLE';
  });
});

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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') {
    if (state.connected && document.activeElement.tagName !== 'INPUT') doEmergency();
  }
});

// ============================================================
// INIT
// ============================================================
initChart();
termLog('App pronto. Selecione o modo (USB ou BLE) e clique em Conectar.', 'line-info');
termLog('Força exibida em gf (1 kgf = 1000 gf).', 'line-info');