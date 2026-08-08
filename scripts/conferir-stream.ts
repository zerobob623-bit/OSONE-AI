import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { acompanharClienteDoStream } from '../src/lib/clienteDoStream';

class RespostaDeTeste extends EventEmitter {
  writableEnded = false;

  fechar() {
    this.emit('close');
  }
}

// O navegador terminou de mandar o POST, mas a resposta continua aberta: nada nessa etapa é
// entregue ao observador e a geração tem de continuar.
const respostaNormal = new RespostaDeTeste();
const normal = acompanharClienteDoStream(respostaNormal);
assert.equal(normal.foiEmbora, false);

// Depois de res.end(), o Node fecha a resposta como parte do ciclo saudável.
respostaNormal.writableEnded = true;
respostaNormal.fechar();
assert.equal(normal.foiEmbora, false, 'fechamento normal da resposta cancelou a geração');

// Fechar antes de terminar é o cancelamento real (aba fechada ou AbortController).
const respostaInterrompida = new RespostaDeTeste();
const interrompida = acompanharClienteDoStream(respostaInterrompida);
respostaInterrompida.fechar();
assert.equal(interrompida.foiEmbora, true, 'desconexão prematura não cancelou a geração');

console.log('3/3 conferências do ciclo de streaming passaram.');
