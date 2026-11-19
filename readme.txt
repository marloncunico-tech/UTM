
Todos os displays, gráfico e exportações mostram valores em **gf**.

## 📡 Protocolo implementado

- **Handshake ping-pong**: cada comando aguarda `ok` antes do próximo.
- **Telemetria**: parseia `t:<ms> D:<mm> F:<kgf>` e converte para gf.
- **Eventos**: detecta `RUPTURE_DETECTED` e `EMERGENCY_STOP`.
- **Emergência**: botão ⛔ ou tecla `Esc`/`E`.

## 📤 Exportação

- **CSV**: abre direto no Excel (separador `;`, compatível com BR). Coluna `F_gf` em gf.
- **Excel (.xlsx)**: via SheetJS, com cabeçalhos em português. Coluna "Força (gf)".

## 📂 Estrutura
