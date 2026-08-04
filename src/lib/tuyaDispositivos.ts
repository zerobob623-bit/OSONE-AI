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

export interface RecursosDoAparelho {
  liga?: { code: string; ligado: boolean };
  /** As duas gerações de brilho da Tuya têm FAIXAS diferentes; mandar na escala errada apaga a
   *  luz quando o pedido era diminuí-la. Por isso a faixa anda junto do código. */
  brilho?: { code: string; min: number; max: number; atual: number };
  cor?: { code: string };
  modo?: { code: string };
}

export const FAIXA_DE_BRILHO: Record<string, { min: number; max: number }> = {
  bright_value_v2: { min: 10, max: 1000 },
  bright_value: { min: 25, max: 255 }
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
  if (cor) recursos.cor = { code: cor.code };

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

/** Converte cor (hex ou nome) para o formato HSV que a Tuya usa: h 0-360, s/v 0-1000. */
export function corParaHsvDaTuya(bruta: any): { h: number; s: number; v: number } | null {
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

  return { h, s: Math.round((max === 0 ? 0 : d / max) * 1000), v: Math.round(max * 1000) };
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
    const hsv = corParaHsvDaTuya(color);
    if (!hsv) return { falha: `Não reconheci a cor "${color}". Use um nome de cor comum ou um valor hexadecimal (#RRGGBB).` };
    if (!recursos.cor) return { falha: "Este aparelho não tem luz colorida — só liga, desliga e (às vezes) brilho." };
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
