import JSZip from 'jszip';
import { CodeRepositoryFile } from '../types';

/**
 * Empacota o projeto num .zip que abre e roda fora do OSONE.
 *
 * Dava para baixar um arquivo por vez. Num projeto de três arquivos isso já é ruim; e o problema
 * de fundo é outro: sem o projeto na mão, o trabalho fica preso dentro do app. Não dá para
 * publicar, mandar para alguém, versionar em outro lugar, nem simplesmente guardar. Um jogo que
 * levou uma tarde para nascer não pode existir só no localStorage de um navegador.
 *
 * A parte que precisa de cuidado não é gerar o zip — é o NOME dos arquivos dentro dele. Nomes
 * chegam aqui como o usuário (ou a IA) escreveu, e um zip é extraído no sistema de arquivos de
 * quem baixou: um nome com "../" escreve FORA da pasta de destino, e um com ":" ou "?" nem
 * extrai no Windows. Sanear aqui é o que faz o pacote ser seguro de abrir.
 */

/** Caracteres proibidos em nome de arquivo no Windows, mais os separadores de caminho. */
const PROIBIDOS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Deixa um nome seguro para virar arquivo no disco de quem abrir o pacote.
 *
 * A remoção de ".." e de barras não é preciosismo: um nome como "../../.bashrc" faz alguns
 * extratores gravarem fora da pasta escolhida. Quem baixa um zip espera que ele encoste apenas
 * onde foi mandado encostar.
 */
export function nomeSeguroDeArquivo(nome: string, reserva = 'arquivo.txt'): string {
  const limpo = (nome || '')
    .split(/[/\\]/).pop()!          // fica só o nome, sem caminho
    .replace(PROIBIDOS, '-')
    .replace(/^\.+/, '')            // nada de nomes que começam com ponto-ponto
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return limpo || reserva;
}

/** O nome do .zip, a partir do nome do projeto. */
export function nomeDoPacote(nomeDoProjeto: string): string {
  const base = nomeSeguroDeArquivo(nomeDoProjeto, 'projeto')
    .replace(/\.zip$/i, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  const dia = new Date().toISOString().slice(0, 10);
  return `${base || 'projeto'}-${dia}.zip`;
}

export interface EntradaDoPacote {
  caminho: string;
  conteudo: string;
}

/**
 * A lista de arquivos que entra no pacote, com os nomes já seguros e sem colisão.
 *
 * A desambiguação existe porque sanear pode COLIDIR: "a/b.js" e "a\\b.js" viram o mesmo "b.js", e
 * o segundo apagaria o primeiro dentro do zip em silêncio. Perder um arquivo na exportação é o
 * tipo de falha que só se descobre depois, ao abrir o pacote e achar que o trabalho sumiu.
 */
export function prepararEntradas(arquivos: CodeRepositoryFile[]): EntradaDoPacote[] {
  const usados = new Set<string>();
  const entradas: EntradaDoPacote[] = [];

  for (const arquivo of arquivos || []) {
    let caminho = nomeSeguroDeArquivo(arquivo.name);
    if (usados.has(caminho.toLowerCase())) {
      const ponto = caminho.lastIndexOf('.');
      const base = ponto === -1 ? caminho : caminho.slice(0, ponto);
      const ext = ponto === -1 ? '' : caminho.slice(ponto);
      let n = 2;
      while (usados.has(`${base}-${n}${ext}`.toLowerCase())) n++;
      caminho = `${base}-${n}${ext}`;
    }
    usados.add(caminho.toLowerCase());
    entradas.push({ caminho, conteudo: arquivo.content ?? '' });
  }
  return entradas;
}

/**
 * Monta o .zip. Devolve null quando não há nada para empacotar — um pacote vazio só faria a
 * pessoa achar que exportou.
 */
export async function montarPacote(
  nomeDoProjeto: string,
  arquivos: CodeRepositoryFile[]
): Promise<{ nome: string; blob: Blob; entradas: EntradaDoPacote[] } | null> {
  const entradas = prepararEntradas(arquivos).filter(e => e.conteudo.trim().length > 0);
  if (entradas.length === 0) return null;

  const zip = new JSZip();
  for (const e of entradas) zip.file(e.caminho, e.conteudo);

  const blob = await zip.generateAsync({
    type: 'blob',
    // Compressão média: o ganho de ir ao máximo é pequeno em texto, e o tempo de espera com um
    // projeto grande é sentido na hora, dentro da própria aba.
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return { nome: nomeDoPacote(nomeDoProjeto), blob, entradas };
}
