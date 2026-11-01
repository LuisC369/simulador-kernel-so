// Pruebas de Round Robin y del kernel. Los valores esperados vienen de la Tarea 12
// y de las diapositivas del catedrático, calculados a mano.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kernel } from '../src/kernel.js';
import { retorno, respuesta, espera } from '../src/pcb.js';

// Antes de cada tick crea los procesos cuya llegada coincide con el reloj.
// Recibe pares [llegada, ráfaga]; cada proceso usa 10 MB.
function simular(lista, quantum) {
  const kernel = new Kernel({ quantum: quantum });
  let creados = 0;
  let terminados = 0;
  while (terminados < lista.length) {
    assert.ok(kernel.reloj < 1000, 'la simulación no terminó');
    for (let i = 0; i < lista.length; i++) {
      if (lista[i][0] === kernel.reloj) {
        kernel.crearProceso('10', String(lista[i][1]));
        creados++;
      }
    }
    kernel.tick();
    terminados = 0;
    for (let i = 0; i < kernel.procesos.length; i++) {
      if (kernel.procesos[i].fin !== null) {
        terminados++;
      }
    }
  }
  assert.equal(creados, lista.length);
  return { kernel: kernel, procesos: kernel.procesos, metricas: kernel.metricas() };
}

function dosDecimales(numero) {
  return Number(numero.toFixed(2));
}

function campo(procesos, funcion) {
  const valores = [];
  for (let i = 0; i < procesos.length; i++) {
    valores.push(funcion(procesos[i]));
  }
  return valores;
}

const CASOS = [
  { nombre: 'Tarea 12, Ej. 1', q: 3, p: [[0, 8], [0, 4], [0, 2]], fin: [14, 12, 8], ret: [14, 12, 8], esp: [6, 8, 6], promEsp: 6.67, promRet: 11.33 },
  { nombre: 'Tarea 12, Ej. 2', q: 2, p: [[0, 5], [1, 3], [2, 1]], fin: [9, 8, 5], ret: [9, 7, 3], esp: [4, 4, 2], promEsp: 3.33, promRet: 6.33 },
  { nombre: 'Tarea 12, Ej. 3', q: 4, p: [[0, 9], [2, 2], [4, 5]], fin: [16, 6, 15], ret: [16, 4, 11], esp: [7, 2, 6], promEsp: 5.0, promRet: 10.33 },
  { nombre: 'Tarea 12, Ej. 4', q: 2, p: [[0, 3], [1, 2], [8, 4]], fin: [5, 4, 12], ret: [5, 3, 4], esp: [2, 1, 0], promEsp: 1.0, promRet: 4.0 },
  { nombre: 'Tarea 12, Ej. 5', q: 1, p: [[0, 3], [1, 1], [2, 2]], fin: [5, 2, 6], ret: [5, 1, 4], esp: [2, 0, 2], promEsp: 1.33, promRet: 3.33 },
  { nombre: 'Catedrático, diap. 12', q: 2, p: [[0, 6], [0, 2], [0, 4]], fin: [12, 4, 10], ret: [12, 4, 10], esp: [6, 2, 6], promEsp: 4.67, promRet: 8.67 },
  { nombre: 'Catedrático, diap. 21', q: 2, p: [[0, 4], [0, 2], [0, 6]], fin: [8, 4, 12], ret: [8, 4, 12], esp: [4, 2, 6], promEsp: 4.0, promRet: 8.0 },
  { nombre: 'Catedrático, diap. 27', q: 2, p: [[0, 5], [1, 3], [2, 1], [3, 4]], fin: [11, 10, 5, 13], ret: [11, 9, 3, 10], esp: [6, 6, 2, 6], promEsp: 5.0, promRet: 8.25 },
];

for (let i = 0; i < CASOS.length; i++) {
  const caso = CASOS[i];
  test(caso.nombre, function () {
    const r = simular(caso.p, caso.q);
    assert.deepEqual(campo(r.procesos, function (p) { return p.fin; }), caso.fin);
    assert.deepEqual(campo(r.procesos, retorno), caso.ret);
    assert.deepEqual(campo(r.procesos, espera), caso.esp);
    assert.equal(dosDecimales(r.metricas.esperaPromedio), caso.promEsp);
    assert.equal(dosDecimales(r.metricas.retornoPromedio), caso.promRet);
    // Sin bloqueos, lo contado en la cola debe ser igual a retorno - ráfaga.
    for (let j = 0; j < r.procesos.length; j++) {
      const p = r.procesos[j];
      assert.equal(espera(p), retorno(p) - p.rafagaTotal);
    }
  });
}

test('Tarea 12, Ej. 4: utilización, productividad y CPU ociosa', function () {
  const r = simular(CASOS[3].p, CASOS[3].q);
  assert.equal(r.metricas.utilizacion, 75);
  assert.equal(r.metricas.productividad, 0.25);
  assert.deepEqual(r.kernel.historial.slice(5, 8), [null, null, null]);
});

test('Diapositiva 12: tiempos de respuesta', function () {
  const r = simular(CASOS[5].p, CASOS[5].q);
  assert.deepEqual(campo(r.procesos, respuesta), [0, 2, 4]);
  assert.equal(r.metricas.respuestaPromedio, 2);
});

test('Diapositiva 27: historial exacto', function () {
  const r = simular(CASOS[7].p, CASOS[7].q);
  assert.deepEqual(r.kernel.historial, [1, 1, 2, 2, 3, 1, 1, 4, 4, 2, 1, 4, 4]);
});

test('el TCB guarda y restaura el contador de programa', function () {
  const kernel = new Kernel();
  const p1 = kernel.crearProceso('10', '8');
  kernel.crearProceso('10', '4');
  kernel.tick(3);
  assert.equal(p1.tcb.pc, 3);
  kernel.tick(1); // P1 sale de la CPU y P2 entra con su propio contador
  assert.equal(p1.tcb.pc, 3);
  assert.equal(kernel.planificador.pcCPU, 1);
  kernel.tick(3); // P2 completa su quantum (3 ticks en total) y regresa P1
  assert.equal(p1.tcb.pc, 4);
  assert.equal(kernel.planificador.pcCPU, 4);
});

test('con la cola vacía no hay cambio de contexto al agotar el quantum', function () {
  const kernel = new Kernel();
  const p1 = kernel.crearProceso('10', '7');
  kernel.ejecutarHastaTerminar();
  assert.equal(p1.fin, 7);
  assert.equal(kernel.metricas().cambiosContexto, 0);
});

test('Out of Memory no consume el PID y queda en la bitácora', function () {
  const kernel = new Kernel();
  kernel.crearProceso('60', '5');
  kernel.crearProceso('30', '5');
  assert.throws(function () { kernel.crearProceso('20', '5'); }, /^Error: Out of Memory: P3 requiere 20 MB; hueco contiguo mayor 10 MB; libre total 10 MB$/);
  assert.equal(kernel.procesos.length, 2);
  assert.equal(kernel.eventos[kernel.eventos.length - 1].tipo, 'error');
  assert.equal(kernel.crearProceso('10', '5').pid, 3);
});

test('fragmentación externa usando kill', function () {
  const kernel = new Kernel();
  kernel.crearProceso('30', '5');
  kernel.crearProceso('30', '5');
  kernel.crearProceso('30', '5');
  kernel.kill(1);
  kernel.kill(3);
  assert.equal(kernel.memoria.libreTotal(), 70);
  assert.equal(kernel.memoria.huecoMayor(), 40);
  assert.throws(function () { kernel.crearProceso('50', '5'); }, /Out of Memory/);
  assert.equal(kernel.crearProceso('40', '5').inicioMemoria, 60);
  assert.equal(kernel.crearProceso('30', '5').inicioMemoria, 0);
});

test('terminar un proceso libera su memoria', function () {
  const kernel = new Kernel();
  kernel.crearProceso('60', '2');
  kernel.crearProceso('40', '2');
  kernel.ejecutarHastaTerminar();
  assert.deepEqual(kernel.memoria.bloques, [{ inicio: 0, tamano: 100, pid: null }]);
});

test('kill saca el proceso de la CPU y no cuenta en los promedios', function () {
  const kernel = new Kernel();
  const p1 = kernel.crearProceso('10', '5');
  const p2 = kernel.crearProceso('10', '2');
  kernel.tick(1);
  kernel.kill(1);
  assert.equal(p1.estado, 'TERMINADO');
  assert.equal(p1.abortado, true);
  assert.equal(p1.fin, 1);
  assert.equal(kernel.planificador.enEjecucion, null);
  kernel.ejecutarHastaTerminar();
  assert.equal(p2.fin, 3);
  assert.equal(kernel.metricas().retornoPromedio, 3);
  assert.throws(function () { kernel.kill(1); }, /ya terminó/);
  assert.throws(function () { kernel.kill(99); }, /No existe/);
});

test('run se detiene en el límite y se puede repetir', function () {
  const kernel = new Kernel();
  for (let i = 0; i < 6; i++) {
    kernel.crearProceso('10', '100');
  }
  const primero = kernel.ejecutarHastaTerminar();
  assert.equal(primero.ticks, 500);
  assert.equal(primero.limiteAlcanzado, true);
  const segundo = kernel.ejecutarHastaTerminar();
  assert.equal(segundo.ticks, 100);
  assert.equal(segundo.limiteAlcanzado, false);
});

test('reset vuelve al estado inicial', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '5');
  kernel.tick(2);
  kernel.reset();
  assert.equal(kernel.reloj, 0);
  assert.equal(kernel.procesos.length, 0);
  assert.equal(kernel.memoria.libreTotal(), 100);
  assert.equal(kernel.crearProceso('10', '5').pid, 1);
});
