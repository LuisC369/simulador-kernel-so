// Pruebas de los recursos R1 y R2, la detección de deadlock y la recuperación con kill.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kernel } from '../src/kernel.js';
import { GestorRecursos } from '../src/recursos.js';
import { ejecutarComando } from '../src/comandos.js';

function kernelConProcesos(cantidad) {
  const kernel = new Kernel();
  for (let i = 0; i < cantidad; i++) {
    kernel.crearProceso('10', '5');
  }
  return kernel;
}

function textos(kernel) {
  const lista = [];
  for (let i = 0; i < kernel.eventos.length; i++) {
    lista.push(kernel.eventos[i].texto);
  }
  return lista;
}

test('forzarDeadlock detecta un ciclo que contiene a ambos procesos', function () {
  const kernel = new Kernel();
  const ruta = kernel.forzarDeadlock();
  assert.deepEqual(ruta, ['P1', 'R2', 'P2', 'R1', 'P1']);
  assert.deepEqual(kernel.deadlock, ruta);
  assert.equal(kernel.procesos[0].estado, 'BLOQUEADO');
  assert.equal(kernel.procesos[1].estado, 'BLOQUEADO');
  assert.equal(kernel.procesos[0].esperandoRecurso, 'R2');
  assert.equal(kernel.procesos[1].esperandoRecurso, 'R1');
  assert.ok(textos(kernel).includes('DEADLOCK detectado: P1 -> R2 -> P2 -> R1 -> P1'));
});

test('los procesos en deadlock no avanzan y run reporta los bloqueados', function () {
  const kernel = new Kernel();
  kernel.forzarDeadlock();
  kernel.tick(3);
  assert.deepEqual(kernel.historial, [null, null, null]);
  assert.equal(kernel.procesos[0].rafagaRestante, 5);
  const resultado = kernel.ejecutarHastaTerminar();
  assert.equal(resultado.ticks, 0);
  assert.equal(resultado.bloqueados, 2);
  assert.ok(textos(kernel).includes('Quedan 2 procesos bloqueados'));
});

test('kill rompe el ciclo: el otro recibe el recurso y todo termina', function () {
  const kernel = new Kernel();
  kernel.forzarDeadlock();
  kernel.kill(2);
  const otro = kernel.procesos[0];
  assert.equal(kernel.recursos.recursos.R2.duenio, 1);
  assert.equal(otro.estado, 'LISTO');
  assert.equal(otro.esperandoRecurso, null);
  assert.equal(kernel.recursos.detectarCiclo(), null);
  assert.equal(kernel.deadlock, null);
  assert.ok(textos(kernel).includes('Deadlock resuelto'));

  const resultado = kernel.ejecutarHastaTerminar();
  assert.equal(resultado.bloqueados, 0);
  assert.equal(otro.estado, 'TERMINADO');
  assert.equal(otro.abortado, false);
  assert.equal(kernel.recursos.recursos.R1.duenio, null);
  assert.equal(kernel.recursos.recursos.R2.duenio, null);
  assert.equal(kernel.memoria.libreTotal(), 100);
});

test('una espera sin ciclo no es deadlock', function () {
  const kernel = kernelConProcesos(2);
  kernel.solicitar(1, 'R1');
  assert.equal(kernel.solicitar(2, 'R1'), false);
  assert.equal(kernel.recursos.detectarCiclo(), null);
  assert.equal(kernel.deadlock, null);
});

test('un proceso que termina entrega su recurso al primero de la cola', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '1');
  kernel.crearProceso('10', '1');
  kernel.crearProceso('10', '1');
  kernel.solicitar(1, 'R1');
  kernel.solicitar(2, 'R1');
  kernel.solicitar(3, 'R1');
  kernel.tick(1);
  assert.equal(kernel.recursos.recursos.R1.duenio, 2);
  assert.deepEqual(kernel.recursos.recursos.R1.cola, [3]);
  kernel.ejecutarHastaTerminar();
  assert.equal(kernel.recursos.recursos.R1.duenio, null);
  assert.equal(kernel.procesos[2].estado, 'TERMINADO');
});

test('kill de un dueño de los dos recursos despierta a cada proceso en espera', function () {
  const kernel = kernelConProcesos(3);
  kernel.solicitar(1, 'R1');
  kernel.solicitar(1, 'R2');
  kernel.solicitar(2, 'R1');
  kernel.solicitar(3, 'R2');
  kernel.kill(1);
  assert.equal(kernel.recursos.recursos.R1.duenio, 2);
  assert.equal(kernel.recursos.recursos.R2.duenio, 3);
  assert.equal(kernel.procesos[1].estado, 'LISTO');
  assert.equal(kernel.procesos[2].estado, 'LISTO');
});

test('abortar a un proceso ajeno al ciclo no resuelve el deadlock', function () {
  const kernel = kernelConProcesos(3);
  kernel.solicitar(1, 'R1');
  kernel.solicitar(2, 'R2');
  kernel.solicitar(3, 'R1'); // P3 espera, pero nadie lo espera a él
  kernel.solicitar(1, 'R2');
  kernel.solicitar(2, 'R1');
  assert.deepEqual(kernel.deadlock, ['P1', 'R2', 'P2', 'R1', 'P1']);
  kernel.kill(3);
  assert.deepEqual(kernel.deadlock, ['P1', 'R2', 'P2', 'R1', 'P1']);
  assert.ok(!textos(kernel).includes('Deadlock resuelto'));
});

test('una cadena que llega a un ciclo sin ser parte de él no se queda dando vueltas', function () {
  const gestor = new GestorRecursos();
  gestor.solicitar(2, 'R1');
  gestor.solicitar(3, 'R2');
  gestor.solicitar(1, 'R1'); // P1 espera a P2, pero nadie espera a P1
  gestor.solicitar(2, 'R2');
  gestor.solicitar(3, 'R1');
  assert.deepEqual(gestor.detectarCiclo(), ['P2', 'R2', 'P3', 'R1', 'P2']);
});

test('el kill de quien está en el semáforo y en un recurso libera ambos', function () {
  const kernel = kernelConProcesos(3);
  kernel.wait(1);
  kernel.wait(2);
  kernel.solicitar(1, 'R1');
  kernel.solicitar(3, 'R1');
  kernel.kill(1);
  assert.equal(kernel.semaforo.dentro, 2);
  assert.equal(kernel.recursos.recursos.R1.duenio, 3);
});

test('un proceso dentro de la sección y bloqueado no puede hacer signal', function () {
  const kernel = kernelConProcesos(2);
  kernel.solicitar(2, 'R1');
  kernel.wait(1);
  kernel.solicitar(1, 'R1');
  assert.throws(function () { kernel.signal(1); }, /bloqueado/);
  assert.equal(kernel.semaforo.dentro, 1);
});

test('deadlock con R1 o R2 ocupados da error y no crea procesos', function () {
  const kernel = kernelConProcesos(1);
  kernel.solicitar(1, 'R2');
  assert.throws(function () { kernel.forzarDeadlock(); }, /deben estar libres/);
  assert.equal(kernel.procesos.length, 1);
});

test('deadlock sin memoria para dos procesos no deja uno a medias', function () {
  const kernel = new Kernel();
  kernel.crearProceso('85', '5');
  assert.throws(function () { kernel.forzarDeadlock(); }, /^Error: Out of Memory/);
  assert.equal(kernel.procesos.length, 1);
  assert.equal(kernel.memoria.libreTotal(), 15);
  assert.equal(kernel.recursos.recursos.R1.duenio, null);
});

test('deadlock usa huecos separados si los dos procesos caben', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '5');
  kernel.crearProceso('70', '5');
  kernel.kill(1); // huecos de 10 MB en la dirección 0 y de 20 MB en la dirección 80
  kernel.forzarDeadlock();
  assert.equal(kernel.procesos[2].inicioMemoria, 0);
  assert.equal(kernel.procesos[3].inicioMemoria, 80);
});

test('solicitar inválido: recurso, repetido, bloqueado, inexistente o terminado', function () {
  const kernel = kernelConProcesos(2);
  kernel.solicitar(1, 'R1');
  kernel.solicitar(2, 'R1');
  assert.throws(function () { kernel.solicitar(1, 'R3'); }, /Recurso inválido/);
  assert.throws(function () { kernel.solicitar(1, '__proto__'); }, /Recurso inválido/);
  assert.throws(function () { kernel.solicitar(1, 'R1'); }, /ya tiene/);
  assert.throws(function () { kernel.solicitar(2, 'R2'); }, /bloqueado/);
  assert.throws(function () { kernel.solicitar(99, 'R1'); }, /No existe/);
  kernel.kill(2);
  assert.throws(function () { kernel.solicitar(2, 'R2'); }, /ya terminó/);
  assert.deepEqual(kernel.recursos.recursos.R1.cola, []);
});

test('comandos de deadlock: salida de texto y errores', function () {
  const kernel = new Kernel();
  const salida = ejecutarComando(kernel, 'DEADLOCK');
  assert.ok(salida.includes('t=0  DEADLOCK detectado: P1 -> R2 -> P2 -> R1 -> P1'));
  assert.match(ejecutarComando(kernel, 'deadlock')[0], /^ERROR: R1 y R2 deben estar libres/);
  assert.match(ejecutarComando(kernel, 'solicitar')[0], /^ERROR: cantidad/);
  assert.match(ejecutarComando(kernel, 'solicitar 1')[0], /^ERROR: cantidad/);
  assert.match(ejecutarComando(kernel, 'solicitar abc R1')[0], /^ERROR: Valor inválido/);
  assert.match(ejecutarComando(kernel, 'deadlock ya')[0], /^ERROR: cantidad/);

  const resuelto = ejecutarComando(kernel, 'kill p2');
  assert.ok(resuelto.includes('t=0  Deadlock resuelto'));
  ejecutarComando(kernel, 'crear 10 5');
  assert.match(ejecutarComando(kernel, 'solicitar p3 r2')[0], /P3 se bloquea: espera R2/);
});

test('reset deja los recursos libres y sin deadlock', function () {
  const kernel = new Kernel();
  kernel.forzarDeadlock();
  kernel.reset();
  assert.equal(kernel.deadlock, null);
  assert.equal(kernel.recursos.recursos.R1.duenio, null);
  assert.deepEqual(kernel.recursos.recursos.R2.cola, []);
});
