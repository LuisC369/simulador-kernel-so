// Intérprete de comandos compartido por la consola y la interfaz web.
//
// Convierte una línea de texto en una acción del kernel y devuelve líneas de texto
// como resultado. Al existir un solo intérprete, un comando se comporta igual en
// las dos interfaces. Aquí se atrapa todo Error del kernel, por lo que ninguna
// entrada puede tumbar el programa.

import { ESTADOS, retorno, respuesta, espera } from './pcb.js';
import { validarEntero } from './kernel.js';

const PID_MAXIMO = 999999;

const AYUDA = [
  ['ayuda', 'muestra esta lista de comandos'],
  ['crear <MB> <rafaga>', 'crea un proceso (MB y ráfaga de 1 a 100)'],
  ['ejemplo', 'reinicia y carga la Tarea 12, Ejercicio 1'],
  ['ps', 'muestra la tabla de procesos (PCB) y las métricas'],
  ['mem', 'muestra el mapa de la memoria RAM'],
  ['tick [n]', 'avanza n unidades de tiempo (1 a 100; por defecto 1)'],
  ['run', 'ejecuta hasta que no queden procesos ejecutables'],
  ['gantt', 'muestra el diagrama de Gantt en texto'],
  ['kill <pid>', 'aborta un proceso'],
  ['reset', 'reinicia el simulador'],
];

// Único punto de entrada. Se usa un switch porque es fácil de leer y porque, a
// diferencia de buscar en un objeto, "constructor" no se confunde con un comando.
export function ejecutarComando(kernel, linea) {
  const partes = String(linea).trim().split(/\s+/);
  const comando = partes[0].toLowerCase();
  const args = partes.slice(1);
  if (comando === '') {
    return [];
  }
  try {
    switch (comando) {
      case 'ayuda':
        exigirArgumentos(args, 0, 0, 'ayuda');
        return comandoAyuda();
      case 'crear':
        exigirArgumentos(args, 2, 2, 'crear <MB> <rafaga>');
        return comandoCrear(kernel, args);
      case 'ejemplo':
        exigirArgumentos(args, 0, 0, 'ejemplo');
        return comandoEjemplo(kernel);
      case 'ps':
        exigirArgumentos(args, 0, 0, 'ps');
        return comandoPs(kernel);
      case 'mem':
        exigirArgumentos(args, 0, 0, 'mem');
        return comandoMem(kernel);
      case 'tick':
        exigirArgumentos(args, 0, 1, 'tick [n]');
        return comandoTick(kernel, args);
      case 'run':
        exigirArgumentos(args, 0, 0, 'run');
        return comandoRun(kernel);
      case 'gantt':
        exigirArgumentos(args, 0, 0, 'gantt');
        return [textoGantt(kernel.historial)];
      case 'kill':
        exigirArgumentos(args, 1, 1, 'kill <pid>');
        return comandoKill(kernel, args);
      case 'reset':
        exigirArgumentos(args, 0, 0, 'reset');
        kernel.reset();
        return ['Simulador reiniciado.'];
      default:
        return ['ERROR: comando desconocido "' + partes[0] + '". Escriba ayuda para ver los comandos.'];
    }
  } catch (error) {
    return ['ERROR: ' + error.message];
  }
}

function exigirArgumentos(args, minimo, maximo, uso) {
  if (args.length < minimo || args.length > maximo) {
    throw new Error('cantidad de argumentos incorrecta. Uso: ' + uso);
  }
}

// Acepta el pid como 3 o como P3.
function leerPid(texto) {
  let limpio = texto;
  if (limpio[0] === 'p' || limpio[0] === 'P') {
    limpio = limpio.slice(1);
  }
  return validarEntero(limpio, 'pid', 1, PID_MAXIMO);
}

function comandoAyuda() {
  const lineas = ['Comandos disponibles:'];
  for (let i = 0; i < AYUDA.length; i++) {
    lineas.push('  ' + AYUDA[i][0].padEnd(24) + AYUDA[i][1]);
  }
  return lineas;
}

function comandoCrear(kernel, args) {
  const pcb = kernel.crearProceso(args[0], args[1]);
  return ['P' + pcb.pid + ' creado: ' + pcb.memoria + ' MB en la dirección ' + pcb.inicioMemoria + ', ráfaga ' + pcb.rafagaTotal + ', estado ' + pcb.estado];
}

function comandoEjemplo(kernel) {
  kernel.reset();
  kernel.crearProceso('20', '8');
  kernel.crearProceso('30', '4');
  kernel.crearProceso('10', '2');
  return ['Ejemplo cargado (Tarea 12, Ejercicio 1): P1 (20 MB, ráfaga 8), P2 (30 MB, ráfaga 4), P3 (10 MB, ráfaga 2).'];
}

function comandoTick(kernel, args) {
  const n = args.length === 0 ? 1 : validarEntero(args[0], 'n', 1, 100);
  const desde = kernel.eventos.length;
  kernel.tick(n);
  const lineas = textoEventos(kernel, desde);
  lineas.push(textoCPU(kernel));
  return lineas;
}

function comandoRun(kernel) {
  const desde = kernel.eventos.length;
  const resultado = kernel.ejecutarHastaTerminar();
  const lineas = textoEventos(kernel, desde);
  lineas.push('Se ejecutaron ' + resultado.ticks + ' ticks.');
  lineas.push(textoCPU(kernel));
  return lineas;
}

function comandoKill(kernel, args) {
  const desde = kernel.eventos.length;
  kernel.kill(leerPid(args[0]));
  return textoEventos(kernel, desde);
}

// Los eventos nuevos son los que se agregaron a la bitácora desde la posición "desde".
function textoEventos(kernel, desde) {
  const lineas = [];
  for (let i = desde; i < kernel.eventos.length; i++) {
    lineas.push('t=' + kernel.eventos[i].t + '  ' + kernel.eventos[i].texto);
  }
  return lineas;
}

function textoCPU(kernel) {
  const enCPU = kernel.planificador.enEjecucion;
  const cola = [];
  for (let i = 0; i < kernel.planificador.cola.length; i++) {
    cola.push('P' + kernel.planificador.cola[i].pid);
  }
  return 'Reloj: t = ' + kernel.reloj + ' | CPU: ' + (enCPU === null ? 'libre' : 'P' + enCPU.pid) + ' | Cola de listos: [' + cola.join(', ') + ']';
}

function valorOGuion(valor) {
  return valor === null ? '-' : String(valor);
}

function comandoPs(kernel) {
  const filas = [['PID', 'ESTADO', 'MB', 'DIR', 'RAFAGA', 'RESTA', 'PC', 'LLEGADA', 'FIN', 'RETORNO', 'ESPERA', 'RESPUESTA']];
  for (let i = 0; i < kernel.procesos.length; i++) {
    const p = kernel.procesos[i];
    filas.push([
      'P' + p.pid,
      p.abortado ? 'ABORTADO' : p.estado,
      String(p.memoria),
      String(p.inicioMemoria),
      String(p.rafagaTotal),
      String(p.rafagaRestante),
      String(p.tcb.pc),
      String(p.llegada),
      valorOGuion(p.fin),
      valorOGuion(retorno(p)),
      String(espera(p)),
      valorOGuion(respuesta(p)),
    ]);
  }
  const lineas = textoTabla(filas);
  const m = kernel.metricas();
  lineas.push('');
  lineas.push('Utilización CPU: ' + m.utilizacion.toFixed(2) + '% | Productividad: ' + m.productividad.toFixed(2) + ' procesos/tick | Cambios de contexto: ' + m.cambiosContexto);
  lineas.push('Promedios: espera ' + m.esperaPromedio.toFixed(2) + ' | retorno ' + m.retornoPromedio.toFixed(2) + ' | respuesta ' + m.respuestaPromedio.toFixed(2));
  return lineas;
}

// Alinea las columnas con padEnd usando el ancho del texto más largo de cada una.
function textoTabla(filas) {
  const anchos = [];
  for (let c = 0; c < filas[0].length; c++) {
    let ancho = 0;
    for (let f = 0; f < filas.length; f++) {
      if (filas[f][c].length > ancho) {
        ancho = filas[f][c].length;
      }
    }
    anchos.push(ancho);
  }
  const lineas = [];
  for (let f = 0; f < filas.length; f++) {
    let texto = '';
    for (let c = 0; c < filas[f].length; c++) {
      texto = texto + filas[f][c].padEnd(anchos[c] + 2);
    }
    lineas.push(texto.trimEnd());
  }
  return lineas;
}

// Devuelve el pid dueño de una dirección, o null si está libre.
function duenioDe(memoria, direccion) {
  for (let i = 0; i < memoria.bloques.length; i++) {
    const b = memoria.bloques[i];
    if (direccion >= b.inicio && direccion < b.inicio + b.tamano) {
      return b.pid;
    }
  }
  return null;
}

// Barra de 50 caracteres: cada uno representa 2 MB. Un carácter se marca ocupado si
// cualquiera de sus 2 MB lo está, para que un proceso de 1 MB no desaparezca. Solo
// cabe un dígito por carácter, así que un pid como 12 se dibuja con su último dígito;
// la lista de bloques siempre muestra el pid completo.
function comandoMem(kernel) {
  const memoria = kernel.memoria;
  let barra = '';
  for (let i = 0; i < 50; i++) {
    let duenio = duenioDe(memoria, i * 2);
    if (duenio === null) {
      duenio = duenioDe(memoria, i * 2 + 1);
    }
    barra = barra + (duenio === null ? '.' : String(duenio % 10));
  }
  // La escala se alinea con la barra: el 0 y el 50 quedan sobre sus direcciones.
  const lineas = ['[' + barra + ']', ' 0' + ' '.repeat(24) + '50' + ' '.repeat(21) + '100'];
  for (let i = 0; i < memoria.bloques.length; i++) {
    const b = memoria.bloques[i];
    const rango = b.inicio + '-' + (b.inicio + b.tamano);
    lineas.push('  ' + rango.padEnd(8) + (b.pid === null ? 'libre' : 'P' + b.pid).padEnd(9) + b.tamano + ' MB');
  }
  lineas.push('Usada: ' + memoria.usada() + ' MB | Libre: ' + memoria.libreTotal() + ' MB | Hueco mayor: ' + memoria.huecoMayor() + ' MB');
  return lineas;
}

// Une los ticks seguidos del mismo proceso en un solo segmento: P1[0-3] P2[3-6].
function textoGantt(historial) {
  if (historial.length === 0) {
    return 'Todavía no hay historial de ejecución.';
  }
  const segmentos = [];
  let inicio = 0;
  for (let t = 1; t <= historial.length; t++) {
    if (t === historial.length || historial[t] !== historial[inicio]) {
      const nombre = historial[inicio] === null ? 'ocioso' : 'P' + historial[inicio];
      segmentos.push(nombre + '[' + inicio + '-' + t + ']');
      inicio = t;
    }
  }
  return segmentos.join(' ');
}
