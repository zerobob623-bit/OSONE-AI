import { getMemoryItem, setMemoryItem } from './indexedDbMemory';

export interface QuadroDoEnsino {
  id: string;
  capturadoEm: number;
  /** O que a pessoa acabava de explicar quando este quadro foi tirado. */
  fala: string;
  imagem: string;
}

export interface PassoAssimilado {
  acao: string;
  alvo: string;
  quandoUsar: string;
  comoConfirmar: string;
}

export interface EnsinamentoAssimilado {
  resumo: string;
  passos: PassoAssimilado[];
}

export interface TreinamentoDoCowork extends EnsinamentoAssimilado {
  id: string;
  objetivo: string;
  transcricao: string;
  criadoEm: number;
  quadros: QuadroDoEnsino[];
}

const CHAVE_DOS_TREINAMENTOS = 'osone_cowork_treinamentos_v1';

export async function lerTreinamentosDoCowork(): Promise<TreinamentoDoCowork[]> {
  const lista = await getMemoryItem<TreinamentoDoCowork[]>(CHAVE_DOS_TREINAMENTOS, []);
  return Array.isArray(lista) ? lista : [];
}

export async function salvarTreinamentoDoCowork(treinamento: TreinamentoDoCowork): Promise<TreinamentoDoCowork[]> {
  const atuais = await lerTreinamentosDoCowork();
  const nova = [treinamento, ...atuais.filter(t => t.id !== treinamento.id)].slice(0, 20);
  // IndexedDB recebe inclusive os quadros comprimidos. setMemoryItem tenta o localStorage como
  // fallback, mas ignora com segurança quando as imagens ultrapassam a cota pequena dele.
  await setMemoryItem(CHAVE_DOS_TREINAMENTOS, nova);
  return nova;
}

export async function apagarTreinamentoDoCowork(id: string): Promise<TreinamentoDoCowork[]> {
  const nova = (await lerTreinamentosDoCowork()).filter(t => t.id !== id);
  await setMemoryItem(CHAVE_DOS_TREINAMENTOS, nova);
  return nova;
}

const limparCerca = (texto: string) => texto.trim()
  .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

export function lerEnsinamentoAssimilado(texto: string): EnsinamentoAssimilado {
  const limpo = limparCerca(texto || '');
  let bruto: any;
  try { bruto = JSON.parse(limpo); } catch {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio < 0 || fim <= inicio) throw new Error('O modelo não devolveu um ensinamento legível.');
    bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  }
  const passos = Array.isArray(bruto?.passos) ? bruto.passos.map((p: any) => ({
    acao: String(p?.acao || '').trim(),
    alvo: String(p?.alvo || '').trim(),
    quandoUsar: String(p?.quandoUsar || '').trim(),
    comoConfirmar: String(p?.comoConfirmar || '').trim()
  })).filter((p: PassoAssimilado) => p.acao && (p.alvo || p.quandoUsar)) : [];
  if (!passos.length) throw new Error('Nenhum passo utilizável foi extraído da demonstração.');
  return { resumo: String(bruto?.resumo || '').trim(), passos: passos.slice(0, 24) };
}

/**
 * Converte a demonstração em conhecimento semântico. O chamador persiste os quadros no IndexedDB
 * local como parte do treinamento; o resultado não pode conter coordenadas, pois a execução futura
 * deve olhar a interface atual e reencontrar cada alvo.
 */
export async function assimilarEnsinamento(opcoes: {
  objetivo: string;
  transcricao: string;
  quadros: QuadroDoEnsino[];
  chaveGemini?: string;
  modelo?: string;
}): Promise<EnsinamentoAssimilado> {
  const partes: any[] = [{ text: [
    `TAREFA QUE A PESSOA ESTÁ ENSINANDO: ${opcoes.objetivo}`,
    `TRANSCRIÇÃO COMPLETA DA EXPLICAÇÃO:\n${opcoes.transcricao}`,
    '',
    'Transforme a demonstração em passos semânticos reutilizáveis. Cada imagem é um quadro atual',
    'da tela compartilhada no momento indicado. Use nomes visíveis de menus, botões, abas e sinais',
    'de sucesso. NÃO grave coordenadas, não invente passos, não inclua senhas/tokens/texto privado',
    'digitado e não transforme isto em macro cega. Se houver pagamento, pare antes de confirmar.',
    '',
    'Responda em JSON: {"resumo":"...","passos":[{"acao":"clicar|abrir|rolar|digitar|tecla|esperar",',
    '"alvo":"descrição visível e sem coordenadas","quandoUsar":"como reconhecer esta tela",',
    '"comoConfirmar":"o que deve aparecer depois"}]}.'
  ].join('\n') }];

  opcoes.quadros.slice(0, 12).forEach((quadro, indice) => {
    partes.push({ text: `QUADRO ${indice + 1} — ${new Date(quadro.capturadoEm).toISOString()} — fala associada: ${quadro.fala || '(sem fala)'}` });
    const dados = quadro.imagem.includes(',') ? quadro.imagem.split(',')[1] : quadro.imagem;
    partes.push({ inlineData: { mimeType: 'image/jpeg', data: dados } });
  });

  const resposta = await fetch('/api/gemini/generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientApiKey: opcoes.chaveGemini || undefined,
      model: opcoes.modelo || 'gemini-3.7-flash',
      contents: [{ role: 'user', parts: partes }],
      config: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(dados?.error || `Não foi possível assimilar a demonstração (HTTP ${resposta.status}).`);
  const texto = dados?.text
    ?? dados?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    ?? '';
  return lerEnsinamentoAssimilado(texto);
}
