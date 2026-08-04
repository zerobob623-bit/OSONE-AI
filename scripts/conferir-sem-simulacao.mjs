/**
 * Garante que a casa inteligente do OSONE não volte a inventar aparelhos.
 *
 * Por que existe: o painel já foi um simulador com cara de painel real. Vinha com cinco aparelhos
 * inventados (inclusive uma "Fechadura Biométrica"), credenciais falsas de aparência plausível
 * escritas no código, botões de vincular conta que esperavam 1,8s e anunciavam "conta vinculada e
 * autorizada via OAuth", e um rodapé "Nuvem Sincronizada" piscando em verde sobre aparelhos que
 * nunca chegaram perto de nuvem nenhuma. Mexer num interruptor só pintava a tela. Do lado da IA,
 * pedir para ligar a luz sem casa conectada respondia "[SIMULADO] dispositivo LIGADO".
 *
 * Isso é o tipo de coisa que volta sozinha: um dado de exemplo aqui, um fallback ali, cada um
 * inofensivo em si. Este conferidor lê o código-fonte e reprova qualquer reaparecimento.
 *
 * Como rodar:
 *   node scripts/conferir-sem-simulacao.mjs
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf-8');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const painel = ler('src/components/SmartHomeConnect.tsx');
const app = ler('src/App.tsx');
const hook = ler('src/hooks/useTuyaSmartHome.ts');
const tipos = ler('src/types.ts');

// Os comentários explicam o que foi removido e citam os nomes de propósito; a busca ignora
// comentários para não confundir a explicação com o retorno do defeito.
const semComentarios = (fonte) => fonte
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const painelVivo = semComentarios(painel);
const appVivo = semComentarios(app);
const hookVivo = semComentarios(hook);

// 1) Nenhum aparelho de mentira escrito no código.
{
  const inventados = ['Tomada Smart da Sala', 'Lâmpada Inteligente RGB', 'Interruptor Duplo Cozinha',
    'Ar Condicionado Dual', 'Fechadura Biométrica', 'DEFAULT_DEVICES'];
  const achados = inventados.filter(n => painelVivo.includes(n));
  registrar('nenhum aparelho inventado sobrou no painel',
    achados.length === 0,
    achados.length ? `ainda existem: ${achados.join(', ')}` : 'nenhum');
}

// 2) Nenhuma credencial de mentira. Estas tinham cara de real, que é o que as tornava perigosas.
{
  const falsas = ['tuya_app_client_88329', 'secret_tuya_live_771', 'tuya_user_token_active',
    'usuario@osone.app', 'hue_user_osone_key', '192.168.1.105'];
  const achadas = falsas.filter(c => painelVivo.includes(c));
  registrar('nenhuma credencial falsa de aparência real no código',
    achadas.length === 0,
    achadas.length ? `ainda existem: ${achadas.join(', ')}` : 'nenhuma');
}

// 3) O armazém de aparelhos no navegador não pode voltar: era ele o "aparelho" que a IA ligava.
{
  const usos = [painelVivo, appVivo, hookVivo].filter(f => f.includes('osone_smarthome_devices'));
  registrar('a lista de aparelhos não volta a sair do navegador',
    usos.length === 0,
    usos.length ? 'osone_smarthome_devices ainda é lido/escrito' : 'nenhum uso');
}

// 4) Nenhum vínculo de conta fingido.
{
  const fingidos = ['handleSimulateTuyaOAuth', 'Bridge conectado com sucesso', 'vinculada e autorizada'];
  const achados = fingidos.filter(n => painelVivo.includes(n));
  registrar('nenhum botão que finge vincular conta',
    achados.length === 0,
    achados.length ? `ainda existem: ${achados.join(', ')}` : 'nenhum');
}

// 5) A IA não pode ter caminho que responda "[SIMULADO]".
//
// As marcas procuradas são o TEXTO DE RESPOSTA que a ferramenta devolvia, e não qualquer menção à
// palavra: a instrução do modelo agora diz "não existe modo simulado nem ambiente de demonstração",
// e uma busca solta pela palavra reprovaria justamente a frase que proíbe o defeito.
{
  const marcas = ['[SIMULADO]', 'SIMULADO NO AMBIENTE LOCAL', 'ambiente de demonstração local'];
  const achadas = marcas.filter(m => appVivo.includes(m));
  registrar('nenhuma ferramenta da IA responde "simulado"',
    achadas.length === 0,
    achadas.length ? `ainda existem: ${achadas.join(', ')}` : 'nenhuma');
}

// 6) Sem casa conectada, as três ferramentas precisam RECUSAR — e a recusa tem de estar escrita.
{
  const recusas = (appVivo.match(/Não há nenhuma casa inteligente conectada/g) || []).length;
  registrar('as três ferramentas recusam quando não há casa conectada',
    recusas >= 6,
    `${recusas} recusa(s) no texto e na voz (esperado 6: 3 ferramentas × 2 caminhos)`);
}

// 7) O tipo do aparelho de mentira saiu junto.
{
  registrar('os tipos do simulador foram removidos',
    !tipos.includes('export interface SmartDevice') && !tipos.includes('export interface SmartHomeConfig'),
    'SmartDevice e SmartHomeConfig');
}

// 8) A instrução do modelo não pode mais falar em dois modos.
{
  const proibido = appVivo.includes('MODO SIMULADO');
  registrar('a instrução do modelo não descreve mais um modo simulado',
    !proibido,
    proibido ? 'ainda fala em MODO SIMULADO' : 'só fala em aparelhos reais');
}

// 9) Hue e SmartThings não podem voltar como integração que não existe.
{
  const cartoes = ['Testar Conexão Hue', 'Salvar Token SmartThings', 'personalAccessToken'];
  const achados = cartoes.filter(n => painelVivo.includes(n));
  registrar('sem cartões de integração que nunca existiu (Hue, SmartThings)',
    achados.length === 0,
    achados.length ? `ainda existem: ${achados.join(', ')}` : 'nenhum');
}

// 10) O painel precisa MANDAR comando de verdade, e não só pintar a tela.
{
  const manda = painelVivo.includes("'/api/tuya/command'");
  const le = painelVivo.includes("'/api/tuya/devices'");
  registrar('o painel lê os aparelhos e manda comandos de verdade',
    manda && le,
    `lista ${le ? 'OK' : 'AUSENTE'}, comando ${manda ? 'OK' : 'AUSENTE'}`);
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
