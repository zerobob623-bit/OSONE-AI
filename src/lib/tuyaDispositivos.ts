/**
 * O QUE CADA APARELHO DA CASA REALMENTE ACEITA — lido do próprio aparelho, nunca adivinhado.
 *
 * Este módulo existe para que o painel e a IA falem com os aparelhos exatamente do mesmo jeito.
 * Enquanto essa lógica morava só dentro do hook, o painel tinha a sua própria — e a dele não
 * mandava comando nenhum: mexer no botão só pintava a tela.
 *
 * A regra que vale aqui inteira: nenhum código de comando é chutado. Mandar um ponto de dados que
 * o aparelho não tem faz a Tuya ACEITAR o comando e o aparelho ignorá-lo, sem erro em lugar
 * nenhum — o defeito mais caro de achar, porque tudo parece ter funcionado.
 */

export interface PontoDeDados {
  code: string;
  value: any;
}

/** Matiz 0–360 e saturação/valor na escala do PRÓPRIO ponto de dados (ver FAIXA_DE_COR). */
export interface HsvDaTuya {
  h: number;
  s: number;
  v: number;
}

/** Cor no formato do Google Smart Home: matiz 0–360, saturação e valor de 0 a 1. */
export interface HsvDoGoogle {
  hue: number;
  saturation: number;
  value: number;
}

export interface RecursosDoAparelho {
  liga?: { code: string; ligado: boolean };
  /** As duas gerações de brilho da Tuya têm FAIXAS diferentes; mandar na escala errada apaga a
   *  luz quando o pedido era diminuí-la. Por isso a faixa anda junto do código. */
  brilho?: { code: string; min: number; max: number; atual: number };
  /** Idem para a cor: `max` é o teto de saturação/valor desta geração, e `atual` é a cor que o
   *  aparelho diz estar mostrando agora (ausente quando o valor guardado é ilegível). */
  cor?: { code: string; max: number; atual?: HsvDaTuya };
  modo?: { code: string };
}

export const FAIXA_DE_BRILHO: Record<string, { min: number; max: number }> = {
  bright_value_v2: { min: 10, max: 1000 },
  bright_value: { min: 25, max: 255 }
};

/**
 * O teto de saturação/valor de cada geração do ponto de dados de cor.
 *
 * A mesma armadilha do brilho, e ela estava aberta: a montagem de comandos mandava saturação e
 * valor sempre de 0 a 1000, inclusive nas lâmpadas antigas, que usam `colour_data` numa escala
 * que vai só até 255. Nelas, qualquer cor pedida chegava com os dois valores muito acima do teto
 * — a Tuya aceita, responde sucesso, e a lâmpada faz o que entender do lixo. Como o OSONE
 * anunciava a cor pedida, o defeito não tinha como aparecer a não ser olhando a lâmpada.
 */
export const FAIXA_DE_COR: Record<string, { max: number }> = {
  colour_data_v2: { max: 1000 },
  colour_data: { max: 255 }
};

/** Descobre os recursos a partir da lista de pontos de dados que o aparelho reporta. */
export function recursosDosDps(dps: PontoDeDados[]): RecursosDoAparelho {
  const achar = (codigos: string[]) => {
    for (const codigo of codigos) {
      const dp = dps.find(d => d.code === codigo);
      if (dp) return dp;
    }
    return undefined;
  };

  const recursos: RecursosDoAparelho = {};

  const liga = achar(['switch_led', 'switch_1', 'switch', 'switch_one', 'power_switch_1'])
    || dps.find(d => /switch/i.test(d.code) && typeof d.value === 'boolean');
  if (liga) recursos.liga = { code: liga.code, ligado: !!liga.value };

  const brilho = achar(['bright_value_v2', 'bright_value']);
  if (brilho) {
    const faixa = FAIXA_DE_BRILHO[brilho.code] || { min: 10, max: 1000 };
    recursos.brilho = { code: brilho.code, ...faixa, atual: Number(brilho.value) || faixa.min };
  }

  const cor = achar(['colour_data_v2', 'colour_data']);
  if (cor) {
    const { max } = FAIXA_DE_COR[cor.code] || { max: 1000 };
    recursos.cor = { code: cor.code, max, atual: lerHsvDoAparelho(cor.value) };
  }

  const modo = achar(['work_mode']);
  if (modo) recursos.modo = { code: modo.code };

  return recursos;
}

/** O brilho atual em 0–100, para a barra do painel mostrar o valor de verdade do aparelho. */
export function brilhoEmPorcento(brilho: RecursosDoAparelho['brilho']): number | undefined {
  if (!brilho) return undefined;
  const bruto = ((brilho.atual - brilho.min) / (brilho.max - brilho.min)) * 100;
  return Math.max(0, Math.min(100, Math.round(bruto)));
}

/**
 * Compara nomes SEM acento. Os aparelhos se chamam "Lâmpada da Sala" no app Smart Life, e o
 * modelo escreve o que o usuário falou — que vem tanto com acento quanto sem.
 */
export const semAcento = (t: string) =>
  (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

/** Cores por nome, em português, porque é assim que o modelo as recebe de quem fala. */
const CORES_POR_NOME: Record<string, string> = {
  vermelho: '#FF0000', vermelha: '#FF0000',
  verde: '#00FF00',
  azul: '#0000FF',
  amarelo: '#FFFF00', amarela: '#FFFF00',
  ciano: '#00FFFF', turquesa: '#00FFFF',
  magenta: '#FF00FF',
  rosa: '#FF3399',
  laranja: '#FF8000',
  roxo: '#8000FF', violeta: '#8000FF', lilas: '#B060FF',
  dourado: '#FFC000',
  branco: '#FFFFFF', branca: '#FFFFFF'
};

/**
 * Converte cor (hex ou nome) para o formato HSV que a Tuya usa: matiz 0–360, saturação e valor
 * de 0 até `teto` — 1000 nas lâmpadas atuais, 255 nas antigas (ver FAIXA_DE_COR).
 */
export function corParaHsvDaTuya(bruta: any, teto: number = 1000): HsvDaTuya | null {
  const texto = String(bruta || '').trim();
  if (!texto) return null;

  const hex = /^#?[0-9a-f]{6}$/i.test(texto)
    ? texto.replace('#', '')
    : (CORES_POR_NOME[semAcento(texto)] || '').replace('#', '');
  if (!hex) return null;

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return { h, s: Math.round((max === 0 ? 0 : d / max) * teto), v: Math.round(max * teto) };
}

/**
 * Lê a cor que o aparelho reporta. O valor vem como texto JSON na maioria dos modelos e como
 * objeto em alguns; o que não for nenhum dos dois vira `undefined` em vez de uma cor inventada.
 */
export function lerHsvDoAparelho(bruto: any): HsvDaTuya | undefined {
  try {
    const obj = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
    if (!obj || typeof obj !== 'object') return undefined;
    const h = Number(obj.h);
    const s = Number(obj.s);
    const v = Number(obj.v);
    if (![h, s, v].every(Number.isFinite)) return undefined;
    return { h, s, v };
  } catch {
    return undefined;
  }
}

/**
 * A cor guardada no aparelho, no formato que o Google Smart Home entende.
 *
 * A conversão precisa do `max` da geração certa: dividir por 1000 uma saturação que vai até 255
 * devolve ao Google uma cor quase sem saturação, e o app Google Home passa a mostrar cinza para
 * uma lâmpada que está vermelha na parede.
 */
export function corDoAparelhoParaGoogle(cor: RecursosDoAparelho['cor']): HsvDoGoogle | null {
  if (!cor?.atual) return null;
  const teto = cor.max || 1000;
  return {
    hue: Math.max(0, Math.min(360, cor.atual.h)),
    saturation: Math.max(0, Math.min(1, cor.atual.s / teto)),
    value: Math.max(0, Math.min(1, cor.atual.v / teto))
  };
}

/**
 * Converte a cor que o Google manda (spectrumHSV) no hexadecimal que `montarComandos` entende,
 * para que o caminho da cor vinda do Assistente seja o MESMO do painel e do chat — inclusive o
 * acerto de escala e a entrada no modo colorido, que é o que faz a cor realmente aparecer.
 */
export function corDoGoogleParaHex(hsv: any): string | null {
  const h = Number(hsv?.hue);
  const s = Number(hsv?.saturation);
  const v = Number(hsv?.value);
  if (![h, s, v].every(Number.isFinite)) return null;

  const matiz = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));

  const c = val * sat;
  const x = c * (1 - Math.abs(((matiz / 60) % 2) - 1));
  const m = val - c;
  const faixa = Math.floor(matiz / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]
  ][faixa];

  const canal = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${canal(r)}${canal(g)}${canal(b)}`.toUpperCase();
}

export type ComandosOuFalha =
  | { comandos: PontoDeDados[] }
  | { falha: string };

/**
 * Traduz a ação pedida nos comandos que ESTE aparelho entende.
 *
 * Quando o aparelho não tem o recurso, a resposta é uma falha explicada, e não um comando
 * aproximado: dizer que não dá é melhor do que fazer outra coisa e chamar de sucesso.
 */
export function montarComandos(
  recursos: RecursosDoAparelho,
  action: string,
  value?: any,
  color?: any
): ComandosOuFalha {
  if (action === 'turn_on' || action === 'turn_off' || action === 'toggle') {
    if (!recursos.liga) return { falha: "Este aparelho não expõe um comando de liga/desliga que o OSONE saiba usar." };
    const ligado = action === 'turn_on' ? true : action === 'turn_off' ? false : !recursos.liga.ligado;
    return { comandos: [{ code: recursos.liga.code, value: ligado }] };
  }

  if (action === 'set_value') {
    const numero = Number(value);
    if (!Number.isFinite(numero)) return { falha: "O nível pedido não é um número válido (esperado de 0 a 100)." };
    if (!recursos.brilho) return { falha: "Este aparelho não tem controle de brilho." };
    const { code, min, max } = recursos.brilho;
    const proporcao = Math.max(0, Math.min(100, numero)) / 100;
    const comandos: PontoDeDados[] = [{ code, value: Math.round(min + proporcao * (max - min)) }];
    // Brilho em aparelho apagado não se vê. Quem pede "põe em 30%" quer a luz acesa em 30%.
    if (recursos.liga && !recursos.liga.ligado) comandos.unshift({ code: recursos.liga.code, value: true });
    return { comandos };
  }

  if (action === 'set_color') {
    // A checagem do recurso vem ANTES da conversão porque a escala da cor depende da geração do
    // aparelho: converter primeiro obrigaria a chutar um teto e mandá-lo errado nas antigas.
    if (!recursos.cor) return { falha: "Este aparelho não tem luz colorida — só liga, desliga e (às vezes) brilho." };
    const hsv = corParaHsvDaTuya(color, recursos.cor.max);
    if (!hsv) return { falha: `Não reconheci a cor "${color}". Use um nome de cor comum ou um valor hexadecimal (#RRGGBB).` };
    const comandos: PontoDeDados[] = [];
    if (recursos.liga) comandos.push({ code: recursos.liga.code, value: true });
    // Sem entrar no modo colorido, a lâmpada aceita a cor e continua acesa em branco.
    if (recursos.modo) comandos.push({ code: recursos.modo.code, value: 'colour' });
    comandos.push({ code: recursos.cor.code, value: JSON.stringify(hsv) });
    return { comandos };
  }

  return { falha: `Ação "${action}" não é suportada pelo controle Tuya do OSONE.` };
}

/** Descreve em português o que foi realmente mandado ao aparelho. */
export function descreverComandos(comandos: PontoDeDados[]): string {
  return comandos.map(c => {
    if (typeof c.value === 'boolean') return c.value ? 'ligar' : 'desligar';
    if (/^bright_value/.test(c.code)) {
      const faixa = FAIXA_DE_BRILHO[c.code] || { min: 10, max: 1000 };
      const pct = Math.round(((Number(c.value) - faixa.min) / (faixa.max - faixa.min)) * 100);
      return `brilho em ${pct}%`;
    }
    if (/^colour_data/.test(c.code)) {
      const h = (() => { try { return JSON.parse(String(c.value)).h; } catch { return null; } })();
      return h === null ? 'cor ajustada' : `cor ajustada (matiz ${h}°)`;
    }
    if (c.code === 'work_mode') return `modo ${c.value}`;
    return `${c.code} = ${JSON.stringify(c.value)}`;
  }).join(', ');
}

/** Categorias Tuya que são fechadura/trava — exigem confirmação humana explícita. */
export function ehFechadura(category?: string): boolean {
  if (!category) return false;
  const cat = category.toLowerCase().trim();
  if (['ms', 'jtmspro', 'mk', 'jdms', 'lck', 'lock', 'fechadura'].includes(cat)) return true;
  return cat.includes('lock') || cat.includes('fechadura') || cat.includes('door') || cat.includes('latch');
}
