import { useState, useRef } from 'react';
import { PendingLocalAgentConfirmation } from '../components/LocalAgentConfirmModal';
import { mirarNaInterface } from '../lib/mirarNaInterface';
import { mirarPorVisao } from '../lib/mirarPorVisao';
import { assinaturaDaImagem, historicoVazio, HistoricoDeEsperas } from '../lib/esperarTela';
import { PassoDoPlano, RelatorioDoPlano, ResultadoDoPasso, executarPlano, validarPlano } from '../lib/planoDeAcoes';
import {
  AnotacaoDoAgente, INSTRUCAO_DO_AGENTE, RelatorioDoAgente, VoltaDoAgente, trabalharAteConcluir
} from '../lib/agenteAutonomo';
import { aprenderAutomacao, pistasDaAutomacao } from '../lib/historicoDoCowork';
import { MetadadosDaCaptura, novoIdDeCaptura, validarCapturaAtual } from '../lib/capturaAtual';

/** Chave e modelo usados quando o motor precisa OLHAR a tela para achar um alvo. */
export interface VisaoDoMotor {
  chaveGemini?: string;
  modeloGemini?: string;
}

/** Em qual tela o agente está trabalhando: a sua, ou uma só dele. */
export interface EstadoDaAreaParalela {
  ligada: boolean;
  /** Falso quando o sistema não tem como oferecer uma tela separada (hoje: fora do Linux). */
  suportada: boolean;
  largura?: number;
  altura?: number;
  gerenciadorDeJanelas?: string | null;
  /** O texto que a aba mostra — em português, dizendo o que isso significa na prática. */
  explicacao?: string;
}

/** Uma janela do sistema, como o agente local a enxerga. */
export interface JanelaDeTrabalho {
  id: string;
  titulo: string;
  app: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ativa?: boolean;
}

export interface CapturaConfirmada extends MetadadosDaCaptura {
  idadeMs: number;
}

/**
 * Quantas voltas do laço voltam para o modelo a cada decisão.
 *
 * O histórico inteiro cresceria sem limite numa tarefa longa, e uma tarefa longa é justamente
 * aquela em que ele não pode acabar estourando o contexto no meio. As últimas voltas são as que
 * explicam a tela atual; o objetivo, que é o que não pode se perder, vai inteiro em toda rodada.
 */
const VOLTAS_NO_CONTEXTO = 12;

/**
 * Pergunta ao modelo qual é a PRÓXIMA ação, com a foto da janela à frente.
 *
 * É aqui que a "visão computacional" acontece de verdade: não é um roteiro escrito antes e
 * executado às cegas — a cada rodada o modelo recebe a imagem do estado atual e decide olhando.
 * É por isso que ele consegue lidar com o que ninguém previu (um aviso de cookies, um login, um
 * botão que mudou de lugar): para ele, não existe "imprevisto", existe a tela que está ali.
 */
/**
 * O QUE ESTE COMPUTADOR É — dito ao agente antes de ele decidir qualquer coisa.
 *
 * Sem isto ele agia às cegas sobre o sistema: tentava caminho de Windows num Linux, escrevia
 * "Downloads" onde a pasta se chama "Transferências", chutava o nome do navegador. Nenhum desses
 * é erro de raciocínio — é falta de um dado que a máquina sabe e ele não.
 *
 * Vai em TODA rodada, junto da foto, e não só na primeira: o agente decide uma ação por vez, e
 * uma informação dada só no começo se perde no meio de uma tarefa longa exatamente quando começa a
 * fazer falta.
 */
function descreverOComputador(ambiente: any, area?: EstadoDaAreaParalela | null): string {
  if (!ambiente?.osName) return '';
  const pastas = Object.entries(ambiente.userFolders || {});
  return [
    `ESTE COMPUTADOR: ${ambiente.osName} (${ambiente.platform}). Usuário "${ambiente.userName}".`,
    `Pasta pessoal: ${ambiente.homeDir}. Separador de caminho: "${ambiente.pathSeparator}".`,
    pastas.length
      ? `PASTAS DESTE USUÁRIO, com o nome REAL que elas têm aqui (use exatamente estes):\n${pastas.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
      : '',
    ambiente.platform === 'win32'
      ? 'Use caminhos de Windows (C:\\...). NUNCA use caminhos como /home/usuario.'
      : 'Use caminhos de Linux/macOS começando com "/" ou "~". NUNCA use caminhos como C:\\Users\\... — aqui não existem letras de unidade.',
    area?.ligada
      ? `Você está trabalhando numa TELA SÓ SUA (${area.largura}x${area.altura}), separada da tela do usuário. As janelas que você abrir nascem lá.`
      : ''
  ].filter(Boolean).join('\n');
}

/**
 * De quantas voltas o ERRO vai por extenso, e não só o relato.
 *
 * O histórico comprime cada volta numa linha, e isso está certo para uma tarefa longa. Mas as
 * falhas eram comprimidas junto: sobrava "[FALHOU] ia clicar em Enviar → não achei", sem o motivo
 * que o computador devolveu. O modelo ficava sabendo QUE falhou e não POR QUE — que é exatamente
 * o dado de que ele precisa para não tentar de novo pelo mesmo caminho. As últimas voltas são as
 * que explicam a tela atual; nelas o erro vai inteiro.
 */
const VOLTAS_COM_ERRO_POR_EXTENSO = 3;

/**
 * SÓ A PÁGINA MAIS RECENTE VAI POR EXTENSO. AS ANTERIORES VIRAM UMA LINHA.
 *
 * Sem isto, ler páginas envenena o próprio contexto que torna a leitura útil. O relato de um
 * "ler_pagina" carrega o texto inteiro da página — até 12 mil caracteres — e o histórico manda os
 * relatos das últimas 12 voltas ao modelo A CADA RODADA. Três páginas lidas viram ~36 mil
 * caracteres repetidos em toda decisão, empurrando para fora justamente o objetivo e o que ele já
 * tentou. O sintoma seria cruel: quanto MAIS ele pesquisasse, pior ele decidiria.
 *
 * Manter só a última inteira também é o que dá sentido ao caderno. A regra "anote enquanto lê"
 * deixa de ser conselho e passa a ser a única forma de o conteúdo sobreviver — que é exatamente o
 * comportamento desejado, porque o que está no caderno vem com fonte e o que está no relato, não.
 */
const ACOES_QUE_TRAZEM_TEXTO_LONGO = new Set(['ler_pagina']);

export function resumirOQueJaFoiFeito(historico: VoltaDoAgente[]): string {
  const recentes = historico.slice(-VOLTAS_NO_CONTEXTO);
  const primeiroIndice = historico.length - recentes.length;
  const ultimaLeitura = recentes.map(v => v.acao).lastIndexOf('ler_pagina');

  return recentes.map((v, i) => {
    const numero = primeiroIndice + i + 1;
    const detalhe = v.erro && i >= recentes.length - VOLTAS_COM_ERRO_POR_EXTENSO
      ? ` [motivo: ${v.erro}]`
      : '';

    const relato = (v.ok && ACOES_QUE_TRAZEM_TEXTO_LONGO.has(v.acao) && i !== ultimaLeitura)
      ? `Li ${String(v.args?.url || 'a página')} — o conteúdo já saiu do seu contexto. Se precisar dele de novo, use o que anotou, ou leia a página outra vez.`
      : v.relato;

    return `${numero}. [${v.ok ? 'ok' : 'FALHOU'}] ${v.pensamento} → ${relato}${detalhe}`;
  }).join('\n');
}

/**
 * ====== PARAR DE AGIR E LER A TELA ======
 *
 * Esta é a outra pergunta que o COWORK sabe fazer, e ela existe por um motivo concreto: o modelo
 * que decide mal sob pressão descreve bem uma imagem parada. São habilidades diferentes, e o laço
 * só usava a primeira — inclusive quando estava travado, quando ela é a que menos ajuda.
 *
 * Repare no que NÃO tem aqui: não pede ação, não pede JSON, não manda a instrução do agente. Se
 * mandasse, seria a mesma pergunta de sempre com outro nome, e a resposta seria a mesma decisão de
 * sempre — que é justamente o que travou. O que se pede é o que faltava: os RÓTULOS que estão
 * escritos na tela. Por isso funciona no mesmo modelo gratuito, sem trocar por um mais caro.
 */
const INSTRUCAO_DE_LEITURA_DA_TELA = `Você são os OLHOS do OSONE COWORK, que está operando o computador de alguém e TRAVOU nesta tela.

Você NÃO decide ação nenhuma e NÃO responde JSON — outra parte do sistema faz isso. Seu trabalho é olhar a foto e DESCREVER o que está ali, porque quem decide travou justamente por não ter entendido esta tela.

Responda em português, em texto corrido curto (no máximo 12 linhas), nesta ordem:

1. QUE JANELA É ESTA: página de site, DIÁLOGO DE ARQUIVO DO SISTEMA (escolher/salvar arquivo), menu suspenso, alerta, assistente de etapas, aviso de cookie? Se for diálogo de arquivo, diga isso com todas as letras.
2. OS RÓTULOS: transcreva o texto EXATO de cada botão, aba e campo clicável que você consegue ler — do jeito que está escrito na tela, sem traduzir e sem trocar por sinônimo. Onde for só um ícone, descreva o desenho e diga onde ele fica.
3. QUAL DELES AVANÇA a tarefa do usuário, e por quê. Lembre que o botão quase nunca leva o nome da tarefa: enviar um arquivo se confirma em "Abrir"; baixar se confirma em "Salvar"; anexar pode ser "Selecionar" ou "Escolher".
4. O QUE NÃO FAZER aqui, olhando o que já foi tentado sem sucesso. Se o caminho tentado não existe nesta tela, diga onde ele provavelmente está.

Se esta tela não tem nada a ver com a tarefa, diga isso claramente e diga em que tela a pessoa deveria estar.`;

const PORQUE_TRAVOU: Record<string, string> = {
  'falhas-seguidas': 'as últimas ações falharam, uma atrás da outra',
  'ciclo': 'ele está andando em círculo: já passou por esta mesma tela e voltou para ela',
  'sem-decisao': 'ele não conseguiu sequer formular uma ação para esta tela',
  'regressao': 'ele tentou FECHAR o que acabou de abrir em vez de usar o que apareceu — sinal de que procurou um botão e não achou'
};

async function estudarATelaComOModelo(
  objetivo: string,
  foto: string | null,
  historico: VoltaDoAgente[],
  motivo: string,
  janela: JanelaDeTrabalho | null,
  visao?: VisaoDoMotor,
  ambiente?: any,
  area?: EstadoDaAreaParalela | null
): Promise<string> {
  if (!foto) {
    throw new Error('Não consegui fotografar a janela para estudar a tela.');
  }

  const contexto = [
    `TAREFA QUE O AGENTE ESTÁ TENTANDO FAZER: ${objetivo}`,
    descreverOComputador(ambiente, area),
    janela ? `JANELA DA FOTO: "${janela.titulo}" (${janela.app}), ${janela.width}x${janela.height}.` : '',
    `POR QUE ELE PAROU PARA TE PERGUNTAR: ${PORQUE_TRAVOU[motivo] || 'ele travou'}.`,
    historico.length ? `O QUE ELE JÁ TENTOU (o mais recente por último):\n${resumirOQueJaFoiFeito(historico)}` : '',
    'Descreva a tela da foto seguindo os quatro pontos.'
  ].filter(Boolean).join('\n\n');

  const dados = foto.includes(',') ? foto.split(',')[1] : foto;

  return chamarModeloComAFoto({
    partes: [{ inlineData: { mimeType: 'image/png', data: dados } }, { text: contexto }],
    instrucao: INSTRUCAO_DE_LEITURA_DA_TELA,
    visao,
    /**
     * Mais baixa que a da decisão, e não mais alta.
     *
     * O que tira o modelo do sulco aqui é a PERGUNTA ter mudado, não a temperatura. E o produto
     * desta chamada é leitura de texto na imagem: um rótulo transcrito errado com criatividade
     * seria pior do que o problema que ela veio resolver — mandaria o agente clicar num botão que
     * não existe, com a confiança de quem acha que leu.
     */
    temperatura: 0.15,
    json: false,
    oQueEstavaFazendo: 'estudar a tela'
  });
}

// ============================================================================
// LER A INTERNET SEM ABRIR NAVEGADOR
// ============================================================================

/** Quantos resultados voltam de uma busca. Mais do que isto vira lista para o modelo escolher no chute. */
const RESULTADOS_POR_BUSCA = 6;

/**
 * Pesquisa na web pelo próprio Gemini, com a busca do Google ligada.
 *
 * Não é o modelo respondendo de cabeça: com "googleSearch" nas ferramentas, ele pesquisa de
 * verdade e a resposta vem acompanhada dos ENDEREÇOS consultados (groundingChunks). São esses
 * endereços que interessam aqui — o resumo que ele escreve é descartado de propósito.
 *
 * O motivo de descartar: quem vai decidir o que fazer com a informação é o agente, na volta
 * seguinte, e ele precisa do texto ORIGINAL da página (via "ler_pagina") e não do resumo de um
 * resumo. Duas camadas de síntese antes de alguém olhar o texto é como um número certo vira um
 * número quase certo.
 */
async function procurarNaWeb(
  consulta: string, visao?: VisaoDoMotor
): Promise<{ resultados?: Array<{ titulo: string; url: string }>; error?: string }> {
  try {
    const res = await fetch('/api/gemini/generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientApiKey: visao?.chaveGemini || undefined,
        model: visao?.modeloGemini || 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: [{ text: `Pesquise na web: ${consulta}` }] }],
        config: { tools: [{ googleSearch: {} }] }
      })
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) return { error: corpo?.error || `A busca falhou (HTTP ${res.status}).` };

    const pedacos = corpo?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const resultados: Array<{ titulo: string; url: string }> = [];
    const jaVistos = new Set<string>();
    for (const pedaco of pedacos) {
      const url = pedaco?.web?.uri;
      if (!url || jaVistos.has(url)) continue;
      jaVistos.add(url);
      resultados.push({ titulo: pedaco.web.title || url, url });
      if (resultados.length >= RESULTADOS_POR_BUSCA) break;
    }
    if (!resultados.length) {
      return { error: `A busca por "${consulta}" não devolveu nenhuma fonte. Tente outras palavras.` };
    }
    return { resultados };
  } catch (err: any) {
    return { error: err?.message || 'Não consegui pesquisar agora.' };
  }
}

/**
 * Lê o texto de uma página pelo /api/scrape, que já existe e já tem a proteção contra SSRF.
 *
 * Essa proteção deixa de ser precaução e passa a ser estrutural aqui. Ela foi escrita para uma URL
 * que a PESSOA digita; agora quem escolhe o endereço é o agente, a partir de resultados de busca e
 * de links lidos em páginas de terceiros. Basta uma página sugerir um endereço interno para o
 * agente segui-lo sem desconfiar — e é a checagem do IP resolvido, do outro lado, que segura isso.
 */
async function lerPaginaDaWeb(url: string): Promise<{ texto?: string; error?: string }> {
  try {
    const res = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const corpo = await res.json().catch(() => null);
    if (!res.ok) return { error: corpo?.error || `Não consegui ler a página (HTTP ${res.status}).` };
    return { texto: String(corpo?.text || '') };
  } catch (err: any) {
    return { error: err?.message || 'Não consegui ler a página agora.' };
  }
}

async function perguntarProximaAcao(
  objetivo: string,
  foto: string | null,
  historico: VoltaDoAgente[],
  janela: JanelaDeTrabalho | null,
  visao?: VisaoDoMotor,
  ambiente?: any,
  area?: EstadoDaAreaParalela | null,
  memoriaDaAutomacao?: string,
  frameAtual?: CapturaConfirmada | null,
  orientacao?: string,
  anotacoes?: AnotacaoDoAgente[]
): Promise<string> {
  const feito = resumirOQueJaFoiFeito(historico);

  const contexto = [
    `OBJETIVO DO USUÁRIO: ${objetivo}`,
    memoriaDaAutomacao,
    descreverOComputador(ambiente, area),
    /**
     * SEM JANELA NÃO É ERRO — É OUTRO TIPO DE TAREFA.
     *
     * Uma tarefa só de pesquisa não precisa de janela nenhuma: procurar, ler e anotar não tocam no
     * computador. Antes, o silêncio aqui fazia o agente decidir "clicar" contra uma tela que não
     * existe, falhar duas vezes e desistir — parecendo incapaz de uma coisa que ele sabe fazer.
     * Dizer o que ele TEM em vez de deixá-lo descobrir errando é a diferença entre as duas coisas.
     */
    janela
      ? `JANELA EM QUE VOCÊ ESTÁ: "${janela.titulo}" (${janela.app}), ${janela.width}x${janela.height}.`
      : 'VOCÊ NÃO TEM JANELA DE TRABALHO nesta sessão: ninguém escolheu uma tela para você operar. '
        + 'Você PODE pesquisar na web, ler páginas e anotar — é assim que se resolve uma tarefa de trazer informação. '
        + 'Você NÃO pode clicar, digitar nem rolar, porque não há tela onde fazer isso. Se a tarefa exigir mexer no '
        + 'computador, use "desistir" dizendo que a pessoa precisa escolher a janela primeiro.',
    foto
      ? `A IMAGEM ACIMA é o frame ATUAL ${frameAtual?.captureId || '(sem id)'} dessa janela, ` +
        `confirmado há ${Math.max(0, frameAtual?.idadeMs || 0)}ms. Olhe-a antes de decidir.`
      : 'ATENÇÃO: não foi possível fotografar a janela nesta rodada.',
    historico.length ? `O QUE VOCÊ JÁ FEZ:\n${feito}` : 'Você ainda não fez nada. Esta é a primeira ação.',
    /**
     * A LEITURA DA TELA VEM DEPOIS DO HISTÓRICO E ANTES DA PERGUNTA, DE PROPÓSITO.
     *
     * Ela só existe porque ele travou: é o resultado de ter parado de agir para olhar a tela com
     * outra pergunta. Posta aqui, ela é a última coisa lida antes de decidir — e é a única parte
     * do contexto que contém os RÓTULOS REAIS dos botões, que é o que faltava quando ele
     * procurava "Enviar" numa janela cujo botão se chama "Abrir".
     */
    orientacao
      ? `VOCÊ JÁ TRAVOU NESTA TAREFA E PAROU PARA LER A TELA. Foi isto que você apurou:\n${orientacao}\n\n` +
        `Use esta leitura: ela tem o nome REAL dos botões. Não volte a procurar um botão com o nome da tarefa, ` +
        `e não refaça o caminho que já não deu certo.`
      : '',
    historico.some(v => !v.ok || /não mudou|nao mudou|não achei|nao achei|não consegui|nao consegui/i.test(`${v.relato} ${v.erro || ''}`))
      ? 'SINAL DE EMPACAMENTO: algo recente falhou, não mudou a tela ou não foi encontrado. NÃO repita a mesma ação. Formule uma hipótese nova e teste uma alternativa segura: menu de três pontos, clique_direito no item, rolagem curta, campo de busca, botão Mais/More, ou abrir endereço direto. NÃO feche o que você mesmo acabou de abrir.'
      : '',
    /**
     * O CADERNO VAI INTEIRO, E VAI PERTO DA PERGUNTA.
     *
     * O histórico das voltas é cortado em 12 justamente para uma tarefa longa não estourar o
     * contexto — e é esse corte que faz o que ele leu no começo desaparecer no meio. As anotações
     * são o contrapeso: pequenas, escritas por ele mesmo, e as únicas que não podem sumir, porque
     * são elas que sustentam a resposta final. Sem isto, o agente termina escrevendo de memória
     * sobre páginas que já saíram do seu campo de visão.
     */
    anotacoes?.length
      ? `SEU CADERNO (o que você já anotou, com as fontes):\n${anotacoes.map((a, i) => `${i + 1}. ${a.fato} [fonte: ${a.fonte}]`).join('\n')}`
      : '',
    'Qual é a PRÓXIMA ação? Responda só o JSON.'
  ].filter(Boolean).join('\n\n');

  const partes: any[] = [];
  if (foto) {
    const dados = foto.includes(',') ? foto.split(',')[1] : foto;
    partes.push({ inlineData: { mimeType: 'image/png', data: dados } });
  }
  partes.push({ text: contexto });

  return chamarModeloComAFoto({
    partes, visao,
    instrucao: INSTRUCAO_DO_AGENTE,
    // Baixa, mas não zero: decidir o passo seguinte tem mais de um caminho certo, e um pouco
    // de variação ajuda quando o botão está escondido em menus/alternativas seguras.
    temperatura: 0.28,
    json: true,
    oQueEstavaFazendo: 'decidir a ação'
  });
}

/**
 * A ida ao modelo com a foto na mão. Serve às DUAS perguntas que o COWORK faz.
 *
 * São perguntas de natureza oposta — uma quer uma ação em JSON, a outra quer a tela descrita em
 * português — e é justamente por isso que o transporte é o mesmo: o que muda entre elas tem de
 * ficar visível no lugar da chamada (instrução, temperatura, formato), e não escondido em duas
 * cópias do mesmo fetch que depois divergem sozinhas.
 */
async function chamarModeloComAFoto(opcoes: {
  partes: any[];
  instrucao: string;
  temperatura: number;
  json: boolean;
  visao?: VisaoDoMotor;
  oQueEstavaFazendo: string;
}): Promise<string> {
  const controle = new AbortController();
  // “Pensando” por cinco minutos é uma falha, não trabalho. Em 45s a decisão curta já deveria ter
  // vindo; cancelar devolve um erro explícito ao laço e mantém o computador intocado.
  const limite = setTimeout(() => controle.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch('/api/gemini/generateContent', {
      method: 'POST', signal: controle.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientApiKey: opcoes.visao?.chaveGemini || undefined,
        model: opcoes.visao?.modeloGemini || 'gemini-3.6-flash',
        contents: [{ role: 'user', parts: opcoes.partes }],
        config: {
          systemInstruction: opcoes.instrucao,
          temperature: opcoes.temperatura,
          ...(opcoes.json ? { responseMimeType: 'application/json' } : {})
        }
      })
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Passei de 45 segundos ao ${opcoes.oQueEstavaFazendo} e cancelei para não ficar preso pensando.`);
    }
    throw err;
  } finally {
    clearTimeout(limite);
  }

  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(corpo?.error || `O modelo não respondeu ao ${opcoes.oQueEstavaFazendo} (HTTP ${res.status}).`);
  return corpo?.text
    ?? corpo?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    ?? '';
}

/**
 * Bridge com o Agente Local OSONE (app desktop opcional instalado pelo usuário) via /api/agent.
 * Operações que modificam arquivos (organizar pasta, mover para lixeira) exigem confirmação
 * humana explícita no painel de texto e são totalmente bloqueadas em sessões de voz.
 */
/** Uma ação do motor, como ela aparece no painel: o que está fazendo e como terminou. */
export interface AcaoDoMotor {
  id: string;
  quando: number;
  rotulo: string;
  detalhe?: string;
  estado: 'executando' | 'ok' | 'erro' | 'parado';
  resultado?: string;
  /**
   * Quanto tempo a ação levou.
   *
   * Existe porque "está lento" não é diagnóstico: sem o tempo de cada passo, um minuto por ação
   * pode ser a leitura da tela, a ida ao agente, o modelo pensando ou a soma de tudo, e escolher
   * qual otimizar vira palpite. Com o número ao lado de cada linha, o passo caro se identifica
   * sozinho na primeira sequência que rodar.
   */
  duracaoMs?: number;
}

export function useLocalAgent() {
  const [pendingLocalAgentConfirmation, setPendingLocalAgentConfirmation] = useState<PendingLocalAgentConfirmation | null>(null);
  /**
   * O que o motor está fazendo, em ordem. Existe porque até agora a única pista de que algo
   * acontecia era um "Ação do Agente Local processada" que sumia da tela — sem saber qual ação,
   * quantas faltam, nem se travou. Ver a sequência é o que permite julgar se está funcionando.
   */
  const [acoesDoMotor, setAcoesDoMotor] = useState<AcaoDoMotor[]>([]);
  /**
   * Trava de parada. Fica num ref, e não em estado, porque precisa ser lida DENTRO de uma
   * sequência já em andamento — um estado só chegaria na próxima renderização, tarde demais para
   * interromper o que já está rodando.
   */
  const motorParadoRef = useRef(false);
  const [motorParado, setMotorParado] = useState(false);
  /** Rótulo da ação em andamento, ou null. É o que impede duas ações ao mesmo tempo. */
  const emExecucaoRef = useRef<string | null>(null);
  /**
   * Quando a tela foi olhada pela última vez, e se foi uma ampliação.
   *
   * Existe porque pedir no prompt não bastou: medido em uso real, o modelo clicou três vezes
   * seguidas sem NUNCA chamar 'capturar_tela', sempre no mesmo y — ou seja, chutando de memória
   * em vez de medir. Toda a mira em dois tempos era ignorada porque nada a exigia. Guardando a
   * última captura, o clique passa a poder ser recusado quando não houve leitura recente, o que
   * transforma o procedimento de recomendação em pré-requisito.
   */
  const ultimaCapturaRef = useRef<{ quando: number; ampliada: boolean; regiao?: { x0: number; y0: number; x1: number; y1: number } } | null>(null);
  /**
   * A última posição MEDIDA de um alvo, com o pixel exato ao lado da coordenada 0–1000.
   *
   * A escala 0–1000 é a linguagem do modelo, mas ela é grosseira: numa tela de 1920 cada degrau
   * vale quase 2px, então uma posição medida ao pixel volta arredondada e chega ao clique já com
   * um erro que ninguém introduziu de propósito. Guardando o pixel original, o clique feito na
   * coordenada que acabou de ser devolvida usa a medição inteira, e não a versão arredondada dela.
   */
  const ultimaMiraRef = useRef<{ quando: number; escala0a1000: { x: number; y: number }; pixel: { x: number; y: number } } | null>(null);
  /**
   * Quando o motor mexeu no computador pela última vez.
   *
   * O compartilhamento de tela lê esta marca para PARAR de mandar frames enquanto uma sequência
   * de controle está em curso. Enquanto o vídeo continuava correndo, o modelo tinha duas fontes
   * de imagem: a captura (tela inteira, alinhada com o clique) e o compartilhamento — que
   * costuma mostrar só a aba, começando abaixo da barra do navegador. Medir numa e clicar na
   * outra produz um desvio fixo, e era exatamente o que os registros mostravam: erro constante
   * de cerca de 45px para cima em toda tentativa, imune a qualquer melhoria na leitura.
   */
  const ultimaAcaoNoPcRef = useRef(0);

  /** Interrompe a sequência: a ação em curso termina, as seguintes são recusadas. */
  const pararMotor = () => {
    motorParadoRef.current = true;
    setMotorParado(true);
    setAcoesDoMotor(prev => prev.map(a => a.estado === 'executando' ? { ...a, estado: 'parado' as const } : a));
  };

  const retomarMotor = () => {
    motorParadoRef.current = false;
    setMotorParado(false);
  };

  const limparAcoesDoMotor = () => setAcoesDoMotor([]);
  const pendingLocalAgentResolveRef = useRef<((value: any) => void) | null>(null);
  const pendingLocalAgentTimerRef = useRef<any>(null);
  // Resolução da tela, lida uma vez e reaproveitada: ela não muda no meio de uma sessão, e
  // consultá-la a cada clique acrescentaria uma ida ao agente antes de cada ação.
  const telaCacheRef = useRef<{ width: number; height: number; offsetX: number; offsetY: number } | null>(null);

  /** Nome legível da ação, para o painel não mostrar jargão de ferramenta. */
  const rotularAcao = (toolName: string, args: any): string => {
    if (toolName !== 'controlar_pc') return toolName;
    const a = String(args?.acao || '');
    const mapa: Record<string, string> = {
      clicar: 'Clicar', mover_mouse: 'Mover o mouse', rolar: 'Rolar a tela',
      digitar: 'Digitar', tecla: 'Pressionar tecla', capturar_tela: 'Olhar a tela',
      abrir: 'Abrir', fechar: 'Fechar', terminal: 'Rodar comando',
      criar_pasta: 'Criar pasta', escrever_arquivo: 'Escrever arquivo', listar: 'Listar',
      localizar: 'Achar na tela', achar_texto: 'Achar na tela'
    };
    return mapa[a] || a || toolName;
  };

  const detalharAcao = (toolName: string, args: any): string | undefined => {
    if (toolName !== 'controlar_pc') return undefined;
    const a = String(args?.acao || '');
    if (a === 'clicar' || a === 'mover_mouse') {
      return args?.x !== undefined ? `x=${args.x}, y=${args.y}` : undefined;
    }
    if (a === 'capturar_tela') return args?.x !== undefined ? `ampliando em x=${args.x}, y=${args.y}` : 'tela inteira';
    if (a === 'localizar' || a === 'achar_texto') return `"${String(args?.alvo || args?.texto || '')}"`;
    if (a === 'digitar') return String(args?.texto || '').slice(0, 40);
    if (a === 'tecla') return String(args?.tecla || '');
    if (a === 'terminal') return String(args?.comando || '').slice(0, 60);
    return args?.caminho ? String(args.caminho).slice(0, 60) : undefined;
  };

  const executeLocalAgentCall = async (toolName: string, args: any, localAgentToken?: string, isVoiceSession: boolean = false, visao?: VisaoDoMotor): Promise<any> => {
    // Parada pedida pelo usuário: recusa antes de tocar na máquina dele. A mensagem vai para o
    // modelo para ele não insistir nem fingir que executou.
    if (motorParadoRef.current) {
      return { error: "O usuário PAROU o motor de ações. Não execute mais nada no computador dele e pergunte se ele quer retomar." };
    }

    /**
     * UMA AÇÃO POR VEZ.
     *
     * Sem esta trava, cada frase do usuário abria uma rodada nova enquanto a anterior ainda
     * rodava, e as ações se empilhavam sem limite — medido em uso real: cinco leituras de tela
     * simultâneas, cada uma consumindo quase um núcleo inteiro, e a máquina inteira parando. O
     * usuário via o efeito exato disso: "falo qualquer coisa e ele manda outra ação e outra e
     * outra e trava".
     *
     * A segunda ação é RECUSADA, não enfileirada: enfileirar só adiaria a mesma pilha. A recusa
     * volta como texto para o modelo, que assim sabe esperar em vez de insistir.
     */
    if (emExecucaoRef.current) {
      return {
        error: `Já existe uma ação em andamento no computador ("${emExecucaoRef.current}"). ` +
          `Espere ela terminar e usar o resultado dela antes de pedir outra — não repita nem tente um caminho alternativo agora.`
      };
    }

    if (toolName === 'controlar_pc') ultimaAcaoNoPcRef.current = Date.now();

    const idAcao = Math.random().toString(36).slice(2, 9);
    const comecou = Date.now();
    setAcoesDoMotor(prev => [
      { id: idAcao, quando: comecou, rotulo: rotularAcao(toolName, args), detalhe: detalharAcao(toolName, args), estado: 'executando' as const },
      ...prev
    ].slice(0, 60));

    const concluir = (resultado: any) => {
      const deuErro = !!resultado?.error;
      // Quando a busca por texto não acha, o que interessa não é o "não encontrei" e sim O QUE o
      // OCR leu de fato — é isso que revela se o problema é grafia, letra espaçada ou leitura
      // ruim. Sem mostrar essa lista, cada falha exigia adivinhação.
      const detalheDoErro = deuErro
        ? String(resultado.error) + (Array.isArray(resultado.textosVisiveis) && resultado.textosVisiveis.length
            ? ` | O OCR leu: ${resultado.textosVisiveis.slice(0, 25).join(' / ')}`
            : '')
        : undefined;
      setAcoesDoMotor(prev => prev.map(a => a.id === idAcao
        ? {
            ...a,
            estado: deuErro ? ('erro' as const) : ('ok' as const),
            duracaoMs: Date.now() - comecou,
            resultado: deuErro ? detalheDoErro!.slice(0, 600) : (resultado?.resumo ? String(resultado.resumo).slice(0, 160) : undefined)
          }
        : a));
      return resultado;
    };

    emExecucaoRef.current = rotularAcao(toolName, args);
    try {
      return concluir(await executarAcao(toolName, args, localAgentToken, isVoiceSession, visao));
    } finally {
      emExecucaoRef.current = null;
    }
  };

  const executarAcao = async (toolName: string, args: any, localAgentToken?: string, isVoiceSession: boolean = false, visao?: VisaoDoMotor): Promise<any> => {
    // Sem fallback para um token fixo: cada instalação gera seu próprio token forte em
    // config.json na primeira vez que o servidor sobe (ver localAgentService.ts). Usar um
    // valor padrão aqui seria o mesmo token público em toda instalação do OSONE — quem lesse
    // o código-fonte no GitHub teria acesso de terminal a qualquer computador rodando o agente.
    const token = (localAgentToken || '').trim();
    if (!token) {
      return {
        error: "Agente Local não configurado. Copie o token gerado em config.json (na pasta do OSONE) para o campo 'Token do Agente Local' nas Configurações do OSONE."
      };
    }

    const LOCAL_AGENT_URL = '/api/agent';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token.trim()}`
    };

    /**
     * Converte a coordenada que o MODELO informa (escala 0–1000) para o pixel real da tela.
     *
     * Por que 0–1000 e não pixels: o Gemini aponta posições em imagens nessa escala normalizada
     * por padrão — é o que ele foi treinado a produzir. Pedir pixels obrigava o modelo a adivinhar
     * a resolução da tela, que ele não tem como saber olhando uma foto sem régua. O resultado era
     * um erro sistemático em TODO clique: ele mandava "500" querendo dizer "meio da tela", e o
     * mouse ia para o pixel 500 — bem à esquerda do meio numa tela de 1440.
     *
     * A conversão acontece aqui, e não no endpoint, porque /mouse/move continua recebendo pixels
     * de verdade — é assim que o controle por gestos de mão (useVisionControl) o utiliza, e ele
     * já sabe a resolução real.
     */
    const dimensoesDaTela = async (): Promise<{ width: number; height: number; offsetX: number; offsetY: number } | null> => {
      if (telaCacheRef.current) return telaCacheRef.current;
      try {
        const res = await fetch(`${LOCAL_AGENT_URL}/screen-info`, { headers });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (!data?.width || !data?.height) return null;
        telaCacheRef.current = {
          width: Number(data.width),
          height: Number(data.height),
          offsetX: Number(data.offsetX) || 0,
          offsetY: Number(data.offsetY) || 0
        };
        return telaCacheRef.current;
      } catch {
        return null;
      }
    };

    /**
     * Traduz um par (x,y) na escala 0–1000 para pixels absolutos de tela.
     *
     * O valor é preso na faixa 0–1000 antes da conversão: nada garante que o número informado
     * caiba nela, e um 1400 solto viraria um clique fora da tela — que não erra o alvo, apenas
     * não acontece, sem nada explicando por quê. Preso na borda, o clique ao menos cai no ponto
     * mais próximo do que foi pedido.
     */
    const paraPixels = async (x: number, y: number): Promise<{ x: number; y: number } | null> => {
      const tela = await dimensoesDaTela();
      if (!tela) return null;
      const dentro = (v: number) => Math.min(1000, Math.max(0, v));
      return {
        x: Math.round(tela.offsetX + (dentro(x) / 1000) * tela.width),
        y: Math.round(tela.offsetY + (dentro(y) / 1000) * tela.height)
      };
    };

    try {
      /**
       * FERRAMENTA ÚNICA DE CONTROLE DO PC.
       *
       * Antes existiam 16 ferramentas separadas e sobrepostas para mexer no computador
       * (criarPasta, escreverArquivo, trash_local_file, delete_path, manage_path,
       * open_any_path, open_local_app, fecharAplicativo, close_window_or_app...). O modelo
       * tinha de escolher entre várias quase idênticas a cada pedido, e escolher errado era
       * fácil — o agente parecia burro por excesso de opção, não por falta de capacidade.
       * Uma ferramenta só, com uma ação nomeada, elimina a ambiguidade.
       */
      if (toolName === 'controlar_pc') {
        const acao = String(args?.acao || '').trim();
        const caminho = args?.caminho;
        const destino = args?.destino;
        const conteudo = args?.conteudo;
        const valor = args?.valor;

        const post = async (path: string, body: any) => {
          const res = await fetch(`${LOCAL_AGENT_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
          const data = await res.json().catch(() => null);
          if (!res.ok) return { error: data?.error || `Falha na ação '${acao}' (HTTP ${res.status}).` };
          return data || { success: true };
        };

        switch (acao) {
          case 'status': {
            const res = await fetch(`${LOCAL_AGENT_URL}/status`, { method: 'GET', headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Agente Local indisponível.' };
            return data;
          }
          case 'listar':
            return post('/path/list', { target: caminho || '' });
          case 'criar_pasta': {
            if (!caminho) return { error: "Informe 'caminho' com a pasta a criar (ex: '~/Documentos/Projeto')." };
            // Se o caminho não tiver nenhuma barra (ex: "Testes", só o nome, sem dizer onde),
            // usar a pasta pessoal do usuário como padrão. Antes, sem separador nenhum, o
            // parentFolder virava o MESMO texto do folderName (ex: parentFolder: "Testes",
            // folderName: "Testes"), tentando criar "Testes" dentro de "Testes" — pasta
            // inexistente, então a criação falhava ou ia parar num lugar errado sem avisar.
            const temSeparador = /[\\/]/.test(caminho);
            let parentFolder: string;
            let folderName: string;
            if (temSeparador) {
              const partes = caminho.split(/[\\/]/).filter(Boolean);
              folderName = partes.pop() || caminho;
              const resto = caminho.replace(/[\\/]+[^\\/]+\/?$/, '');
              parentFolder = resto || (caminho.startsWith('/') ? '/' : '~');
            } else {
              folderName = caminho;
              parentFolder = '~';
            }
            return post('/create-folder', { parentFolder, folderName });
          }
          case 'escrever_arquivo': {
            if (!caminho) return { error: "Informe 'caminho' com o arquivo a escrever (ex: '~/Documentos/nota.txt')." };
            const partes = caminho.split(/[\\/]/).filter(Boolean);
            const nomeArquivo = partes.pop() || 'arquivo.txt';
            const pasta = caminho.startsWith('/') ? '/' + partes.join('/') : partes.join('/') || '~';
            return post('/write-file', { folder: pasta, fileName: nomeArquivo, content: conteudo ?? '' });
          }
          case 'apagar':
            if (!caminho) return { error: "Informe 'caminho' do arquivo ou pasta a apagar." };
            return post('/path/delete', { target: caminho });
          case 'mover':
          case 'copiar':
          case 'renomear':
            if (!caminho || !destino) return { error: "Informe 'caminho' (origem) e 'destino'." };
            return post('/path/manage', { action: acao === 'mover' ? 'move' : acao === 'copiar' ? 'copy' : 'rename', source: caminho, destination: destino });
          case 'abrir':
            if (!caminho) return { error: "Informe 'caminho' com o app, arquivo, pasta ou site a abrir." };
            return post('/open-any', { target: caminho, path: destino });
          case 'fechar':
            if (!caminho) return { error: "Informe 'caminho' com o nome do app ou janela a fechar." };
            return post('/window/close', { target: caminho, force: args?.forcar === true });
          case 'terminal':
            if (!args?.comando) return { error: "Informe 'comando' com o comando de terminal." };
            return post('/exec', { command: args.comando, cwd: caminho, visible: args?.visivel === true });
          case 'volume':
            return post('/volume', { action: args?.subacao || 'set', value: valor });
          case 'midia':
            return post('/media', { action: args?.subacao || 'playpause' });
          case 'configuracoes':
            return post('/system/settings', { panel: args?.subacao || 'main' });
          case 'checar_sistema': {
            const res = await fetch(`${LOCAL_AGENT_URL}/system-check`, { method: 'GET', headers });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Falha ao checar o sistema.' };
            return data;
          }
          case 'mover_mouse': {
            const x = Number(args?.x);
            const y = Number(args?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Informe 'x' e 'y' (0 a 1000) para mover_mouse." };
            const pixels = await paraPixels(x, y);
            if (!pixels) return { error: "Não foi possível ler as dimensões da tela para posicionar o mouse. No Linux é necessário ter o pacote 'xdotool' instalado." };
            return post('/mouse/move', pixels);
          }
          case 'clicar': {
            const x = args?.x !== undefined ? Number(args.x) : undefined;
            const y = args?.y !== undefined ? Number(args.y) : undefined;
            if ((x !== undefined && !Number.isFinite(x)) || (y !== undefined && !Number.isFinite(y))) {
              return { error: "Parâmetros 'x' e 'y', quando informados, devem ser numéricos (0 a 1000)." };
            }
            let relato: any = null;
            if (x !== undefined && y !== undefined) {
              /**
               * Clicar sem ter olhado é recusado.
               *
               * Medido em uso real: três cliques seguidos, todos no mesmo y, sem nenhuma chamada
               * de 'capturar_tela' entre eles — o modelo estava chutando de memória enquanto a
               * grade e a ampliação existiam sem serem usadas. Pedir no prompt não mudou isso, e
               * um clique cego no computador de alguém não é algo que deva depender de boa
               * vontade. Aqui o procedimento vira pré-requisito: sem leitura recente da tela, a
               * ação não acontece e a resposta diz exatamente o que fazer.
               */
              const JANELA_VALIDA_MS = 30000;
              const ultima = ultimaCapturaRef.current;
              const idadeMs = ultima ? Date.now() - ultima.quando : Infinity;

              if (!ultima || idadeMs > JANELA_VALIDA_MS) {
                return {
                  error: "CLIQUE RECUSADO: você não olhou a tela antes. Nunca clique de memória — a tela muda. " +
                    "Chame 'localizar' com a descrição do alvo: ele olha a tela e devolve a coordenada pronta. Depois clique nela."
                };
              }

              const dentroDaAmpliacao = ultima.ampliada && ultima.regiao
                && x >= ultima.regiao.x0 && x <= ultima.regiao.x1
                && y >= ultima.regiao.y0 && y <= ultima.regiao.y1;

              if (!dentroDaAmpliacao) {
                return {
                  error: "CLIQUE RECUSADO: esta coordenada é estimada, e estimativa erra de 44 a 510 pixels — já foi medido. " +
                    "Chame 'localizar' descrevendo o alvo ('o botão Instalar', 'o ícone de lupa no topo à direita') e clique na coordenada que ele devolver, sem ajustar."
                };
              }

              /**
               * Clicar na coordenada que acabou de ser MEDIDA usa o pixel medido, não a versão
               * arredondada dele. A escala 0–1000 perde até dois pixels no caminho de ida e mais
               * dois na volta; num botão de 20px isso é a diferença entre o centro e a borda.
               */
              const mira = ultimaMiraRef.current;
              const usarMiraExata = !!mira
                && Date.now() - mira.quando < JANELA_VALIDA_MS
                && Math.abs(mira.escala0a1000.x - x) <= 1
                && Math.abs(mira.escala0a1000.y - y) <= 1;

              const pixels = usarMiraExata ? mira!.pixel : await paraPixels(x, y);
              if (!pixels) return { error: "Não foi possível ler as dimensões da tela para posicionar o clique. No Linux é necessário ter o pacote 'xdotool' instalado." };
              const moveResult = await post('/mouse/move', pixels);
              if (moveResult?.error) return moveResult;
              relato = moveResult;
            }
            const botao = args?.botao === 'right' ? 'right' : 'left';
            const clique = await post('/mouse/button', { action: 'click', button: botao, double: args?.duplo === true });
            if (clique?.error) return clique;

            // Devolve ONDE o clique caiu, não apenas "deu certo".
            //
            // Antes a resposta era um sucesso mudo, e com isso o modelo nunca ficava sabendo se
            // acertou: errar e acertar produziam exatamente a mesma resposta, o que torna impossível
            // corrigir a mira na tentativa seguinte. Dizendo o pixel real e o tamanho da tela, uma
            // conferência da tela depois do clique passa a ser suficiente para ele se corrigir.
            if (!relato) return clique;
            const t = relato.telaPx;
            return {
              ...clique,
              cliqueEm: { escala0a1000: { x, y }, pixelDaTela: relato.ficouPx || relato.pediuPx },
              telaPx: t,
              execucaoExata: relato.execucaoExata,
              resumo: t
                ? `Cliquei em x=${x}, y=${y} (escala 0-1000), que nesta tela de ${t.width}x${t.height} é o pixel ` +
                  `(${(relato.ficouPx || relato.pediuPx).x}, ${(relato.ficouPx || relato.pediuPx).y}). ` +
                  (relato.execucaoExata === false
                    ? `ATENÇÃO: o cursor parou ${relato.desvioPx}px longe do pedido — o sistema não obedeceu exatamente.`
                    : `O sistema posicionou o cursor exatamente onde foi pedido, então se o alvo errado foi atingido a coordenada é que estava errada: capture a tela e confira antes de tentar de novo.`)
                : undefined
            };
          }
          case 'rolar': {
            const direcao = args?.direcao === 'up' || args?.direcao === 'down' ? args.direcao : null;
            if (!direcao) return { error: "Informe 'direcao' como 'up' ou 'down' para rolar." };
            const body: any = { direction: direcao };
            if (args?.quantidade !== undefined) body.amount = Number(args.quantidade);
            if (args?.x !== undefined && args?.y !== undefined) {
              const pixels = await paraPixels(Number(args.x), Number(args.y));
              if (pixels) { body.x = pixels.x; body.y = pixels.y; }
            }
            return post('/mouse/scroll', body);
          }
          case 'digitar': {
            if (!args?.texto) return { error: "Informe 'texto' com o conteúdo a digitar no campo em foco." };
            return post('/keyboard/type', { text: String(args.texto) });
          }
          case 'tecla': {
            if (!args?.tecla) return { error: "Informe 'tecla' (ex: 'enter', 'tab', 'escape', 'a')." };
            const modificadores = Array.isArray(args?.modificadores) ? args.modificadores : [];
            return post('/keyboard/key', { key: String(args.tecla), modifiers: modificadores });
          }
          case 'localizar':
          case 'achar_texto': {
            /**
             * ONDE ESTÁ O ALVO — a pergunta que todo clique depende de responder.
             *
             * São dois caminhos, e nenhum deles é uma lista de botões conhecidos:
             *
             *   1º) Se o alvo for um elemento da PRÓPRIA interface do OSONE, o navegador já sabe a
             *       posição exata dele. Custa alguns milissegundos e acerta ao pixel, então seria
             *       desperdício não perguntar antes.
             *   2º) Qualquer outra coisa — outro programa, ícone sem texto, item de menu, miniatura
             *       de vídeo — o modelo OLHA a captura e diz onde está. É o mesmo que uma pessoa
             *       faz, e não depende de o alvo ter texto escrito.
             *
             * Antes o segundo caminho era reconhecimento de texto, que só achava o que estava
             * escrito e custava minutos de processador. Ele foi removido.
             */
            const procurado = String(args?.alvo || args?.texto || '').trim();
            if (!procurado) {
              return { error: "Informe 'alvo' descrevendo o que você quer achar na tela (ex: 'o botão Instalar', 'o ícone de lupa no topo à direita')." };
            }

            // Marca a posição como já conferida: ela é uma medição, e exigir uma conferência
            // ampliada por cima de uma medição seria só atraso sem ganho.
            const registrarMedicao = (escala0a1000?: { x: number; y: number }, pixel?: { x: number; y: number }) => {
              if (!escala0a1000) return;
              ultimaCapturaRef.current = {
                quando: Date.now(),
                ampliada: true,
                regiao: { x0: escala0a1000.x - 1, y0: escala0a1000.y - 1, x1: escala0a1000.x + 1, y1: escala0a1000.y + 1 }
              };
              if (pixel) ultimaMiraRef.current = { quando: Date.now(), escala0a1000, pixel };
            };

            let porQueNaoNaInterface = 'a interface própria não foi consultada';
            const tela = await dimensoesDaTela();
            if (tela) {
              const mira = await mirarNaInterface(procurado, tela, async (x, y) => {
                const r = await post('/mouse/move', { x, y });
                if (r?.error) return null;
                // ficouPx é onde o sistema operacional diz que o cursor parou; pediuPx é o que foi
                // mandado. Preferir o primeiro mantém a medição presa ao fato.
                return r?.ficouPx || r?.pediuPx || null;
              });

              if (!mira.encontrado || !mira.alvo) {
                porQueNaoNaInterface = mira.motivo || 'a mira na interface não confirmou a posição';
              } else {
                registrarMedicao(mira.alvo.escala0a1000, mira.alvo.pixel);
                return {
                  encontrado: true,
                  comoFoiLocalizado: 'interface do OSONE',
                  x: mira.alvo.escala0a1000.x,
                  y: mira.alvo.escala0a1000.y,
                  telaPx: { width: tela.width, height: tela.height },
                  resumo: `Localizado na própria interface: "${mira.alvo.rotulo}" em x=${mira.alvo.escala0a1000.x}, y=${mira.alvo.escala0a1000.y} ` +
                    `(pixel ${mira.alvo.pixel.x},${mira.alvo.pixel.y}, confirmado com ${mira.alvo.movimentos} movimento(s)).`,
                  comoUsar: `Posição MEDIDA e CONFIRMADA pelo navegador: o cursor já está sobre "${mira.alvo.rotulo}". ` +
                    `Chame 'clicar' com exatamente x=${mira.alvo.escala0a1000.x} e y=${mira.alvo.escala0a1000.y}.`
                };
              }
            } else {
              porQueNaoNaInterface = 'não foi possível ler as dimensões da tela';
            }

            // Segundo caminho: OLHAR. Captura CRUA, sem a grade vermelha — ela é régua para leitura
            // humana e, riscada por cima do conteúdo, só atrapalha quem vai reconhecer o que está lá.
            const respostaCaptura = await fetch(`${LOCAL_AGENT_URL}/screen/capture?grade=0`, { method: 'GET', headers });
            const captura = await respostaCaptura.json().catch(() => null);
            if (!respostaCaptura.ok || !captura?.image) {
              return { error: captura?.error || 'Não foi possível capturar a tela para procurar o alvo.' };
            }
            ultimaCapturaRef.current = { quando: Date.now(), ampliada: false };

            const visto = await mirarPorVisao(
              procurado,
              captura.image,
              captura.mimeType || 'image/png',
              visao?.chaveGemini || '',
              visao?.modeloGemini || 'gemini-3.6-flash'
            );

            if (!visto.encontrado || !visto.alvo) {
              return {
                error: `Não achei "${procurado}" na tela: ${visto.motivo}`,
                // Os dois motivos vão juntos. Antes só o último aparecia, e uma janela em segundo
                // plano era relatada como se fosse falha de leitura — apontando para o lugar errado.
                naInterfaceDoOsone: porQueNaoNaInterface,
                duracaoDaVisaoMs: visto.duracaoMs
              };
            }

            registrarMedicao(visto.alvo.centro);
            return {
              encontrado: true,
              comoFoiLocalizado: 'visão do modelo sobre a captura',
              x: visto.alvo.centro.x,
              y: visto.alvo.centro.y,
              caixa: visto.alvo.caixa,
              vi: visto.alvo.descricao,
              telaPx: tela ? { width: tela.width, height: tela.height } : undefined,
              resumo: `Vi "${visto.alvo.descricao}" em x=${visto.alvo.centro.x}, y=${visto.alvo.centro.y} (${visto.duracaoMs}ms).`,
              comoUsar: `Chame 'clicar' com exatamente x=${visto.alvo.centro.x} e y=${visto.alvo.centro.y}, sem somar nem subtrair nada. ` +
                `Se depois do clique a tela não mudar como esperado, olhe de novo e corrija — nunca repita a mesma coordenada.`
            };
          }
          case 'capturar_tela': {
            // Com x/y, a captura volta ampliada em volta daquele ponto — o segundo passo da mira
            // em dois tempos, que é o que leva o clique do "quase" para o "exato".
            const params = new URLSearchParams();
            if (args?.x !== undefined && args?.y !== undefined) {
              params.set('x', String(Number(args.x)));
              params.set('y', String(Number(args.y)));
              if (args?.janela !== undefined) params.set('janela', String(Number(args.janela)));
            }
            const consulta = params.toString() ? `?${params.toString()}` : '';
            const res = await fetch(`${LOCAL_AGENT_URL}/screen/capture${consulta}`, { method: 'GET', headers });
            if (res.ok) {
              const espiada = await res.clone().json().catch(() => null);
              ultimaCapturaRef.current = {
                quando: Date.now(),
                ampliada: !!espiada?.ampliada,
                regiao: espiada?.regiao
              };
            }
            const data = await res.json().catch(() => null);
            if (!res.ok) return { error: data?.error || 'Não foi possível capturar a tela.' };
            return data;
          }
          default:
            return { error: `Ação '${acao}' desconhecida. Use: status, listar, criar_pasta, escrever_arquivo, apagar, mover, copiar, renomear, abrir, fechar, terminal, volume, midia, configuracoes, checar_sistema, mover_mouse, clicar, rolar, digitar, tecla, capturar_tela.` };
        }
      }

      if (toolName === 'get_local_agent_status') {
        const res = await fetch(`${LOCAL_AGENT_URL}/status`, { method: 'GET', headers });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro HTTP ${res.status} ao consultar status do Agente Local.`, availableApps: data?.availableApps };
        }
        return data || { status: 'online', message: 'Agente ativo.' };
      }

      if (toolName === 'open_local_app') {
        const { appName } = args || {};
        if (!appName) return { error: "Parâmetro 'appName' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/open-app`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ appName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível abrir o aplicativo '${appName}'.`, availableApps: data?.availableApps };
        }
        return data || { message: `Aplicativo '${appName}' aberto com sucesso.` };
      }

      if (toolName === 'close_local_app' || toolName === 'fecharAplicativo' || toolName === 'close_app') {
        const appId = args?.appId || args?.appName;
        if (!appId) return { error: "Parâmetro 'appId' ou 'appName' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/close-app`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ appId })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível fechar o aplicativo '${appId}'.`, availableApps: data?.availableApps };
        }
        return data || { message: `Comando enviado para fechar '${appId}'.` };
      }

      if (toolName === 'create_local_folder' || toolName === 'criarPasta' || toolName === 'create_folder') {
        const { parentFolder, folderName } = args || {};
        if (!parentFolder || !folderName) return { error: "Parâmetros 'parentFolder' e 'folderName' são obrigatórios." };
        const res = await fetch(`${LOCAL_AGENT_URL}/create-folder`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ parentFolder, folderName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao criar pasta '${folderName}' em '${parentFolder}'.` };
        }
        return data || { message: `Pasta '${folderName}' criada com sucesso em '${parentFolder}'.` };
      }

      if (toolName === 'write_local_file' || toolName === 'escreverArquivo' || toolName === 'write_file') {
        const { folder, fileName, content } = args || {};
        if (!folder || !fileName) return { error: "Parâmetros 'folder' e 'fileName' são obrigatórios." };
        const res = await fetch(`${LOCAL_AGENT_URL}/write-file`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folder, fileName, content: content ?? '' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao escrever arquivo '${fileName}' na pasta '${folder}'.` };
        }
        return data || { message: `Arquivo '${fileName}' gravado com sucesso em '${folder}'.` };
      }

      if (toolName === 'organize_folder_plan') {
        const { folderKey } = args || {};
        if (!folderKey) return { error: "Parâmetro 'folderKey' é obrigatório." };
        const res = await fetch(`${LOCAL_AGENT_URL}/organize/plan`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folderKey })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao gerar plano de organização para a pasta '${folderKey}'.` };
        }
        return data || { message: "Plano gerado com sucesso." };
      }

      if (toolName === 'organize_folder_execute') {
        const { folderKey, planJson, baseDir } = args || {};
        if (!folderKey) return { error: "Parâmetro 'folderKey' é obrigatório." };
        if (!planJson) return { error: "Parâmetro 'planJson' é obrigatório." };
        let planArray: any = null;
        try {
          planArray = typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
        } catch (err) {
          return { error: "JSON do plano é inválido. Certifique-se de passar exatamente o array 'plan' retornado por organize_folder_plan sem modificações." };
        }
        if (!Array.isArray(planArray)) {
          return { error: "O plano fornecido deve ser um array com os itens do plano." };
        }

        // SEGURANÇA: Se for sessão de voz, bloqueia execução direta
        if (isVoiceSession) {
          return {
            error: "Por razões de segurança, operações que modificam ou organizam arquivos não podem ser executadas via comandos de voz. Por favor, acione a ação no chat de texto para visualizar o painel de confirmação."
          };
        }

        // Se já existia uma confirmação pendente, cancela a anterior de forma limpa antes de abrir a nova
        if (pendingLocalAgentResolveRef.current) {
          if (pendingLocalAgentTimerRef.current) clearTimeout(pendingLocalAgentTimerRef.current);
          pendingLocalAgentResolveRef.current({ error: "Solicitação de confirmação anterior foi cancelada pois uma nova ação foi solicitada." });
          pendingLocalAgentResolveRef.current = null;
        }

        // INTERCEPTAÇÃO REAL VIA MODAL NA UI REACT COM TIMEOUT DE SEGURANÇA (3 MINUTOS)
        return new Promise((resolve) => {
          const resolveOnce = (val: any) => {
            if (pendingLocalAgentTimerRef.current) {
              clearTimeout(pendingLocalAgentTimerRef.current);
              pendingLocalAgentTimerRef.current = null;
            }
            setPendingLocalAgentConfirmation(null);
            if (pendingLocalAgentResolveRef.current === resolveOnce) {
              pendingLocalAgentResolveRef.current = null;
            }
            resolve(val);
          };

          pendingLocalAgentResolveRef.current = resolveOnce;

          // Timeout de segurança: 180s
          pendingLocalAgentTimerRef.current = setTimeout(() => {
            resolveOnce({ error: "A confirmação do Agente Local expirou por tempo limite (3 minutos sem resposta do usuário no painel)." });
          }, 180000);

          setPendingLocalAgentConfirmation({
            id: Math.random().toString(36).substring(2, 9),
            type: 'organize_folder_execute',
            folderKey,
            baseDir,
            planArray,
            onConfirm: async () => {
              try {
                const res = await fetch(`${LOCAL_AGENT_URL}/organize/execute`, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ folderKey, plan: planArray, confirmed: true })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                  resolveOnce({ error: data?.error || `Erro ao executar plano de organização na pasta '${folderKey}'.` });
                } else {
                  resolveOnce(data || { message: "Organização executada com sucesso após confirmação do usuário no painel." });
                }
              } catch (err) {
                resolveOnce({ error: "Erro de conexão ao executar organização com o Agente Local." });
              }
            },
            onCancel: () => {
              resolveOnce({ error: "Ação de organização cancelada pelo usuário no painel de confirmação da interface." });
            }
          });
        });
      }

      if (toolName === 'trash_local_file') {
        const { folderKey, fileName } = args || {};
        if (!fileName) return { error: "Parâmetro 'fileName' é obrigatório (caminho completo do arquivo, ou nome do arquivo junto de folderKey)." };

        // Execução direta, inclusive por voz. Antes isto abria um modal de confirmação e era
        // recusado em sessões de voz — o que, na prática, tornava impossível apagar qualquer
        // coisa falando. O dono da máquina concedeu acesso total e a exclusão é reversível
        // (o arquivo vai para a lixeira do agente, que devolve o caminho de restauração).
        const res = await fetch(`${LOCAL_AGENT_URL}/file/trash`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ folderKey, fileName })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Não foi possível apagar '${fileName}'.` };
        }
        return data || { success: true };
      }

      if (toolName === 'run_terminal_command') {
        const { command, cwd, visible } = args || {};
        if (!command) return { error: "Parâmetro 'command' é obrigatório." };

        // Execução direta: o dono da máquina liberou explicitamente o controle total do
        // terminal, então não há mais gate de confirmação por categoria de comando (o servidor
        // registra tudo no log de auditoria). A única recusa possível vem do servidor, quando o
        // comando alteraria a própria instalação do OSONE.
        const res = await fetch(`${LOCAL_AGENT_URL}/exec`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command, cwd, visible: visible === true })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error || `Erro ao executar comando (HTTP ${res.status}).` };
        }
        return data || { success: true, message: 'Comando executado com sucesso.' };
      }

      if (toolName === 'close_window_or_app') {
        const { target, force } = args || {};
        if (!target) return { error: "Parâmetro 'target' é obrigatório (nome do app ou título da janela)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/window/close`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target, force: !!force })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível fechar '${target}'.` };
        return data || { success: true };
      }

      if (toolName === 'control_media') {
        const { action } = args || {};
        if (!action) return { error: "Parâmetro 'action' é obrigatório (playpause, play, pause, next, previous, stop)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/media`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível controlar a mídia.` };
        return data || { success: true };
      }

      if (toolName === 'delete_path') {
        const { target } = args || {};
        if (!target) return { error: "Parâmetro 'target' é obrigatório (caminho do arquivo ou pasta)." };
        const res = await fetch(`${LOCAL_AGENT_URL}/path/delete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível apagar '${target}'.` };
        return data || { success: true };
      }

      if (toolName === 'manage_path') {
        const { action, source, destination } = args || {};
        if (!action || !source || !destination) {
          return { error: "Parâmetros 'action' (move/copy/rename), 'source' e 'destination' são obrigatórios." };
        }
        const res = await fetch(`${LOCAL_AGENT_URL}/path/manage`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, source, destination })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível ${action} '${source}'.` };
        return data || { success: true };
      }

      if (toolName === 'list_path') {
        const { target } = args || {};
        const res = await fetch(`${LOCAL_AGENT_URL}/path/list`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target: target || '' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível listar o caminho.` };
        return data || { entries: [] };
      }

      if (toolName === 'open_system_settings') {
        const { panel } = args || {};
        const res = await fetch(`${LOCAL_AGENT_URL}/system/settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ panel: panel || 'main' })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) return { error: data?.error || `Não foi possível abrir as configurações.` };
        return data || { success: true };
      }

      return { error: `Ferramenta desconhecida: ${toolName}` };
    } catch (err: any) {
      return {
        error: "Agente Local unificado indisponível ou offline no servidor (/api/agent)."
      };
    }
  };

  /**
   * O PLANO EM EXECUÇÃO — o que o painel mostra enquanto o agente trabalha sozinho.
   *
   * Um laço automático sem nada visível é a pior combinação possível: o computador se mexe sozinho
   * e a pessoa não tem como saber em que passo está, quanto falta, nem onde parar. Cada passo
   * concluído entra aqui, com o tempo que o motor PREVIA e o que ele MEDIU — é essa diferença que
   * mostra a previsão se calibrando de um passo para o outro.
   */
  const [planoEmCurso, setPlanoEmCurso] = useState<{ passos: ResultadoDoPasso[]; total: number; rodando: boolean } | null>(null);
  /**
   * O aprendizado sobrevive entre planos: o segundo plano da sessão já começa sabendo quanto
   * "abrir" costuma demorar nesta máquina, em vez de reaprender do zero.
   */
  const historicoDeEsperasRef = useRef<HistoricoDeEsperas>(historicoVazio());
  /**
   * Onde o passo atual MEDIU o alvo, na escala 0–1000 — para a tela poder marcar o ponto.
   *
   * Sai daqui, e não do plano, porque no plano ele não existe: o plano descreve o alvo em
   * palavras e a posição só passa a ser um número no instante em que a tela é olhada. Marcar a
   * coordenada que o plano trouxe seria desenhar um palpite; marcar esta é desenhar a medição.
   */
  const [alvoMedido, setAlvoMedido] = useState<{ x: number; y: number; rotulo: string; quando: number } | null>(null);

  // ==========================================================================
  // O AGENTE AUTÔNOMO: TRABALHA DENTRO DE UMA JANELA, DECIDINDO A CADA OLHADA
  // ==========================================================================

  /**
   * A janela em que o agente está trabalhando AGORA.
   *
   * Existe porque olhar a tela inteira obriga o modelo a reencontrar, em toda foto, qual pedaço da
   * imagem é o programa dele — e a tela inteira inclui o próprio OSONE, outras janelas e o que
   * aparecer por cima. Fixada uma janela, a foto é sempre do mesmo programa, e o que acontece fora
   * dela deixa de existir para a decisão.
   *
   * A geometria é relida a cada foto: uma janela pode ser movida ou redimensionada no meio do
   * trabalho, e clicar com a posição antiga erra por toda a distância que ela andou.
   */
  const [janelaDeTrabalho, setJanelaDeTrabalho] = useState<JanelaDeTrabalho | null>(null);
  const janelaRef = useRef<JanelaDeTrabalho | null>(null);
  const definirJanela = (j: JanelaDeTrabalho | null) => { janelaRef.current = j; setJanelaDeTrabalho(j); };

  /** O relatório ao vivo do agente: cada volta do laço, na ordem em que aconteceu. */
  const [relatoDoAgente, setRelatoDoAgente] = useState<{ voltas: VoltaDoAgente[]; rodando: boolean } | null>(null);

  const cabecalhoDoAgente = (token?: string) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${(token || '').trim()}`
  });

  /**
   * A TELA DO AGENTE — ligada, ele deixa de disputar a sua.
   *
   * Sem ela, mouse, teclado e foco de janela são um só recurso para os dois: ele trabalhar
   * significa você parar. Ligada, as janelas dele nascem num servidor gráfico sem monitor, e você
   * continua onde estiver — em qualquer aba, em qualquer programa — enquanto acompanha pela
   * imagem. Só existe no Linux, com Xvfb; o estado diz em qual dos dois modos se está.
   */
  const [areaParalela, setAreaParalela] = useState<EstadoDaAreaParalela | null>(null);
  /** Lido dentro do laço, que roda fora de renderização e não enxergaria o estado. */
  const areaRef = useRef<EstadoDaAreaParalela | null>(null);
  const definirArea = (a: EstadoDaAreaParalela | null) => { areaRef.current = a; setAreaParalela(a); };
  const ultimoIdDeFrameRef = useRef<string | null>(null);
  const ultimoFrameConfirmadoRef = useRef<CapturaConfirmada | null>(null);
  const sequenciaPedidaRef = useRef(0);
  const sequenciaAceitaRef = useRef(0);

  /**
   * Faz um pedido impossível de ser confundido com o anterior: URL única, cache desabilitado e
   * eco do requestId. Uma resposta sem prova de atualidade é descartada e refeita uma vez.
   */
  const pedirCapturaAtual = async (
    caminho: string,
    localAgentToken?: string,
    aoCapturar?: (frame: CapturaConfirmada) => void
  ): Promise<any | null> => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const sequencia = ++sequenciaPedidaRef.current;
      const requestId = novoIdDeCaptura();
      const iniciadoEm = Date.now();
      const separador = caminho.includes('?') ? '&' : '?';
      try {
        const res = await fetch(`${caminho}${separador}requestId=${encodeURIComponent(requestId)}&_=${iniciadoEm}`, {
          headers: cabecalhoDoAgente(localAgentToken), cache: 'no-store'
        });
        const dados = await res.json().catch(() => null);
        if (!res.ok) return null;
        const problema = validarCapturaAtual(dados, {
          requestId, iniciadoEm, agora: Date.now(), ultimoCaptureId: ultimoIdDeFrameRef.current
        });
        if (problema) continue;
        // Dois consumidores podem fotografar ao mesmo tempo (quadro ao vivo e decisão). Se o
        // pedido mais novo já voltou, a resposta atrasada do anterior não pode virar “presente”.
        if (sequencia < sequenciaAceitaRef.current) continue;
        sequenciaAceitaRef.current = sequencia;
        ultimoIdDeFrameRef.current = dados.captureId;
        const frame: CapturaConfirmada = {
          captureId: dados.captureId, requestId, capturedAt: Number(dados.capturedAt),
          idadeMs: Math.max(0, Date.now() - Number(dados.capturedAt))
        };
        ultimoFrameConfirmadoRef.current = frame;
        aoCapturar?.(frame);
        return dados;
      } catch { /* segunda tentativa; se também falhar, devolve null */ }
    }
    return null;
  };

  const consultarAreaParalela = async (localAgentToken?: string) => {
    try {
      const res = await fetch('/api/agent/desktop/status', { headers: cabecalhoDoAgente(localAgentToken) });
      const dados = await res.json().catch(() => null);
      if (dados) definirArea(dados);
      return dados as EstadoDaAreaParalela | null;
    } catch {
      return null;
    }
  };

  const ligarAreaParalela = async (localAgentToken?: string, tamanho?: { largura: number; altura: number }) => {
    try {
      const res = await fetch('/api/agent/desktop/start', {
        method: 'POST', headers: cabecalhoDoAgente(localAgentToken),
        body: JSON.stringify(tamanho || {})
      });
      const dados = await res.json().catch(() => null);
      if (res.ok && dados) {
        definirArea(dados);
        // A janela de trabalho de antes é da SUA tela; do outro lado ela não existe. Manter a
        // referência faria o agente fotografar uma janela que não está na tela dele.
        definirJanela(null);
        return dados as EstadoDaAreaParalela;
      }
      return { ligada: false, suportada: false, explicacao: dados?.error || 'Não foi possível ligar a tela do agente.' } as EstadoDaAreaParalela;
    } catch (err: any) {
      return { ligada: false, suportada: false, explicacao: `Falha ao ligar a tela do agente: ${err?.message || err}` } as EstadoDaAreaParalela;
    }
  };

  const desligarAreaParalela = async (localAgentToken?: string) => {
    try {
      const res = await fetch('/api/agent/desktop/stop', {
        method: 'POST', headers: cabecalhoDoAgente(localAgentToken)
      });
      const dados = await res.json().catch(() => null);
      if (dados) definirArea(dados);
      definirJanela(null);
      return dados as EstadoDaAreaParalela | null;
    } catch {
      return null;
    }
  };

  /** A foto da tela do agente, para a aba mostrar ao vivo sem tirar você de onde está. */
  const fotografarAreaParalela = async (
    localAgentToken?: string,
    aoCapturar?: (frame: CapturaConfirmada) => void
  ): Promise<string | null> => {
    const dados = await pedirCapturaAtual('/api/agent/desktop/capture', localAgentToken, aoCapturar);
    return dados?.image || null;
  };

  /**
   * O que esta máquina é: sistema, pasta pessoal, e o NOME REAL de cada pasta do usuário.
   *
   * Lido uma vez e guardado. Nada disso muda no meio de uma tarefa, e consultar a cada decisão
   * acrescentaria uma ida ao agente antes de cada ação — num laço de quarenta ações, quarenta
   * idas para receber quarenta vezes a mesma resposta.
   */
  const ambienteDaMaquinaRef = useRef<any>(null);
  const lerAmbienteDaMaquina = async (localAgentToken?: string) => {
    if (ambienteDaMaquinaRef.current) return ambienteDaMaquinaRef.current;
    try {
      const res = await fetch('/api/agent/status', { headers: cabecalhoDoAgente(localAgentToken) });
      const dados = await res.json().catch(() => null);
      if (res.ok && dados?.osName) ambienteDaMaquinaRef.current = dados;
      return ambienteDaMaquinaRef.current;
    } catch {
      return null;
    }
  };

  /** As janelas abertas, para o usuário escolher uma — ou para o agente achar a que ele abriu. */
  const listarJanelas = async (localAgentToken?: string): Promise<JanelaDeTrabalho[]> => {
    try {
      const res = await fetch('/api/agent/window/list', { headers: cabecalhoDoAgente(localAgentToken) });
      const dados = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(dados?.janelas)) return [];
      return dados.janelas;
    } catch {
      return [];
    }
  };

  /**
   * Foto do que o agente está olhando: a janela de trabalho, ou a tela dele inteira.
   *
   * A segunda metade existe por um caso que sem ela travaria tudo: a tela do agente NASCE VAZIA.
   * Exigir uma janela escolhida antes de começar impediria a primeira tarefa de sair do lugar,
   * porque a primeira coisa que ele precisa fazer lá é justamente abrir algo. Sem janela e com a
   * tela dele ligada, o quadro é a tela dele inteira — e as coordenadas são as dela.
   */
  const fotografarJanelaDeTrabalho = async (
    localAgentToken?: string,
    aoCapturar?: (frame: CapturaConfirmada) => void
  ): Promise<{ imagem: string; janela: JanelaDeTrabalho } | null> => {
    const janela = janelaRef.current;
    if (!janela) {
      const area = areaRef.current;
      if (!area?.ligada) return null;
      const imagem = await fotografarAreaParalela(localAgentToken, aoCapturar);
      if (!imagem) return null;
      return {
        imagem,
        janela: {
          id: '', titulo: 'Tela do agente', app: 'área paralela',
          x: 0, y: 0, width: area.largura || 1600, height: area.altura || 900
        }
      };
    }
    try {
      const dados = await pedirCapturaAtual(
        `/api/agent/window/capture?id=${encodeURIComponent(janela.id)}`,
        localAgentToken, aoCapturar
      );
      if (!dados?.image) return null;
      // A geometria vem da captura porque ela acabou de trazer a janela para frente — o momento
      // exato em que a posição costuma mudar.
      const atualizada = dados.janela
        ? { ...janela, ...dados.janela }
        : janela;
      janelaRef.current = atualizada;
      return { imagem: dados.image, janela: atualizada };
    } catch {
      return null;
    }
  };

  /**
   * CLICAR DENTRO DA JANELA: olha a janela, mede o alvo NELA, e converte para o pixel da tela.
   *
   * A conversão é a parte que não pode errar. O modelo aponta a posição na foto que recebeu, que é
   * a foto da JANELA — um ponto no meio dela é "500,500" mesmo que a janela esteja no canto
   * direito do monitor. Tratar esse 500 como posição de tela clicaria no meio do monitor, longe do
   * alvo. Por isso a medição relativa é somada ao canto da janela antes de virar pixel.
   */
  const clicarNaJanela = async (
    alvoDescrito: string,
    localAgentToken?: string,
    visao?: VisaoDoMotor,
    aoCapturar?: (frame: CapturaConfirmada) => void,
    opcoes: { botao?: 'left' | 'right'; duplo?: boolean } = {}
  ): Promise<any> => {
    const foto = await fotografarJanelaDeTrabalho(localAgentToken, aoCapturar);
    if (!foto) return { error: 'Não consegui fotografar a janela para localizar o alvo.' };

    const visto = await mirarPorVisao(
      alvoDescrito, foto.imagem, 'image/png',
      visao?.chaveGemini || '', visao?.modeloGemini || 'gemini-3.6-flash'
    );
    if (!visto.encontrado || !visto.alvo) {
      return { error: `Não achei "${alvoDescrito}" nesta janela: ${visto.motivo}` };
    }

    const j = foto.janela;
    const pixel = {
      x: Math.round(j.x + (visto.alvo.centro.x / 1000) * j.width),
      y: Math.round(j.y + (visto.alvo.centro.y / 1000) * j.height)
    };

    const tela = await lerDimensoesDaTelaDoAgente(localAgentToken);
    if (!tela) return { error: 'Não consegui ler as dimensões da tela para converter a posição do clique.' };

    const escala0a1000 = {
      x: Math.round((pixel.x / tela.width) * 1000),
      y: Math.round((pixel.y / tela.height) * 1000)
    };

    /**
     * A medição é registrada nos mesmos refs que a recusa de clique cego consulta.
     *
     * O clique com coordenada é recusado quando não houve leitura recente da tela — a trava que
     * existe para impedir clique de memória. Aqui a leitura ACONTECEU, e é ela que produziu a
     * coordenada; registrar isso é dizer a verdade ao verificador, não contorná-lo. E gravar o
     * pixel exato faz o clique usar a medição inteira em vez da versão arredondada dela.
     */
    ultimaCapturaRef.current = {
      quando: Date.now(), ampliada: true,
      regiao: { x0: escala0a1000.x - 1, y0: escala0a1000.y - 1, x1: escala0a1000.x + 1, y1: escala0a1000.y + 1 }
    };
    ultimaMiraRef.current = { quando: Date.now(), escala0a1000, pixel };
    setAlvoMedido({ x: escala0a1000.x, y: escala0a1000.y, rotulo: alvoDescrito, quando: Date.now() });

    return await executeLocalAgentCall(
      'controlar_pc', {
        acao: 'clicar',
        x: escala0a1000.x,
        y: escala0a1000.y,
        botao: opcoes.botao || 'left',
        duplo: opcoes.duplo === true
      },
      localAgentToken, false, visao
    );
  };

  const dimensoesDaTelaRef = useRef<{ quando: number; valor: { width: number; height: number } } | null>(null);
  const lerDimensoesDaTelaDoAgente = async (localAgentToken?: string) => {
    const emCache = dimensoesDaTelaRef.current;
    if (emCache && Date.now() - emCache.quando < 15000) return emCache.valor;
    try {
      const res = await fetch('/api/agent/screen-info', { headers: cabecalhoDoAgente(localAgentToken) });
      const dados = await res.json().catch(() => null);
      if (!res.ok || !dados?.width) return null;
      const valor = { width: Number(dados.width), height: Number(dados.height) };
      dimensoesDaTelaRef.current = { quando: Date.now(), valor };
      return valor;
    } catch {
      return null;
    }
  };

  /**
   * O agente trabalha até concluir, decidindo cada ação com a janela à frente.
   *
   * Aqui só mora a LIGAÇÃO com o mundo — fotografar, executar, perguntar ao modelo, trocar de
   * janela. O laço, os freios e as travas ficam em agenteAutonomo.ts, que por sua vez valida cada
   * ação com a mesma função do plano fixo. Nada de segurança é decidido neste arquivo.
   */
  const trabalharNoObjetivo = async (
    objetivo: string,
    opcoes: {
      localAgentToken?: string;
      visao?: VisaoDoMotor;
      janela?: JanelaDeTrabalho | null;
      aoProgredir?: (volta: VoltaDoAgente) => void;
      aoCapturar?: (frame: CapturaConfirmada) => void;
    } = {}
  ): Promise<RelatorioDoAgente | { error: string }> => {
    const { localAgentToken, visao } = opcoes;
    if (opcoes.janela !== undefined) definirJanela(opcoes.janela);

    // Com a tela do agente ligada, começar sem janela é o NORMAL: ela nasce vazia, e a primeira
    // coisa que ele faz lá é abrir alguma coisa. Sem ela, escolher a janela é obrigatório — ele
    // vai agir na sua tela, e "em qualquer janela" não é uma resposta aceitável para isso.
    if (!janelaRef.current && !areaRef.current?.ligada) {
      return { error: 'Escolha em qual janela eu devo trabalhar antes de começar.' };
    }
    if (motorParadoRef.current) {
      return { error: 'O motor de ações está PARADO por pedido seu. Retome antes de começar uma tarefa.' };
    }

    setRelatoDoAgente({ voltas: [], rodando: true });
    setAlvoMedido(null);
    const memoriaDaAutomacao = pistasDaAutomacao(objetivo);

    const fotografar = async () => {
      const f = await fotografarJanelaDeTrabalho(localAgentToken, opcoes.aoCapturar);
      return f ? await assinaturaDaImagem(f.imagem) : null;
    };

    const relatorio = await trabalharAteConcluir(objetivo, {
      agora: () => Date.now(),
      dormir: (ms) => new Promise(r => setTimeout(r, ms)),
      fotografar,
      cancelado: () => motorParadoRef.current,

      fotografarJanela: async () => {
        const f = await fotografarJanelaDeTrabalho(localAgentToken, opcoes.aoCapturar);
        return f ? f.imagem : null;
      },

      /**
       * TROCAR DE JANELA É DECISÃO DO AGENTE.
       *
       * É o que permite abrir algo novo e continuar trabalhando lá: ele abre, procura a janela
       * pelo título e passa a olhar aquela. Sem isto, abrir um programa deixaria o agente
       * fotografando a janela antiga enquanto o trabalho acontece noutra — vendo o lugar errado
       * com total confiança.
       */
      trocarJanela: async (tituloContem: string) => {
        const procurado = (tituloContem || '').trim().toLowerCase();
        if (!procurado) return { error: 'Não disse qual janela procurar.' };
        // Uma janela recém-aberta pode ainda não existir na lista: o sistema leva um instante
        // para registrá-la. Tentar uma vez só transformaria "abriu e trocou" em falha constante.
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          const janelas = await listarJanelas(localAgentToken);
          const achou = janelas.find(j =>
            (j.titulo || '').toLowerCase().includes(procurado) || (j.app || '').toLowerCase().includes(procurado));
          if (achou) {
            definirJanela(achou);
            await fetch('/api/agent/window/focus', {
              method: 'POST', headers: cabecalhoDoAgente(localAgentToken),
              body: JSON.stringify({ id: achou.id })
            }).catch(() => { /* a captura foca de novo logo em seguida */ });
            return { titulo: achou.titulo };
          }
          await new Promise(r => setTimeout(r, 900));
        }
        const abertas = (await listarJanelas(localAgentToken)).map(j => j.titulo).slice(0, 12);
        return { error: `Não achei nenhuma janela com "${tituloContem}" no título. Abertas agora: ${abertas.join(' / ') || 'nenhuma'}` };
      },

      executar: async (acao, args) => {
        // Clicar passa pelo caminho que MEDE dentro da janela; o resto vai direto.
        if (acao === 'clicar') {
          const alvo = String(args?.alvo || '').trim();
          if (!alvo) return { error: 'Para clicar é preciso descrever o alvo.' };
          return await clicarNaJanela(alvo, localAgentToken, visao, opcoes.aoCapturar, {
            botao: args?.botao === 'right' ? 'right' : 'left',
            duplo: args?.duplo === true
          });
        }
        if (acao === 'clique_direito') {
          const alvo = String(args?.alvo || '').trim();
          if (!alvo) return { error: 'Para clicar com o botão direito é preciso descrever o alvo.' };
          return await clicarNaJanela(alvo, localAgentToken, visao, opcoes.aoCapturar, { botao: 'right' });
        }

        /**
         * ABRIR E PASSAR A OLHAR O QUE ABRIU — no mesmo passo, sem depender do modelo lembrar.
         *
         * É o conserto do erro observado: pedido "analise uma coisa no YouTube", o agente abriu
         * TRÊS abas. O motivo não foi burrice do modelo. Ele mandou abrir, e a foto seguinte ainda
         * era da janela ANTERIOR — a nova tinha acabado de nascer e ninguém tinha trocado o olhar
         * para ela. Vendo a tela velha, a conclusão correta a partir do que ele via era "não
         * abriu", e ele abriu de novo.
         *
         * Deixar isso para o modelo resolver (mandando ele chamar 'trocar_janela' depois de abrir)
         * seria confiar numa disciplina que a própria situação atrapalha: justamente quando ele
         * precisa lembrar da regra, o que ele está vendo diz o contrário. Aqui a troca acontece
         * como parte de abrir, medida comparando as janelas de antes e as de depois.
         */
        if (acao === 'abrir') {
          const antes = new Set((await listarJanelas(localAgentToken)).map(j => j.id));
          const r = await executeLocalAgentCall('controlar_pc', { acao, ...args }, localAgentToken, false, visao);
          if (r?.error) return r;

          for (let tentativa = 0; tentativa < 6; tentativa++) {
            // Um programa que estava fechado leva segundos para desenhar a primeira janela.
            await new Promise(res => setTimeout(res, 900));
            const agora = await listarJanelas(localAgentToken);
            const nova = agora.find(j => !antes.has(j.id));
            if (nova) {
              definirJanela(nova);
              return { ...r, resumo: `Abri e passei a olhar a janela "${nova.titulo}".` };
            }
          }
          /**
           * Nenhuma janela nova é o caso do programa que JÁ ESTAVA aberto e só ganhou uma aba
           * interna (um navegador aberto recebendo um endereço). Dizer isso é o que impede a
           * conclusão errada de "não abriu" — que é o que gerava a abertura repetida.
           */
          return {
            ...r,
            resumo: 'Abri. Nenhuma janela NOVA apareceu, então provavelmente abriu como aba dentro ' +
              'de uma janela que já existia. NÃO mande abrir de novo: olhe a foto e siga daí.'
          };
        }

        return await executeLocalAgentCall('controlar_pc', { acao, ...args }, localAgentToken, false, visao);
      },

      decidir: async (objetivoAtual, foto, historico, orientacao, anotacoes) => {
        return await perguntarProximaAcao(
          objetivoAtual, foto, historico, janelaRef.current, visao,
          await lerAmbienteDaMaquina(localAgentToken), areaRef.current, memoriaDaAutomacao,
          ultimoFrameConfirmadoRef.current
            ? { ...ultimoFrameConfirmadoRef.current, idadeMs: Date.now() - ultimoFrameConfirmadoRef.current.capturedAt }
            : null,
          orientacao, anotacoes
        );
      },

      consultar: async (objetivoAtual, foto, historico, motivo) => {
        return await estudarATelaComOModelo(
          objetivoAtual, foto, historico, motivo, janelaRef.current, visao,
          await lerAmbienteDaMaquina(localAgentToken), areaRef.current
        );
      },

      procurar: (consulta) => procurarNaWeb(consulta, visao),
      lerPagina: (url) => lerPaginaDaWeb(url),

      aoProgredir: (volta) => {
        setRelatoDoAgente(prev => ({ voltas: [...(prev?.voltas || []), volta], rodando: true }));
        opcoes.aoProgredir?.(volta);
      }
    }, { historicoDeEsperas: historicoDeEsperasRef.current });

    historicoDeEsperasRef.current = relatorio.historico;
    aprenderAutomacao(objetivo, relatorio);
    setRelatoDoAgente({ voltas: relatorio.voltas, rodando: false });
    return relatorio;
  };

  /**
   * Executa um plano inteiro sem consultar o usuário passo a passo.
   *
   * A trava de uma ação por vez continua valendo por dentro: cada passo passa por
   * executeLocalAgentCall, então o painel, o registro e a parada seguem funcionando igual.
   */
  const executarCowork = async (
    passosBrutos: any[],
    localAgentToken?: string,
    isVoiceSession: boolean = false,
    visao?: VisaoDoMotor
  ): Promise<RelatorioDoPlano | { error: string }> => {
    const passos: PassoDoPlano[] = (passosBrutos || []).map((p: any) => ({
      acao: String(p?.acao || ''),
      args: p?.args || {},
      descricao: String(p?.descricao || ''),
      esperaDaTela: p?.esperaDaTela
    }));

    const problema = validarPlano(passos);
    if (problema) return { error: problema };

    if (motorParadoRef.current) {
      return { error: "O motor de ações está PARADO por pedido do usuário. Pergunte se ele quer retomar antes de executar qualquer plano." };
    }

    setPlanoEmCurso({ passos: [], total: passos.length, rodando: true });
    // Alvo de um plano anterior não pode ficar marcado na tela deste: a marca diria que o passo
    // atual vai agir num ponto que ninguém mediu para ele.
    setAlvoMedido(null);

    /** Fotografa a tela pelo mesmo caminho das outras ações, e reduz à assinatura. */
    const fotografar = async () => {
      const r = await executarAcao('controlar_pc', { acao: 'capturar_tela' }, localAgentToken, isVoiceSession, visao);
      if (!r || r.error || !r.image) return null;
      return await assinaturaDaImagem(r.image);
    };

    const relatorio = await executarPlano(passos, {
      agora: () => Date.now(),
      dormir: (ms) => new Promise(r => setTimeout(r, ms)),
      fotografar,
      cancelado: () => motorParadoRef.current,
      executar: async (acao, args) => {
        /**
         * CLICAR NUM ALVO DESCRITO: OLHA, DEPOIS CLICA.
         *
         * Um plano não pode trazer coordenada pronta. Quem escreve o plano não está vendo a tela
         * do momento em que ele vai rodar — a janela pode estar em outra posição, o menu pode ter
         * rolado, a resolução pode ser outra. Coordenada escrita de antemão é chute, e chute erra
         * de 44 a 510 pixels (já medido); e como o passo seguinte age em cima do resultado do
         * anterior, um clique fora do alvo estraga a sequência inteira, não só um passo.
         *
         * Por isso o plano descreve o ALVO ("o campo de busca do YouTube") e a coordenada é
         * MEDIDA aqui, no instante do passo, com a tela à frente: 'localizar' olha e devolve a
         * posição, e o clique usa exatamente ela. Sem este par, um 'clicar' sem coordenada
         * clicaria onde o cursor estivesse parado — que é o mesmo que não clicar em nada.
         */
        if (acao === 'clicar' && args?.alvo && args?.x === undefined) {
          const { alvo, ...restoDoClique } = args;
          const achou = await executeLocalAgentCall(
            'controlar_pc', { acao: 'localizar', alvo }, localAgentToken, isVoiceSession, visao
          );
          if (achou?.error) return achou;
          if (!Number.isFinite(Number(achou?.x)) || !Number.isFinite(Number(achou?.y))) {
            return { error: `Não consegui medir onde está "${alvo}" na tela, então não cliquei — clicar sem ter medido é clicar no escuro.` };
          }
          setAlvoMedido({ x: Number(achou.x), y: Number(achou.y), rotulo: String(alvo), quando: Date.now() });
          return await executeLocalAgentCall(
            'controlar_pc', { acao: 'clicar', x: achou.x, y: achou.y, ...restoDoClique },
            localAgentToken, isVoiceSession, visao
          );
        }
        // Passa por executeLocalAgentCall para herdar a trava de concorrência, o registro no
        // painel de ações e a marca de "mexeu no PC" que cala o compartilhamento de tela.
        return await executeLocalAgentCall('controlar_pc', { acao, ...args }, localAgentToken, isVoiceSession, visao);
      },
      aoProgredir: (passo, total) => {
        setPlanoEmCurso(prev => ({ passos: [...(prev?.passos || []), passo], total, rodando: true }));
      }
    }, { historico: historicoDeEsperasRef.current });

    historicoDeEsperasRef.current = relatorio.historico;
    setPlanoEmCurso({ passos: relatorio.passos, total: relatorio.totalDePassos, rodando: false });
    return relatorio;
  };

  return {
    pendingLocalAgentConfirmation,
    executeLocalAgentCall,
    acoesDoMotor,
    motorParado,
    ultimaAcaoNoPcRef,
    pararMotor,
    retomarMotor,
    limparAcoesDoMotor,
    executarCowork,
    planoEmCurso,
    alvoMedido,
    // O agente autônomo e a janela em que ele trabalha.
    listarJanelas,
    janelaDeTrabalho,
    definirJanela,
    trabalharNoObjetivo,
    relatoDoAgente,
    // A tela do agente: ligada, ele para de disputar a sua.
    areaParalela,
    consultarAreaParalela,
    ligarAreaParalela,
    desligarAreaParalela,
    fotografarAreaParalela
  };
}
