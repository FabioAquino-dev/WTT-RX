# WTT-RX — Análise da API

## Endpoint principal

```
POST /pserver/DprintMI2.exe
Content-Type: application/x-www-form-urlencoded
```

O endpoint recebe parâmetros via form-urlencoded e retorna **HTML** (não JSON).

---

## Actions disponíveis

### `findStudies`

Retorna lista de exames reconhecidos (associados a um paciente).

**Request:**
```
action=findStudies&sessionid=<SESSION_ID>
```

**Campos esperados na resposta HTML (mapeamento posicional — confirmar após inspeção):**

| Índice | Campo             | Exemplo           |
|--------|-------------------|-------------------|
| [0]    | patientId         | `00123456`        |
| [1]    | patientName       | `JOÃO DA SILVA`   |
| [2]    | studyId           | `ST20240510-001`  |
| [3]    | modality          | `CT`              |
| [4]    | studyDescription  | `Tomografia de Tórax` |
| [5]    | accessionNumber   | `ACC2024051001`   |
| [6]    | status            | `PENDING` / `DONE` |

**onclick handlers presentes nos `<tr>` ou `<td>`:**
- `getStdPrints(studyId, accessionNumber)` — abre prints padrão do estudo
- `associate(patientId, studyId)` — associa estudo a paciente (NÃO executado automaticamente no MVP)

---

### `findUnrecPrints`

Retorna lista de prints não reconhecidos (sem associação a paciente).

**Request:**
```
action=findUnrecPrints&sessionid=<SESSION_ID>
```

**Estrutura HTML:** desconhecida — o MVP expõe as células brutas (`cells[]`) e os onclick extraídos para análise via export JSON.

---

## Captura do sessionId

O `content.js` tenta, em ordem:

1. `document.cookie` — regex para `sessionid|JSESSIONID|PHPSESSID|session_id|sid`
2. `window.sessionId` / `window.SESSION_ID` / variáveis globais comuns
3. `sessionStorage.getItem('sessionid')` e variantes
4. `document.querySelector('input[type="hidden"][name*="session" i]')`

Mesmo quando `null`, o `fetch` com `credentials: 'include'` envia os cookies automaticamente — o servidor pode validar a sessão sem necessidade do parâmetro explícito.

---

## Estrutura da resposta do content.js (para o popup)

```jsonc
{
  "ok": true,
  "sessionCaptured": true,         // false se não detectou sessionId explícito
  "studies": [
    {
      "patientId": "00123456",
      "patientName": "JOÃO DA SILVA",
      "studyId": "ST20240510-001",
      "modality": "CT",
      "studyDescription": "Tomografia de Tórax",
      "accessionNumber": "ACC2024051001",
      "status": "PENDING",
      "getStdPrints": ["ST20240510-001", "ACC2024051001"],  // args do onclick
      "associate": ["00123456", "ST20240510-001"],           // args do onclick
      "_extra": [],               // células além do índice 6 (se houver)
      "_rawCells": ["..."]        // células brutas para calibrar o parser
    }
  ],
  "unrecPrints": [
    {
      "cells": ["..."],           // células brutas (estrutura desconhecida)
      "getStdPrints": null,
      "associate": null,
      "_rawOnclick": {}
    }
  ],
  "_rawStudiesHtml": "...",       // HTML bruto de findStudies (para diagnóstico)
  "_rawUnrecHtml": "..."          // HTML bruto de findUnrecPrints (para diagnóstico)
}
```

---

## Export JSON

O botão "Exportar JSON" no popup gera um arquivo `wttrx-exames-<timestamp>.json` com todos os campos acima, incluindo os HTMLs brutos. Usar para:

1. **Calibrar o parser** — verificar se os índices posicionais estão corretos via `_rawCells`
2. **Mapear os campos desconhecidos** de `findUnrecPrints` via `cells[]`
3. **Inspecionar os parâmetros de `associate(...)`** antes de implementar associação automática

---

## Riscos e limitações conhecidas

| Risco | Descrição | Mitigação |
|-------|-----------|-----------|
| Parser posicional frágil | Qualquer coluna nova/removida no HTML quebra o mapeamento | Usar `_rawCells` no export para revalidar após updates do sistema |
| sessionId não encontrado | Fetch pode retornar 401/403 | `credentials: include` pode ser suficiente; investigar via export |
| Encoding ISO-8859-1 | Nomes com acentos podem corromper | `Response.text()` respeita charset do `Content-Type` |
| Escopo amplo de injeção | `content.js` injeta em `*://*/*` | Restringir `matches` para o domínio real do sistema em produção |
| CORS em subdomínio | Se endpoint estiver em domínio diferente | Ajustar `host_permissions` e verificar headers CORS do servidor |

---

## Próximos passos (pós-MVP)

1. Inspecionar `_rawStudiesHtml` e `_rawCells` para confirmar/corrigir o mapeamento posicional
2. Mapear a estrutura de `findUnrecPrints` via `cells[]` das primeiras respostas reais
3. Identificar quais parâmetros de `associate(...)` são necessários para a associação segura
4. Implementar a associação apenas após validação manual dos dados extraídos
