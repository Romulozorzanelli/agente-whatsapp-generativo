// Supabase Edge Function: agente-conhecimento
// Deploy com verificação de JWT DESLIGADA (verify_jwt = false).
// A autenticação é feita aqui dentro:
//   - n8n (agente):  header  x-agent-key: <AGENT_API_KEY>
//   - painel (equipe): header Authorization: Bearer <JWT do usuário logado>
//
// Secrets necessários: OPENAI_API_KEY, AGENT_API_KEY
// Opcional: MATCH_THRESHOLD (padrão 0.45), EMBEDDING_MODEL (padrão text-embedding-3-small)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente das Edge Functions.
//
// Ações (POST JSON com { "acao": ... }):
//   buscar           (agente, equipe)  { pergunta }
//   registrar_duvida (agente, equipe)  { pergunta, contexto?, contato? }
//   salvar           (equipe)          { id?, tipo, titulo, conteudo, observacao?, tags?, ativo? }
//   resolver_duvida  (equipe)          { duvida_id, resposta, titulo? }
//   indexar          (equipe)          { todos? }  -> gera embeddings faltantes

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const AGENT_API_KEY = Deno.env.get("AGENT_API_KEY") ?? "";
const LIMITE = Number(Deno.env.get("MATCH_THRESHOLD") ?? "0.45");
const MODELO = Deno.env.get("EMBEDDING_MODEL") ?? "text-embedding-3-small";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAMPOS = "id,tipo,titulo,conteudo,observacao,tags,ativo,created_at,updated_at";

type Chamador = { papel: "agente" } | { papel: "equipe"; userId: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function limpar(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function gerarEmbedding(texto: string): Promise<number[]> {
  if (!OPENAI_API_KEY) throw new Error("Secret OPENAI_API_KEY não configurado.");
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODELO, input: texto.replace(/\s+/g, " ").trim() }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.data[0].embedding;
}

function textoParaIndexar(item: {
  tipo: string;
  titulo: string;
  conteudo: string;
  observacao?: string | null;
}): string {
  const obs = item.observacao ? `\nObservação: ${item.observacao}` : "";
  return item.tipo === "situacao"
    ? `Situação: ${item.titulo}\nComo lidar: ${item.conteudo}${obs}`
    : `Pergunta: ${item.titulo}\nResposta: ${item.conteudo}${obs}`;
}

async function identificar(req: Request): Promise<Chamador | null> {
  const chave = req.headers.get("x-agent-key");
  if (chave && AGENT_API_KEY && chave === AGENT_API_KEY) return { papel: "agente" };

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { papel: "equipe", userId: data.user.id };
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------

async function buscar(body: Record<string, unknown>) {
  const pergunta = limpar(body.pergunta);
  if (!pergunta) return json({ erro: "Informe 'pergunta'." }, 400);

  const { data, error } = await admin.rpc("buscar_conhecimento", {
    query_embedding: await gerarEmbedding(pergunta),
    limite_similaridade: LIMITE,
    quantidade: 5,
  });
  if (error) throw error;

  if (!data || data.length === 0) {
    return json({
      encontrado: false,
      instrucao:
        "Nada encontrado na base. Não invente. Use a ferramenta registrar_duvida e diga ao lead que vai confirmar com a equipe.",
    });
  }

  return json({
    encontrado: true,
    instrucao:
      "Itens 'pergunta_resposta' são fatos oficiais (não altere). Itens 'situacao' são orientações de conduta. Se nada aqui responder de fato à pergunta, registre a dúvida.",
    resultados: data.map((r: Record<string, unknown>) => ({
      tipo: r.tipo,
      titulo: r.titulo,
      conteudo: r.conteudo,
      observacao: r.observacao,
      similaridade: Number(Number(r.similaridade).toFixed(3)),
    })),
  });
}

async function registrarDuvida(body: Record<string, unknown>) {
  const pergunta = limpar(body.pergunta);
  if (!pergunta) return json({ erro: "Informe 'pergunta'." }, 400);
  const contexto = limpar(body.contexto) || null;
  const contato = limpar(body.contato) || null;

  const embedding = await gerarEmbedding(pergunta);
  const agora = new Date().toISOString();

  const { data: parecida, error: e1 } = await admin.rpc("duvida_parecida", {
    query_embedding: embedding,
    limite: 0.88,
  });
  if (e1) throw e1;

  if (parecida && parecida.length > 0) {
    const d = parecida[0];
    const { error } = await admin
      .from("duvidas")
      .update({ ocorrencias: d.ocorrencias + 1, ultima_ocorrencia: agora })
      .eq("id", d.id);
    if (error) throw error;
    return json({ registrado: true, duplicada: true, id: d.id });
  }

  const { data, error } = await admin
    .from("duvidas")
    .insert({ pergunta, contexto, contato, embedding, ultima_ocorrencia: agora })
    .select("id")
    .single();
  if (error) throw error;
  return json({ registrado: true, duplicada: false, id: data.id });
}

async function salvar(body: Record<string, unknown>, userId: string) {
  const id = limpar(body.id);
  const tipo = limpar(body.tipo);
  const titulo = limpar(body.titulo);
  const conteudo = limpar(body.conteudo);
  const observacao = limpar(body.observacao) || null;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  if (!["pergunta_resposta", "situacao"].includes(tipo)) {
    return json({ erro: "'tipo' deve ser 'pergunta_resposta' ou 'situacao'." }, 400);
  }
  if (!titulo || !conteudo) return json({ erro: "Preencha título e conteúdo." }, 400);

  const registro: Record<string, unknown> = {
    tipo,
    titulo,
    conteudo,
    observacao,
    tags,
    embedding: await gerarEmbedding(textoParaIndexar({ tipo, titulo, conteudo, observacao })),
    updated_at: new Date().toISOString(),
  };
  if (typeof body.ativo === "boolean") registro.ativo = body.ativo;

  const consulta = id
    ? admin.from("conhecimento").update(registro).eq("id", id)
    : admin.from("conhecimento").insert({ ...registro, criado_por: userId });
  const { data, error } = await consulta.select(CAMPOS).single();
  if (error) throw error;
  return json({ ok: true, item: data });
}

async function resolverDuvida(body: Record<string, unknown>, userId: string) {
  const duvidaId = limpar(body.duvida_id);
  const resposta = limpar(body.resposta);
  if (!duvidaId || !resposta) return json({ erro: "Informe 'duvida_id' e 'resposta'." }, 400);

  const { data: duvida, error: e1 } = await admin
    .from("duvidas")
    .select("id,pergunta,contexto")
    .eq("id", duvidaId)
    .single();
  if (e1 || !duvida) return json({ erro: "Dúvida não encontrada." }, 404);

  const titulo = limpar(body.titulo) || duvida.pergunta;
  const { data: item, error: e2 } = await admin
    .from("conhecimento")
    .insert({
      tipo: "pergunta_resposta",
      titulo,
      conteudo: resposta,
      criado_por: userId,
      embedding: await gerarEmbedding(
        textoParaIndexar({ tipo: "pergunta_resposta", titulo, conteudo: resposta }),
      ),
    })
    .select(CAMPOS)
    .single();
  if (e2) throw e2;

  const { error: e3 } = await admin
    .from("duvidas")
    .update({ status: "respondida", conhecimento_id: item.id })
    .eq("id", duvidaId);
  if (e3) throw e3;

  return json({ ok: true, item });
}

async function indexar(body: Record<string, unknown>) {
  let consulta = admin.from("conhecimento").select("id,tipo,titulo,conteudo,observacao");
  if (body.todos !== true) consulta = consulta.is("embedding", null);
  const { data, error } = await consulta.limit(200);
  if (error) throw error;

  let feitos = 0;
  for (const item of data ?? []) {
    const { error: e } = await admin
      .from("conhecimento")
      .update({ embedding: await gerarEmbedding(textoParaIndexar(item)) })
      .eq("id", item.id);
    if (e) throw e;
    feitos++;
  }
  return json({ ok: true, indexados: feitos, restantes: (data?.length ?? 0) === 200 });
}

// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);

  try {
    const quem = await identificar(req);
    if (!quem) return json({ erro: "Não autorizado." }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const acao = limpar(body.acao);

    switch (acao) {
      case "buscar":
        return await buscar(body);
      case "registrar_duvida":
        return await registrarDuvida(body);
      case "salvar":
      case "resolver_duvida":
      case "indexar": {
        if (quem.papel !== "equipe") return json({ erro: "Ação exclusiva da equipe." }, 403);
        if (acao === "salvar") return await salvar(body, quem.userId);
        if (acao === "resolver_duvida") return await resolverDuvida(body, quem.userId);
        return await indexar(body);
      }
      default:
        return json({ erro: `Ação desconhecida: '${acao}'.` }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ erro: err instanceof Error ? err.message : String(err) }, 500);
  }
});
