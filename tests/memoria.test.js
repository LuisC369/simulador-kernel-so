// Pruebas de la gestión de memoria: primer ajuste, Out of Memory,
// fragmentación externa y fusión de huecos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memoria } from '../src/memoria.js';

test('la RAM inicia como un solo hueco de 100 MB', function () {
  const memoria = new Memoria();
  assert.deepEqual(memoria.bloques, [{ inicio: 0, tamano: 100, pid: null }]);
  assert.equal(memoria.libreTotal(), 100);
  assert.equal(memoria.usada(), 0);
  assert.equal(memoria.huecoMayor(), 100);
});

test('60 MB y 30 MB entran; 20 MB no entra porque quedan 10 libres', function () {
  const memoria = new Memoria();
  assert.equal(memoria.asignar(1, 60), 0);
  assert.equal(memoria.asignar(2, 30), 60);
  assert.equal(memoria.asignar(3, 20), null);
  assert.equal(memoria.libreTotal(), 10);
  assert.equal(memoria.usada(), 90);
});

test('un rechazo no altera los bloques', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 95);
  const antes = structuredClone(memoria.bloques);
  assert.equal(memoria.asignar(2, 6), null);
  assert.deepEqual(memoria.bloques, antes);
});

test('fragmentación externa: 70 MB libres no alcanzan para 50 MB', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 30);
  memoria.asignar(2, 30);
  memoria.asignar(3, 30);
  memoria.liberar(1);
  memoria.liberar(3);

  assert.equal(memoria.libreTotal(), 70);
  assert.equal(memoria.huecoMayor(), 40);
  assert.equal(memoria.asignar(4, 50), null);
  // El hueco de 30 en la dirección 0 no alcanza, así que usa el de la dirección 60.
  assert.equal(memoria.asignar(5, 40), 60);
  assert.equal(memoria.asignar(6, 30), 0);
  assert.equal(memoria.libreTotal(), 0);
});

test('primer ajuste toma el primer hueco que alcanza, no el más justo', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 40);
  memoria.asignar(2, 10);
  memoria.asignar(3, 20);
  memoria.liberar(1); // hueco de 40 en la dirección 0; otro de 30 en la dirección 70
  assert.equal(memoria.asignar(4, 25), 0);
});

test('un hueco de tamaño exacto no deja un bloque vacío', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 100);
  assert.deepEqual(memoria.bloques, [{ inicio: 0, tamano: 100, pid: 1 }]);
});

test('fusión sin vecinos libres: el hueco queda solo', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 40);
  memoria.asignar(2, 30);
  memoria.asignar(3, 30);
  memoria.liberar(2);
  assert.equal(memoria.bloques.length, 3);
  assert.deepEqual(memoria.bloques[1], { inicio: 40, tamano: 30, pid: null });
});

test('fusión con el vecino anterior', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 40);
  memoria.asignar(2, 30);
  memoria.asignar(3, 30);
  memoria.liberar(1);
  memoria.liberar(2);
  assert.equal(memoria.bloques.length, 2);
  assert.deepEqual(memoria.bloques[0], { inicio: 0, tamano: 70, pid: null });
});

test('fusión con el vecino siguiente', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 40);
  memoria.asignar(2, 30);
  memoria.asignar(3, 30);
  memoria.liberar(2);
  memoria.liberar(1);
  assert.equal(memoria.bloques.length, 2);
  assert.deepEqual(memoria.bloques[0], { inicio: 0, tamano: 70, pid: null });
});

test('fusión con ambos vecinos', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 20);
  memoria.asignar(2, 20);
  memoria.asignar(3, 20);
  memoria.asignar(4, 40);
  memoria.liberar(1);
  memoria.liberar(3);
  memoria.liberar(2);
  assert.equal(memoria.bloques.length, 2);
  assert.deepEqual(memoria.bloques[0], { inicio: 0, tamano: 60, pid: null });
});

test('liberar todo deja un solo bloque libre de 100 MB', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 30);
  memoria.asignar(2, 30);
  memoria.asignar(3, 30);
  memoria.liberar(2);
  memoria.liberar(1);
  memoria.liberar(3);
  assert.deepEqual(memoria.bloques, [{ inicio: 0, tamano: 100, pid: null }]);
});

test('liberar un pid sin memoria no cambia nada', function () {
  const memoria = new Memoria();
  memoria.asignar(1, 30);
  const antes = structuredClone(memoria.bloques);
  assert.equal(memoria.liberar(99), false);
  assert.deepEqual(memoria.bloques, antes);
});
