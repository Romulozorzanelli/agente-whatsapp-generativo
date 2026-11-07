# Criar um MCP personalizado do n8n (pelo navegador)

Use quando a pessoa não tem conector do n8n no Claude e a instância não oferece MCP nativo (ou ela não sabe ativar). Você faz tudo pelo navegador; a pessoa só adiciona a URL final como conector no Claude.

## 1. Chave da API do n8n
No n8n, nas configurações de **n8n API**, crie uma chave de API. Guarde-a só na credencial do passo 2.

## 2. Credencial
Crie uma credencial **Header Auth** chamada `n8n API interna`:
- Nome do header: `X-N8N-API-KEY`
- Valor: a chave do passo 1

## 3. Workflow `MCP Claude – Gerenciar n8n`
1. Nó **MCP Server Trigger**
   - Autenticação: **Bearer Auth** (crie um token aleatório forte). Não deixe sem autenticação.
2. Conecte ao trigger estes nós **HTTP Request Tool** (todos com a credencial `n8n API interna`; base `https://<URL-DO-N8N>/api/v1`):

| Ferramenta | Método | Caminho | Descrição para o modelo |
|---|---|---|---|
| `listar_workflows` | GET | `/workflows` | Lista os workflows (id, nome, ativo). |
| `obter_workflow` | GET | `/workflows/{id}` | Retorna o JSON completo de um workflow. `id` via `$fromAI`. |
| `criar_workflow` | POST | `/workflows` | Cria um workflow. Corpo = JSON com `name`, `nodes`, `connections`, `settings`, via `$fromAI`. |
| `atualizar_workflow` | PUT | `/workflows/{id}` | Substitui um workflow pelo JSON enviado. Usar só em workflows criados por esta skill. |
| `ativar_workflow` | POST | `/workflows/{id}/activate` | Ativa um workflow. |
| `desativar_workflow` | POST | `/workflows/{id}/deactivate` | Desativa um workflow. |
| `listar_execucoes` | GET | `/executions?workflowId={id}&limit=10&includeData=true` | Últimas execuções para depurar. |
| `listar_credenciais_schema` | GET | `/credentials/schema/{tipo}` | Campos de um tipo de credencial (opcional). |

3. **Ative** o workflow e copie a **URL de produção** do MCP Server Trigger.

## 4. Conectar no Claude
Peça para a pessoa adicionar um **conector personalizado** nas configurações de conectores do Claude com:
- URL: a URL de produção do MCP Server Trigger
- Autenticação: o token Bearer do passo 3 (se o formulário pedir)

Pode ser preciso abrir um chat novo para as ferramentas aparecerem. Entregue o **Bloco de progresso** do SKILL.md antes.

## Cuidados
- Esse MCP dá controle sobre a instância: mantenha o Bearer token forte e não compartilhe a URL.
- Nunca use `atualizar_workflow` em workflows existentes da pessoa sem ela pedir.
- Antes de criar, leia um workflow existente (`obter_workflow`) para copiar o formato de nós e versões da instância.
