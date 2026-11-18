
Basta fazer upload destes 4 arquivos para o repositório do **GitHub Pages**.

## 🔧 Comandos disponíveis no terminal

Qualquer comando G-code/M-code do firmware funciona. Exemplos:

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

> ⚠️ O GitHub Pages serve em HTTPS — a Web Serial API **exige HTTPS** (ou localhost), então funciona perfeitamente.

## 📋 Requisitos do navegador

- Chrome 89+ ou Edge 89+ (desktop)
- Permissão de porta serial ao clicar em "Conectar"
- Android Chrome também suporta Web Serial a partir da versão 113