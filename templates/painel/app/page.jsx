"use client";

import { useCallback, useEffect, useState } from "react";
import { sb, chamar } from "../lib/supabase";

export default function Painel() {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    sb()
      .auth.getSession()
      .then(({ data }) => {
        setSessao(data.session);
        setCarregando(false);
      });
    const { data: sub } = sb().auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (carregando) return <main className="centro sub">Carregando…</main>;
  if (!sessao) return <Login />;
  return <Base email={sessao.user.email} />;
}

/* ------------------------------------------------------------------ */

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const { error } = await sb().auth.signInWithPassword({ email, password: senha });
    if (error) setErro("E-mail ou senha inválidos.");
    setEnviando(false);
  }

  return (
    <main className="centro">
      <form className="cartao login" onSubmit={entrar}>
        <h1>Base de conhecimento</h1>
        <p className="sub">Acesso da equipe</p>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ */

const ABAS = [
  { id: "pergunta_resposta", nome: "Perguntas e respostas" },
  { id: "situacao", nome: "Situações" },
  { id: "duvidas", nome: "Dúvidas" },
  { id: "testar", nome: "Testar busca" },
];

function Base({ email }) {
  const [aba, setAba] = useState("pergunta_resposta");
  const [pendentes, setPendentes] = useState(0);

  const contar = useCallback(async () => {
    const { count } = await sb()
      .from("duvidas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente");
    setPendentes(count ?? 0);
  }, []);

  useEffect(() => {
    contar();
  }, [contar, aba]);

  return (
    <div className="app">
      <header>
        <strong>Base de conhecimento do agente</strong>
        <span className="sub">
          {email} ·{" "}
          <button className="link" onClick={() => sb().auth.signOut()}>
            Sair
          </button>
        </span>
      </header>
      <nav>
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>
            {a.nome}
            {a.id === "duvidas" && pendentes > 0 && <span className="badge">{pendentes}</span>}
          </button>
        ))}
      </nav>
      <main>
        {(aba === "pergunta_resposta" || aba === "situacao") && <Conhecimento key={aba} tipo={aba} />}
        {aba === "duvidas" && <Duvidas aoMudar={contar} />}
        {aba === "testar" && <Testar />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const ROTULOS = {
  pergunta_resposta: {
    novo: "Nova pergunta",
    titulo: "Pergunta",
    conteudo: "Resposta",
    dicaTitulo: "Como o lead costuma perguntar",
    dicaConteudo: "Resposta correta e completa",
  },
  situacao: {
    novo: "Nova situação",
    titulo: "Situação",
    conteudo: "Como lidar",
    dicaTitulo: "Ex.: lead diz que está caro",
    dicaConteudo: "Orientação de como o agente deve conduzir",
  },
};

const VAZIO = { titulo: "", conteudo: "", observacao: "", tags: "" };

function Conhecimento({ tipo }) {
  const r = ROTULOS[tipo];
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await sb()
      .from("conhecimento")
      .select("id,tipo,titulo,conteudo,observacao,tags,ativo,updated_at")
      .eq("tipo", tipo)
      .order("updated_at", { ascending: false });
    if (error) setMsg(error.message);
    else setItens(data);
  }, [tipo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMsg("");
    try {
      await chamar("salvar", {
        id: editando ?? undefined,
        tipo,
        titulo: form.titulo,
        conteudo: form.conteudo,
        observacao: form.observacao,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setForm(VAZIO);
      setEditando(null);
      setMsg("Salvo. O agente já pode usar.");
      await carregar();
    } catch (err) {
      setMsg("Erro: " + err.message);
    }
    setSalvando(false);
  }

  function editar(i) {
    setEditando(i.id);
    setForm({
      titulo: i.titulo,
      conteudo: i.conteudo,
      observacao: i.observacao ?? "",
      tags: (i.tags ?? []).join(", "),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function alternar(i) {
    await sb().from("conhecimento").update({ ativo: !i.ativo }).eq("id", i.id);
    carregar();
  }

  async function excluir(i) {
    if (!confirm("Excluir este item?")) return;
    await sb().from("conhecimento").delete().eq("id", i.id);
    carregar();
  }

  const termo = filtro.toLowerCase();
  const visiveis = itens.filter((i) =>
    `${i.titulo} ${i.conteudo} ${i.observacao ?? ""} ${(i.tags ?? []).join(" ")}`
      .toLowerCase()
      .includes(termo)
  );

  return (
    <>
      <form className="cartao" onSubmit={salvar}>
        <h2>{editando ? "Editar" : r.novo}</h2>
        <label>
          {r.titulo}
          <input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder={r.dicaTitulo}
            required
          />
        </label>
        <label>
          {r.conteudo}
          <textarea
            rows={4}
            value={form.conteudo}
            onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
            placeholder={r.dicaConteudo}
            required
          />
        </label>
        <label>
          Observação (opcional)
          <textarea
            rows={2}
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
          />
        </label>
        <label>
          Tags (separadas por vírgula)
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </label>
        <div className="acoes">
          <button disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
          {editando && (
            <button
              type="button"
              className="secundario"
              onClick={() => {
                setEditando(null);
                setForm(VAZIO);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
        {msg && <p className="sub">{msg}</p>}
      </form>

      <input className="filtro" placeholder="Filtrar…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      {visiveis.length === 0 && <p className="sub">Nada cadastrado ainda.</p>}

      <ul className="lista">
        {visiveis.map((i) => (
          <li key={i.id} className={"cartao" + (i.ativo ? "" : " inativo")}>
            <div className="topo">
              <strong>{i.titulo}</strong>
              {!i.ativo && <span className="tag">inativo</span>}
            </div>
            <p className="texto">{i.conteudo}</p>
            {i.observacao && <p className="sub">Obs.: {i.observacao}</p>}
            {i.tags?.length > 0 && (
              <div>
                {i.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="acoes">
              <button className="secundario" onClick={() => editar(i)}>
                Editar
              </button>
              <button className="secundario" onClick={() => alternar(i)}>
                {i.ativo ? "Desativar" : "Ativar"}
              </button>
              <button className="perigo" onClick={() => excluir(i)}>
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Duvidas({ aoMudar }) {
  const [status, setStatus] = useState("pendente");
  const [itens, setItens] = useState([]);
  const [respostas, setRespostas] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await sb()
      .from("duvidas")
      .select("id,pergunta,contexto,contato,ocorrencias,status,ultima_ocorrencia")
      .eq("status", status)
      .order("ocorrencias", { ascending: false })
      .order("ultima_ocorrencia", { ascending: false });
    if (error) setMsg(error.message);
    else setItens(data);
  }, [status]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function responder(d) {
    const resposta = (respostas[d.id] ?? "").trim();
    if (!resposta) return;
    setEnviando(d.id);
    try {
      await chamar("resolver_duvida", { duvida_id: d.id, resposta });
      setMsg("Pronto! A resposta entrou na base e o agente já sabe.");
      await carregar();
      aoMudar();
    } catch (err) {
      setMsg("Erro: " + err.message);
    }
    setEnviando(null);
  }

  async function descartar(d) {
    await sb().from("duvidas").update({ status: "descartada" }).eq("id", d.id);
    carregar();
    aoMudar();
  }

  return (
    <>
      <p className="sub">
        O que o agente não soube responder. Escreva a resposta certa e ela vira conhecimento na hora.
      </p>
      <div className="filtros">
        {["pendente", "respondida", "descartada"].map((s) => (
          <button key={s} className={status === s ? "ativa" : "secundario"} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
      </div>
      {msg && <p className="sub">{msg}</p>}
      {itens.length === 0 && <p className="sub">Nenhuma dúvida aqui.</p>}

      <ul className="lista">
        {itens.map((d) => (
          <li key={d.id} className="cartao">
            <div className="topo">
              <strong>{d.pergunta}</strong>
              <span className="tag">{d.ocorrencias}x</span>
            </div>
            {d.contexto && <p className="sub">Contexto: {d.contexto}</p>}
            <p className="sub">
              {new Date(d.ultima_ocorrencia).toLocaleString("pt-BR")}
              {d.contato ? ` · ${d.contato}` : ""}
            </p>
            {d.status === "pendente" && (
              <>
                <textarea
                  rows={3}
                  placeholder="Escreva a resposta correta…"
                  value={respostas[d.id] ?? ""}
                  onChange={(e) => setRespostas({ ...respostas, [d.id]: e.target.value })}
                />
                <div className="acoes">
                  <button disabled={enviando === d.id} onClick={() => responder(d)}>
                    {enviando === d.id ? "Salvando…" : "Responder e ensinar o agente"}
                  </button>
                  <button className="secundario" onClick={() => descartar(d)}>
                    Descartar
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Testar() {
  const [pergunta, setPergunta] = useState("");
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [indexando, setIndexando] = useState(false);
  const [msg, setMsg] = useState("");

  async function testar(e) {
    e.preventDefault();
    setBuscando(true);
    setMsg("");
    try {
      setResultado(await chamar("buscar", { pergunta }));
    } catch (err) {
      setMsg("Erro: " + err.message);
    }
    setBuscando(false);
  }

  async function indexar() {
    setIndexando(true);
    setMsg("");
    try {
      let total = 0;
      let r;
      do {
        r = await chamar("indexar");
        total += r.indexados;
      } while (r.restantes);
      setMsg(`${total} item(ns) indexado(s).`);
    } catch (err) {
      setMsg("Erro: " + err.message);
    }
    setIndexando(false);
  }

  return (
    <>
      <form className="cartao" onSubmit={testar}>
        <h2>Testar o que o agente encontra</h2>
        <p className="sub">Escreva como um lead perguntaria. O teste não registra dúvida.</p>
        <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} required />
        <div className="acoes">
          <button disabled={buscando}>{buscando ? "Buscando…" : "Buscar"}</button>
          <button type="button" className="secundario" disabled={indexando} onClick={indexar}>
            {indexando ? "Indexando…" : "Indexar pendentes"}
          </button>
        </div>
        {msg && <p className="sub">{msg}</p>}
      </form>

      {resultado && !resultado.encontrado && (
        <p className="sub">Nada encontrado. Numa conversa real, o agente registraria essa dúvida.</p>
      )}
      {resultado?.resultados?.map((r, i) => (
        <div key={i} className="cartao">
          <div className="topo">
            <strong>{r.titulo}</strong>
            <span className="tag">
              {r.tipo === "situacao" ? "situação" : "pergunta"} · {Math.round(r.similaridade * 100)}%
            </span>
          </div>
          <p className="texto">{r.conteudo}</p>
          {r.observacao && <p className="sub">Obs.: {r.observacao}</p>}
        </div>
      ))}
    </>
  );
}
