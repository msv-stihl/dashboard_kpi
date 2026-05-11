# Dashboard KPI (GitHub Pages + Google Sheets)

## Estrutura

- O site está em [docs](file:///c:/Users/manserv/OneDrive%20-%20MANSERV/%C3%81rea%20de%20Trabalho/Projetos_Wesley/dashboard_kpi/docs).
- O template do Google Apps Script está em [apps-script](file:///c:/Users/manserv/OneDrive%20-%20MANSERV/%C3%81rea%20de%20Trabalho/Projetos_Wesley/dashboard_kpi/apps-script).

## Publicar no GitHub Pages

1. Crie um repositório e suba este projeto.
2. No GitHub: Settings → Pages → Build and deployment:
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/docs`
3. Acesse a URL do GitHub Pages após o deploy.

## Configurar o site para buscar dados

Edite [docs/config.js](file:///c:/Users/manserv/OneDrive%20-%20MANSERV/%C3%81rea%20de%20Trabalho/Projetos_Wesley/dashboard_kpi/docs/config.js):

- `dataEndpoint`: URL do Web App do Apps Script (termina em `/exec`).
- `transport`:
  - `"auto"` (padrão): tenta `fetch` e, se bloquear por CORS, cai para JSONP automaticamente
  - `"fetch"`: força `fetch`
  - `"jsonp"`: força JSONP

O site atualiza automaticamente conforme `pollMs` (padrão: 5 minutos).

## Google Apps Script (atualizar planilha + servir JSON)

### 1) Criar o script

1. No Google Drive, crie (ou abra) a planilha.
2. Extensions → Apps Script.
3. Cole o conteúdo de [apps-script/Code.gs](file:///c:/Users/manserv/OneDrive%20-%20MANSERV/%C3%81rea%20de%20Trabalho/Projetos_Wesley/dashboard_kpi/apps-script/Code.gs) como o código do projeto.

### 2) Configurar parâmetros (API + planilha)

No editor do Apps Script, abra o console e rode:

```js
setConfig({
  SPREADSHEET_ID: "SUA_SPREADSHEET_ID",
  API_URL: "https://sua-api/aqui",
  API_METHOD: "GET",
  API_HEADERS_JSON: "{\"Authorization\":\"Bearer SEU_TOKEN\"}",
  API_PAYLOAD_JSON: ""
})
```

Depois rode manualmente `runFetchAndUpdate()` uma vez para validar.

### 3) Agendar atualização a cada 30 min

Rode `createEvery30MinTrigger()`.

### 4) Preparar abas (para o dashboard JSON)

O endpoint do site lê estas abas (se existirem) para montar o JSON:

- `general_accidents` com cabeçalhos: `label | value | lastRecord`
- `general_customer_satisfaction` com cabeçalhos: `month | value | line` (line é opcional)
- `general_7s` com cabeçalhos: `month | stihl | manserv`
- `facilities_kpis` (duas opções):
  - Uma linha de dados com cabeçalhos: `tmaDays | productivityPct | reworkPct`
  - Ou tabela `key | value` (primeira coluna “key”, segunda “value”)
- `facilities_atendimento_zus` com cabeçalhos: `time | civil | eletrica | refrigeracao | spci | limit`
- `facilities_prioridade_alta` com cabeçalhos: `label | value | color` (color opcional)
- `facilities_avaliacoes` com cabeçalhos: `label | value | color` (color opcional)
- `facilities_prod_colab` com cabeçalhos: `name | value | color` (color opcional)

A aba `prisma_source` é atualizada pelo script com o retorno bruto da API, e você pode usar fórmulas/pivôs para alimentar as abas acima.

### 5) Publicar endpoint (Web App)

1. Deploy → New deployment → Web app
2. Execute as: você
3. Who has access: Anyone (ou “Anyone with the link”)
4. Copie a URL `/exec` e coloque em `docs/config.js` (`dataEndpoint`).

O endpoint suporta JSONP automaticamente:

- `.../exec` retorna JSON
- `.../exec?callback=meuCallback` retorna JavaScript (`meuCallback({...})`)

## Informações que você precisa me passar (para integrar sua API real)

- Qual é o formato do retorno da API (exemplo JSON ou campos principais)
- Método (GET/POST) e headers obrigatórios (token, etc.)
- Se existe paginação, filtros (data inicial/final) e quais campos precisam virar KPI
- Quais KPIs entram em cada tela e de quais abas/células você quer puxar

