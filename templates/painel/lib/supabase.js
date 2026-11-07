import { createClient } from "@supabase/supabase-js";

let cliente;

export function sb() {
  if (!cliente) {
    cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return cliente;
}

export const FUNCAO = "agente-conhecimento";

export async function chamar(acao, dados = {}) {
  const { data, error } = await sb().functions.invoke(FUNCAO, {
    body: { acao, ...dados },
  });
  if (error) {
    let msg = error.message;
    try {
      const corpo = await error.context?.json();
      if (corpo?.erro) msg = corpo.erro;
    } catch {}
    throw new Error(msg);
  }
  return data;
}
