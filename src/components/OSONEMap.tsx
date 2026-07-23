import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  MapPin, Search, Compass, Layers, ChevronLeft, Map as MapIcon,
  Plus, Minus, History, Navigation, Loader2, Sparkles, Pin, Check, RotateCw,
  Eye, EyeOff, Maximize2, Globe, X
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '../lib/utils';

/**
 * ── WHAT CHANGED FROM THE OLD VERSION ────────────────────────────────────
 * The previous globe faked "3D" with manual trig on a 2D canvas, and faked
 * continents with hand-placed circles + sine noise. That's why it rendered
 * as a lopsided blob instead of a planet.
 *
 * This version uses a real Three.js scene:
 *   - Real WebGL sphere + camera + raycasting (no manual inverse-rotation math)
 *   - Real world geography (topojson-client + d3-geo + world-atlas) to decide
 *     land vs ocean per point, so the dot-constellation actually traces
 *     recognizable continents
 *   - Proper depth-buffer occlusion (no more far-side dots bleeding through)
 *   - A fresnel atmosphere shader for the "holographic core" glow
 *
 * New dependencies to install in the project:
 *   npm install three topojson-client d3-geo world-atlas
 *   npm install -D @types/three @types/topojson-client @types/d3-geo
 * ──────────────────────────────────────────────────────────────────────── */

// Banco de dados geográfico local offline para sintonização instantânea das principais cidades brasileiras, estados e países globais
const LOCAL_GEO_DB: Array<{ names: string[]; displayName: string; lat: number; lng: number; desc: string }> = [
  // Estados Brasileiros
  { names: ['rio grande do sul', 'estado do rio grande do sul', 'rs', 'gaucho'], displayName: 'Rio Grande do Sul, Brasil', lat: -30.0346, lng: -51.2177, desc: 'Estado gaúcho no extremo sul do Brasil, famoso pela cultura tradicional, pampas e serras' },
  { names: ['rio grande do norte', 'estado do rio grande do norte', 'rn'], displayName: 'Rio Grande do Norte, Brasil', lat: -5.7945, lng: -35.2110, desc: 'Estado do nordeste brasileiro famoso pelas dunas, praias e litoral exuberante' },
  { names: ['bahia', 'estado da bahia', 'ba'], displayName: 'Bahia, Brasil', lat: -12.9714, lng: -38.5014, desc: 'Estado no nordeste brasileiro, centro de história, cultura afro-brasileira e praias' },
  { names: ['minas gerais', 'estado de minas gerais', 'mg'], displayName: 'Minas Gerais, Brasil', lat: -19.9167, lng: -43.9345, desc: 'Estado mineiro no sudeste, rico em cidades históricas, serras e gastronomia' },
  { names: ['santa catarina', 'estado de santa catarina', 'sc'], displayName: 'Santa Catarina, Brasil', lat: -27.5954, lng: -48.5480, desc: 'Estado do sul com litoral paradisíaco, serras frias e forte cultura europeia' },
  { names: ['parana', 'estado do parana', 'pr'], displayName: 'Paraná, Brasil', lat: -25.4284, lng: -49.2733, desc: 'Estado do sul, lar das Cataratas do Iguaçu e florestas de araucárias' },
  { names: ['sao paulo estado', 'estado de sao paulo', 'sp estado'], displayName: 'São Paulo (Estado), Brasil', lat: -23.5505, lng: -46.6333, desc: 'Motor econômico do Brasil, com metrópoles vibrantes, indústria e litoral' },
  { names: ['rio de janeiro estado', 'estado do rio de janeiro', 'rj estado'], displayName: 'Rio de Janeiro (Estado), Brasil', lat: -22.9068, lng: -43.1729, desc: 'Estado da Região Sudeste, de belas praias na Costa Verde e Região dos Lagos' },
  { names: ['ceara', 'estado do ceara', 'ce'], displayName: 'Ceará, Brasil', lat: -3.7319, lng: -38.5267, desc: 'Estado do nordeste famoso por dunas, falésias e vento constante para kitesurf' },
  { names: ['pernambuco', 'estado de pernambuco', 'pe'], displayName: 'Pernambuco, Brasil', lat: -8.0543, lng: -34.8813, desc: 'Estado do nordeste, berço do frevo, maracatu e Fernando de Noronha' },
  { names: ['goias', 'estado de goias', 'go'], displayName: 'Goiás, Brasil', lat: -16.6869, lng: -49.2648, desc: 'Coração do centro-oeste brasileiro, rico em águas termais e arquitetura colonial' },
  { names: ['mato grosso', 'estado de mato grosso', 'mt'], displayName: 'Mato Grosso, Brasil', lat: -15.6010, lng: -56.0974, desc: 'Estado do Pantanal e da Amazônia meridional, gigante do agronegócio' },
  { names: ['mato grosso do sul', 'estado de mato grosso do sul', 'ms'], displayName: 'Mato Grosso do Sul, Brasil', lat: -20.4697, lng: -54.6201, desc: 'Estado santuário do Pantanal e águas cristalinas de Bonito' },
  { names: ['para', 'estado do para', 'pa'], displayName: 'Pará, Brasil', lat: -1.4558, lng: -48.4902, desc: 'Gigante amazônico do norte, terra do açaí, carimbó e rio Amazonas' },
  { names: ['amazonas', 'estado do amazonas', 'am'], displayName: 'Amazonas, Brasil', lat: -3.1190, lng: -60.0217, desc: 'Maior estado brasileiro, coberto pela imensa Floresta Amazônica' },
  { names: ['maranhao', 'estado do maranhao', 'ma'], displayName: 'Maranhão, Brasil', lat: -2.5307, lng: -44.3068, desc: 'Estado dos deslumbrantes Lençóis Maranhenses e casarões coloniais' },
  { names: ['espirito santo', 'estado do espirito santo', 'es'], displayName: 'Espírito Santo, Brasil', lat: -20.3155, lng: -40.3128, desc: 'Estado capixaba, famoso pela moqueca, praias e montanhas da Serra' },
  { names: ['alagoas', 'estado de alagoas', 'al'], displayName: 'Alagoas, Brasil', lat: -9.6658, lng: -35.7350, desc: 'Estado do caribe brasileiro, com águas cristalinas e barreiras de corais' },
  { names: ['sergipe', 'estado de sergipe', 'se'], displayName: 'Sergipe, Brasil', lat: -10.9472, lng: -37.0731, desc: 'Menor estado do Brasil em extensão, rico em cânions do São Francisco' },
  { names: ['piaui', 'estado do piaui', 'pi'], displayName: 'Piauí, Brasil', lat: -5.0919, lng: -42.8034, desc: 'Estado da Serra da Capivara, berço da pré-história sul-americana' },
  { names: ['paraiba', 'estado da paraiba', 'pb'], displayName: 'Paraíba, Brasil', lat: -7.1195, lng: -34.8450, desc: 'Ponto mais oriental das Américas e tradição do Maior São João do Mundo' },
  { names: ['tocantins', 'estado de tocantins', 'to'], displayName: 'Tocantins, Brasil', lat: -10.1844, lng: -48.3336, desc: 'Estado do Jalapão, fervedouros de águas cristalinas e dunas douradas' },
  { names: ['rondonia', 'estado de rondonia', 'ro'], displayName: 'Rondônia, Brasil', lat: -8.7619, lng: -63.9039, desc: 'Estado do norte banhado pelo rio Madeira e de forte produção agrícola' },
  { names: ['acre', 'estado do acre', 'ac'], displayName: 'Acre, Brasil', lat: -9.9747, lng: -67.8076, desc: 'Estado da borracha, biodiversidade amazônica e geoglifos ancestrais' },
  { names: ['roraima', 'estado de roraima', 'rr'], displayName: 'Roraima, Brasil', lat: 2.8196, lng: -60.6714, desc: 'Estado do imponente Monte Roraima e da savana amazônica' },
  { names: ['amapa', 'estado do amapa', 'ap'], displayName: 'Amapá, Brasil', lat: 0.0349, lng: -51.0694, desc: 'Estado cortado pelo Equador, banhado pelo Amazonas e Atlântico' },

  // Capitais brasileiras e grandes cidades
  { names: ['sao paulo', 'sp', 'sao paulo, brasil', 'sao paulo city', 'sampa'], displayName: 'São Paulo, Brasil', lat: -23.5505, lng: -46.6333, desc: 'Maior metrópole e polo financeiro da América do Sul' },
  { names: ['rio de janeiro', 'rio', 'rj', 'rio de janeiro, brasil', 'cidade maravilhosa'], displayName: 'Rio de Janeiro, Brasil', lat: -22.9068, lng: -43.1729, desc: 'Coração tropical, praias icônicas e relevo sinuoso' },
  { names: ['brasilia', 'df', 'capital do brasil', 'distrito federal'], displayName: 'Brasília, Brasil', lat: -15.7975, lng: -47.8919, desc: 'Capital federal, obra-prima do urbanismo modernista de Oscar Niemeyer' },
  { names: ['salvador', 'salvador, bahia', 'ssa'], displayName: 'Salvador, Brasil', lat: -12.9714, lng: -38.5014, desc: 'Primeira capital do Brasil, rica cultura afro-brasileira e Pelourinho' },
  { names: ['belo horizonte', 'bh', 'belo horizonte, minas gerais', 'beaga'], displayName: 'Belo Horizonte, Brasil', lat: -19.9167, lng: -43.9345, desc: 'Capital mineira, cercada por serras e famosa pela gastronomia tradicional' },
  { names: ['fortaleza', 'fortaleza, ceara'], displayName: 'Fortaleza, Brasil', lat: -3.7319, lng: -38.5267, desc: 'Capital cearense, belas praias urbanas e vibrante polo do Nordeste' },
  { names: ['manaus', 'manaus, amazonas', 'amazonia'], displayName: 'Manaus, Brasil', lat: -3.1190, lng: -60.0217, desc: 'Metrópole no coração da Floresta Amazônica e Teatro Amazonas' },
  { names: ['curitiba', 'curitiba, parana'], displayName: 'Curitiba, Brasil', lat: -25.4284, lng: -49.2733, desc: 'Capital paranaense, modelo internacional de planejamento urbano e áreas verdes' },
  { names: ['recife', 'recife, pernambuco', 'veneza brasileira'], displayName: 'Recife, Brasil', lat: -8.0543, lng: -34.8813, desc: 'Polo tecnológico e cultural de Pernambuco, cortado por rios e pontes' },
  { names: ['porto alegre', 'poa', 'porto alegre, rio grande do sul', 'portoalegre'], displayName: 'Porto Alegre, Brasil', lat: -30.0346, lng: -51.2177, desc: 'Capital dos gaúchos, às margens do Lago Guaíba' },
  { names: ['belem', 'belem, para', 'cidade das mangueiras'], displayName: 'Belém, Brasil', lat: -1.4558, lng: -48.4902, desc: 'Portal da Amazônia, famosa pelo Mercado do Ver-o-Peso' },
  { names: ['goiania', 'goiania, goias'], displayName: 'Goiânia, Brasil', lat: -16.6869, lng: -49.2648, desc: 'Capital de Goiás, conhecida pelo traçado art déco e arborização abundante' },
  { names: ['campinas', 'campinas, sao paulo'], displayName: 'Campinas, Brasil', lat: -22.9056, lng: -47.0608, desc: 'Importante polo de tecnologia, ciência e inovação no interior paulista' },
  { names: ['sao luis', 'sao luis, maranhao'], displayName: 'São Luís, Brasil', lat: -2.5307, lng: -44.3068, desc: 'Capital maranhense, única fundada por franceses, com casarões históricos' },
  { names: ['maceio', 'maceio, alagoas'], displayName: 'Maceió, Brasil', lat: -9.6658, lng: -35.7350, desc: 'Paraíso das águas azul-turquesa e piscinas naturais de Alagoas' },
  { names: ['natal', 'natal, rio grande do norte', 'cidade do sol'], displayName: 'Natal, Brasil', lat: -5.7945, lng: -35.2110, desc: 'Cidade do Sol, famosa pelas dunas móveis e Forte dos Reis Magos' },
  { names: ['teresina', 'teresina, piaui'], displayName: 'Teresina, Brasil', lat: -5.0919, lng: -42.8034, desc: 'Única capital nordestina fora do litoral, conhecida como Cidade Verde' },
  { names: ['joao pessoa', 'joao pessoa, paraiba', 'jampa'], displayName: 'João Pessoa, Brasil', lat: -7.1195, lng: -34.8450, desc: 'Onde o sol nasce primeiro nas Américas (Ponta do Seixas)' },
  { names: ['florianopolis', 'floripa', 'florianopolis, santa catarina'], displayName: 'Florianópolis, Brasil', lat: -27.5954, lng: -48.5480, desc: 'Ilha da Magia, praias deslumbrantes e alta qualidade de vida' },
  { names: ['vitoria', 'vitoria, espirito santo'], displayName: 'Vitória, Brasil', lat: -20.3155, lng: -40.3128, desc: 'Capital capixaba, charmosa cidade arquipélago rodeada de montanhas' },
  { names: ['aracaju', 'aracaju, sergipe'], displayName: 'Aracaju, Brasil', lat: -10.9472, lng: -37.0731, desc: 'Capital de Sergipe, famosa por sua Orla de Atalaia e calmaria' },
  { names: ['cuiaba', 'cuiaba, mato grosso'], displayName: 'Cuiabá, Brasil', lat: -15.6010, lng: -56.0974, desc: 'Centro geográfico da América do Sul, portal para o Pantanal' },
  { names: ['campo grande', 'campo grande, mato grosso do sul'], displayName: 'Campo Grande, Brasil', lat: -20.4697, lng: -54.6201, desc: 'Cidade Morena, rica biodiversidade urbana e cultura pantaneira' },
  { names: ['porto velho', 'porto velho, rondonia'], displayName: 'Porto Velho, Brasil', lat: -8.7619, lng: -63.9039, desc: 'Capital de Rondônia, às margens do caudaloso Rio Madeira' },
  { names: ['macapa', 'macapa, amapa', 'linha do equador'], displayName: 'Macapá, Brasil', lat: 0.0349, lng: -51.0694, desc: 'Capital banhada pelo Rio Amazonas, cortada exatamente pela Linha do Equador' },
  { names: ['rio branco', 'rio branco, acre'], displayName: 'Rio Branco, Brasil', lat: -9.9747, lng: -67.8076, desc: 'Capital do Acre, cercada por florestas e história revolucionária' },
  { names: ['boa vista', 'boa vista, roraima'], displayName: 'Boa Vista, Brasil', lat: 2.8196, lng: -60.6714, desc: 'Única capital brasileira totalmente acima da Linha do Equador' },
  { names: ['palmas', 'palmas, tocantins'], displayName: 'Palmas, Brasil', lat: -10.1844, lng: -48.3336, desc: 'Mais jovem capital planejada do Brasil, cercada de serras e lagos' },
  { names: ['santos', 'santos, sao paulo'], displayName: 'Santos, Brasil', lat: -23.9608, lng: -46.3331, desc: 'Maior porto de contêineres da América Latina e belos jardins de praia' },
  { names: ['jundiai', 'jundiai, sao paulo'], displayName: 'Jundiaí, Brasil', lat: -23.1857, lng: -46.8844, desc: 'Terra da Uva e do morango, encostada na exuberante Serra do Japi' },
  { names: ['sorocaba', 'sorocaba, sao paulo'], displayName: 'Sorocaba, Brasil', lat: -23.5015, lng: -47.4522, desc: 'Grande polo industrial e de ciclovias no interior de São Paulo' },
  { names: ['ribeirao preto', 'ribeirao preto, sao paulo', 'capital do chopp'], displayName: 'Ribeirão Preto, Brasil', lat: -21.1767, lng: -47.8100, desc: 'Polo do agronegócio e tradicionalmente chamada de Califórnia Brasileira' },
  { names: ['sao jose dos campos', 'sjc', 'sao jose dos campos, sao paulo'], displayName: 'São José dos Campos, Brasil', lat: -23.1791, lng: -45.8872, desc: 'Centro aeroespacial brasileiro e sede da Embraer' },

  // Países e territórios globais
  { names: ['china', 'republica popular da china', 'prc'], displayName: 'China', lat: 35.8617, lng: 104.1954, desc: 'Nação milenar do leste asiático, centro industrial e cultural' },
  { names: ['japao', 'japan', 'nippon', 'nihon'], displayName: 'Japão', lat: 36.2048, lng: 138.2529, desc: 'Arquipélago vulcânico do pacífico, pioneiro em tecnologia e tradições' },
  { names: ['estados unidos', 'usa', 'eua', 'united states', 'america'], displayName: 'Estados Unidos', lat: 37.0902, lng: -95.7129, desc: 'Vasta nação norte-americana do atlântico ao pacífico' },
  { names: ['franca', 'france'], displayName: 'França', lat: 46.2276, lng: 2.2137, desc: 'Nação europeia famosa por arte, gastronomia e monumentos históricos' },
  { names: ['alemanha', 'germany', 'deutschland'], displayName: 'Alemanha', lat: 51.1657, lng: 10.4515, desc: 'Potência industrial e cultural no centro da Europa' },
  { names: ['italia', 'italy'], displayName: 'Itália', lat: 41.8719, lng: 12.5674, desc: 'Península mediterrânea rica em história da antiguidade e arte renascentista' },
  { names: ['espanha', 'spain', 'espana'], displayName: 'Espanha', lat: 40.4637, lng: -3.7492, desc: 'Nação ibérica vibrante com litoral mediterrâneo e rica arquitetura' },
  { names: ['reino unido', 'inglaterra', 'uk', 'united kingdom', 'england'], displayName: 'Reino Unido', lat: 55.3781, lng: -3.4360, desc: 'Nação insular no noroeste da Europa com milênios de tradições' },
  { names: ['russia', 'russian federation'], displayName: 'Rússia', lat: 61.5240, lng: 105.3188, desc: 'Maior país do planeta em extensão territorial, unindo Europa e Ásia' },
  { names: ['india'], displayName: 'Índia', lat: 20.5937, lng: 78.9629, desc: 'Subcontinente asiático de imensa diversidade cultural e histórica' },
  { names: ['australia'], displayName: 'Austrália', lat: -25.2744, lng: 133.7751, desc: 'País-continente cercado pelos oceanos Índico e Pacífico' },
  { names: ['canada'], displayName: 'Canadá', lat: 56.1304, lng: -106.3468, desc: 'Vasto território norte-americano de paisagens glaciais e florestas' },
  { names: ['mexico'], displayName: 'México', lat: 23.6345, lng: -102.5528, desc: 'Terra de antigas civilizações maias e astecas e rica cultura' },
  { names: ['argentina'], displayName: 'Argentina', lat: -38.4161, lng: -63.6167, desc: 'Nação sul-americana da Patagônia aos Andes' },
  { names: ['chile'], displayName: 'Chile', lat: -35.6751, lng: -71.5430, desc: 'Extensa faixa entre os Andes e o Pacífico' },
  { names: ['colombia'], displayName: 'Colômbia', lat: 4.5709, lng: -74.2973, desc: 'Portal da América do Sul banhado pelo Caribe e Pacífico' },
  { names: ['egito', 'egypt'], displayName: 'Egito', lat: 26.8206, lng: 30.8025, desc: 'Berço da civilização faraônica e do Rio Nilo' },
  { names: ['portugal'], displayName: 'Portugal', lat: 39.3999, lng: -8.2245, desc: 'Nação ibérica banhada pelo Atlântico, história das navegações' },

  // Grandes hubs mundiais
  { names: ['toquio', 'tokyo', 'tokio', 'capital do japao'], displayName: 'Tóquio, Japão', lat: 35.6762, lng: 139.6503, desc: 'A capital cibernética e de néon do amanhã' },
  { names: ['paris', 'cidade luz', 'capital da franca'], displayName: 'Paris, França', lat: 48.8566, lng: 2.3522, desc: 'Cidade Luz, epicentro de arte, moda e arquitetura secular' },
  { names: ['nova york', 'new york', 'ny', 'nyc'], displayName: 'Nova York, EUA', lat: 40.7128, lng: -74.0060, desc: 'Coração financeiro e cultural do planeta, a cidade que nunca dorme' },
  { names: ['londres', 'london', 'capital da inglaterra'], displayName: 'Londres, Reino Unido', lat: 51.5074, lng: -0.1278, desc: 'Metrópole histórica com rica fusão de realeza e vanguarda cultural' },
  { names: ['roma', 'rome', 'capital da italia'], displayName: 'Roma, Itália', lat: 41.9028, lng: 12.4964, desc: 'Cidade Eterna, museu a céu aberto do antigo Império Romano' },
  { names: ['berlim', 'berlin', 'capital da alemanha'], displayName: 'Berlim, Alemanha', lat: 52.5200, lng: 13.4050, desc: 'Vibrante centro de arte, música eletrônica e história da Guerra Fria' },
  { names: ['madri', 'madrid', 'capital da espanha'], displayName: 'Madri, Espanha', lat: 40.4168, lng: -3.7038, desc: 'Capital espanhola, famosa por museus reais e gastronomia refinada' },
  { names: ['lisboa', 'lisbon', 'capital de portugal'], displayName: 'Lisboa, Portugal', lat: 38.7223, lng: -9.1393, desc: 'Cidade das sete colinas, fado e azulejos centenários' },
  { names: ['reykjavik', 'capital da islandia'], displayName: 'Reykjavík, Islândia', lat: 64.1466, lng: -21.9426, desc: 'Refúgio ártico cercado de gêiseres, vulcões e auroras boreais' },
  { names: ['seul', 'seoul', 'coreia do sul', 'capital da coreia'], displayName: 'Seul, Coreia do Sul', lat: 37.5665, lng: 126.9780, desc: 'Metrópole futurista líder em K-Pop, skincare e semicondutores' },
  { names: ['pequim', 'beijing', 'capital da china'], displayName: 'Pequim, China', lat: 39.9042, lng: 116.4074, desc: 'Capital milenar chinesa, lar da Cidade Proibida e Grande Muralha' },
  { names: ['xangai', 'shanghai'], displayName: 'Xangai, China', lat: 31.2304, lng: 121.4737, desc: 'Pulsante floresta de arranha-céus na costa da China' },
  { names: ['singapura', 'singapore'], displayName: 'Singapura', lat: 1.3521, lng: 103.8198, desc: 'Cidade-estado ultra-moderna integrada à natureza e arranha-céus verdes' },
  { names: ['mumbai', 'baimbaim', 'bombaim', 'india'], displayName: 'Mumbai, Índia', lat: 19.0760, lng: 72.8777, desc: 'Coração econômico indiano e o vibrante lar de Bollywood' },
  { names: ['nova deli', 'new delhi'], displayName: 'Nova Deli, Índia', lat: 28.6139, lng: 77.2090, desc: 'Capital indiana, rica em templos ornamentados e mercados vibrantes' },
  { names: ['cairo', 'egito', 'capital do egito', 'piramides'], displayName: 'Cairo, Egito', lat: 30.0444, lng: 31.2357, desc: 'Portal para as Pirâmides de Gizé e os mistérios dos faraós' },
  { names: ['cidade do cabo', 'cape town', 'africa do sul'], displayName: 'Cidade do Cabo, África do Sul', lat: -33.9249, lng: 18.4241, desc: 'Belíssima cidade costeira coroada pela Table Mountain' },
  { names: ['sydney', 'sidnei', 'australia'], displayName: 'Sydney, Austrália', lat: -33.8688, lng: 151.2093, desc: 'Maior porto natural do mundo, famosa por sua icônica Opera House' },
  { names: ['melbourne', 'australia'], displayName: 'Melbourne, Austrália', lat: -37.8136, lng: 144.9631, desc: 'Capital cultural australiana, rica em ruelas de graffiti e café' },
  { names: ['auckland', 'nova zelandia'], displayName: 'Auckland, Nova Zelândia', lat: -36.8485, lng: 174.7633, desc: 'Cidade das Velas, de relevo vulcânico e praias deslumbrantes' },
  { names: ['viena', 'vienna', 'austria'], displayName: 'Viena, Áustria', lat: 48.2082, lng: 16.3738, desc: 'Centro da música clássica, palácios imperiais e cafés finos' },
  { names: ['amsterda', 'amsterdam', 'holanda', 'paises baixos'], displayName: 'Amsterdã, Países Baixos', lat: 52.3676, lng: 4.9041, desc: 'Cidade dos canais românticos, bicicletas e museu de Van Gogh' },
  { names: ['bruxelas', 'brussels', 'belgica'], displayName: 'Bruxelas, Bélgica', lat: 50.8503, lng: 4.3517, desc: 'Sede da União Europeia, famosa por chocolates finos e quadrinhos' },
  { names: ['atenas', 'athens', 'grecia'], displayName: 'Atenas, Grécia', lat: 37.9838, lng: 23.7275, desc: 'Berço da filosofia ocidental e da democracia, dominada pela Acrópole' },
  { names: ['moscou', 'moscow', 'russia'], displayName: 'Moscou, Rússia', lat: 55.7558, lng: 37.6173, desc: 'Coração da Rússia, dominado pelo Kremlin e a colorida Catedral de São Basílio' },
  { names: ['kiev', 'kyiv', 'ucrania'], displayName: 'Kyiv, Ucrânia', lat: 50.4501, lng: 30.5234, desc: 'Cidade histórica ucraniana, famosa por mosteiros de cúpulas douradas' },
  { names: ['los angeles', 'la', 'california', 'hollywood'], displayName: 'Los Angeles, EUA', lat: 34.0522, lng: -118.2437, desc: 'Centro da indústria cinematográfica mundial, praias ensolaradas e celebridades' },
  { names: ['chicago', 'illinois'], displayName: 'Chicago, EUA', lat: 41.8781, lng: -87.6298, desc: 'Cidade dos Ventos, famosa por sua arquitetura arrojada e esculturas urbanas' },
  { names: ['sao francisco', 'san francisco', 'sf'], displayName: 'São Francisco, EUA', lat: 37.7749, lng: -122.4194, desc: 'Polo do Vale do Silício, com a famosa ponte Golden Gate' },
  { names: ['miami', 'florida'], displayName: 'Miami, EUA', lat: 25.7617, lng: -80.1918, desc: 'Hub latino nos EUA, praias paradisíacas e vida noturna agitada' },
  { names: ['seattle', 'washington'], displayName: 'Seattle, EUA', lat: 47.6062, lng: -122.3321, desc: 'Lar do Space Needle, florestas exuberantes e berço da cultura grunge' },
  { names: ['toronto', 'canada'], displayName: 'Toronto, Canadá', lat: 43.6532, lng: -79.3832, desc: 'Maior cidade canadense, cosmopolita e encabeçada pela CN Tower' },
  { names: ['vancouver', 'canada'], displayName: 'Vancouver, Canadá', lat: 49.2827, lng: -123.1207, desc: 'Pérola do Pacífico cercada de montanhas nevadas e florestas temperadas' },
  { names: ['montreal', 'canada'], displayName: 'Montreal, Canadá', lat: 45.5017, lng: -73.5673, desc: 'Charmosa metrópole bilíngue com forte influência francesa' },
  { names: ['cidade do mexico', 'mexico city', 'mexico'], displayName: 'Cidade do México, México', lat: 19.4326, lng: -99.1332, desc: 'Metrópole vibrante erguida sobre as ruínas do antigo império Asteca' },
  { names: ['buenos aires', 'argentina', 'capital da argentina'], displayName: 'Buenos Aires, Argentina', lat: -34.6037, lng: -58.3816, desc: 'Capital argentina do tango, cafés históricos e arquitetura europeia' },
  { names: ['santiago', 'chile', 'capital do chile'], displayName: 'Santiago, Chile', lat: -33.4489, lng: -70.6693, desc: 'Capital chilena emoldurada pela imponente Cordilheira dos Andes' },
  { names: ['bogota', 'colombia', 'capital da colombia'], displayName: 'Bogotá, Colômbia', lat: 4.7110, lng: -74.0721, desc: 'Metrópole andina, coração econômico e cultural colombiano' },
  { names: ['lima', 'peru', 'capital do peru'], displayName: 'Lima, Peru', lat: -12.0464, lng: -77.0428, desc: 'Capital gastronômica das Américas e antiga joia do vice-reinado espanhol' },
  { names: ['caracas', 'venezuela', 'capital da venezuela'], displayName: 'Caracas, Venezuela', lat: 10.4806, lng: -66.9036, desc: 'Capital venezuelana, localizada em um lindo vale próximo ao Caribe' },
  { names: ['dubai', 'emirados arabes'], displayName: 'Dubai, Emirados Árabes', lat: 25.2048, lng: 55.2708, desc: 'Oásis tecnológico no deserto, lar do maior arranha-céu do mundo' },
  { names: ['jerusalem', 'israel', 'cidade santa'], displayName: 'Jerusalém, Israel', lat: 31.7683, lng: 35.2137, desc: 'Cidade sagrada para as três grandes religiões monoteístas' },
  { names: ['meca', 'mecca', 'arabia saudita'], displayName: 'Meca, Arábia Saudita', lat: 21.3891, lng: 39.8579, desc: 'O local mais sagrado do Islã, destino anual de milhões em peregrinação' },
  { names: ['bangkok', 'tailandia', 'capital da tailandia'], displayName: 'Bangkok, Tailândia', lat: 13.7563, lng: 100.5018, desc: 'Capital tailandesa dos templos de ouro ornamentados e canais flutuantes' }
];

// Preset locations to play with inside OSONE
const PRESET_PLACES = [
  { name: 'São Paulo, Brasil', lat: -23.5505, lng: -46.6333, desc: 'Metrópole pulsar da América Latina' },
  { name: 'Tóquio, Japão', lat: 35.6762, lng: 139.6503, desc: 'A capital cibernética do futuro' },
  { name: 'Paris, França', lat: 48.8566, lng: 2.3522, desc: 'Cidade Luz e centro de harmonia' },
  { name: 'Nova York, EUA', lat: 40.7128, lng: -74.0060, desc: 'O fulcro financeiro e cultural' },
  { name: 'Rio de Janeiro, Brasil', lat: -22.9068, lng: -43.1729, desc: 'Coração tropical e sinuoso' },
  { name: 'Reykjavík, Islândia', lat: 64.1466, lng: -21.9426, desc: 'Estação ártica e auroras boreais' }
];

// Numeric (three.js) color themes — same palette as before, per style
const STYLE_THEMES: Record<string, { land: number; grid: number; activeMarker: number; atmosphere: number; ambientColor: number; sunColor: number }> = {
  slate: { land: 0x3b82f6, grid: 0x1e293b, activeMarker: 0xf97316, atmosphere: 0x1d4ed8, ambientColor: 0x18181b, sunColor: 0xffffff },
  satellite: { land: 0x0ea5e9, grid: 0x334155, activeMarker: 0xef4444, atmosphere: 0x0ea5e9, ambientColor: 0x3f3f46, sunColor: 0xffffff },
  warm: { land: 0xeab308, grid: 0x451a03, activeMarker: 0xf59e0b, atmosphere: 0xd97706, ambientColor: 0x27272a, sunColor: 0xffedd5 },
  terrain: { land: 0x10b981, grid: 0x064e3b, activeMarker: 0x8b5cf6, atmosphere: 0x10b981, ambientColor: 0x18181b, sunColor: 0xf0fdf4 }
};

const RADIUS = 2.4;
const ATMOSPHERE_RADIUS = RADIUS * 1.15;
const BASE_DISTANCE = 10;

// ── Geo math helpers ────────────────────────────────────────────────────
function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vector3ToLatLng(v: THREE.Vector3): { lat: number; lng: number } {
  const n = v.clone().normalize();
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)) * 180) / Math.PI;
  let lng = (Math.atan2(n.z, -n.x) * 180) / Math.PI - 180;
  lng = ((lng + 180) % 360 + 360) % 360 - 180;
  return { lat, lng };
}

function destinationPoint(lat: number, lng: number, bearing: number, distanceKm: number) {
  const R = 6371;
  const angDist = distanceKm / R;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const destLat = Math.asin(
    Math.sin(latRad) * Math.cos(angDist) + Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearing)
  );
  const destLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angDist) * Math.cos(latRad),
      Math.cos(angDist) - Math.sin(latRad) * Math.sin(destLat)
    );
  return { lat: (destLat * 180) / Math.PI, lng: (destLng * 180) / Math.PI };
}

// Yaw/pitch that would rotate the given local unit vector onto +Z (facing camera),
// keeping "north" consistently up (no roll drift).
function computeCenteringAngles(lat: number, lng: number) {
  const v = latLngToVector3(lat, lng, 1);
  const yaw = Math.atan2(-v.x, v.z);
  const vzAfterYaw = Math.sqrt(v.x * v.x + v.z * v.z);
  const pitch = Math.atan2(v.y, vzAfterYaw);
  return { yaw, pitch };
}

function orientOutward(obj: THREE.Object3D, localDir: THREE.Vector3) {
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localDir.clone().normalize());
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
      else child.material.dispose();
    }
  });
}

interface PulseRing {
  mesh: THREE.Mesh;
}

interface GlobeState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  globeGroup: THREE.Group;
  earthMesh: THREE.Mesh;
  earthMat: THREE.MeshPhongMaterial;
  cloudMesh: THREE.Mesh | null;
  cloudMat: THREE.MeshPhongMaterial | null;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  textures: {
    day: THREE.Texture;
    night: THREE.Texture;
    dark: THREE.Texture;
    bump: THREE.Texture;
    specular: THREE.Texture;
    clouds: THREE.Texture;
  };
  equatorLine: THREE.Line;
  meridianLine: THREE.Line;
  atmosMat: THREE.ShaderMaterial;
  markerGroup: THREE.Group;
  markerMat: THREE.MeshBasicMaterial;
  markerRingMat: THREE.MeshBasicMaterial;
  triGroup: THREE.Group;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  clock: THREE.Clock;
  animId: number;
  // live simulation state (avoids stale-closure bugs — always read via ref.current)
  yaw: number;
  pitch: number;
  yawVel: number;
  pitchVel: number;
  isDragging: boolean;
  lastX: number;
  lastY: number;
  isCentering: boolean;
  targetYaw: number;
  targetPitch: number;
  orbitMode: 'off' | '2d' | '3d';
  pulseRings: PulseRing[];
  targetDist?: number;
}

interface OSONEMapProps {
  onClose: () => void;
  initialSearchQuery?: string;
  onLocationFound?: (placeName: string, coords: { lat: number; lng: number }) => void;
}

export const OSONEMap = ({ onClose, initialSearchQuery = '', onLocationFound }: OSONEMapProps) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<GlobeState | null>(null);
  const [isGlobeLoading, setIsGlobeLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [isSearching, setIsSearching] = useState(false);

  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({ lat: -23.5505, lng: -46.6333 });
  const [focalCoords, setFocalCoords] = useState<{ lat: number; lng: number }>({ lat: -23.5505, lng: -46.6333 });
  const [orbitMode, setOrbitMode] = useState<'off' | '2d' | '3d'>('2d');
  const [zoomLevel, setZoomLevel] = useState<number>(1.2);
  const [mapStyle, setMapStyle] = useState<'slate' | 'satellite' | 'terrain' | 'warm'>('slate');
  const [locationName, setLocationName] = useState('São Paulo, Brasil');
  const [noResults, setNoResults] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isTriangulating, setIsTriangulating] = useState(false);
  const [triangulationPoints, setTriangulationPoints] = useState<Array<{
    id: string; name: string; lat: number; lng: number; radiusKm: number; color: string;
  }>>([]);
  const [positioningTarget, setPositioningTarget] = useState<'A' | 'B' | 'C' | null>(null);

  const [searchHistory, setSearchHistory] = useState<Array<{ name: string; lat: number; lng: number; time: string }>>([
    { name: 'São Paulo, Brasil', lat: -23.5505, lng: -46.6333, time: 'Definido como Padrão' }
  ]);

  // Satellite Lens Viewfinder State
  const [satPanelOpen, setSatPanelOpen] = useState(false);
  const [satZoom, setSatZoom] = useState(16);
  const [satProvider, setSatProvider] = useState<'satellite' | 'street' | 'terrain'>('satellite');
  const [isScanning, setIsScanning] = useState(false);
  const [isTraveling, setIsTraveling] = useState(false);
  const satMapContainerRef = useRef<HTMLDivElement | null>(null);

  // Unified Globe-to-2D Map state
  const [activeViewMode, setActiveViewMode] = useState<'globe' | 'map2d'>('globe');
  const [isGlobeNavigating, setIsGlobeNavigating] = useState(false);
  const fullMapContainerRef = useRef<HTMLDivElement | null>(null);

  // Trilateration solver — pure math, unchanged
  const triangulatedPoint = useMemo(() => {
    if (triangulationPoints.length === 0) return null;
    let bestLat = triangulationPoints.reduce((sum, p) => sum + p.lat, 0) / triangulationPoints.length;
    let bestLng = triangulationPoints.reduce((sum, p) => sum + p.lng, 0) / triangulationPoints.length;
    let learningRate = 0.2;
    for (let iter = 0; iter < 120; iter++) {
      let dLat = 0;
      let dLng = 0;
      for (const p of triangulationPoints) {
        const dy = (bestLat - p.lat) * 110.57;
        const dx = (bestLng - p.lng) * 111.32 * Math.cos((p.lat * Math.PI) / 180);
        const currentDist = Math.sqrt(dx * dx + dy * dy);
        if (currentDist === 0) continue;
        const error = currentDist - p.radiusKm;
        dLng += error * (dx / currentDist);
        dLat += error * (dy / currentDist);
      }
      bestLng -= (dLng / triangulationPoints.length) * learningRate * 0.009;
      bestLat -= (dLat / triangulationPoints.length) * learningRate * 0.009;
      learningRate *= 0.985;
    }
    return { lat: bestLat, lng: bestLng };
  }, [triangulationPoints]);

  const updateMapPosition = (lat: number, lng: number, label: string) => {
    setCurrentCoords({ lat, lng });
    setFocalCoords({ lat, lng });
    setLocationName(label);
    setOrbitMode('off');

    const s = stateRef.current;
    if (s) {
      s.orbitMode = 'off';
      const { yaw, pitch } = computeCenteringAngles(lat, lng);
      s.targetYaw = yaw;
      s.targetPitch = pitch;
      s.yawVel = 0;
      s.pitchVel = 0;
      s.isCentering = true;
    }

    setSearchHistory(prev => {
      if (prev.some(h => Math.abs(h.lat - lat) < 0.001 && Math.abs(h.lng - lng) < 0.001)) return prev;
      return [{ name: label, lat, lng, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 19)];
    });

    if (onLocationFound) onLocationFound(label, { lat, lng });
  };

  const triggerSatelliteFocus = (lat: number, lng: number, label: string) => {
    setIsTraveling(true);
    setIsScanning(true);
    setIsGlobeNavigating(true);
    setActiveViewMode('globe');
    setOrbitMode('off');
    setMapStyle('satellite');
    
    // Phase 1: Zoom out to show full globe rotation
    setZoomLevel(0.85);
    const s = stateRef.current;
    if (s) {
      s.orbitMode = 'off';
      s.targetDist = BASE_DISTANCE / 0.85;
    }

    // Centering: rotates the globe beautifully towards target coordinates
    updateMapPosition(lat, lng, label);

    // Phase 2: Camera descent zoom-in towards the surface
    setTimeout(() => {
      setZoomLevel(2.85);
      if (s) {
        s.targetDist = BASE_DISTANCE / 2.85;
      }
      
      // Phase 3: Transition smoothly from 3D Globe into 2D Satellite Map!
      setTimeout(() => {
        setActiveViewMode('map2d');
        setIsGlobeNavigating(false);
        setIsTraveling(false);
        setIsScanning(false);
      }, 850);
    }, 850);
  };

  // ── Fullscreen 2D Satellite Map Sync ───────────────────────────────
  useEffect(() => {
    if (activeViewMode !== 'map2d' || !fullMapContainerRef.current) return;
    const container = fullMapContainerRef.current;

    let map = (container as any)._leaflet_map as L.Map | undefined;
    if (!map) {
      map = L.map(container, {
        zoomControl: false,
        attributionControl: false
      });
      (container as any)._leaflet_map = map;
    }

    // Set view smoothly
    map.setView([currentCoords.lat, currentCoords.lng], satZoom);

    // Reuse tile layer unless provider changed
    const currentProvider = (container as any)._osone_provider;
    const tileUrl = satProvider === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : satProvider === 'street'
      ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

    if (currentProvider !== satProvider || !(container as any)._osone_tile_layer) {
      if ((container as any)._osone_tile_layer) {
        map.removeLayer((container as any)._osone_tile_layer);
      }
      const newTileLayer = L.tileLayer(tileUrl, { maxZoom: 19 });
      newTileLayer.addTo(map);
      (container as any)._osone_tile_layer = newTileLayer;
      (container as any)._osone_provider = satProvider;
    }

    // Reuse marker unless not present
    const customIcon = L.divIcon({
      className: 'custom-radar-marker',
      html: `
        <div class="relative flex items-center justify-center w-12 h-12">
          <span class="absolute inline-flex h-10 w-10 rounded-full bg-fuchsia-500/30 border border-fuchsia-400 animate-ping" style="animation-duration: 2s;"></span>
          <span class="relative inline-flex rounded-full h-4 w-4 bg-fuchsia-500 border-2 border-white shadow-[0_0_15px_#d946ef]"></span>
          <div class="absolute w-8 h-8 border border-dashed border-fuchsia-400/60 rounded-full animate-spin-slow"></div>
          <div class="absolute w-10 h-[1px] bg-fuchsia-400/60"></div>
          <div class="absolute h-10 w-[1px] bg-fuchsia-400/60"></div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    if ((container as any)._osone_marker) {
      (container as any)._osone_marker.setLatLng([currentCoords.lat, currentCoords.lng]);
    } else {
      const marker = L.marker([currentCoords.lat, currentCoords.lng], { icon: customIcon }).addTo(map);
      (container as any)._osone_marker = marker;
    }

    const handleMoveEnd = () => {
      if (!map) return;
      const center = map.getCenter();
      setCurrentCoords({ lat: center.lat, lng: center.lng });
    };
    map.off('moveend', handleMoveEnd);
    map.on('moveend', handleMoveEnd);

    const timer = setTimeout(() => {
      if (map) map.invalidateSize();
    }, 50);

    return () => clearTimeout(timer);
  }, [currentCoords.lat, currentCoords.lng, satZoom, satProvider, activeViewMode]);

  // ── Mount: build the Three.js scene once ────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, BASE_DISTANCE / 1.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const theme = STYLE_THEMES[mapStyle];

    // Texture loading for realistic Google Earth view
    const textureLoader = new THREE.TextureLoader();
    const textures = {
      day: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
      night: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg'),
      dark: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-dark.jpg'),
      bump: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png'),
      specular: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-water.png'),
      clouds: textureLoader.load('https://unpkg.com/three-globe/example/img/earth-clouds.png')
    };

    // Configure textures
    textures.clouds.wrapS = THREE.RepeatWrapping;
    textures.clouds.wrapT = THREE.RepeatWrapping;

    // Solid Earth sphere with phong material (supports specular and bump maps)
    const earthMat = new THREE.MeshPhongMaterial({
      color: mapStyle === 'warm' ? 0xfffbeb : 0xffffff,
      shininess: 35,
    });

    // Dynamic initial mapping
    if (mapStyle === 'satellite') {
      earthMat.map = textures.day;
      earthMat.bumpMap = textures.bump;
      earthMat.bumpScale = 0.05;
      earthMat.specularMap = textures.specular;
      earthMat.specular = new THREE.Color(0x333333);
    } else if (mapStyle === 'slate') {
      earthMat.map = textures.night;
      earthMat.bumpMap = textures.bump;
      earthMat.bumpScale = 0.04;
      earthMat.specularMap = null;
    } else if (mapStyle === 'terrain') {
      earthMat.map = textures.dark;
      earthMat.bumpMap = textures.bump;
      earthMat.bumpScale = 0.08;
      earthMat.specularMap = textures.specular;
      earthMat.specular = new THREE.Color(0x222222);
    } else if (mapStyle === 'warm') {
      earthMat.map = textures.day;
      earthMat.bumpMap = textures.bump;
      earthMat.bumpScale = 0.05;
      earthMat.specularMap = textures.specular;
      earthMat.specular = new THREE.Color(0xeab308);
    }

    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 64), earthMat);
    globeGroup.add(earthMesh);

    // Dynamic Cloud Layer
    const cloudMat = new THREE.MeshPhongMaterial({
      map: textures.clouds,
      transparent: true,
      opacity: 0.4,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.012, 64, 64), cloudMat);
    cloudMesh.visible = mapStyle !== 'terrain';
    globeGroup.add(cloudMesh);

    // Add Ambient and Directional (Sun) light sources for rich 3D shading
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // Equator + prime meridian graticule (styled subtly as an overlay)
    const buildRing = (isEquator: boolean, color: number) => {
      const pts: THREE.Vector3[] = [];
      for (let d = -180; d <= 180; d += 2) {
        const lat = isEquator ? 0 : d;
        const lng = isEquator ? d : 0;
        pts.push(latLngToVector3(lat, lng, RADIUS * 1.002));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.15 });
      return new THREE.Line(geo, mat);
    };
    const equatorLine = buildRing(true, theme.grid);
    const meridianLine = buildRing(false, theme.grid);
    globeGroup.add(equatorLine, meridianLine);

    // Fresnel atmosphere glow (styled beautifully to wrap the planet)
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(theme.atmosphere) } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize( normalMatrix * normal );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow( 0.65 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) ), 3.5 );
          gl_FragColor = vec4( glowColor, 1.0 ) * clamp(intensity, 0.0, 1.0);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    const atmosMesh = new THREE.Mesh(new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 48, 48), atmosMat);
    scene.add(atmosMesh);

    // Active pin marker
    const markerGroup = new THREE.Group();
    globeGroup.add(markerGroup);
    const markerMat = new THREE.MeshBasicMaterial({ color: theme.activeMarker });
    const markerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), markerMat);
    const markerRingMat = new THREE.MeshBasicMaterial({ color: theme.activeMarker, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const markerRing = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 32), markerRingMat);
    markerGroup.add(markerMesh, markerRing);

    const triGroup = new THREE.Group();
    globeGroup.add(triGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    stateRef.current = {
      scene, camera, renderer, globeGroup,
      earthMesh, earthMat, cloudMesh, cloudMat,
      ambientLight, sunLight, textures,
      equatorLine, meridianLine, atmosMat, markerGroup, markerMat, markerRingMat,
      triGroup, raycaster, pointer, clock: new THREE.Clock(), animId: 0,
      yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, isDragging: false, lastX: 0, lastY: 0,
      isCentering: true, targetYaw: 0, targetPitch: 0, orbitMode, pulseRings: [],
      targetDist: BASE_DISTANCE / zoomLevel
    };

    // Center on the initial coordinates immediately
    const initAngles = computeCenteringAngles(currentCoords.lat, currentCoords.lng);
    stateRef.current.yaw = initAngles.yaw;
    stateRef.current.pitch = initAngles.pitch;
    stateRef.current.targetYaw = initAngles.yaw;
    stateRef.current.targetPitch = initAngles.pitch;
    markerGroup.position.copy(latLngToVector3(currentCoords.lat, currentCoords.lng, RADIUS * 1.01));
    orientOutward(markerRing, markerGroup.position);

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(mount);

    const animate = () => {
      const s = stateRef.current;
      if (!s || disposed) return;
      s.animId = requestAnimationFrame(animate);
      const time = s.clock.getElapsedTime();

      // Slowly rotate clouds layer independently of Earth rotation for beautiful dynamism
      if (s.cloudMesh) {
        s.cloudMesh.rotation.y += 0.00035;
        s.cloudMesh.rotation.x += 0.0001;
      }

      // Rotate sun position relative to camera for gorgeous shadow casting
      if (s.sunLight) {
        s.sunLight.position.copy(s.camera.position).add(new THREE.Vector3(4, 2, 3)).normalize().multiplyScalar(15);
      }

      // Smooth camera dolly/zoom distance easing
      if (s.targetDist !== undefined) {
        const diffZoom = s.targetDist - s.camera.position.z;
        if (Math.abs(diffZoom) > 0.005) {
          s.camera.position.z += diffZoom * 0.065;
        } else {
          s.camera.position.z = s.targetDist;
        }
      }

      if (s.isCentering && !s.isDragging) {
        const diffYaw = Math.atan2(Math.sin(s.targetYaw - s.yaw), Math.cos(s.targetYaw - s.yaw));
        const diffPitch = s.targetPitch - s.pitch;
        if (Math.abs(diffYaw) > 0.002 || Math.abs(diffPitch) > 0.002) {
          s.yaw += diffYaw * 0.085;
          s.pitch += diffPitch * 0.085;
        } else {
          s.yaw = s.targetYaw;
          s.pitch = s.targetPitch;
          s.isCentering = false;
        }
      }

      if (s.orbitMode !== 'off' && !s.isDragging && !s.isCentering) {
        s.yaw += s.orbitMode === '3d' ? 0.0018 : 0.0032;
        if (s.orbitMode === '3d') s.pitch = 0.25 + 0.12 * Math.sin(time * 0.4);
      }

      if (!s.isDragging && !s.isCentering) {
        s.yaw += s.yawVel;
        s.pitch = THREE.MathUtils.clamp(s.pitch + s.pitchVel, -Math.PI / 2.05, Math.PI / 2.05);
        s.yawVel *= 0.94;
        s.pitchVel *= 0.94;
      }

      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch);
      s.globeGroup.quaternion.multiplyQuaternions(qPitch, qYaw);

      s.pulseRings.forEach(({ mesh }) => {
        const pulse = 1 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3));
        mesh.scale.setScalar(pulse);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.75 - 0.4 * (0.5 + 0.5 * Math.sin(time * 3));
      });

      s.renderer.render(s.scene, s.camera);
    };
    animate();

    setIsGlobeLoading(false);

    return () => {
      disposed = true;
      const s = stateRef.current;
      if (s) cancelAnimationFrame(s.animId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      disposeObject3D(scene);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Theme swap ───────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const theme = STYLE_THEMES[mapStyle];
    
    s.markerMat.color.setHex(theme.activeMarker);
    s.markerRingMat.color.setHex(theme.activeMarker);
    (s.atmosMat.uniforms.glowColor.value as THREE.Color).setHex(theme.atmosphere);

    if (s.equatorLine) {
      (s.equatorLine.material as THREE.LineBasicMaterial).color.setHex(theme.grid);
    }
    if (s.meridianLine) {
      (s.meridianLine.material as THREE.LineBasicMaterial).color.setHex(theme.grid);
    }

    if (s.earthMat) {
      if (mapStyle === 'satellite') {
        s.earthMat.map = s.textures.day;
        s.earthMat.bumpMap = s.textures.bump;
        s.earthMat.bumpScale = 0.05;
        s.earthMat.specularMap = s.textures.specular;
        s.earthMat.specular = new THREE.Color(0x333333);
        s.earthMat.color.setHex(0xffffff);
        if (s.cloudMesh) s.cloudMesh.visible = true;
      } else if (mapStyle === 'slate') {
        s.earthMat.map = s.textures.night;
        s.earthMat.bumpMap = s.textures.bump;
        s.earthMat.bumpScale = 0.04;
        s.earthMat.specularMap = null;
        s.earthMat.color.setHex(0xffffff);
        if (s.cloudMesh) s.cloudMesh.visible = true;
      } else if (mapStyle === 'terrain') {
        s.earthMat.map = s.textures.dark;
        s.earthMat.bumpMap = s.textures.bump;
        s.earthMat.bumpScale = 0.08;
        s.earthMat.specularMap = s.textures.specular;
        s.earthMat.specular = new THREE.Color(0x222222);
        s.earthMat.color.setHex(0xffffff);
        if (s.cloudMesh) s.cloudMesh.visible = false;
      } else if (mapStyle === 'warm') {
        s.earthMat.map = s.textures.day;
        s.earthMat.bumpMap = s.textures.bump;
        s.earthMat.bumpScale = 0.05;
        s.earthMat.specularMap = s.textures.specular;
        s.earthMat.specular = new THREE.Color(0xeab308);
        s.earthMat.color.setHex(0xfffbeb);
        if (s.cloudMesh) s.cloudMesh.visible = true;
      }
      s.earthMat.needsUpdate = true;
    }
  }, [mapStyle]);

  // ── Zoom (camera dolly) ──────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const dist = THREE.MathUtils.clamp(BASE_DISTANCE / zoomLevel, 3.3, 22);
    s.targetDist = dist;
  }, [zoomLevel]);

  // ── Sync viewport sizes on view mode change ──────────────────────────
  useEffect(() => {
    if (stateRef.current && mountRef.current) {
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w > 0 && h > 0) {
        stateRef.current.camera.aspect = w / h;
        stateRef.current.camera.updateProjectionMatrix();
        stateRef.current.renderer.setSize(w, h);
      }
    }
  }, [activeViewMode]);

  // ── Auto-search on initialSearchQuery prop changes & custom events ────
  const lastSearchedRef = useRef<string>('');
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery.trim() !== '' && initialSearchQuery !== lastSearchedRef.current) {
      lastSearchedRef.current = initialSearchQuery;
      handleAddressSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    const handleNavEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ location: string }>;
      const loc = customEvent.detail?.location;
      if (loc && loc.trim() !== '') {
        lastSearchedRef.current = loc;
        handleAddressSearch(loc);
      }
    };
    window.addEventListener('osone-navigate-map', handleNavEvent);
    return () => {
      window.removeEventListener('osone-navigate-map', handleNavEvent);
    };
  }, []);

  // ── Orbit mode ───────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.orbitMode = orbitMode;
  }, [orbitMode]);

  // ── Centering when focal point changes ──────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const { yaw, pitch } = computeCenteringAngles(focalCoords.lat, focalCoords.lng);
    s.targetYaw = yaw;
    s.targetPitch = pitch;
    s.yawVel = 0;
    s.pitchVel = 0;
    s.isCentering = true;
  }, [focalCoords]);

  // ── Active pin marker position ──────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const v = latLngToVector3(currentCoords.lat, currentCoords.lng, RADIUS * 1.01);
    s.markerGroup.position.copy(v);
    const ring = s.markerGroup.children[1];
    if (ring) orientOutward(ring, v);
  }, [currentCoords]);

  // ── High-Res Satellite Viewfinder Synchronization ───────────────────
  useEffect(() => {
    if (!satPanelOpen || !satMapContainerRef.current) return;
    const container = satMapContainerRef.current;
    
    let map = (container as any)._leaflet_map as L.Map | undefined;
    if (!map) {
      map = L.map(container, {
        zoomControl: false,
        attributionControl: false
      });
      (container as any)._leaflet_map = map;
    }

    map.setView([currentCoords.lat, currentCoords.lng], satZoom);

    // Remove existing layers
    map.eachLayer((layer) => {
      map!.removeLayer(layer);
    });

    // Pick tile URL based on chosen satellite provider
    const tileUrl = satProvider === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19
    }).addTo(map);

    // Glowing cyberpunk crosshair marker inside Leaflet close-up
    const customIcon = L.divIcon({
      className: 'custom-radar-marker',
      html: `
        <div class="relative flex items-center justify-center w-10 h-10">
          <span class="absolute inline-flex h-8 w-8 rounded-full bg-orange-400 bg-opacity-20 border border-orange-500 animate-ping" style="animation-duration: 2.5s;"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-orange-500 border border-white shadow-[0_0_10px_rgba(249,115,22,0.8)]"></span>
          <div class="absolute w-7 h-7 border border-dashed border-orange-400 border-opacity-50 rounded-full"></div>
          <div class="absolute w-8 h-[1px] bg-orange-500 bg-opacity-50"></div>
          <div class="absolute h-8 w-[1px] bg-orange-500 bg-opacity-50"></div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    L.marker([currentCoords.lat, currentCoords.lng], { icon: customIcon }).addTo(map);

    // Invalidate map size to recalculate bounds after DOM rendering
    const timer = setTimeout(() => {
      if (map) map.invalidateSize();
    }, 150);

    return () => clearTimeout(timer);
  }, [currentCoords, satZoom, satProvider, satPanelOpen]);

  // ── Triangulation rebuild ────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    while (s.triGroup.children.length) {
      const obj = s.triGroup.children.pop()!;
      disposeObject3D(obj);
    }
    s.pulseRings = [];

    if (!isTriangulating) return;

    triangulationPoints.forEach(p => {
      const colorHex = parseInt(p.color.replace('#', ''), 16);
      const centerV = latLngToVector3(p.lat, p.lng, RADIUS);

      const circlePts: THREE.Vector3[] = [];
      for (let step = 0; step <= 64; step++) {
        const bearing = (step * Math.PI * 2) / 64;
        const dest = destinationPoint(p.lat, p.lng, bearing, p.radiusKm);
        circlePts.push(latLngToVector3(dest.lat, dest.lng, RADIUS * 1.005));
      }
      const circleLine = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(circlePts),
        new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85 })
      );
      s.triGroup.add(circleLine);

      const nodeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), new THREE.MeshBasicMaterial({ color: colorHex }));
      nodeMesh.position.copy(centerV);
      s.triGroup.add(nodeMesh);

      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.06, 32),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ringMesh.position.copy(centerV);
      orientOutward(ringMesh, centerV);
      s.triGroup.add(ringMesh);
      s.pulseRings.push({ mesh: ringMesh });

      if (triangulatedPoint) {
        const targetV = latLngToVector3(triangulatedPoint.lat, triangulatedPoint.lng, RADIUS * 1.01);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([centerV, targetV]),
          new THREE.LineDashedMaterial({ color: colorHex, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.6 })
        );
        line.computeLineDistances();
        s.triGroup.add(line);
      }
    });

    if (triangulatedPoint) {
      const targetV = latLngToVector3(triangulatedPoint.lat, triangulatedPoint.lng, RADIUS * 1.01);
      const targetMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 })
      );
      targetMesh.position.copy(targetV);
      s.triGroup.add(targetMesh);

      const reticleMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.09, 0.1, 32),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      reticleMesh.position.copy(targetV);
      orientOutward(reticleMesh, targetV);
      s.triGroup.add(reticleMesh);
      s.pulseRings.push({ mesh: reticleMesh });
    }
  }, [isTriangulating, triangulationPoints, triangulatedPoint]);

  // ── Pointer interaction (rotate + click-to-pick coordinates) ─────────
  const pickCoordsFromEvent = (clientX: number, clientY: number) => {
    const s = stateRef.current;
    const mount = mountRef.current;
    if (!s || !mount) return;
    const rect = mount.getBoundingClientRect();
    s.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    s.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(s.pointer, s.camera);
    const hit = s.raycaster.intersectObjects(s.globeGroup.children, false);
    
    // Find intersection specifically with the Earth mesh
    const earthHit = hit.find(h => h.object === s.earthMesh);
    if (!earthHit) return;
    const local = s.globeGroup.worldToLocal(earthHit.point.clone());
    const { lat, lng } = vector3ToLatLng(local);

    if (positioningTarget) {
      setTriangulationPoints(prev => prev.map(p => (p.id === positioningTarget ? { ...p, lat, lng } : p)));
      setPositioningTarget(null);
    } else {
      // Set provisional coordinates label instantly and trigger satellite focus
      const tempLabel = `Coordenadas: [${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
      triggerSatelliteFocus(lat, lng, tempLabel);

      // Fetch accurate town/city/country via reverse lookup
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`, {
        headers: { Accept: 'application/json', 'User-Agent': 'OSONE-3DGlobe-Navigator/6.0' }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.display_name) {
            const displayName = data.display_name.split(',').slice(0, 3).join(',');
            updateMapPosition(lat, lng, displayName);
          }
        })
        .catch(err => {
          console.error('Reverse geocode error:', err);
        });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    pickCoordsFromEvent(e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s) return;
    s.isDragging = true;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s || !s.isDragging) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.yaw += dx * 0.0065;
    s.pitch = THREE.MathUtils.clamp(s.pitch - dy * 0.0065, -Math.PI / 2.05, Math.PI / 2.05);
    s.yawVel = dx * 0.004;
    s.pitchVel = -dy * 0.004;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.isCentering = false;
  };

  const handleMouseUp = () => {
    const s = stateRef.current;
    if (s) s.isDragging = false;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s || e.touches.length !== 1) return;
    s.isDragging = true;
    s.lastX = e.touches[0].clientX;
    s.lastY = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s || !s.isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - s.lastX;
    const dy = e.touches[0].clientY - s.lastY;
    s.yaw += dx * 0.007;
    s.pitch = THREE.MathUtils.clamp(s.pitch - dy * 0.007, -Math.PI / 2.05, Math.PI / 2.05);
    s.yawVel = dx * 0.004;
    s.pitchVel = -dy * 0.004;
    s.lastX = e.touches[0].clientX;
    s.lastY = e.touches[0].clientY;
    s.isCentering = false;
  };

  const disperseEmitters = (latVal = currentCoords.lat, lngVal = currentCoords.lng) => {
    setTriangulationPoints([
      { id: 'A', name: 'Canal Alpha (UHF-1)', lat: latVal + 4.2 + (Math.random() - 0.5) * 1.5, lng: lngVal - 5.5 + (Math.random() - 0.5) * 1.5, radiusKm: 750 + Math.random() * 300, color: '#ef4444' },
      { id: 'B', name: 'Canal Beta (HF-2)', lat: latVal - 4.5 + (Math.random() - 0.5) * 1.5, lng: lngVal + 5.2 + (Math.random() - 0.5) * 1.5, radiusKm: 850 + Math.random() * 300, color: '#06b6d4' },
      { id: 'C', name: 'Canal Gamma (VHF-3)', lat: latVal - 3.8 + (Math.random() - 0.5) * 2.5, lng: lngVal - 4.2 + (Math.random() - 0.5) * 1.5, radiusKm: 680 + Math.random() * 300, color: '#f59e0b' }
    ]);
    setIsTriangulating(true);
    setOrbitMode('off');
  };

  const toggleTriangulation = () => {
    if (isTriangulating) {
      setIsTriangulating(false);
      setPositioningTarget(null);
    } else {
      disperseEmitters(currentCoords.lat, currentCoords.lng);
    }
  };

  const handleAddressSearch = async (queryText?: string) => {
    const textToSearch = (typeof queryText === 'string' && queryText.trim() !== '' ? queryText : searchQuery).trim();
    if (!textToSearch) return;
    
    setSearchQuery(textToSearch);
    setIsSearching(true);
    setNoResults(false);
    
    // Normalização para comparação na base local
    const normalizedQuery = textToSearch
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    try {
      // 1. Verificar se é uma coordenada direta (ex: -23.5505, -46.6333)
      const coordRegex = /^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/;
      const coordMatch = textToSearch.match(coordRegex);
      if (coordMatch) {
        const latVal = parseFloat(coordMatch[1]);
        const lngVal = parseFloat(coordMatch[2]);
        if (latVal >= -90 && latVal <= 90 && lngVal >= -180 && lngVal <= 180) {
          triggerSatelliteFocus(latVal, lngVal, `Coordenadas: ${latVal.toFixed(4)}, ${lngVal.toFixed(4)}`);
          return;
        }
      }

      // 2. Buscar no banco geográfico local offline (Primeiro busca exata, depois por prefixo se termo for longo)
      let foundLocal = LOCAL_GEO_DB.find(place => 
        place.names.some(name => {
          const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return normName === normalizedQuery;
        })
      );

      if (!foundLocal) {
        foundLocal = LOCAL_GEO_DB.find(place => 
          place.names.some(name => {
            const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (normName.length <= 3) return false;
            return normName.startsWith(normalizedQuery) || normalizedQuery.startsWith(normName);
          })
        );
      }

      if (foundLocal) {
        triggerSatelliteFocus(foundLocal.lat, foundLocal.lng, foundLocal.displayName);
        return;
      }

      // 3. Provedor 1: OpenMeteo Geocoding API (Sem limite de taxa, ultra-rápido para cidades e países)
      const formattedQuery = encodeURIComponent(textToSearch);
      try {
        const omRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${formattedQuery}&count=1&language=pt`);
        if (omRes.ok) {
          const omData = await omRes.json();
          if (omData.results && omData.results.length > 0) {
            const res = omData.results[0];
            const nameParts = [res.name, res.admin1, res.country].filter(Boolean);
            const label = nameParts.slice(0, 2).join(', ');
            triggerSatelliteFocus(res.latitude, res.longitude, label);
            return;
          }
        }
      } catch (err) {
        console.warn('OpenMeteo geocode skipped:', err);
      }

      // 4. Provedor 2: Nominatim OpenStreetMap
      try {
        const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${formattedQuery}&limit=1`, {
          headers: { Accept: 'application/json', 'User-Agent': 'OSONE-3DGlobe-Navigator/6.0' }
        });
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (nomData && nomData.length > 0) {
            const place = nomData[0];
            const lat = parseFloat(place.lat);
            const lng = parseFloat(place.lon);
            const displayName = place.display_name.split(',').slice(0, 3).join(',');
            triggerSatelliteFocus(lat, lng, displayName);
            return;
          }
        }
      } catch (err) {
        console.warn('Nominatim geocode skipped:', err);
      }

      // 5. Provedor 3: Photon Komoot
      try {
        const phRes = await fetch(`https://photon.komoot.io/api/?q=${formattedQuery}&limit=1`);
        if (phRes.ok) {
          const phData = await phRes.json();
          if (phData.features && phData.features.length > 0) {
            const feat = phData.features[0];
            const [lng, lat] = feat.geometry.coordinates;
            const props = feat.properties;
            const label = [props.name, props.city || props.state, props.country].filter(Boolean).slice(0, 2).join(', ');
            triggerSatelliteFocus(lat, lng, label || textToSearch);
            return;
          }
        }
      } catch (err) {
        console.warn('Photon geocode skipped:', err);
      }

      // 6. Correspondência parcial no banco geográfico local como último recurso
      const partialLocal = LOCAL_GEO_DB.find(place => 
        place.names.some(name => {
          const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (normName.length <= 3) return false;
          return normalizedQuery.split(/\s+/).some(word => word.length > 3 && (normName === word || normName.startsWith(word)));
        })
      );
      if (partialLocal) {
        triggerSatelliteFocus(partialLocal.lat, partialLocal.lng, partialLocal.displayName);
      } else {
        setNoResults(true);
        setTimeout(() => setNoResults(false), 4000);
      }
    } catch (error) {
      console.error('Error during geocoding:', error);
      const partialLocal = LOCAL_GEO_DB.find(place => 
        place.names.some(name => {
          const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (normName.length <= 3) return false;
          return normalizedQuery.split(/\s+/).some(word => word.length > 3 && (normName === word || normName.startsWith(word)));
        })
      );
      if (partialLocal) {
        triggerSatelliteFocus(partialLocal.lat, partialLocal.lng, partialLocal.displayName);
      } else {
        setNoResults(true);
        setTimeout(() => setNoResults(false), 4000);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddressSearch();
  };

  const zoomIn = () => setZoomLevel(prev => Math.min(3.0, prev * 1.15));
  const zoomOut = () => setZoomLevel(prev => Math.max(0.5, prev / 1.15));

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-zinc-950 font-sans border border-white/[0.05] md:rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 border-b bg-zinc-900/40 backdrop-blur-md shrink-0 transition-all duration-700 ease-in-out z-20",
        isTraveling ? "max-h-0 py-0 opacity-0 border-b-transparent pointer-events-none overflow-hidden" : "max-h-24 py-3 border-b-white/[0.06]"
      )}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 duration-150 transition-all rounded-lg text-zinc-400 hover:text-white border border-white/[0.05]" title="Voltar ao início">
            <ChevronLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] md:text-[9px] tracking-[0.3em] font-serif italic text-fuchsia-400 font-bold uppercase">SATELLITE VECTOR CORE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-sm md:text-md font-medium tracking-tight text-white flex items-center gap-1.5">
              <Compass size={14} className="text-fuchsia-400" />
              <span>Navegador Geográfico OSONE</span>
            </h2>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 bg-black/40 px-3.5 py-1.5 rounded-xl border border-white/5 font-mono text-[9px] text-zinc-400">
          <div>
            <span className="text-zinc-600 block text-[7px] uppercase tracking-wider font-bold">LATITUDE</span>
            <span className="text-fuchsia-300 font-bold">{currentCoords.lat.toFixed(4)}°</span>
          </div>
          <div className="w-[1px] h-5 bg-white/5" />
          <div>
            <span className="text-zinc-600 block text-[7px] uppercase tracking-wider font-bold">LONGITUDE</span>
            <span className="text-fuchsia-300 font-bold">{currentCoords.lng.toFixed(4)}°</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeViewMode === 'map2d') {
                setActiveViewMode('globe');
              } else {
                setActiveViewMode('map2d');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 text-xs font-bold transition-all active:scale-95"
            title="Alternar entre Globo 3D e Mapa 2D"
          >
            <Globe size={13} className="text-fuchsia-400" />
            <span className="hidden sm:inline">{activeViewMode === 'map2d' ? 'Ver Globo 3D' : 'Ver Mapa 2D'}</span>
          </button>

          <button onClick={() => setMobileMenuOpen(prev => !prev)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 active:scale-95 transition-all text-[11px] text-orange-300 font-medium font-sans border border-orange-500/20 shadow-lg" title="Alternar Painel de Busca">
            {mobileMenuOpen ? <Check size={12} className="text-orange-400" /> : <Search size={12} className="text-orange-400" />}
            <span>{mobileMenuOpen ? 'Fechar' : 'Procurar'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col md:flex-row min-h-0 relative">
        {/* Drawer / Controls Side Panel */}
        <div className={cn(
          'w-full md:w-80 border-b md:border-b-0 md:border-r border-white/[0.05] bg-zinc-950/95 backdrop-blur shrink-0 overflow-y-auto flex flex-col transition-all duration-700 ease-in-out z-20',
          (mobileMenuOpen && !isTraveling) ? 'flex h-[60vh] max-h-[60vh]' : 'hidden md:flex md:h-full',
          isTraveling ? 'md:w-0 md:opacity-0 md:pointer-events-none border-r-transparent overflow-hidden' : ''
        )}>
          <div className="p-4 border-b border-white/[0.04]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Pesquisar cidade, país ou endereço..."
                className="w-full h-10 bg-zinc-900 border border-white/5 hover:border-white/10 focus:border-fuchsia-500/40 focus:ring-1 focus:ring-fuchsia-500/20 text-xs text-white rounded-xl pl-9 pr-10 outline-none transition-all placeholder:text-zinc-500"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <button onClick={() => handleAddressSearch()} disabled={isSearching} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 active:scale-95 transition-all outline-none text-fuchsia-400 rounded-lg">
                {isSearching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              </button>
            </div>
            {noResults && (
              <div className="mt-2 text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2 rounded-lg leading-relaxed animate-in slide-in-from-top-1">
                ⚠️ Nenhum local encontrado para esta busca. Tente buscar um termo mais amplo.
              </div>
            )}
          </div>

          <div className="p-4 space-y-4 flex-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Estações Globais</span>
                <span className="text-[8px] px-1.5 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 rounded-md border border-fuchsia-500/20 font-bold">Presets</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_PLACES.map((place, idx) => (
                  <button
                    key={idx}
                    onClick={() => triggerSatelliteFocus(place.lat, place.lng, place.name)}
                    className={cn(
                      'p-2.5 rounded-xl border text-left transition-all relative group outline-none',
                      locationName.includes(place.name.split(',')[0])
                        ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-200 shadow-[inset_0_0_8px_rgba(217,70,239,0.15)]'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10 text-zinc-400 hover:text-white'
                    )}
                  >
                    <span className="text-[10px] font-bold block">{place.name.split(',')[0]}</span>
                    <span className="text-[8px] opacity-40 font-mono tracking-tighter truncate block mt-0.5">{place.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold block mb-2">Fonte de Imagem 2D</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'satellite', name: 'Satélite HD', icon: Layers },
                  { id: 'street', name: 'Mapa Ruas', icon: MapIcon },
                  { id: 'terrain', name: 'Relevo Topo', icon: Compass }
                ].map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSatProvider(style.id as any)}
                    className={cn(
                      'p-2 rounded-xl text-center border flex flex-col items-center justify-center transition-all outline-none',
                      satProvider === style.id ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    <style.icon size={13} className={cn('mb-1', satProvider === style.id ? 'text-fuchsia-400' : 'text-zinc-500')} />
                    <span className="text-[9px] font-bold block leading-tight">{style.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Voo Orbital Espontâneo</span>
                <span className="text-[8px] px-1.5 py-0.5 bg-orange-500/5 text-orange-400 rounded-md border border-orange-500/10 animate-pulse font-bold">Drone</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'off', name: 'Manual', desc: 'Foco Fixo', icon: Pin },
                  { id: '2d', name: 'Giro 2D', desc: 'Rotação plana', icon: RotateCw },
                  { id: '3d', name: 'Órbita 3D', desc: 'Giro com onda', icon: Compass }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setOrbitMode(mode.id as any);
                      setActiveViewMode('globe');
                    }}
                    className={cn(
                      'p-2 rounded-xl text-center border flex flex-col items-center justify-center transition-all outline-none',
                      orbitMode === mode.id ? 'bg-orange-500/15 border-orange-500/40 text-orange-200 shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    <mode.icon size={13} className={cn('mb-1', orbitMode === mode.id ? 'text-orange-400 animate-spin' : 'text-zinc-500')} style={orbitMode === mode.id && mode.id !== 'off' ? { animationDuration: mode.id === '3d' ? '12s' : '6s' } : undefined} />
                    <span className="text-[9px] font-bold block leading-tight">{mode.name}</span>
                    <span className="text-[7.5px] opacity-40 block leading-tight mt-0.5">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-white/5 rounded-2xl p-3 bg-[#0d0d11]/80 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-mono tracking-widest text-zinc-400 uppercase font-extrabold">Varredura Trilaterada</span>
                </div>
                <button
                  onClick={toggleTriangulation}
                  className={cn(
                    'text-[8px] font-mono uppercase font-bold tracking-wider px-2 py-1 rounded border transition-all active:scale-95',
                    isTriangulating ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20' : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20'
                  )}
                >
                  {isTriangulating ? 'Desligar' : 'Triangular'}
                </button>
              </div>

              {isTriangulating ? (
                <div className="space-y-2.5">
                  <div className="space-y-2">
                    {triangulationPoints.map((p) => (
                      <div key={p.id} className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex items-center justify-center text-[7px] font-extrabold text-white" style={{ backgroundColor: p.color }}>{p.id}</span>
                            <span className="font-bold text-zinc-300 truncate">{p.name}</span>
                          </div>
                          <button
                            onClick={() => setPositioningTarget(positioningTarget === p.id ? null : (p.id as 'A' | 'B' | 'C'))}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[7.5px] font-mono font-medium tracking-tight border active:scale-95 transition-all',
                              positioningTarget === p.id ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse' : 'bg-white/5 border-white/5 hover:bg-white/10 text-zinc-400 hover:text-white'
                            )}
                          >
                            {positioningTarget === p.id ? 'Clicar Globo...' : 'Alocar'}
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[7.5px] font-mono text-zinc-500 shrink-0 w-11 uppercase leading-none">Raio: {p.radiusKm.toFixed(0)}km</label>
                          <input
                            type="range" min="150" max="2500" step="50" value={p.radiusKm}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setTriangulationPoints(prev => prev.map(item => (item.id === p.id ? { ...item, radiusKm: v } : item)));
                            }}
                            className="flex-1 accent-orange-500 h-1 rounded bg-zinc-800 cursor-pointer outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {triangulatedPoint && (
                    <div className="p-2 border border-emerald-950 bg-emerald-950/10 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-emerald-400 uppercase font-extrabold tracking-wider">Interceptação Sintonizada</span>
                        <span className="text-zinc-600 bg-zinc-900 px-1 py-0.5 rounded">GPS 3D Solver</span>
                      </div>
                      <div className="font-mono text-[8.5px] text-zinc-300 flex items-center justify-between">
                        <span>Lat: {triangulatedPoint.lat.toFixed(4)}°</span>
                        <span>Lng: {triangulatedPoint.lng.toFixed(4)}°</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => triggerSatelliteFocus(triangulatedPoint.lat, triangulatedPoint.lng, 'Alvo de Intercepção Sintonizado')} className="w-full py-1.5 bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none flex items-center justify-center gap-1">
                          <Compass size={10} className="text-emerald-400 animate-spin" style={{ animationDuration: '6s' }} />
                          <span>Ir ao Alvo</span>
                        </button>
                        <button onClick={() => disperseEmitters(currentCoords.lat, currentCoords.lng)} className="w-full py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-zinc-300 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none flex items-center justify-center gap-1">
                          <RotateCw size={10} className="text-zinc-500" />
                          <span>Dispersar</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-2.5 px-2 bg-black/10 border border-white/[0.02] rounded-xl">
                  <p className="text-[8.5px] text-zinc-500 leading-normal">
                    Simule 3 antenas repetidoras em órbita de cobertura e calcule seu ponto de convergência com traçado de raios curvados sobre o globo 3D.
                  </p>
                  <button onClick={toggleTriangulation} className="mt-2 px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/15 text-orange-300 border border-orange-500/20 text-[8.5px] font-bold rounded-lg transition-all active:scale-95 outline-none">
                    Ativar Trilateração
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase font-bold">Rastro de Navegação</span>
                <History size={10} className="text-zinc-600" />
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {searchHistory.map((hist, idx) => (
                  <button key={idx} onClick={() => triggerSatelliteFocus(hist.lat, hist.lng, hist.name)} className="w-full text-left p-2 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-fuchsia-500/30 group-hover:bg-fuchsia-500 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] text-zinc-300 truncate block font-medium">{hist.name}</span>
                      <span className="text-[7.5px] text-zinc-600 font-mono block mt-0.5">{hist.lat.toFixed(3)}, {hist.lng.toFixed(3)} • {hist.time}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Viewport Container */}
        <div className="flex-1 h-full relative bg-[#060608] overflow-hidden select-none">
          {/* 1. 3D Globe View Canvas Container */}
          <div
            ref={mountRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            className={cn(
              "absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing transition-all duration-500",
              (activeViewMode === 'globe' || isGlobeNavigating)
                ? "z-10 opacity-100 pointer-events-auto scale-100"
                : "z-0 opacity-0 pointer-events-none scale-95"
            )}
          />

          {/* Globe Orbit Navigation Laser Overlay */}
          {isGlobeNavigating && (
            <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs pointer-events-none transition-all duration-300">
              <div className="absolute top-0 left-0 w-full h-0.5 bg-fuchsia-500 shadow-[0_0_15px_#d946ef] animate-scan-down" />
              <div className="p-4 rounded-2xl bg-zinc-950/90 border border-fuchsia-500/30 shadow-[0_0_30px_rgba(217,70,239,0.2)] flex flex-col items-center gap-2 max-w-xs text-center font-mono">
                <Loader2 size={24} className="text-fuchsia-400 animate-spin" />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-fuchsia-300 animate-pulse">
                  REDIRECIONANDO ÓRBITA SATELLITE
                </span>
                <span className="text-[9px] text-zinc-400 truncate max-w-[200px]">
                  Navegando até: <strong className="text-white">{locationName}</strong>
                </span>
                <span className="text-[8px] text-fuchsia-400/80">
                  [{currentCoords.lat.toFixed(4)}°, {currentCoords.lng.toFixed(4)}°]
                </span>
              </div>
            </div>
          )}

          {/* 2. Fullscreen 2D Satellite Map Container */}
          <div
            ref={fullMapContainerRef}
            className={cn(
              "absolute inset-0 w-full h-full transition-all duration-500",
              (activeViewMode === 'map2d' && !isGlobeNavigating)
                ? "z-10 opacity-100 pointer-events-auto"
                : "z-0 opacity-0 pointer-events-none"
            )}
          />

          {/* Floating Card Overlay matching previous design in Screenshot */}
          {activeViewMode === 'map2d' && !isGlobeNavigating && (
            <div className="absolute top-4 left-4 z-[25] max-w-[320px] sm:max-w-[400px] p-3.5 rounded-2xl bg-zinc-950/85 backdrop-blur-md border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col gap-1.5 font-sans animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-400">
                  <Compass size={14} className="animate-spin-slow" />
                </div>
                <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-fuchsia-300">
                  VARREDURA DE CÂMERA 2D ATIVA
                </span>
              </div>
              <h3 className="text-xs md:text-sm font-bold text-white truncate leading-tight" title={locationName}>
                {locationName}
              </h3>
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1 border-t border-white/5">
                <span>Grid: {currentCoords.lat.toFixed(4)}°, {currentCoords.lng.toFixed(4)}°</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  SINAL SINTONIZADO
                </span>
              </div>
            </div>
          )}

          {/* Globe Loading State */}
          {isGlobeLoading && activeViewMode === 'globe' && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#060608] z-[30]">
              <div className="flex flex-col items-center gap-2 text-fuchsia-400">
                <Loader2 size={22} className="animate-spin" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Renderizando globo tridimensional...</span>
              </div>
            </div>
          )}

          {/* Floating Controls for 2D/3D View */}
          <div className={cn(
            "absolute bottom-6 right-6 z-[25] flex flex-col gap-1.5 transition-all duration-500",
            isTraveling ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"
          )}>
            <button
              onClick={() => {
                if (activeViewMode === 'map2d') {
                  setSatZoom(prev => Math.min(19, prev + 1));
                } else {
                  zoomIn();
                }
              }}
              className="w-10 h-10 rounded-xl bg-zinc-950/90 hover:bg-zinc-900 border border-white/10 hover:border-white/20 text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all outline-none"
              title="Aproximar Visão"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => {
                if (activeViewMode === 'map2d') {
                  setSatZoom(prev => Math.max(3, prev - 1));
                } else {
                  zoomOut();
                }
              }}
              className="w-10 h-10 rounded-xl bg-zinc-950/90 hover:bg-zinc-900 border border-white/10 hover:border-white/20 text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all outline-none"
              title="Afastar Visão"
            >
              <Minus size={16} />
            </button>
            <button
              onClick={() => {
                if (activeViewMode === 'map2d') {
                  setActiveViewMode('globe');
                } else {
                  triggerSatelliteFocus(currentCoords.lat, currentCoords.lng, locationName);
                }
              }}
              className="w-10 h-10 rounded-xl bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-500/40 text-fuchsia-300 flex items-center justify-center shadow-2xl active:scale-95 transition-all outline-none"
              title={activeViewMode === 'map2d' ? "Alternar para Globo 3D" : "Centralizar e ver em Mapa 2D"}
            >
              <Globe size={16} className="animate-pulse" />
            </button>
          </div>

          <div className={cn(
            "absolute top-4 right-4 z-[20] bg-black/60 backdrop-blur border border-white/5 px-2.5 py-1 rounded-lg text-[8px] font-mono text-zinc-500 pointer-events-none transition-all duration-500 hidden sm:block",
            isTraveling ? "opacity-0 -translate-y-4" : "opacity-100 translate-y-0"
          )}>
            {activeViewMode === 'globe' ? '🖱️ Clique e arraste para orbitar o globo' : '🗺️ Arraste para explorar o mapa de satélite'}
          </div>
        </div>
      </div>
    </div>
  );
};
