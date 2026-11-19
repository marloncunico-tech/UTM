# Máquina de Ensaio de Tração — App Web

Aplicação web para controle e aquisição de dados da máquina de ensaio de tração.

## 🚀 Como usar

1. Acesse a página pelo **Chrome** ou **Edge**.
2. Selecione o modo de conexão:
   - **🔌 USB Serial**: conecte o Arduino via cabo USB.
   - **📡 Bluetooth BLE**: conecte sem fio via módulo HM-10.
3. Clique em **Conectar** e selecione a porta/dispositivo.
4. Use os botões para controlar a máquina.

## 📡 Modos de conexão

| Modo | Tecnologia | Navegadores | Requisitos |
|---|---|---|---|
| **USB Serial** | Web Serial API | Chrome/Edge (desktop) | Cabo USB, baud 38400 |
| **Bluetooth BLE** | Web Bluetooth API | Chrome/Edge (desktop + Android) | Módulo HM-10 (0xFFE0/0xFFE1) |

### Configuração USB
- Baud rate padrão: **38400** (conforme firmware)
- Selecione a porta COM ao clicar em "Conectar USB"

### Configuração Bluetooth
- Serviço UUID: `0000FFE0-0000-1000-8000-00805F9B34FB`
- Característica UUID: `0000FFE1-0000-1000-8000-00805F9B34FB`
- O HM-10 deve estar configurado para 38400 baud (`AT+BAUD8`)

## 📊 Gráfico

- **Eixo X**: Deslocamento (mm)
- **Eixo Y**: Força (gf)
- Curva clássica de ensaio de tração (Força × Deslocamento)
- Atualização em tempo real durante o ensaio

## ⚖ Unidades de força

O firmware envia a força diretamente em **gf** (grama-força). O app exibe, plota e exporta nessa unidade sem conversão.

## ⚖ Tara (M760)

O botão **⚖ Tara (M760)** zera a indicação de força no instante atual, sem alterar a calibração da célula. Útil para:

- Descontar o peso do dispositivo de fixação do corpo de prova
- Zerar a força antes de iniciar um ensaio com pré-carga
- Compensar o peso próprio do acessório instalado

**Fluxo recomendado:**
1. Montar o corpo de prova (ou acessório) na máquina
2. Aguardar a força estabilizar
3. Clicar em **⚖ Tara (M760)**
4. A força passa a ser mostrada a partir do novo zero
5. Iniciar o ensaio com **▶ Iniciar Teste (G02)**

> ⚠️ A tara é volátil — é perdida ao reiniciar o firmware. A calibração (`M750`) permanece gravada na EEPROM.

## 📡 Protocolo implementado

- **Handshake ping-pong**: cada comando aguarda `ok` antes do próximo.
- **Telemetria**: parseia `t:<ms> D:<mm> F:<gf>` em tempo real.
- **Eventos**: detecta `RUPTURE_DETECTED` e `EMERGENCY_STOP`.
- **Emergência**: botão ⛔ ou tecla `Esc`/`E`.

## 📤 Exportação

- **CSV**: abre direto no Excel (separador `;`, compatível com BR). Coluna `F_gf` em gf.
- **Excel (.xlsx)**: via SheetJS, com cabeçalhos em português. Coluna "Força (gf)".

## 📂 Estrutura
