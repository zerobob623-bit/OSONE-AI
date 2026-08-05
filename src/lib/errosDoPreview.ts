/**
 * Transforma o que quebrou no preview num pedido de conserto que a IA consegue executar.
 *
 * Antes disto, o erro morria na tela. O preview capturava `TypeError: ctx is undefined` com
 * arquivo, linha e coluna, mostrava numa aba, e ali acabava — a IA nunca ficava sabendo. Clicar
 * em "Corrigir BUGS" mandava o modelo procurar um defeito que ele não tinha como ver, e o que
 * voltava era palpite: mexidas em código que estava certo, enquanto a linha que realmente
 * quebrava continuava lá.
 *
 * O que este arquivo faz é dar ao modelo aquilo que a máquina já sabia: a mensagem exata, e —
 * mais importante — o TEXTO da linha que falhou. O número da linha sozinho não serve, porque o
 * preview roda o projeto MONTADO (o styles.css e o script.js entram embutidos no HTML), então a
 * linha 312 do preview não é a linha 312 de nenhum arquivo do repositório. O texto, sim, é o
 * mesmo nos dois lados: é por ele que o modelo encontra o lugar.
 */

export interface ProblemaDoPreview {
  mensagem: string;
  linha?: number;
  coluna?: number;
  /** 'erro' quebra a execução; 'aviso' não, e por isso nunca vira pedido sozinho. */
  tipo: 'erro' | 'aviso';
  /**
   * O texto da linha que falhou, quando quem capturou o erro soube lê-lo.
   *
   * Vem pronto do preview porque só ele conhece o documento que o navegador executou: o código do
   * usuário é embrulhado numa página maior, e o número da linha se refere ao resultado final.
   */
  textoDaLinha?: string;
}

/** Mensagens que não são defeito do código do usuário e só atrapalhariam o pedido. */
const RUIDO = [
  /cdn\.tailwindcss\.com should not be used in production/i,
  /Download the React DevTools/i,
  /\[Alert\]:/,
  /favicon/i
];

export function ehRuido(mensagem: string): boolean {
  return RUIDO.some(r => r.test(mensagem || ''));
}

/**
 * Junta problemas repetidos e descarta ruído.
 *
 * Um erro dentro do laço do jogo dispara sessenta vezes por segundo. Sem isto, a lista viraria
 * mil cópias da mesma linha em poucos segundos — e o pedido enviado à IA seria mil vezes a mesma
 * frase, empurrando o código de verdade para fora do contexto.
 */
export function juntarProblemas(problemas: ProblemaDoPreview[]): Array<ProblemaDoPreview & { vezes: number }> {
  const porChave = new Map<string, ProblemaDoPreview & { vezes: number }>();
  for (const p of problemas) {
    const mensagem = (p.mensagem || '').trim();
    if (!mensagem || ehRuido(mensagem)) continue;
    const chave = `${p.tipo}|${mensagem}|${p.linha ?? ''}`;
    const existente = porChave.get(chave);
    if (existente) existente.vezes++;
    else porChave.set(chave, { ...p, mensagem, vezes: 1 });
  }
  return Array.from(porChave.values());
}

/** A linha do código montado que o navegador apontou, sem os espaços das bordas. */
export function linhaDoCodigo(codigoMontado: string, linha?: number): string {
  if (!linha || linha < 1) return '';
  const linhas = (codigoMontado || '').split('\n');
  return (linhas[linha - 1] || '').trim();
}

/**
 * Monta o pedido. Devolve string vazia quando não há erro que justifique incomodar o modelo.
 *
 * Avisos entram como contexto, nunca como motivo: "isto pode ser lento" não é defeito, e mandar
 * a IA "consertar" um aviso costuma produzir alteração onde não havia problema.
 */
export function montarPedidoDeCorrecao(
  problemas: ProblemaDoPreview[],
  codigoMontado: string,
  nomeDoArquivo: string
): string {
  const juntos = juntarProblemas(problemas);
  const erros = juntos.filter(p => p.tipo === 'erro');
  if (erros.length === 0) return '';

  const descrever = (p: ProblemaDoPreview & { vezes: number }) => {
    const partes = [`- ${p.mensagem}`];
    if (p.vezes > 1) partes.push(`  (aconteceu ${p.vezes} vezes — provavelmente dentro de um laço)`);
    if (p.linha || p.textoDaLinha) {
      // O texto que o preview leu vale mais: ele conhece o documento que rodou de verdade.
      const texto = p.textoDaLinha || linhaDoCodigo(codigoMontado, p.linha);
      // A linha do preview não corresponde à linha do arquivo (o projeto é montado com os outros
      // arquivos embutidos), então o que se entrega é o TEXTO — esse sim existe igual nos dois.
      if (texto) partes.push(`  A linha que falhou contém exatamente isto: ${texto}`);
      else partes.push(`  Linha ${p.linha}${p.coluna ? `, coluna ${p.coluna}` : ''} do projeto montado.`);
    }
    return partes.join('\n');
  };

  const avisos = juntos.filter(p => p.tipo === 'aviso').slice(0, 3);

  return `O código deste projeto FOI EXECUTADO e quebrou. Estes são os erros reais que o navegador registrou:

${erros.map(descrever).join('\n')}
${avisos.length > 0 ? `\nAvisos que apareceram junto (não são o defeito, servem só de contexto):\n${avisos.map(a => `- ${a.mensagem}`).join('\n')}\n` : ''}
Conserte a causa destes erros no arquivo "${nomeDoArquivo}".

- Localize o problema pelo TEXTO da linha citada acima, não por número de linha: o preview executa o projeto montado, e a numeração dele não corresponde à do arquivo.
- Corrija a CAUSA, não o sintoma: se uma variável está indefinida, descubra por que ela não foi criada em vez de só cercar com um "if".
- Mexa apenas no necessário para estes erros. Não reescreva partes que estão funcionando.`;
}
