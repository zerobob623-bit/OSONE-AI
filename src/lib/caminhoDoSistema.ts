/**
 * ONDE FICA, DE VERDADE, O CAMINHO QUE A PESSOA PEDIU.
 *
 * ====== OS ERROS QUE ISTO CONSERTA, TODOS RELATADOS EM USO ======
 *
 * 1. "Pedi home/usuario/downloads e ele foi procurar em .../OSONE-AI/downloads."
 *    Um caminho sem a barra inicial é RELATIVO, e relativo é sempre relativo a alguma coisa. Sem
 *    ninguém decidir a quê, ele acabava relativo à pasta onde o programa roda — a pasta do próprio
 *    OSONE. Daí o nome do app aparecer no meio de um caminho que ninguém escreveu assim.
 *
 * 2. "Ele pede Downloads e o sistema nega o acesso."
 *    No Linux, 'downloads' e 'Downloads' são pastas diferentes. Um modelo escreve em minúscula com
 *    naturalidade, e a pasta existe com maiúscula — o erro que volta é "não existe" ou "acesso
 *    negado", que aponta para um problema de permissão que não existe.
 *
 * 3. "Ele tenta abrir caminho de Windows num Linux."
 *    C:\Users\Fulano\Downloads não é um caminho inválido: é um caminho de OUTRO sistema. Tratá-lo
 *    como texto qualquer produz um erro que não ajuda ninguém.
 *
 * ====== A IDEIA QUE RESOLVE OS TRÊS ======
 *
 * Não adivinhar: MEDIR. Cada regra aqui propõe um candidato e PERGUNTA AO DISCO se ele existe. O
 * primeiro que existe vence, e o caminho volta acompanhado de como foi resolvido — para o agente
 * poder dizer ao usuário "você pediu X, eu abri Y", em vez de abrir outra coisa em silêncio.
 *
 * O disco entra por uma sonda, e não por chamadas diretas: assim a regra pode ser conferida contra
 * um disco de mentira, com as pastas exatas de cada caso, sem depender de como está a máquina de
 * quem roda o teste.
 */

export interface SondaDeDisco {
  existe: (caminho: string) => boolean;
  /** Nomes dentro de uma pasta. Usado para casar sem diferenciar maiúscula de minúscula. */
  listar: (pasta: string) => string[];
  /** A pasta pessoal do usuário deste computador. */
  casa: string;
  ehWindows: boolean;
}

export interface CaminhoResolvido {
  caminho: string;
  /** Em português, o que foi feito. Vazio quando o caminho veio pronto e existia. */
  comoResolveu: string;
  /** O caminho existe no disco? Falso não é erro: pode ser uma pasta a criar. */
  existe: boolean;
}

const separador = (ehWindows: boolean) => (ehWindows ? '\\' : '/');

/** Junta pedaços com o separador do sistema, sem duplicar barras. */
function juntar(ehWindows: boolean, ...partes: string[]): string {
  const sep = separador(ehWindows);
  return partes
    .filter(p => p !== '' && p !== undefined && p !== null)
    .join(sep)
    .replace(new RegExp(`\\${sep}{2,}`, 'g'), sep);
}

function pedacos(caminho: string): string[] {
  return caminho.split(/[\\/]+/).filter(Boolean);
}

export function ehAbsoluto(caminho: string, ehWindows: boolean): boolean {
  const t = (caminho || '').trim();
  if (ehWindows) return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith('\\\\');
  return t.startsWith('/');
}

/**
 * Raízes de sistema que, escritas SEM a barra inicial, quase certamente são um caminho absoluto a
 * que faltou a barra.
 *
 * É o caso exato do relato: "home/usuario/downloads". Ninguém tem uma pasta chamada "home" dentro
 * da própria pasta pessoal; quem escreve isso está falando de /home. Tratar como relativo era o
 * que enfiava a pasta do app no meio do caminho.
 */
const RAIZES_SEM_BARRA = ['home', 'users', 'mnt', 'media', 'opt', 'var', 'usr', 'srv', 'tmp', 'etc', 'root'];

/**
 * Um caminho escrito no vocabulário de OUTRO sistema operacional.
 *
 * Devolve a tradução quando ela é honesta, e null quando não é. "C:\Users\Fulano\Downloads" num
 * Linux vira a pasta pessoal + "Downloads": a parte depois do usuário é a que carrega a intenção,
 * e o resto é endereço de uma máquina que não é esta. Já "D:\Projetos" não vira nada — não existe
 * segunda unidade a que corresponder, e inventar uma seria pior do que dizer que não dá.
 */
export function traduzirDeOutroSistema(caminho: string, sonda: SondaDeDisco): { caminho: string; explicacao: string } | null {
  const t = (caminho || '').trim();

  if (!sonda.ehWindows) {
    // Caminho de Windows pedido num Linux/macOS.
    const comUsuario = t.match(/^[a-zA-Z]:[\\/]+Users[\\/]+[^\\/]+[\\/]*(.*)$/i);
    if (comUsuario) {
      const resto = comUsuario[1].replace(/\\/g, '/');
      return {
        caminho: juntar(false, sonda.casa, ...pedacos(resto)),
        explicacao: `"${t}" é um caminho de Windows. Aqui é ${sonda.ehWindows ? 'Windows' : 'Linux/macOS'}, então usei a pasta pessoal deste computador no lugar de "C:\\Users\\<usuário>".`
      };
    }
    if (/^[a-zA-Z]:[\\/]/.test(t)) {
      return null; // Unidade sem equivalente: melhor recusar do que inventar.
    }
    return null;
  }

  // Caminho POSIX pedido num Windows.
  const comHome = t.match(/^\/home\/[^/]+\/?(.*)$/i) || t.match(/^\/Users\/[^/]+\/?(.*)$/i);
  if (comHome) {
    return {
      caminho: juntar(true, sonda.casa, ...pedacos(comHome[1])),
      explicacao: `"${t}" é um caminho de Linux/macOS. Aqui é Windows, então usei a pasta pessoal deste computador no lugar de "/home/<usuário>".`
    };
  }
  return null;
}

/**
 * Conserta a diferença de maiúscula/minúscula, segmento por segmento, perguntando ao disco.
 *
 * 'Downloads' e 'downloads' são pastas diferentes no Linux, e o erro que volta ao errar a caixa é
 * "não existe" — que soa como problema de permissão e manda quem lê investigar o lugar errado.
 * A correção é feita um pedaço de cada vez porque só assim ela pode ser MEDIDA: cada segmento é
 * confirmado no disco antes de o seguinte ser tentado.
 */
export function consertarCaixa(caminho: string, sonda: SondaDeDisco): string | null {
  const partes = pedacos(caminho);
  if (partes.length === 0) return null;

  const ehWin = sonda.ehWindows;
  // No Windows a caixa não diferencia, então não há o que consertar.
  if (ehWin) return sonda.existe(caminho) ? caminho : null;

  let atual = '';
  for (const parte of partes) {
    const tentativa = juntar(false, atual, parte);
    const comBarra = atual === '' ? `/${parte}` : tentativa;
    if (sonda.existe(comBarra)) {
      atual = comBarra;
      continue;
    }
    const pai = atual === '' ? '/' : atual;
    const irmaos = sonda.listar(pai) || [];
    const casado = irmaos.find(n => n.toLowerCase() === parte.toLowerCase());
    if (!casado) return null;
    atual = juntar(false, pai === '/' ? '' : pai, casado);
    if (!atual.startsWith('/')) atual = `/${atual}`;
  }
  return atual;
}

export interface OpcoesDeResolucao {
  /** Nomes por idioma das pastas conhecidas: { downloads: ['Downloads', 'Descargas'], ... } */
  apelidosDePastas?: Record<string, string[]>;
}

/**
 * O caminho que a pessoa pediu, resolvido no disco desta máquina.
 *
 * A ordem das regras é a ordem da certeza: o que é inequívoco primeiro, o palpite por último — e
 * todo palpite é confirmado no disco antes de ser devolvido.
 */
export function resolverCaminho(pedido: string, sonda: SondaDeDisco, opcoes: OpcoesDeResolucao = {}): CaminhoResolvido {
  const bruto = String(pedido || '').trim();
  const ehWin = sonda.ehWindows;
  const pronto = (caminho: string, comoResolveu = ''): CaminhoResolvido =>
    ({ caminho, comoResolveu, existe: sonda.existe(caminho) });

  if (!bruto) return pronto(sonda.casa, 'Nenhum caminho informado; usei a pasta pessoal.');

  // ====== 1) O TIL ======
  if (bruto === '~') return pronto(sonda.casa);
  if (/^~[\\/]/.test(bruto)) {
    const alvo = juntar(ehWin, sonda.casa, ...pedacos(bruto.slice(2)));
    const consertado = !sonda.existe(alvo) ? consertarCaixa(alvo, sonda) : null;
    return consertado
      ? pronto(consertado, `Ajustei maiúsculas/minúsculas: "${bruto}" existe como "${consertado}".`)
      : pronto(alvo);
  }

  // ====== 2) CAMINHO DE OUTRO SISTEMA ======
  const traduzido = traduzirDeOutroSistema(bruto, sonda);
  if (traduzido) {
    const consertado = !sonda.existe(traduzido.caminho) ? consertarCaixa(traduzido.caminho, sonda) : null;
    return pronto(consertado || traduzido.caminho, traduzido.explicacao);
  }
  if (!ehWin && /^[a-zA-Z]:[\\/]/.test(bruto)) {
    return {
      caminho: bruto,
      existe: false,
      comoResolveu: `"${bruto}" é um caminho de Windows (unidade "${bruto[0]}:") e este computador é Linux/macOS, onde não existem letras de unidade. ` +
        `Diga o caminho começando de "/" ou de "~", ou o nome da pasta (Downloads, Documentos, Área de Trabalho).`
    };
  }

  // ====== 3) ABSOLUTO ======
  if (ehAbsoluto(bruto, ehWin)) {
    if (sonda.existe(bruto)) return pronto(bruto);
    const consertado = consertarCaixa(bruto, sonda);
    return consertado
      ? pronto(consertado, `Ajustei maiúsculas/minúsculas: "${bruto}" existe como "${consertado}".`)
      : pronto(bruto);
  }

  // ====== 4) FALTOU A BARRA INICIAL ======
  // "home/usuario/downloads" — o caso do relato. Ninguém tem uma pasta "home" dentro da própria
  // pasta pessoal, então isto é um caminho absoluto a que faltou a barra.
  const primeiro = pedacos(bruto)[0]?.toLowerCase();
  if (!ehWin && primeiro && RAIZES_SEM_BARRA.includes(primeiro)) {
    const comBarra = `/${pedacos(bruto).join('/')}`;
    if (sonda.existe(comBarra)) {
      return pronto(comBarra, `Entendi "${bruto}" como "${comBarra}" (faltava a barra do começo).`);
    }
    const consertado = consertarCaixa(comBarra, sonda);
    if (consertado) {
      return pronto(consertado, `Entendi "${bruto}" como "${consertado}" (faltava a barra do começo, e ajustei maiúsculas).`);
    }
  }

  // ====== 5) APELIDO DE PASTA CONHECIDA ======
  const apelidos = opcoes.apelidosDePastas || {};
  const chave = bruto.toLowerCase().replace(/\s+/g, '_');
  const chaveDoApelido = Object.keys(apelidos).find(k =>
    k === chave || apelidos[k].some(n => n.toLowerCase().replace(/\s+/g, '_') === chave)
  );
  if (chaveDoApelido) {
    for (const nome of apelidos[chaveDoApelido]) {
      const completo = nome ? juntar(ehWin, sonda.casa, nome) : sonda.casa;
      if (sonda.existe(completo)) {
        return pronto(completo, nome && nome.toLowerCase() !== bruto.toLowerCase()
          ? `Nesta máquina a pasta "${bruto}" se chama "${nome}".` : '');
      }
    }
    const padrao = apelidos[chaveDoApelido][0];
    return pronto(padrao ? juntar(ehWin, sonda.casa, padrao) : sonda.casa);
  }

  // ====== 6) RELATIVO: SEMPRE À PASTA PESSOAL, NUNCA À DO APP ======
  // É a regra que impedia o nome do OSONE de aparecer no meio de um caminho que ninguém escreveu
  // assim. "Relativo a onde o programa está rodando" nunca é o que a pessoa quis dizer.
  const naCasa = juntar(ehWin, sonda.casa, ...pedacos(bruto));
  if (sonda.existe(naCasa)) return pronto(naCasa);
  const consertado = consertarCaixa(naCasa, sonda);
  return consertado
    ? pronto(consertado, `Ajustei maiúsculas/minúsculas: "${bruto}" existe como "${consertado}".`)
    : pronto(naCasa);
}
