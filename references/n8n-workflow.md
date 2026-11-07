# Workflow do agente no n8n

Antes de montar, **confira a versão do n8n** da pessoa: nomes de nós, versões e a função `$fromAI()` variam entre versões. Adapte ao que existir na instância.

O n8n **só orquestra**. Nada de nós de Vector Store ou Embeddings aqui: as duas ferramentas do agente são chamadas HTTP para a Edge Function do Supabase.

Nome sugerido: `Agente WhatsApp – <Empresa>`

---

## Credenciais (criar antes)

| Nome sugerido | Tipo | Valor |
|---|---|---|
| `WhatsApp API` | Header Auth | Evolution: header `apikey` = chave global ou da instância. Outras APIs: conforme a documentação delas. |
| `OpenAI` | OpenAI | Chave da OpenAI (modelo do agente) |
| `Supabase Postgres` | Postgres | String de conexão do Supabase (pooler). Usada só para a memória da conversa. |
| `Agente Conhecimento` | Header Auth | header `x-agent-key` = valor do secret `AGENT_API_KEY` |

Deixe a credencial do WhatsApp **já conectada e testada** (uma chamada simples de status da instância).

---

## Nós

### 1. Webhook — `Receber WhatsApp`
- Método: `POST`
- Path: `whatsapp-agente`
- Responder: imediatamente (200)
- Use a **URL de produção** no webhook da API de WhatsApp.

### 2. Filter — `Só mensagens de lead`
Continua apenas se **todas** forem verdadeiras (Evolution API v2):
- `{{ $json.body.event }}` é igual a `messages.upsert`
- `{{ $json.body.data.key.fromMe }}` é `false`
- `{{ $json.body.data.key.remoteJid }}` **não** termina com `@g.us` (grupos) e **não** contém `broadcast` (status)
- Existe texto: `{{ $json.body.data.message.conversation || $json.body.data.message.extendedTextMessage?.text }}` não está vazio

### 3. Set — `Normalizar`
| Campo | Valor (Evolution v2) |
|---|---|
| `telefone` | `{{ $json.body.data.key.remoteJid.split('@')[0] }}` |
| `nome` | `{{ $json.body.data.pushName || '' }}` |
| `mensagem` | `{{ $json.body.data.message.conversation || $json.body.data.message.extendedTextMessage.text }}` |
| `instancia` | `{{ $json.body.instance }}` |
| `servidor` | URL base da Evolution (ex.: `{{ $json.body.server_url }}` ou fixa) |

### 4. AI Agent — `Agente`
- Tipo: Tools Agent
- Prompt (mensagem do usuário): `{{ $json.mensagem }}`
- System message: o prompt montado com `references/prompt-agente.md`. Pode incluir `Nome do lead: {{ $json.nome }}`.
- Máx. iterações: ~8

**Sub-nós:**

- **Chat Model:** OpenAI Chat Model (credencial `OpenAI`), modelo de chat atual, temperatura ~0.3.
- **Memory:** Postgres Chat Memory (credencial `Supabase Postgres`)
  - Session ID: `{{ $('Normalizar').item.json.telefone }}`
  - Janela de contexto: ~15 mensagens
- **Tool 1 — HTTP Request Tool `consultar_conhecimento`**
  - Descrição: `Consulta a base de conhecimento oficial da empresa. Use SEMPRE antes de responder qualquer dúvida sobre produtos, serviços, preços, prazos, pagamento, entrega, políticas, horários, endereço ou como lidar com uma situação. Envie a dúvida do lead reescrita de forma clara e completa.`
  - Método: `POST`
  - URL: `https://<PROJECT_REF>.supabase.co/functions/v1/agente-conhecimento`
  - Autenticação: credencial `Agente Conhecimento`
  - Body JSON:
    ```json
    {
      "acao": "buscar",
      "pergunta": "{{ $fromAI('pergunta', 'Dúvida do lead reescrita de forma clara e completa', 'string') }}"
    }
    ```
- **Tool 2 — HTTP Request Tool `registrar_duvida`**
  - Descrição: `Registra uma dúvida que a base de conhecimento não respondeu, para a equipe responder depois. Use quando consultar_conhecimento retornar encontrado=false ou quando os resultados não responderem de fato à pergunta. Chame uma vez por dúvida.`
  - Método: `POST`
  - URL: a mesma da Tool 1
  - Autenticação: credencial `Agente Conhecimento`
  - Body JSON:
    ```json
    {
      "acao": "registrar_duvida",
      "pergunta": "{{ $fromAI('pergunta', 'A dúvida exata do lead, clara e objetiva', 'string') }}",
      "contexto": "{{ $fromAI('contexto', 'Resumo curto do contexto da conversa', 'string') }}",
      "contato": "{{ $('Normalizar').item.json.telefone }}"
    }
    ```

### 5. (Opcional) Code — `Quebrar em mensagens`
Divide a resposta em blocos por linha em branco para parecer conversa natural. Cada bloco vira um item; use um Wait de 1–2 s entre envios.

> **Importante:** nos nós HTTP, prefira o modo de corpo **"Using Fields Below"** (um campo por chave) em vez de colar JSON com expressões. Assim aspas e quebras de linha do texto não quebram o JSON. Os blocos JSON acima mostram só quais campos e valores usar.

### 6. HTTP Request — `Enviar WhatsApp`
- Método: `POST`
- URL (Evolution v2): `{{ $('Normalizar').item.json.servidor }}/message/sendText/{{ $('Normalizar').item.json.instancia }}`
- Autenticação: credencial `WhatsApp API`
- Body (Using Fields Below, Evolution v2):
  - `number` = `{{ $('Normalizar').item.json.telefone }}`
  - `text` = `{{ $json.output }}`
  Evolution v1 usa `{ "number": "...", "textMessage": { "text": "..." } }`.

### Webhook na API de WhatsApp
Na instância da Evolution, configure o webhook para a URL de produção do n8n, com o evento **MESSAGES_UPSERT** ligado (os demais podem ficar desligados). Ative o workflow.

---

## Outras APIs de WhatsApp

Troque apenas o filtro, a normalização e o envio:

| API | Recebe (texto / telefone / fromMe) | Envia |
|---|---|---|
| **Evolution v2** | `data.message.conversation` ou `extendedTextMessage.text` / `data.key.remoteJid` / `data.key.fromMe` | `POST /message/sendText/{instancia}` |
| **Z-API** | `text.message` / `phone` / `fromMe` | `POST /send-text` (`phone`, `message`) |
| **WAHA** | `payload.body` / `payload.from` / `payload.fromMe` | `POST /api/sendText` (`chatId`, `text`, `session`) |
| **Meta Cloud API** | `entry[0].changes[0].value.messages[0].text.body` / `.from` | `POST /{phone_number_id}/messages` |

Confirme os campos na documentação da versão em uso da pessoa antes de finalizar.

---

## Melhorias opcionais (oferecer na entrega)
- **Agrupar mensagens picadas** (buffer de alguns segundos por telefone antes de chamar o agente)
- **Áudio:** transcrever com um modelo de transcrição antes do agente
- **Transbordo humano:** pausar o agente por telefone quando um humano assumir
- **Follow-up** automático para leads que pararam de responder
