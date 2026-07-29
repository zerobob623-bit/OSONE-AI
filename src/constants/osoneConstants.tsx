import React from 'react';
import { SoundEffect, WorkspaceMode } from '../types';

export const BowAndArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M5 21C5 13 13 5 21 5" />
    <path d="M5 21L21 5" strokeDasharray="2 2" strokeOpacity="0.7" />
    <path d="M7 17L19 7" strokeWidth="2.5" />
    <path d="M19 7H14M19 7V12" strokeWidth="2.5" />
    <path d="M7 17L5 19M8 18L6 20" />
  </svg>
);

export const CyberneticHandIcon = ({ className = "w-8 h-8" }: { className?: string }) => {
  return (
    <svg 
      viewBox="0 0 120 120" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
    >
      <defs>
        <filter id="hologram-unreal-bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur2" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="8.0" result="blur3" />
          <feMerge>
            <feMergeNode in="blur3" />
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="fresnel-rim-bloom" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComponentTransfer in="blur" result="boost">
            <feFuncA type="linear" slope="2" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="boost" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <pattern id="hex-grid-pattern" width="6" height="10.392" patternUnits="userSpaceOnUse">
          <path
            d="M3,0 L6,1.732 L6,5.196 L3,6.928 L0,5.196 L0,1.732 Z M3,10.392 L6,8.66 L6,5.196 L3,6.928 L0,5.196 L0,8.66 Z"
            fill="none"
            stroke="#10b981"
            strokeWidth="0.35"
            strokeOpacity="0.45"
          />
        </pattern>

        <radialGradient id="fresnel-shader-grad" cx="58%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#02140d" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#063824" stopOpacity="0.65" />
          <stop offset="80%" stopColor="#059669" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
        </radialGradient>

        <linearGradient id="wrist-dissolve-fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="70%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="90%" stopColor="#ffffff" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <mask id="wrist-mask">
          <rect x="0" y="0" width="120" height="120" fill="url(#wrist-dissolve-fade)" />
        </mask>

        <radialGradient id="scan-target-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="1" />
          <stop offset="40%" stopColor="#10b981" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#047857" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter="url(#hologram-unreal-bloom)">
        <path
          d="M38,102 C35,92 36,82 40,72 C34,68 24,62 16,52 C12,46 12,38 18,34 C24,30 30,34 35,42 C38,46 41,50 46,18 C45,12 51,8 56,10 C61,12 60,18 58,10 C57,4 64,2 69,5 C74,8 72,14 72,14 C72,8 78,6 83,9 C87,12 85,18 84,26 C85,21 90,20 94,23 C97,26 95,31 93,40 C91,48 89,58 88,74 C88,85 84,95 80,104"
          fill="none"
          stroke="#34d399"
          strokeWidth="3.5"
          strokeOpacity="0.3"
          filter="url(#fresnel-rim-bloom)"
        />

        <g mask="url(#wrist-mask)">
          <path
            d="M38,102 C35,92 36,82 40,72 C34,68 24,62 16,52 C12,46 12,38 18,34 C24,30 30,34 35,42 C38,46 41,50 46,18 C45,12 51,8 56,10 C61,12 60,18 58,10 C57,4 64,2 69,5 C74,8 72,14 72,14 C72,8 78,6 83,9 C87,12 85,18 84,26 C85,21 90,20 94,23 C97,26 95,31 93,40 C91,48 89,58 88,74 C88,85 84,95 80,104 Z"
            fill="url(#fresnel-shader-grad)"
            stroke="#10b981"
            strokeWidth="0.8"
            strokeOpacity="0.8"
          />

          <path
            d="M38,102 C35,92 36,82 40,72 C34,68 24,62 16,52 C12,46 12,38 18,34 C24,30 30,34 35,42 C38,46 41,50 46,18 C45,12 51,8 56,10 C61,12 60,18 58,10 C57,4 64,2 69,5 C74,8 72,14 72,14 C72,8 78,6 83,9 C87,12 85,18 84,26 C85,21 90,20 94,23 C97,26 95,31 93,40 C91,48 89,58 88,74 C88,85 84,95 80,104 Z"
            fill="url(#hex-grid-pattern)"
            opacity="0.85"
          />

          <g stroke="#34d399" strokeWidth="0.5" opacity="0.6" fill="none">
            <path d="M22,46 C26,44 30,48 34,52" />
            <path d="M48,36 C52,35 55,36 57,37" />
            <path d="M47,24 C50,23 53,24 55,25" />
            <path d="M60,32 C63,31 66,32 69,33" />
            <path d="M59,18 C62,17 65,18 67,19" />
            <path d="M72,34 C75,33 78,34 81,35" />
            <path d="M72,21 C75,20 78,21 81,22" />
            <path d="M84,42 C86,41 89,42 91,43" />
            <path d="M84,30 C86,29 89,30 91,31" />

            <path d="M42,75 C52,70 65,74 78,80" strokeWidth="0.7" opacity="0.7" />
            <path d="M46,62 C56,58 66,64 74,70" strokeWidth="0.7" opacity="0.7" />
            <path d="M40,90 C50,86 60,88 72,92" strokeWidth="0.5" opacity="0.5" />
          </g>

          <path
            d="M38,102 C35,92 36,82 40,72 C34,68 24,62 16,52 C12,46 12,38 18,34 C24,30 30,34 35,42 M46,18 C45,12 51,8 56,10 M58,10 C57,4 64,2 69,5 M72,14 C72,8 78,6 83,9 M84,26 C85,21 90,20 94,23 C97,26 95,31 93,40 C91,48 89,58 88,74 M88,74 C88,85 84,95 80,104"
            fill="none"
            stroke="#a7f3d0"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>

        <g transform="translate(60, 72)">
          <circle cx="0" cy="0" r="9" fill="none" stroke="#34d399" strokeWidth="0.5" strokeDasharray="2 1.5" opacity="0.8" />
          <circle cx="0" cy="0" r="6" fill="none" stroke="#10b981" strokeWidth="0.6" opacity="0.9" />
          <circle cx="0" cy="0" r="3" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="1.2" fill="#ffffff" />
          <line x1="-11" y1="0" x2="-7" y2="0" stroke="#34d399" strokeWidth="0.6" />
          <line x1="7" y1="0" x2="11" y2="0" stroke="#34d399" strokeWidth="0.6" />
          <line x1="0" y1="-11" x2="0" y2="-7" stroke="#34d399" strokeWidth="0.6" />
          <line x1="0" y1="7" x2="0" y2="11" stroke="#34d399" strokeWidth="0.6" />
        </g>

        <g transform="translate(16, 38)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#34d399" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="2.2" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="0.9" fill="#ffffff" />
        </g>

        <g transform="translate(51, 10)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#34d399" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="2.2" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="0.9" fill="#ffffff" />
        </g>

        <g transform="translate(63, 4)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#34d399" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="2.2" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="0.9" fill="#ffffff" />
        </g>

        <g transform="translate(77, 8)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#34d399" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="2.2" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="0.9" fill="#ffffff" />
        </g>

        <g transform="translate(89, 22)">
          <circle cx="0" cy="0" r="4" fill="none" stroke="#34d399" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="2.2" fill="url(#scan-target-glow)" />
          <circle cx="0" cy="0" r="0.9" fill="#ffffff" />
        </g>

        <g fill="#34d399" opacity="0.9">
          <rect x="34" y="98" width="1.5" height="1.5" rx="0.3" opacity="0.9" />
          <rect x="39" y="104" width="2" height="2" rx="0.4" opacity="0.7" />
          <rect x="44" y="96" width="1.2" height="1.2" rx="0.2" opacity="0.8" />
          <rect x="48" y="108" width="2" height="2" rx="0.5" opacity="0.5" />
          <rect x="52" y="102" width="1.5" height="1.5" rx="0.3" opacity="0.85" />
          <rect x="57" y="112" width="1.8" height="1.8" rx="0.4" opacity="0.4" />
          <rect x="61" y="99" width="2" height="2" rx="0.5" opacity="0.9" />
          <rect x="66" y="106" width="1.2" height="1.2" rx="0.2" opacity="0.6" />
          <rect x="71" y="114" width="2.2" height="2.2" rx="0.5" opacity="0.3" />
          <rect x="75" y="101" width="1.6" height="1.6" rx="0.4" opacity="0.8" />
          <rect x="80" y="107" width="1.8" height="1.8" rx="0.4" opacity="0.5" />
          <rect x="84" y="95" width="1.2" height="1.2" rx="0.2" opacity="0.7" />

          <circle cx="36" cy="108" r="0.8" opacity="0.6" fill="#a7f3d0" />
          <circle cx="42" cy="112" r="1.1" opacity="0.5" fill="#a7f3d0" />
          <circle cx="50" cy="116" r="0.9" opacity="0.3" fill="#6ee7b7" />
          <circle cx="58" cy="118" r="1.2" opacity="0.2" fill="#34d399" />
          <circle cx="68" cy="111" r="0.8" opacity="0.4" fill="#a7f3d0" />
          <circle cx="78" cy="115" r="1.0" opacity="0.3" fill="#6ee7b7" />
          <circle cx="83" cy="103" r="0.7" opacity="0.6" fill="#a7f3d0" />
        </g>
      </g>
    </svg>
  );
};

export interface IntimateQuestion {
  id: number;
  category: string;
  question: string;
}

export const INTIMATE_QUESTIONS: IntimateQuestion[] = [
  { id: 1, category: "Informações Básicas e Identidade", question: "Qual é o seu nome completo?" },
  { id: 2, category: "Informações Básicas e Identidade", question: "Quantos anos você tem? (ou data de nascimento)" },
  { id: 3, category: "Informações Básicas e Identidade", question: "Qual é o seu gênero e pronome de preferência?" },
  { id: 4, category: "Informações Básicas e Identidade", question: "Em que cidade/país você mora atualmente?" },
  { id: 5, category: "Informações Básicas e Identidade", question: "Qual é a sua nacionalidade e etnia/cultura de origem?" },
  { id: 6, category: "Informações Básicas e Identidade", question: "Qual é o seu nível de fluência em idiomas? (português, inglês, etc.)" },
  { id: 7, category: "Vida Profissional e Educação", question: "Qual é a sua formação acadêmica (cursos, graduação, pós, etc.)?" },
  { id: 8, category: "Vida Profissional e Educação", question: "Qual é a sua profissão atual e área de atuação?" },
  { id: 9, category: "Vida Profissional e Educação", question: "Você trabalha por conta própria, em empresa, ou é estudante?" },
  { id: 10, category: "Vida Profissional e Educação", question: "Quais são as suas principais responsabilidades no trabalho/estudos?" },
  { id: 11, category: "Vida Profissional e Educação", question: "Qual é o seu objetivo de carreira de curto, médio e longo prazo?" },
  { id: 12, category: "Vida Profissional e Educação", question: "Você já mudou de carreira? Quais foram as principais transições?" },
  { id: 13, category: "Vida Pessoal e Rotina", question: "Como é um dia típico na sua vida (do acordar até dormir)?" },
  { id: 14, category: "Vida Pessoal e Rotina", question: "Qual é o seu horário habitual de acordar e dormir?" },
  { id: 15, category: "Vida Pessoal e Rotina", question: "Você pratica algum esporte ou atividade física? Com que frequência?" },
  { id: 16, category: "Vida Pessoal e Rotina", question: "Como é a sua alimentação (dieta, restrições, preferências)?" },
  { id: 17, category: "Vida Pessoal e Rotina", question: "Você tem algum problema de saúde, alergia ou condição médica importante?" },
  { id: 18, category: "Vida Pessoal e Rotina", question: "Como você cuida da sua saúde mental?" },
  { id: 19, category: "Relacionamentos e Vida Social", question: "Qual é o seu estado civil (solteiro, casado, namorando, etc.)?" },
  { id: 20, category: "Relacionamentos e Vida Social", question: "Você tem filhos? Quantos e quais as idades?" },
  { id: 21, category: "Relacionamentos e Vida Social", question: "Como é a sua relação com sua família (pais, irmãos, etc.)?" },
  { id: 22, category: "Relacionamentos e Vida Social", question: "Quantos amigos próximos você tem e com que frequência se encontra?" },
  { id: 23, category: "Relacionamentos e Vida Social", question: "Você prefere sair ou ficar em casa nos fins de semana?" },
  { id: 24, category: "Interesses, Hobbies e Entretenimento", question: "Quais são os seus hobbies e paixões principais?" },
  { id: 25, category: "Interesses, Hobbies e Entretenimento", question: "Que tipo de música você escuta (gêneros favoritos e artistas)?" },
  { id: 26, category: "Interesses, Hobbies e Entretenimento", question: "Quais séries, filmes, livros ou podcasts você mais gosta?" },
  { id: 27, category: "Interesses, Hobbies e Entretenimento", question: "Você joga videogames? Quais são seus favoritos?" },
  { id: 28, category: "Interesses, Hobbies e Entretenimento", question: "Você pratica alguma arte (desenho, música, escrita, dança, etc.)?" },
  { id: 29, category: "Interesses, Hobbies e Entretenimento", question: "Quais são os seus interesses intelectuais (ciência, história, filosofia, etc.)?" },
  { id: 30, category: "Valores, Crenças e Personalidade", question: "Quais são os seus valores mais importantes na vida?" },
  { id: 31, category: "Valores, Crenças e Personalidade", question: "Você tem alguma religião ou crença espiritual?" },
  { id: 32, category: "Valores, Crenças e Personalidade", question: "Qual é a sua visão sobre política e sociedade?" },
  { id: 33, category: "Valores, Crenças e Personalidade", question: "O que te motiva diariamente?" },
  { id: 34, category: "Valores, Crenças e Personalidade", question: "Quais são os seus maiores medos ou inseguranças?" },
  { id: 35, category: "Valores, Crenças e Personalidade", question: "Como você lida com fracassos e adversidades?" },
  { id: 36, category: "Valores, Crenças e Personalidade", question: "Qual é o seu MBTI, Big Five ou qualquer teste de personalidade que já fez?" },
  { id: 37, category: "Metas, Sonhos e Futuro", question: "Quais são os seus principais objetivos para os próximos 12 meses?" },
  { id: 38, category: "Metas, Sonhos e Futuro", question: "O que você gostaria de conquistar nos próximos 5 anos?" },
  { id: 39, category: "Metas, Sonhos e Futuro", question: "Qual é o seu \"sonho de vida\" (algo grande que quer realizar)?" },
  { id: 40, category: "Metas, Sonhos e Futuro", question: "Você tem vontade de mudar de cidade/país no futuro?" },
  { id: 41, category: "Metas, Sonhos e Futuro", question: "Em que áreas da sua vida você quer melhorar (financeira, saúde, relacionamentos, etc.)?" },
  { id: 42, category: "Preferências de Consumo e Estilo de Vida", question: "Qual é o seu orçamento mensal aproximado (ou faixa de renda)?" },
  { id: 43, category: "Preferências de Consumo e Estilo de Vida", question: "Como você gosta de viajar (luxo, mochilão, aventura, relaxamento)?" },
  { id: 44, category: "Preferências de Consumo e Estilo de Vida", question: "Qual é o seu estilo de roupa e aparência preferido?" },
  { id: 45, category: "Preferências de Consumo e Estilo de Vida", question: "Você prefere produtos digitais ou físicos?" },
  { id: 46, category: "Preferências de Consumo e Estilo de Vida", question: "Quais aplicativos ou ferramentas você usa diariamente?" },
  { id: 47, category: "Relacionamento com Tecnologia e IA", question: "Há quanto tempo você usa IAs como eu?" },
  { id: 48, category: "Relacionamento com Tecnologia e IA", question: "O que você espera de uma IA (estilo de resposta, tom, profundidade)?" },
  { id: 49, category: "Relacionamento com Tecnologia e IA", question: "Quais são os seus maiores medos ou preocupações com IA?" },
  { id: 50, category: "Relacionamento com Tecnologia e IA", question: "Em que áreas você mais quer ajuda de uma IA (estudos, produtividade, criatividade, etc.)?" },
  { id: 51, category: "Perguntas Profundas / \"Tudo\"", question: "Qual foi o momento mais feliz da sua vida até hoje?" },
  { id: 52, category: "Perguntas Profundas / \"Tudo\"", question: "Qual foi o momento mais difícil e o que você aprendeu com ele?" },
  { id: 53, category: "Perguntas Profundas / \"Tudo\"", question: "Se você pudesse mudar uma coisa na sua vida agora, o que seria?" },
  { id: 54, category: "Perguntas Profundas / \"Tudo\"", question: "O que você quer que as pessoas digam sobre você no futuro?" },
  { id: 55, category: "Perguntas Profundas / \"Tudo\"", question: "Existe algo sobre você que quase ninguém sabe?" }
];

export const DEFAULT_SOUNDS: SoundEffect[] = [
  { id: '1', name: 'Boing', category: 'funny', url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
  { id: '2', name: 'Grito de Terror', category: 'terror', url: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3' },
  { id: '3', name: 'Batida de Coração', category: 'suspense', url: 'https://assets.mixkit.co/active_storage/sfx/2324/2324-preview.mp3' },
  { id: '4', name: 'Passos Sutis', category: 'sneaky', url: 'https://assets.mixkit.co/active_storage/sfx/2355/2355-preview.mp3' },
  { id: '5', name: 'Risada Maligna', category: 'halloween', url: 'https://assets.mixkit.co/active_storage/sfx/2287/2287-preview.mp3' },
  { id: '6', name: 'Rimshot', category: 'comico', url: 'https://assets.mixkit.co/active_storage/sfx/2330/2330-preview.mp3' },
  { id: '7', name: 'Aplausos', category: 'comico', url: 'https://assets.mixkit.co/active_storage/sfx/2362/2362-preview.mp3' },
  { id: '8', name: 'Rufar de Tambores', category: 'suspense', url: 'https://assets.mixkit.co/active_storage/sfx/2289/2289-preview.mp3' },
  { id: '9', name: 'Erro/Buzz', category: 'funny', url: 'https://assets.mixkit.co/active_storage/sfx/2353/2353-preview.mp3' },
  { id: '10', name: 'Ta-da!', category: 'comico', url: 'https://assets.mixkit.co/active_storage/sfx/2365/2365-preview.mp3' },
  { id: '11', name: 'Trovão', category: 'horror', url: 'https://assets.mixkit.co/active_storage/sfx/2344/2344-preview.mp3' },
  { id: '12', name: 'Porta Rangendo', category: 'horror', url: 'https://assets.mixkit.co/active_storage/sfx/2261/2261-preview.mp3' },
  { id: '13', name: 'Assobio', category: 'funny', url: 'https://assets.mixkit.co/active_storage/sfx/2331/2331-preview.mp3' },
  { id: '14', name: 'Brilho Mágico', category: 'funny', url: 'https://assets.mixkit.co/active_storage/sfx/2374/2374-preview.mp3' },
  { id: '15', name: 'Voo Ninja', category: 'sneaky', url: 'https://assets.mixkit.co/active_storage/sfx/2351/2351-preview.mp3' },
  { id: '16', name: 'Explosão Cômica', category: 'funny', url: 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3' },
  { id: '17', name: 'Tapa Corretivo (Meme)', category: 'comico', url: 'synth://slap' },
  { id: '18', name: 'Homem de Ferro (Iron Man) - Heavy Rock Tribute', category: 'musica', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' }
];

export interface ComboHost {
  name: string;
  role: string;
  gender: 'male' | 'female';
  pitch: number;
  rate: number;
  avatarUrl: string;
  accentColor: string;
  instructions: string;
}

export interface DuoCombo {
  id: string;
  name: string;
  hostA: ComboHost;
  hostB: ComboHost;
}

export const DUO_COMBOS: DuoCombo[] = [
  {
    id: 'prof_bilingue',
    name: 'Sala de Imersão (Inglês + Mentoria)',
    hostA: {
      name: 'Prof. Sean',
      role: 'Especialista em Língua Inglesa & Fonética',
      gender: 'male',
      pitch: 0.90,
      rate: 0.98,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
      instructions: ' abordagem de imersão total em inglês. Dinâmico, carismático e focado em ensinar inglês de forma prática, de conversação rápida e natural. Ele usa expressões idiomáticas novas e fáceis, e corrige o usuário no chat ou nas falas com total leveza.'
    },
    hostB: {
      name: 'Profª Clara',
      role: 'Mentoria Pedagógica & Tradução',
      gender: 'female',
      pitch: 1.25,
      rate: 1.02,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
      instructions: ' abordagem empática de facilitação e mentoria de estudos. Especialista em tradução, gramática comparativa inglês-português e metodologia de estudo. Ajuda a esclarecer nuances de palavras e organizar o processo de fixação.'
    }
  },
  {
    id: 'prof_ciencias',
    name: 'Gênio Co-Docente (Inglês + Sciences)',
    hostA: {
      name: 'Prof. Sean',
      role: 'Especialista em Língua Inglesa & Fonética',
      gender: 'male',
      pitch: 0.90,
      rate: 0.98,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
      instructions: ' abordagem de imersão total em inglês com ênfase em vocabulário técnico acadêmico e termos científicos contemporâneos.'
    },
    hostB: {
      name: 'Prof. Newton',
      role: 'Física Teórica & Inovação Computacional',
      gender: 'male',
      pitch: 0.85,
      rate: 0.95,
      avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-red-400 bg-red-400/10 border-red-400/20',
      instructions: ' abordagem lógica, racional, curiosa sobre leis do universo, física moderna e IA avançada. Procura de forma instigante trazer dúvidas e fatos matemáticos ao debate.'
    }
  },
  {
    id: 'prof_humanas',
    name: 'Debate Intercultural (Inglês + Cultura)',
    hostA: {
      name: 'Prof. Sean',
      role: 'Especialista em Língua Inglesa & Fonética',
      gender: 'male',
      pitch: 0.90,
      rate: 0.98,
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
      instructions: ' abordagem de inglês aplicado a discussões de literatura internacional, sotaques globais e expressão cultural fluida.'
    },
    hostB: {
      name: 'Profª Helena',
      role: 'História Geral & Ciências Humanas',
      gender: 'female',
      pitch: 1.15,
      rate: 0.95,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      instructions: ' abordagem culta, histórica e filosófica. Traz ricas conexões culturais da história moderna, marcos literários e análises sociológicas fascinantes ao diálogo.'
    }
  },
  {
    id: 'socrates_nietzsche',
    name: 'Sócrates vs. Nietzsche (Razão vs. Vida)',
    hostA: {
      name: 'Sócrates',
      role: 'O Pai do Racionalismo & Diálogo Socrático',
      gender: 'male',
      pitch: 0.95,
      rate: 0.90,
      avatarUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      instructions: ' abordagem socrática clássica (maiêutica). Ele inicia questionando as certezas absolutas do usuário e de Nietzsche, usando de ironia fina e perguntas indutoras que revelam contradições para extrair do próprio debatedor e do usuário as respostas reais para a virtude e o autoconhecimento. Sua máxima é "Só sei que nada sei". É calmo, humilde na fala, mas mortalmente perspicaz de forma irônica.'
    },
    hostB: {
      name: 'Nietzsche',
      role: 'O Crítico de Dogmas & Filósofo da Vida',
      gender: 'male',
      pitch: 0.80,
      rate: 1.05,
      avatarUrl: 'https://images.unsplash.com/photo-1542343633-ce7b23211a88?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      instructions: ' abordagem iconoclasta, dionisíaca e do vitalismo existencial. Despreza falsas morais, dogmas metafísicos e o racionalismo excessivo de Sócrates que ele diz ter enfraquecido o espírito humano. Ele incita o criador a se tornar o "Übermensch" (Além-do-Homem) e a abraçar o caos e a criação ("Tornar-se quem se é", "Amor fati"). É poético, intenso, instigante, ousadamente ranzinza contra conformismos e grandioso na retórica.'
    }
  },
  {
    id: 'platao_aristoteles',
    name: 'Platão vs. Aristóteles (Idealismo vs. Empirismo)',
    hostA: {
      name: 'Platão',
      role: 'O Filósofo do Mundo das Ideias',
      gender: 'male',
      pitch: 0.85,
      rate: 0.92,
      avatarUrl: 'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
      instructions: ' abordagem idealista e metafísica pura. Ele argumenta vigorosamente que o nosso mundo físico é uma ilusão de sombras e que a verdadeira Realidade Suprema reside no inteligível Mundo das Ideias perfeitas. Vê a alma como imortal e o aprendizado como recordação/reminiscência. É solene, poético, metafórico (remete ao Mito da Caverna) e expressa suas visões com tom místico e elevado.'
    },
    hostB: {
      name: 'Aristóteles',
      role: 'O Mestre da Lógica Pragmática & Empirismo',
      gender: 'male',
      pitch: 0.92,
      rate: 0.96,
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      instructions: ' abordagem lógica, sistemática, realista e baseada na observação minuciosa do mundo sensorial. Ele discorda do dualismo metafísico de seu mestre Platão, argumentando que as essências residem nas próprias coisas reais, unindo matéria e forma. Ele explica as coisas através do sistema de quatro causas e busca focar o debate na ética de virtude do meio-termo (equilíbrio prático) e conclusões empíricas pragmáticas.'
    }
  },
  {
    id: 'sartre_camus',
    name: 'Sartre vs. Camus (Existência vs. O Absurdo)',
    hostA: {
      name: 'Sartre',
      role: 'O Filósofo da Liberdade Condenada',
      gender: 'male',
      pitch: 0.88,
      rate: 1.00,
      avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      instructions: ' abordagem existencialista ateia estrita. Ele afirma com paixão intelectual que "a existência precede a essência" — o homem surge no mundo primeiro, define-se depois e é "condenado a ser livre", carregando total responsabilidade pelas próprias atitudes sem bodes expiatórios ou má-fé. Ele busca o engajamento revolucionário e a ação concreta.'
    },
    hostB: {
      name: 'Camus',
      role: 'O Filósofo da Revolta Lúcida',
      gender: 'male',
      pitch: 0.90,
      rate: 1.02,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80',
      accentColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
      instructions: ' abordagem absurda e do inconformismo compassivo. Ele recusa o existencialismo filosófico rígido e afirma que a busca humana por sentido colide com o silêncio sem sentido do universo (o Absurdo). Porém, longe de se desesperar, ele advoga que a verdadeira liberdade reside em aceitar o Absurdo e viver uma revolta criativa diária e feliz (assim como Sísifo empurrando sua pedra). É poético, rebelde, caloroso e focado no amor pelo presente humano.'
    }
  }
];

export const DUO_TOPICS = [
  { id: 'english_immersion', name: '🇬🇧 Imersão & Conversação em Inglês', description: 'Foco exclusivo em conversação ativa, listening natural e pronúncia correta.' },
  { id: 'stem', name: '🔬 Ciências, Tecnologia & STEM', description: 'Investigação de tópicos científicos e IA aplicados ao aprendizado bilíngue.' },
  { id: 'humanities', name: '🏛️ Cultura, História & Sociedade', description: 'Discussão literária, histórica e evolução linguística nos dias de hoje.' },
  { id: 'metacognition', name: '🧠 Metacognição & Técnicas de Estudo', description: 'Estratégias de aprendizagem, memorização ativa e inteligência educacional.' },
  { id: 'philosophy', name: '🏛️ Filosofia, Existência & Verdade', description: 'Debates instigantes sobre a condição humana, o sentido, verdades metafísicas e dilemas morais.' }
];

export interface SpeechTurn {
  speaker: 'hostA' | 'hostB';
  name: string;
  text: string;
}

export const parseDuoTextToTurns = (text: string, combo: DuoCombo): SpeechTurn[] => {
  const turns: SpeechTurn[] = [];
  const lines = text.split('\n');
  
  let currentSpeaker: 'hostA' | 'hostB' | null = null;
  let currentText = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const cleanLine = trimmed.replace(/^\*\*Fontes:\*\*.*$/i, '').trim();
    if (!cleanLine) continue;
    
    if (cleanLine.startsWith('* [') && cleanLine.includes('](')) continue;
    
    const isHostA = trimmed.startsWith(`**${combo.hostA.name}**:`) || 
                    trimmed.startsWith(`${combo.hostA.name}:`) ||
                    trimmed.startsWith(`[${combo.hostA.name}]:`) ||
                    trimmed.startsWith(`*${combo.hostA.name}*:`) ||
                    trimmed.startsWith(`**${combo.hostA.name}** :`) ||
                    trimmed.startsWith(`**${combo.hostA.name.toUpperCase()}**:`) ||
                    trimmed.startsWith(`${combo.hostA.name.toUpperCase()}:`);
                    
    const isHostB = trimmed.startsWith(`**${combo.hostB.name}**:`) || 
                    trimmed.startsWith(`${combo.hostB.name}:`) ||
                    trimmed.startsWith(`[${combo.hostB.name}]:`) ||
                    trimmed.startsWith(`*${combo.hostB.name}*:`) ||
                    trimmed.startsWith(`**${combo.hostB.name}** :`) ||
                    trimmed.startsWith(`**${combo.hostB.name.toUpperCase()}**:`) ||
                    trimmed.startsWith(`${combo.hostB.name.toUpperCase()}:`);
                    
    if (isHostA) {
      if (currentSpeaker && currentText.trim()) {
        turns.push({ speaker: currentSpeaker, name: currentSpeaker === 'hostA' ? combo.hostA.name : combo.hostB.name, text: currentText.trim() });
      }
      currentSpeaker = 'hostA';
      currentText = trimmed.replace(new RegExp(`^(\\*\\*)?${combo.hostA.name}(\\*\\*)?\\s*:\\s*`, 'i'), '');
    } else if (isHostB) {
      if (currentSpeaker && currentText.trim()) {
        turns.push({ speaker: currentSpeaker, name: currentSpeaker === 'hostA' ? combo.hostA.name : combo.hostB.name, text: currentText.trim() });
      }
      currentSpeaker = 'hostB';
      currentText = trimmed.replace(new RegExp(`^(\\*\\*)?${combo.hostB.name}(\\*\\*)?\\s*:\\s*`, 'i'), '');
    } else {
      if (currentSpeaker) {
        currentText += '\n' + trimmed;
      } else {
        currentSpeaker = 'hostA';
        currentText = trimmed;
      }
    }
  }
  
  if (currentSpeaker && currentText.trim()) {
    turns.push({ speaker: currentSpeaker, name: currentSpeaker === 'hostA' ? combo.hostA.name : combo.hostB.name, text: currentText.trim() });
  }
  
  return turns;
};

let sharedFxAudioCtx: AudioContext | null = null;
export const getSharedFxAudioCtx = (): AudioContext | null => {
  try {
    if (!sharedFxAudioCtx || sharedFxAudioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return null;
      sharedFxAudioCtx = new AudioCtxClass();
    }
    if (sharedFxAudioCtx.state === 'suspended') {
      sharedFxAudioCtx.resume().catch(() => {});
    }
    return sharedFxAudioCtx;
  } catch (_) {
    return null;
  }
};

export const playMXKeySound = () => {
  try {
    const ctx = getSharedFxAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    const now = ctx.currentTime;
    osc.type = Math.random() > 0.4 ? 'sine' : 'triangle';
    const baseFreq = 480 + Math.random() * 260;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.035);

    gainNode.gain.setValueAtTime(0.03, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (e) {}
};

export const playNeuralSummonSound = () => {
  try {
    const ctx = getSharedFxAudioCtx();
    if (!ctx) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    const now = ctx.currentTime;
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, now);
    osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2);

    gainNode.gain.setValueAtTime(0.06, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start(now);
    osc2.start(now);
    
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  } catch (e) {}
};

export const getFriendlyModeName = (mode: WorkspaceMode): string => {
  switch (mode) {
    case 'home': return 'Início / Painel Central';
    case 'writing': return 'Escrita / Estúdio de Texto';
    case 'code': return 'OSONE CODE (Swarm Harness)';
    case 'canvas': return 'Quadro Interativo / Desenho';
    case 'wellness': return 'Wellness & Style Lab';
    case 'local_control': return 'Automação IoT (Sandbox Local)';
    case 'smarthome': return 'Automação IoT — Modo Demonstração (Tuya/Hue)';
    case 'sounds': return 'Biblioteca de Sons';
    case 'whatsapp': return 'Gerenciador WhatsApp';
    case 'map': return 'Mapa OS';
    case 'rag': return 'RAG • Conector de Arquivos PC';
    case 'creator': return 'Estúdio de Criação Viral';
    case 'memory_book': return 'Livro de Memórias';
    default: return String(mode);
  }
};
