// Interfaz de línea de comandos del simulador.
//
// Sin argumentos abre una consola interactiva. Con archivos como argumento ejecuta
// sus líneas como comandos e imprime todo, lo que genera los volcados de texto de
// la bitácora. Toda la lógica está en src/comandos.js y src/kernel.js.

import fs from 'node:fs';
import readline from 'node:readline';
import { Kernel } from './src/kernel.js';
import { ejecutarComando } from './src/comandos.js';

function imprimir(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    console.log(lineas[i]);
  }
}

// Ejecuta un guion. Si un archivo no se puede leer, lo informa y sigue con el resto.
function ejecutarArchivo(kernel, ruta) {
  let contenido;
  try {
    contenido = fs.readFileSync(ruta, 'utf8');
  } catch (error) {
    console.log('ERROR: no se pudo leer el archivo ' + ruta);
    process.exitCode = 1;
    return;
  }
  // Algunos editores agregan una marca invisible (BOM) al inicio del archivo.
  const lineas = contenido.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (linea.startsWith('#')) {
      console.log(linea);
    } else if (linea !== '') {
      console.log('kernel> ' + linea);
      imprimir(ejecutarComando(kernel, linea));
    }
  }
}

function consolaInteractiva(kernel) {
  console.log('=== Simulador de Funciones del Kernel ===');
  console.log('Sistemas Operativos I, UMG');
  console.log('');
  imprimir(ejecutarComando(kernel, 'ayuda'));
  console.log('  ' + 'salir'.padEnd(24) + 'termina el programa');
  console.log('');

  const consola = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'kernel> ',
  });
  consola.prompt();
  consola.on('line', function (linea) {
    // Se termina el programa de una vez: close() por sí solo dejaría que se
    // procesen las líneas que ya estaban en espera después de "salir".
    if (linea.trim().toLowerCase() === 'salir') {
      process.exit(0);
    }
    imprimir(ejecutarComando(kernel, linea));
    consola.prompt();
  });
}

const kernel = new Kernel();
const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  consolaInteractiva(kernel);
} else {
  for (let i = 0; i < archivos.length; i++) {
    ejecutarArchivo(kernel, archivos[i]);
  }
}
