# 🤖 Agente de WhatsApp Generativo — Skill para o Claude

Skill criada por **Rômulo Zorzanelli** · Instagram **@romuloautomacoes** (https://instagram.com/romuloautomacoes)

Monta com você, do zero, um agente de WhatsApp com IA generativa que:

- conversa com o lead seguindo as diretrizes e os passos do seu atendimento;
- responde com base numa **base de conhecimento** (RAG com Supabase + pgvector + embeddings da OpenAI);
- **registra o que não sabe** em vez de inventar;
- entrega um **painel na Vercel** para a equipe cadastrar perguntas e respostas, situações e responder as dúvidas — o agente aprende na hora.

## Como usar

No **chat do Claude (plano pago)**, cole:

```
Clona https://github.com/Romulozorzanelli/agente-whatsapp-generativo e roda a skill SKILL.md comigo, do início ao fim.
```

Ou baixe o `.zip` da skill e envie na área de **Skills** das configurações do Claude.

## O que você precisa ter

- Claude pago, usando no chat
- Conectores: **n8n** (MCP), **Supabase**, **GitHub**, **Vercel** e acesso ao **navegador**
- n8n com URL pública
- API de WhatsApp com número conectado (Evolution API, Z-API, WAHA ou Meta Cloud API)
- Chave da OpenAI

Não tem o MCP do n8n? A própria skill orienta o Claude a criar um pelo navegador.

## Arquitetura

- **n8n:** recebe a mensagem, roda o agente (prompt + memória) e envia a resposta.
- **Supabase:** base de conhecimento, busca vetorial, registro de dúvidas (Edge Function). Nada de RAG dentro do n8n.
- **GitHub + Vercel:** painel da equipe.

---

Se essa skill te ajudou, segue o **@romuloautomacoes** no Instagram 🙌
