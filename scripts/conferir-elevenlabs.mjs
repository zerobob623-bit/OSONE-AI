import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const cowork = fs.readFileSync(new URL('../src/components/CoworkSection.tsx', import.meta.url), 'utf8');
const features = fs.readFileSync(new URL('../FEATURES.md', import.meta.url), 'utf8');

assert.match(app, /const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'/);
assert.match(app, /return principal \|\| ELEVENLABS_DEFAULT_VOICE_ID/);
assert.match(app, /apiKeys\.elevenLabsVoiceId2 \|\| principal \|\| ELEVENLABS_DEFAULT_VOICE_ID/);
assert.match(app, /apiKeys\.elevenLabsVoiceId3 \|\| principal \|\| ELEVENLABS_DEFAULT_VOICE_ID/);
console.log('  ok  ElevenLabs usa Rachel como fallback real quando o Voice ID fica em branco');

assert.match(app, /modeloElevenLabsParaStream\(apiKeys\.elevenLabsModel\)/);
assert.match(app, /modelo === 'eleven_multilingual_v2'\) return 'eleven_flash_v2_5'/);
assert.match(server, /modeloElevenLabsParaStream\(searchParams\.get\("modelId"\)\)/);
assert.match(server, /modelo === "eleven_multilingual_v2"\) return "eleven_flash_v2_5"/);
console.log('  ok  streaming troca modelo pesado por flash v2.5 no cliente e no proxy');

assert.match(app, /encodeURIComponent\(voiceId\).*stream-input\?model_id=\$\{encodeURIComponent\(modelId\)\}/s);
assert.match(app, /output_format=pcm_24000/);
assert.match(server, /output_format=pcm_24000/);
console.log('  ok  WebSocket monta URL codificada e pede PCM 24 kHz para o player');

assert.match(app, /dispararFallbackRest\('mensagem de erro da ElevenLabs'\)/);
assert.match(app, /dispararFallbackRest\('erro de WebSocket'\)/);
assert.match(app, /dispararFallbackRest\('fechou sem áudio'\)/);
assert.match(app, /const playElevenLabsRestFallback = async/);
console.log('  ok  erros assíncronos e fechamento sem áudio caem para REST TTS');

assert.match(app, /validarChaveElevenLabsParaUso\(apiKeys\.elevenLabsApiKey\)/);
assert.match(app, /não a API Key secreta.*começa com sk_/s);
assert.doesNotMatch(app, /WS ElevenLabs speech failed, falling back to Web Speech Synthesis/);
assert.match(app, /retomarEscutaElevenLabs/);
assert.match(app, /armarWatchdogRetornoElevenLabs/);
assert.match(app, /engine: 'local'/);
assert.match(app, /Promise<boolean>/);
const startEleven = app.match(/const startElevenLabsLiveSession = async \(\) => \{[\s\S]*?\n  \};/);
assert.ok(startEleven, 'startElevenLabsLiveSession deve existir');
assert.match(startEleven[0], /startLiveSession\(isCameraActive, 'elevenlabs'\)/);
assert.doesNotMatch(startEleven[0], /startListeningElevenLabs\(\)/);
assert.match(app, /type LiveAudioOutputEngine = 'gemini' \| 'elevenlabs'/);
assert.match(app, /liveAudioOutputEngineRef/);
assert.match(app, /!isElevenLabsLiveOutput\(\)\)\s*\{\s*audioPlayerRef\.current\?\.playChunk/s);
assert.match(app, /outputTranscription\?\.text/);
assert.match(app, /enviarTextoLiveParaElevenLabs\(transcriptChunk\)/);
assert.match(app, /finalizarStreamLiveElevenLabs\(cleanedText\)/);
assert.match(app, /ws\.send\(JSON\.stringify\(\{ text: "", flush: true \}\)\)/);
assert.match(app, /interromperSaidaElevenLabs\('interrupção por voz', false\)/);
assert.match(app, /rms < 0\.018/);
assert.match(app, /setIsListening\(true\);\s*return;\s*\}\s*startListeningElevenLabs\(\)/s);
assert.match(server, /validarChaveElevenLabsParaUso\(elApiKey\)/);
assert.match(server, /validarChaveElevenLabsParaUso\(trimApiKey\)/);
assert.match(cowork, /validarChaveElevenLabsParaUso\(elevenLabsApiKey\)/);
console.log('  ok  ElevenLabs usa Gemini Live como sessão contínua, fala incrementalmente e aceita interrupção');

assert.match(features, /ElevenLabs Streaming TTS/);
console.log('  ok  recurso ElevenLabs continua registrado no FEATURES.md');

assert.match(cowork, /type MotorNarracaoCowork = 'piper' \| 'elevenlabs'/);
assert.match(cowork, /engine: 'elevenlabs'/);
assert.match(cowork, /<option value="piper">Piper local<\/option>/);
assert.match(cowork, /<option value="elevenlabs">ElevenLabs<\/option>/);
assert.doesNotMatch(cowork, /speechSynthesis|SpeechSynthesisUtterance|CHAVE_DA_VOZ_NARRACAO|vozesDisponiveis|Navegador reserva/);
assert.match(app, /elevenLabsApiKey=\{apiKeys\.elevenLabsApiKey \|\| ''\}/);
assert.match(app, /elevenLabsVoiceId=\{getActiveElevenLabsVoiceId\(\)\}/);
assert.match(features, /não usa mais `speechSynthesis`\/voz Google como fallback no COWORK/);
assert.match(features, /cada pedaço de transcrição da resposta é enviado incrementalmente/);
assert.match(features, /permite interrupção real sem esperar timeout/);
console.log('  ok  COWORK oferece só Piper/ElevenLabs e não volta para voz Google/navegador');

console.log('7/7 conferências ElevenLabs passaram.');
