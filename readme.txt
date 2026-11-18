
## 🔧 Comandos disponíveis no terminal

Qualquer comando G-code/M-code do firmware funciona:

- `G28` — Home
- `G01 X10 F100` — Move 10 mm a 100 mm/min
- `G02 F10` — Inicia ensaio
- `M503` — Relatório de configuração
- `M750` — Calibração 3 pontos
- `!` — Emergência

## 🛠️ Deploy no GitHub Pages

1. Crie um repositório público no GitHub.
2. Faça upload dos 4 arquivos na raiz.
3. Vá em **Settings → Pages → Source: main branch / root**.
4. Acesse `https://<usuario>.github.io/<repo>/`.

## 📋 Requisitos do navegador

### USB Serial
- Chrome 89+ ou Edge 89+ (desktop)
- Permissão de porta serial ao clicar em "Conectar"

### Bluetooth BLE
- Chrome 56+ ou Edge 79+ (desktop ou Android)
- Bluetooth habilitado
- **iOS não suporta** Web Bluetooth

## 🔍 Diagnóstico

| Problema | Causa | Solução |
|---|---|---|
| "Web Serial não suportada" | Navegador incompatível | Use Chrome/Edge |
| "Web Bluetooth não suportada" | Navegador incompatível ou iOS | Use Chrome/Edge (não Safari) |
| Dispositivo BLE não aparece | HM-10 não visível | Verifique alimentação e pareamento |
| "Timeout aguardando ok" | Firmware travado ou baud errado | Conferir baud (USB) ou `AT+BAUD` (BLE) |
| Gráfico não atualiza | Telemetria não está sendo enviada | Verificar `M204 N` (passos por telemetria) |