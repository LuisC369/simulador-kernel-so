// Pruebas de las validaciones de entrada, pensadas para la prueba de estrés en vivo.
// Cada entrada inválida debe producir un error claro y dejar el simulador intacto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Kernel, validarEntero } from '../src/kernel.js';
import { ejecutarComando } from '../src/comandos.js';

const NUMEROS_INVALIDOS = ['abc', '-5', '0', '1.5', '1e3', '101', '0x10', '+5', '5,5', '5.0', 'NaN', 'Infinity', '99999999999999999999'];

// Foto de todo el estado que un comando podría alterar, incluida la bitácora.
function foto(kernel) {
  return JSON.stringify({
    reloj: kernel.reloj,
    siguientePid: kernel.siguientePid,
    procesos: kernel.procesos,
    bloques: kernel.memoria.bloques,
    cola: kernel.planificador.cola,
    enEjecucion: kernel.planificador.enEjecucion,
    semaforo: kernel.semaforo,
    recursos: kernel.recursos.recursos,
    deadlock: kernel.deadlock,
    historial: kernel.historial,
    eventos: kernel.eventos,
  });
}

// P1 está en CPU y dentro de la sección crítica, y retiene R1. P2 espera el semáforo.
// P3 está listo. P4 ya terminó por kill.
function escenario() {
  const kernel = new Kernel();
  for (let i = 0; i < 4; i++) {
    kernel.crearProceso('10', '20');
  }
  kernel.tick(1);
  kernel.wait(1);
  kernel.wait(2);
  kernel.solicitar(1, 'R1');
  kernel.kill(4);
  return kernel;
}

function comprobarRechazo(kernel, comando) {
  const antes = foto(kernel);
  const salida = ejecutarComando(kernel, comando);
  assert.equal(salida.length, 1, 'una sola línea para: ' + comando);
  assert.match(salida[0], /^ERROR: /, 'debe ser error: ' + comando);
  assert.equal(foto(kernel), antes, 'el estado cambió con: ' + comando);
}

test('validarEntero acepta los límites y limpia espacios', function () {
  assert.equal(validarEntero('1', 'x', 1, 100), 1);
  assert.equal(validarEntero('100', 'x', 1, 100), 100);
  assert.equal(validarEntero('  7  ', 'x', 1, 100), 7);
  assert.equal(validarEntero('007', 'x', 1, 100), 7);
});

test('validarEntero rechaza vacío y valores que no son enteros en rango', function () {
  const entradas = NUMEROS_INVALIDOS.concat(['', '   ', undefined, null]);
  for (let i = 0; i < entradas.length; i++) {
    assert.throws(function () { validarEntero(entradas[i], 'x', 1, 100); }, Error, String(entradas[i]));
  }
});

test('crearProceso rechaza memoria y ráfaga inválidas sin alterar el estado', function () {
  const kernel = escenario();
  const entradas = NUMEROS_INVALIDOS.concat(['', '   ', undefined, null]);
  const antes = foto(kernel);
  for (let i = 0; i < entradas.length; i++) {
    assert.throws(function () { kernel.crearProceso(entradas[i], '5'); }, Error, 'memoria ' + entradas[i]);
    assert.throws(function () { kernel.crearProceso('5', entradas[i]); }, Error, 'ráfaga ' + entradas[i]);
  }
  assert.equal(foto(kernel), antes);
});

test('los límites válidos sí se aceptan', function () {
  const kernel = new Kernel();
  assert.equal(kernel.crearProceso('1', '100').memoria, 1);
  assert.equal(kernel.crearProceso('99', '1').memoria, 99);
});

test('crear por comando rechaza números inválidos y argumentos de más o de menos', function () {
  const kernel = escenario();
  for (let i = 0; i < NUMEROS_INVALIDOS.length; i++) {
    comprobarRechazo(kernel, 'crear ' + NUMEROS_INVALIDOS[i] + ' 5');
    comprobarRechazo(kernel, 'crear 5 ' + NUMEROS_INVALIDOS[i]);
  }
  comprobarRechazo(kernel, 'crear');
  comprobarRechazo(kernel, 'crear 5');
  comprobarRechazo(kernel, 'crear 5 5 5');
});

test('Out of Memory no altera nada, salvo el evento en la bitácora', function () {
  const kernel = new Kernel();
  kernel.crearProceso('95', '5');
  const procesos = kernel.procesos.length;
  const bloques = JSON.stringify(kernel.memoria.bloques);
  const salida = ejecutarComando(kernel, 'crear 6 5');
  assert.match(salida[0], /^ERROR: Out of Memory: P2 requiere 6 MB/);
  assert.equal(kernel.procesos.length, procesos);
  assert.equal(JSON.stringify(kernel.memoria.bloques), bloques);
  assert.equal(kernel.siguientePid, 2);
});

test('tick rechaza valores fuera de 1 a 100', function () {
  const kernel = escenario();
  const invalidos = ['0', '101', '-1', 'abc', '1.5', '1e3', '1 2'];
  for (let i = 0; i < invalidos.length; i++) {
    comprobarRechazo(kernel, 'tick ' + invalidos[i]);
  }
});

test('un pid inexistente o mal escrito da error en todos los comandos', function () {
  const kernel = escenario();
  const pids = ['99', 'P99', '0', 'abc', '-1', '1.5', 'p', 'PP1', '1e3', '99999999'];
  for (let i = 0; i < pids.length; i++) {
    comprobarRechazo(kernel, 'wait ' + pids[i]);
    comprobarRechazo(kernel, 'signal ' + pids[i]);
    comprobarRechazo(kernel, 'kill ' + pids[i]);
    comprobarRechazo(kernel, 'solicitar ' + pids[i] + ' R1');
  }
});

test('un proceso ya terminado da error en todos los comandos', function () {
  const kernel = escenario();
  comprobarRechazo(kernel, 'wait 4');
  comprobarRechazo(kernel, 'signal 4');
  comprobarRechazo(kernel, 'kill 4');
  comprobarRechazo(kernel, 'solicitar 4 R2');
});

test('wait rechaza a quien ya está dentro, en la cola o bloqueado', function () {
  const kernel = escenario();
  comprobarRechazo(kernel, 'wait 1');
  comprobarRechazo(kernel, 'wait 2');
});

test('signal rechaza a quien no está dentro de la sección crítica', function () {
  const kernel = escenario();
  comprobarRechazo(kernel, 'signal 2');
  comprobarRechazo(kernel, 'signal 3');
});

test('solicitar rechaza recursos inválidos, repetidos o procesos bloqueados', function () {
  const kernel = escenario();
  const recursos = ['R3', 'R0', 'abc', '1', '__proto__', 'constructor'];
  for (let i = 0; i < recursos.length; i++) {
    comprobarRechazo(kernel, 'solicitar 3 ' + recursos[i]);
  }
  comprobarRechazo(kernel, 'solicitar 1 R1'); // P1 ya lo tiene
  comprobarRechazo(kernel, 'solicitar 2 R2'); // P2 está bloqueado
});

test('deadlock se rechaza con R1 o R2 ocupados', function () {
  const kernel = escenario();
  comprobarRechazo(kernel, 'deadlock');
});

test('todos los comandos rechazan argumentos de más o de menos', function () {
  const kernel = escenario();
  const comandos = ['ayuda x', 'ejemplo x', 'ps x', 'mem x', 'tick 1 2', 'run x', 'gantt x', 'wait', 'wait 1 2',
    'signal', 'signal 1 2', 'sem x', 'carrera', 'carrera sin con', 'solicitar', 'solicitar 1', 'solicitar 1 R1 R2',
    'deadlock x', 'kill', 'kill 1 2', 'reset x'];
  for (let i = 0; i < comandos.length; i++) {
    comprobarRechazo(kernel, comandos[i]);
  }
});

test('los comandos desconocidos sugieren ayuda y no alteran el estado', function () {
  const kernel = escenario();
  const comandos = ['hola', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '<script>alert(1)</script>', 'ñandú', 'x'.repeat(5000)];
  for (let i = 0; i < comandos.length; i++) {
    comprobarRechazo(kernel, comandos[i]);
    assert.match(ejecutarComando(kernel, comandos[i])[0], /ayuda/);
  }
});

test('una línea vacía no hace nada; mayúsculas y espacios se aceptan', function () {
  const kernel = new Kernel();
  const antes = foto(kernel);
  assert.deepEqual(ejecutarComando(kernel, ''), []);
  assert.deepEqual(ejecutarComando(kernel, '   \t  '), []);
  assert.equal(foto(kernel), antes);
  assert.match(ejecutarComando(kernel, '  CREAR   10\t5  ')[0], /^P1 creado/);
  assert.match(ejecutarComando(kernel, 'KILL p1')[0], /P1 abortado/);
});

test('un valor que no es texto tampoco tumba el intérprete', function () {
  const kernel = new Kernel();
  const entradas = [undefined, null, 5, {}, []];
  for (let i = 0; i < entradas.length; i++) {
    assert.ok(Array.isArray(ejecutarComando(kernel, entradas[i])));
  }
});

test('un proceso que termina dentro de la sección libera el semáforo', function () {
  const kernel = new Kernel();
  kernel.crearProceso('10', '1');
  kernel.wait(1);
  kernel.tick(1);
  assert.equal(kernel.semaforo.valor, 1);
  assert.equal(kernel.semaforo.dentro, null);
});

test('la consola sobrevive a entradas inválidas y sigue funcionando', function () {
  const entrada = ['', 'hola', 'crear abc 5', 'crear 101 5', 'tick 0', 'kill 99', 'wait x', 'signal 1', 'solicitar 1 R9',
    '__proto__', 'crear 10 2', 'run', 'salir', 'ps'].join('\n') + '\n';
  const resultado = spawnSync(process.execPath, ['cli.js'], { input: entrada, encoding: 'utf8' });
  assert.equal(resultado.status, 0);
  assert.equal(resultado.stderr, '');
  assert.match(resultado.stdout, /P1 terminó y liberó 10 MB/);
  // Lo que viene después de salir no se ejecuta: ps mostraría la columna RESPUESTA.
  assert.doesNotMatch(resultado.stdout, /RESPUESTA/);
});

test('un archivo inexistente se informa sin un error interno de Node', function () {
  const resultado = spawnSync(process.execPath, ['cli.js', 'no-existe.txt'], { encoding: 'utf8' });
  assert.equal(resultado.status, 1);
  assert.equal(resultado.stderr, '');
  assert.match(resultado.stdout, /ERROR: no se pudo leer el archivo no-existe.txt/);
});
