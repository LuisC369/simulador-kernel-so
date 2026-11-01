// Pruebas del semáforo binario, la condición de carrera y su integración con el kernel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kernel } from '../src/kernel.js';
import { SemaforoBinario, simularCarrera } from '../src/semaforo.js';
import { ejecutarComando } from '../src/comandos.js';

function kernelConProcesos(cantidad) {
  const kernel = new Kernel();
  for (let i = 0; i < cantidad; i++) {
    kernel.crearProceso('10', '5');
  }
  return kernel;
}

test('carrera sin semáforo: se pierde una actualización', function () {
  const r = simularCarrera(false);
  assert.equal(r.final, 800);
  assert.equal(r.esperado, 1300);
  const acciones = [];
  for (let i = 0; i < r.pasos.length; i++) {
    acciones.push(r.pasos[i].proceso + ':' + r.pasos[i].valorLocal + ':' + r.pasos[i].saldo);
  }
  assert.deepEqual(acciones, ['A:1000:1000', 'B:1000:1000', 'A:1500:1500', 'B:800:800']);
});

test('carrera con semáforo: el resultado es correcto y B espera a A', function () {
  const r = simularCarrera(true);
  assert.equal(r.final, 1300);
  assert.equal(r.esperado, 1300);
  const orden = [];
  for (let i = 0; i < r.pasos.length; i++) {
    orden.push(r.pasos[i].proceso);
  }
  assert.deepEqual(orden, ['A', 'B', 'A', 'A', 'A', 'B', 'B', 'B']);
  assert.match(r.pasos[1].accion, /bloquea/);
  assert.match(r.pasos[4].accion, /despierta a B/);
  assert.equal(r.pasos[5].valorLocal, 1500);
});

test('semáforo: un signal sin cola deja el valor en 1', function () {
  const s = new SemaforoBinario();
  assert.equal(s.wait(1), true);
  assert.equal(s.valor, 0);
  assert.equal(s.signal(1), null);
  assert.equal(s.valor, 1);
  assert.equal(s.dentro, null);
});

test('tres procesos en orden: entra 1 y la cola queda [2, 3]', function () {
  const kernel = kernelConProcesos(3);
  assert.equal(kernel.wait(1), true);
  assert.equal(kernel.wait(2), false);
  assert.equal(kernel.wait(3), false);
  assert.equal(kernel.semaforo.dentro, 1);
  assert.deepEqual(kernel.semaforo.cola, [2, 3]);
  assert.equal(kernel.procesos[1].estado, 'BLOQUEADO');
  assert.equal(kernel.procesos[1].enColaSemaforo, true);
});

test('signal de quien no está dentro da error y no cambia nada', function () {
  const kernel = kernelConProcesos(3);
  kernel.wait(1);
  kernel.wait(2);
  kernel.wait(3);
  assert.throws(function () { kernel.signal(2); }, /no está dentro/);
  assert.equal(kernel.semaforo.dentro, 1);
  assert.deepEqual(kernel.semaforo.cola, [2, 3]);
});

test('signal 1 despierta a 2: el valor sigue en 0 y la cola queda [3]', function () {
  const kernel = kernelConProcesos(3);
  kernel.wait(1);
  kernel.wait(2);
  kernel.wait(3);
  assert.equal(kernel.signal(1), 2);
  assert.equal(kernel.semaforo.dentro, 2);
  assert.equal(kernel.semaforo.valor, 0);
  assert.deepEqual(kernel.semaforo.cola, [3]);
  assert.equal(kernel.procesos[1].estado, 'LISTO');
  assert.equal(kernel.procesos[1].enColaSemaforo, false);
  assert.equal(kernel.procesos[2].estado, 'BLOQUEADO');
});

test('kill del proceso que está dentro despierta al siguiente', function () {
  const kernel = kernelConProcesos(3);
  kernel.wait(1);
  kernel.wait(2);
  kernel.wait(3);
  kernel.kill(1);
  assert.equal(kernel.semaforo.dentro, 2);
  assert.deepEqual(kernel.semaforo.cola, [3]);
  assert.equal(kernel.procesos[1].estado, 'LISTO');
});

test('kill de un proceso en la cola lo saca sin afectar a los demás', function () {
  const kernel = kernelConProcesos(3);
  kernel.wait(1);
  kernel.wait(2);
  kernel.wait(3);
  kernel.kill(2);
  assert.equal(kernel.semaforo.dentro, 1);
  assert.deepEqual(kernel.semaforo.cola, [3]);
  assert.equal(kernel.procesos[1].enColaSemaforo, false);
});

test('un proceso que termina dentro de la sección la libera', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '2');
  kernel.crearProceso('10', '2');
  kernel.wait(1);
  kernel.wait(2);
  kernel.tick(2); // P1 completa su ráfaga dentro de la sección crítica
  assert.equal(kernel.procesos[0].estado, 'TERMINADO');
  assert.equal(kernel.semaforo.dentro, 2);
  kernel.ejecutarHastaTerminar();
  assert.equal(kernel.procesos[1].estado, 'TERMINADO');
  assert.equal(kernel.semaforo.valor, 1);
  assert.equal(kernel.semaforo.dentro, null);
});

test('un proceso en CPU que se bloquea cede la CPU y conserva su avance', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '5');
  kernel.crearProceso('10', '5');
  kernel.wait(2);
  kernel.tick(1); // P1 entra a la CPU
  assert.equal(kernel.procesos[0].estado, 'EJECUCION');
  kernel.wait(1); // la sección es de P2, así que P1 se bloquea
  assert.equal(kernel.planificador.enEjecucion, null);
  assert.equal(kernel.procesos[0].tcb.pc, 1);
  kernel.tick(1);
  assert.equal(kernel.planificador.enEjecucion.pid, 2);
});

test('un proceso bloqueado no recibe CPU ni acumula espera', function () {
  const kernel = kernelConProcesos(2);
  kernel.wait(1);
  kernel.wait(2);
  kernel.tick(3);
  assert.deepEqual(kernel.historial, [1, 1, 1]);
  assert.equal(kernel.procesos[1].rafagaRestante, 5);
  assert.equal(kernel.procesos[1].tiempoEspera, 0);
});

test('wait inválido: ya dentro, en cola, inexistente o terminado', function () {
  const kernel = kernelConProcesos(2);
  kernel.wait(1);
  kernel.wait(2);
  assert.throws(function () { kernel.wait(1); }, /ya está dentro/);
  assert.throws(function () { kernel.wait(2); }, /bloqueado/);
  assert.throws(function () { kernel.wait(99); }, /No existe/);
  kernel.kill(2);
  assert.throws(function () { kernel.wait(2); }, /ya terminó/);
  assert.throws(function () { kernel.signal(2); }, /ya terminó/);
  assert.deepEqual(kernel.semaforo.cola, []);
});

test('comandos del semáforo: salida de texto y errores', function () {
  const kernel = kernelConProcesos(2);
  ejecutarComando(kernel, 'WAIT p1');
  ejecutarComando(kernel, 'wait 2');
  assert.deepEqual(ejecutarComando(kernel, 'sem'), [
    'Semáforo: valor 0 (ocupado)',
    'Dentro de la sección crítica: P1',
    'Cola de espera: [P2]',
    'Variable compartida: Q1,000',
  ]);
  assert.match(ejecutarComando(kernel, 'signal 2')[0], /^ERROR: P2 no está dentro/);
  assert.match(ejecutarComando(kernel, 'carrera')[0], /^ERROR: cantidad/);
  assert.match(ejecutarComando(kernel, 'carrera talvez')[0], /^ERROR: opción inválida/);
  assert.match(ejecutarComando(kernel, 'wait')[0], /^ERROR: cantidad/);

  const sin = ejecutarComando(kernel, 'carrera SIN');
  assert.ok(sin.includes('Resultado final: Q800 | Esperado: Q1,300'));
  const con = ejecutarComando(kernel, 'carrera con');
  assert.ok(con.includes('Resultado final: Q1,300 | Esperado: Q1,300'));
});

test('reset deja el semáforo como nuevo', function () {
  const kernel = kernelConProcesos(2);
  kernel.wait(1);
  kernel.wait(2);
  kernel.reset();
  assert.equal(kernel.semaforo.valor, 1);
  assert.equal(kernel.semaforo.dentro, null);
  assert.deepEqual(kernel.semaforo.cola, []);
  assert.equal(kernel.variableCompartida, 1000);
});
