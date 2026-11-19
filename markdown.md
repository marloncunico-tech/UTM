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

## ⚖️ Unidades de força

O firmware envia a força em **kgf** (quilograma-força). O app converte automaticamente para **gf** (grama-força):
