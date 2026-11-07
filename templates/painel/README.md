# Painel da base de conhecimento do agente

Painel da equipe para administrar o que o agente de WhatsApp sabe.

- **Perguntas e respostas:** fatos oficiais (preço, prazo, política…).
- **Situações:** como o agente deve conduzir casos (objeções, reclamações…), com observação.
- **Dúvidas:** o que o agente não soube responder. Responda aqui e o agente aprende na hora.
- **Testar busca:** veja o que o agente encontraria para uma pergunta. Botão **Indexar pendentes** gera os embeddings de itens inseridos direto no banco.

## Variáveis de ambiente (Vercel)

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon/publishable) |

Nunca coloque a `service_role` aqui.

## Deploy

Repositório no GitHub conectado à Vercel: cada `git push` publica automaticamente.

Acesso: só usuários criados no Supabase Auth (cadastro público desativado).
