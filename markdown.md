# Máquina de Ensaio de Tração — App Web

Aplicação web para controle e aquisição de dados da máquina de ensaio de tração via **Web Serial API**.

## 🚀 Como usar

1. Acesse a página pelo **Chrome** ou **Edge** (Web Serial só funciona nesses navegadores).
2. Conecte o Arduino Mega via **cabo USB** ao computador.
3. Clique em **🔌 Conectar** e selecione a porta COM correspondente.
4. A baud rate padrão é **38400** (conforme o firmware).

## ⚠️ Importante sobre Bluetooth

O firmware usa **HC-05 (Bluetooth Classic SPP)**, que **não é suportado pela Web Bluetooth API** dos navegadores (ela só suporta BLE). Opções:

| Opção | Como funciona |
|---|---|
| **USB direto** (recomendado) | Use o cabo USB do Arduino — funciona imediatamente com este app. |
| **Trocar HC-05 por BLE** | Use um HC-08, HM-10 ou ESP32 com BLE. Ajuste o baud no app. |
| **Bridge serial-BT** | Use um PC/ Raspberry com o HC-05 pareado e exponha uma porta virtual. |

## 📡 Protocolo implementado

- **Handshake ping-pong**: cada comando aguarda `ok` antes do próximo.
- **Telemetria**: parseia `t:<ms> D:<mm> F:<kgf>` em tempo real.
- **Eventos**: detecta `RUPTURE_DETECTED` e `EMERGENCY_STOP`.
- **Emergência**: botão ⛔ ou tecla `Esc`/`E`.

## 📤 Exportação

- **CSV**: abre direto no Excel (separador `;`, compatível com BR).
- **Excel (.xlsx)**: via SheetJS, com cabeçalhos em português.

## 📂 Estrutura
