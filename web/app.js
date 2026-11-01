// Interfaz web del simulador.
//
// Cada botón arma un comando de texto y llama ejecutarComando, el mismo camino que usa
// la consola. Después, render() redibuja todos los paneles leyendo el kernel. Aquí no
// se duplica el estado del simulador: solo se guarda lo propio de la pantalla, como el
// temporizador o el texto de la consola.
//
// Todo el texto se escribe con textContent, nunca con innerHTML, para que lo que
// escriba el usuario se muestre tal cual y nunca se interprete como código.

import { Kernel } from '../src/kernel.js';
import { ejecutarComando } from '../src/comandos.js';
import { retorno, respuesta, espera } from '../src/pcb.js';

const COLORES = ['#1d4ed8', '#0f766e', '#b45309', '#6d28d9', '#be185d', '#4d7c0f', '#0e7490', '#334155'];
const ROJO_ALERTA = '#c62828';
const GRIS_FLECHA = '#5b6675';
const MAXIMO_LINEAS_CONSOLA = 500;

const kernel = new Kernel();

// Estado propio de la pantalla.
let temporizador = null;
let lineasConsola = ['Escriba ayuda para ver los comandos.'];
let historialComandos = [];
let posicionHistorial = 0;

function porId(id) {
  return document.getElementById(id);
}

function colorDe(pid) {
  return COLORES[pid % COLORES.length];
}

function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) {
    elemento.className = clase;
  }
  if (texto !== undefined) {
    elemento.textContent = texto;
  }
  return elemento;
}

function crearBoton(texto, comando, panelError) {
  const boton = crear('button', '', texto);
  boton.type = 'button';
  boton.addEventListener('click', function () {
    ejecutar(comando, panelError);
  });
  return boton;
}

// Único camino hacia el kernel. Si el comando falla y se indicó un panel, el error
// también se muestra junto al control que lo provocó.
function ejecutar(comando, panelError) {
  const lineas = ejecutarComando(kernel, comando);
  agregarAConsola('kernel> ' + comando);
  for (let i = 0; i < lineas.length; i++) {
    agregarAConsola(lineas[i]);
  }
  limpiarErrores();
  if (panelError && lineas.length > 0 && lineas[0].startsWith('ERROR: ')) {
    porId(panelError).textContent = lineas[0].slice('ERROR: '.length);
  }
  render();
  return lineas;
}

function agregarAConsola(linea) {
  lineasConsola.push(linea);
  if (lineasConsola.length > MAXIMO_LINEAS_CONSOLA) {
    lineasConsola.shift();
  }
}

function limpiarErrores() {
  porId('error-crear').textContent = '';
  porId('error-tabla').textContent = '';
  porId('error-recursos').textContent = '';
}

// ---------- Ejecución automática ----------

function iniciarAuto() {
  if (temporizador === null && kernel.hayEjecutables()) {
    temporizador = setInterval(function () {
      ejecutar('tick');
    }, Number(porId('sel-velocidad').value));
  }
  renderControles();
}

function detenerAuto() {
  if (temporizador !== null) {
    clearInterval(temporizador);
    temporizador = null;
  }
  renderControles();
}

// ---------- Dibujo de los paneles ----------

function render() {
  // La ejecución automática se detiene sola cuando ya no queda nada ejecutable.
  if (temporizador !== null && !kernel.hayEjecutables()) {
    detenerAuto();
  }
  renderControles();
  renderMetricas();
  renderCPU();
  renderTabla();
  renderMemoria();
  renderGantt();
  renderSemaforo();
  renderRecursos();
  renderConsola();
  renderBitacora();
}

function renderControles() {
  porId('reloj').textContent = 't = ' + kernel.reloj;
  const auto = porId('btn-auto');
  auto.textContent = temporizador === null ? 'Ejecutar' : 'Pausar';
  auto.disabled = temporizador === null && !kernel.hayEjecutables();
}

function renderMetricas() {
  const m = kernel.metricas();
  const datos = [
    ['Utilización CPU', m.utilizacion.toFixed(2) + '%'],
    ['Productividad', m.productividad.toFixed(2)],
    ['Espera promedio', m.esperaPromedio.toFixed(2)],
    ['Retorno promedio', m.retornoPromedio.toFixed(2)],
    ['Respuesta promedio', m.respuestaPromedio.toFixed(2)],
    ['Cambios de contexto', String(m.cambiosContexto)],
  ];
  const contenedor = porId('metricas');
  contenedor.replaceChildren();
  for (let i = 0; i < datos.length; i++) {
    const grupo = crear('div');
    grupo.append(crear('dt', '', datos[i][0]), crear('dd', '', datos[i][1]));
    contenedor.append(grupo);
  }
}

function crearChip(pid) {
  const chip = crear('span', 'chip', 'P' + pid);
  chip.style.backgroundColor = colorDe(pid);
  return chip;
}

function renderChips(contenedor, pids, textoVacio, conFlechas) {
  contenedor.replaceChildren();
  if (pids.length === 0) {
    contenedor.append(crear('span', 'vacio', textoVacio));
    return;
  }
  for (let i = 0; i < pids.length; i++) {
    if (conFlechas && i > 0) {
      contenedor.append(crear('span', 'flecha', '→'));
    }
    contenedor.append(crearChip(pids[i]));
  }
}

function renderCPU() {
  const proceso = kernel.planificador.enEjecucion;
  const segmentos = porId('cpu-quantum');
  segmentos.replaceChildren();
  for (let i = 0; i < kernel.quantum; i++) {
    const lleno = proceso !== null && i < kernel.planificador.quantumUsado;
    segmentos.append(crear('div', lleno ? 'segmento segmento-lleno' : 'segmento'));
  }

  const barra = porId('cpu-barra');
  if (proceso === null) {
    porId('cpu-pid').textContent = 'Libre';
    porId('cpu-pid').style.color = '';
    porId('cpu-rafaga-texto').textContent = '-';
    porId('cpu-pc').textContent = '-';
    barra.style.width = '0';
  } else {
    porId('cpu-pid').textContent = 'P' + proceso.pid;
    porId('cpu-pid').style.color = colorDe(proceso.pid);
    porId('cpu-rafaga-texto').textContent = proceso.rafagaRestante + ' de ' + proceso.rafagaTotal;
    porId('cpu-pc').textContent = String(proceso.tcb.pc);
    barra.style.width = (proceso.rafagaRestante / proceso.rafagaTotal) * 100 + '%';
  }

  const cola = [];
  for (let i = 0; i < kernel.planificador.cola.length; i++) {
    cola.push(kernel.planificador.cola[i].pid);
  }
  renderChips(porId('cola-listos'), cola, 'Vacía', true);
}

function valorOGuion(valor) {
  return valor === null ? '-' : String(valor);
}

function renderTabla() {
  const cuerpo = porId('tabla-cuerpo');
  cuerpo.replaceChildren();
  for (let i = 0; i < kernel.procesos.length; i++) {
    const p = kernel.procesos[i];
    const fila = crear('tr');

    const celdaPid = crear('td');
    celdaPid.append(crearChip(p.pid));
    const estado = p.abortado ? 'ABORTADO' : p.estado;
    const celdaEstado = crear('td');
    celdaEstado.append(crear('span', 'insignia estado-' + estado, estado));
    fila.append(celdaPid, celdaEstado);

    const valores = [p.memoria, p.inicioMemoria, p.rafagaTotal, p.rafagaRestante, p.tcb.pc, p.llegada,
      valorOGuion(p.fin), valorOGuion(retorno(p)), espera(p), valorOGuion(respuesta(p))];
    for (let j = 0; j < valores.length; j++) {
      fila.append(crear('td', '', String(valores[j])));
    }

    const acciones = crear('div', 'acciones-fila');
    const nombres = ['wait', 'signal', 'kill'];
    for (let j = 0; j < nombres.length; j++) {
      const boton = crearBoton(nombres[j], nombres[j] + ' ' + p.pid, 'error-tabla');
      boton.disabled = p.estado === 'TERMINADO';
      acciones.append(boton);
    }
    const celdaAcciones = crear('td');
    celdaAcciones.append(acciones);
    fila.append(celdaAcciones);
    cuerpo.append(fila);
  }
  if (kernel.procesos.length === 0) {
    const fila = crear('tr');
    const celda = crear('td', 'vacio', 'Todavía no hay procesos.');
    celda.colSpan = 13;
    fila.append(celda);
    cuerpo.append(fila);
  }
}

// Se reutilizan los elementos de la barra en lugar de recrearlos: si se recrearan, el
// navegador no tendría un ancho anterior desde el cual animar la transición.
function renderMemoria() {
  const barra = porId('mem-barra');
  const bloques = kernel.memoria.bloques;
  for (let i = 0; i < bloques.length; i++) {
    let elemento = barra.children[i];
    if (elemento === undefined) {
      elemento = crear('div');
      barra.append(elemento);
    }
    const b = bloques[i];
    const nombre = b.pid === null ? 'Libre' : 'P' + b.pid;
    elemento.className = b.pid === null ? 'bloque bloque-libre' : 'bloque';
    elemento.style.backgroundColor = b.pid === null ? '' : colorDe(b.pid);
    elemento.style.width = (b.tamano / kernel.memoria.total) * 100 + '%';
    elemento.title = nombre + ' · ' + b.tamano + ' MB (dirección ' + b.inicio + ')';
    elemento.textContent = textoBloque(b, nombre);
  }
  while (barra.children.length > bloques.length) {
    barra.lastChild.remove();
  }
  porId('mem-resumen').textContent = 'Usada: ' + kernel.memoria.usada() + ' MB | Libre: '
    + kernel.memoria.libreTotal() + ' MB | Hueco mayor: ' + kernel.memoria.huecoMayor() + ' MB';
}

// En un bloque angosto no cabe la etiqueta completa; el detalle queda en el title.
function textoBloque(bloque, nombre) {
  if (bloque.tamano >= 10) {
    return bloque.pid === null ? bloque.tamano + ' MB' : nombre + ' · ' + bloque.tamano + ' MB';
  }
  if (bloque.tamano >= 4 && bloque.pid !== null) {
    return nombre;
  }
  return '';
}

function renderGantt() {
  const gantt = porId('gantt');
  gantt.replaceChildren();
  for (let t = 0; t < kernel.historial.length; t++) {
    const pid = kernel.historial[t];
    const celda = crear('div', 'gantt-celda');
    const color = crear('div', pid === null ? 'gantt-color gantt-ocioso' : 'gantt-color', pid === null ? '—' : 'P' + pid);
    if (pid !== null) {
      color.style.backgroundColor = colorDe(pid);
    }
    celda.append(color, crear('div', 'gantt-tick', String(t)));
    gantt.append(celda);
  }
  gantt.scrollLeft = gantt.scrollWidth;
}

function renderSemaforo() {
  const s = kernel.semaforo;
  porId('sem-indicador').className = s.valor === 1 ? 'semaforo semaforo-libre' : 'semaforo semaforo-ocupado';
  porId('sem-valor-texto').textContent = 'Valor ' + s.valor + (s.valor === 1 ? ' (libre)' : ' (ocupado)');
  porId('sem-dentro').textContent = s.dentro === null ? 'nadie' : 'P' + s.dentro;
  porId('sem-variable').textContent = 'Q' + kernel.variableCompartida.toLocaleString('en-US');
  renderChips(porId('sem-cola'), s.cola, 'Vacía', false);
}

// ---------- Grafo de asignación de recursos ----------

function nodoSvg(etiqueta, atributos, texto) {
  const nodo = document.createElementNS('http://www.w3.org/2000/svg', etiqueta);
  const nombres = Object.keys(atributos);
  for (let i = 0; i < nombres.length; i++) {
    nodo.setAttribute(nombres[i], atributos[nombres[i]]);
  }
  if (texto !== undefined) {
    nodo.textContent = texto;
  }
  return nodo;
}

function crearPuntaDeFlecha(id, color) {
  const marcador = nodoSvg('marker', {
    id: id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto',
  });
  marcador.append(nodoSvg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
  return marcador;
}

// Una arista pertenece al ciclo si sus dos extremos están seguidos en la ruta.
function aristaEnCiclo(origen, destino) {
  const ruta = kernel.deadlock;
  if (ruta === null) {
    return false;
  }
  for (let i = 0; i < ruta.length - 1; i++) {
    if (ruta[i] === origen && ruta[i + 1] === destino) {
      return true;
    }
  }
  return false;
}

// Recorta la línea para que empiece y termine en el borde de cada figura.
function dibujarFlecha(grafo, origen, destino, punteada) {
  const dx = destino.x - origen.x;
  const dy = destino.y - origen.y;
  const largo = Math.sqrt(dx * dx + dy * dy);
  const enCiclo = aristaEnCiclo(origen.nombre, destino.nombre);
  const atributos = {
    x1: origen.x + (dx / largo) * 26,
    y1: origen.y + (dy / largo) * 26,
    x2: destino.x - (dx / largo) * 28,
    y2: destino.y - (dy / largo) * 28,
    stroke: enCiclo ? ROJO_ALERTA : GRIS_FLECHA,
    'stroke-width': enCiclo ? 2.5 : 1.5,
    'marker-end': enCiclo ? 'url(#punta-roja)' : 'url(#punta-gris)',
  };
  if (punteada) {
    atributos['stroke-dasharray'] = '6 4';
  }
  grafo.append(nodoSvg('line', atributos));
}

// Devuelve los pid que retienen o esperan algún recurso, ordenados.
function procesosInvolucrados() {
  const pids = [];
  const nombres = ['R1', 'R2'];
  for (let i = 0; i < nombres.length; i++) {
    const recurso = kernel.recursos.recursos[nombres[i]];
    const lista = recurso.duenio === null ? [] : [recurso.duenio];
    for (let j = 0; j < recurso.cola.length; j++) {
      lista.push(recurso.cola[j]);
    }
    for (let j = 0; j < lista.length; j++) {
      if (!pids.includes(lista[j])) {
        pids.push(lista[j]);
      }
    }
  }
  pids.sort(function (a, b) {
    return a - b;
  });
  return pids;
}

// Los procesos se reparten entre una fila superior y una inferior; los recursos van al centro.
function posicionesDeProcesos(pids) {
  const posiciones = [];
  const arriba = Math.ceil(pids.length / 2);
  const abajo = pids.length - arriba;
  for (let i = 0; i < pids.length; i++) {
    const esArriba = i % 2 === 0;
    const lugar = Math.floor(i / 2) + 1;
    const total = esArriba ? arriba : abajo;
    posiciones.push({
      nombre: 'P' + pids[i],
      pid: pids[i],
      x: (lugar * 520) / (total + 1),
      y: esArriba ? 32 : 208,
    });
  }
  return posiciones;
}

function renderGrafo() {
  const grafo = porId('grafo');
  grafo.replaceChildren();
  const definiciones = nodoSvg('defs', {});
  definiciones.append(crearPuntaDeFlecha('punta-gris', GRIS_FLECHA), crearPuntaDeFlecha('punta-roja', ROJO_ALERTA));
  grafo.append(definiciones);

  const posicionR1 = { nombre: 'R1', x: 170, y: 120 };
  const posicionR2 = { nombre: 'R2', x: 350, y: 120 };
  const procesos = posicionesDeProcesos(procesosInvolucrados());

  const figurasRecurso = [posicionR1, posicionR2];
  for (let i = 0; i < procesos.length; i++) {
    for (let j = 0; j < figurasRecurso.length; j++) {
      const recurso = kernel.recursos.recursos[figurasRecurso[j].nombre];
      if (recurso.duenio === procesos[i].pid) {
        dibujarFlecha(grafo, figurasRecurso[j], procesos[i], false);
      }
      if (recurso.cola.includes(procesos[i].pid)) {
        dibujarFlecha(grafo, procesos[i], figurasRecurso[j], true);
      }
    }
  }

  for (let j = 0; j < figurasRecurso.length; j++) {
    const r = figurasRecurso[j];
    grafo.append(nodoSvg('rect', {
      x: r.x - 22, y: r.y - 22, width: 44, height: 44, rx: 4, fill: '#fff', stroke: '#1f2733', 'stroke-width': 1.5,
    }));
    grafo.append(nodoSvg('text', {
      x: r.x, y: r.y + 5, 'text-anchor': 'middle', 'font-family': 'ui-monospace, Consolas, monospace', 'font-weight': 700, 'font-size': 15, fill: '#1f2733',
    }, r.nombre));
  }
  for (let i = 0; i < procesos.length; i++) {
    const p = procesos[i];
    grafo.append(nodoSvg('circle', { cx: p.x, cy: p.y, r: 22, fill: colorDe(p.pid) }));
    grafo.append(nodoSvg('text', {
      x: p.x, y: p.y + 5, 'text-anchor': 'middle', 'font-family': 'ui-monospace, Consolas, monospace', 'font-weight': 700, 'font-size': 14, fill: '#fff',
    }, p.nombre));
  }
}

function renderRecursos() {
  renderGrafo();
  const banner = porId('banner-deadlock');
  banner.replaceChildren();
  banner.hidden = kernel.deadlock === null;
  if (kernel.deadlock === null) {
    return;
  }
  banner.append(crear('span', '', 'DEADLOCK detectado: ' + kernel.deadlock.join(' -> ')));
  // La ruta repite el primer proceso al final, por eso el último elemento se omite.
  for (let i = 0; i < kernel.deadlock.length - 1; i++) {
    const nodo = kernel.deadlock[i];
    if (nodo[0] === 'P') {
      banner.append(crearBoton('Abortar ' + nodo, 'kill ' + nodo, 'error-recursos'));
    }
  }
}

function renderConsola() {
  const salida = porId('consola-salida');
  salida.textContent = lineasConsola.join('\n');
  salida.scrollTop = salida.scrollHeight;
}

function renderBitacora() {
  const lista = porId('bitacora');
  lista.replaceChildren();
  for (let i = 0; i < kernel.eventos.length; i++) {
    const evento = kernel.eventos[i];
    lista.append(crear('li', 'evento-' + evento.tipo, 't=' + evento.t + '  ' + evento.texto));
  }
  lista.scrollTop = lista.scrollHeight;
}

// ---------- Eventos de la pantalla ----------

async function copiarBitacora() {
  const lineas = [];
  for (let i = 0; i < kernel.eventos.length; i++) {
    lineas.push('t=' + kernel.eventos[i].t + '  ' + kernel.eventos[i].texto);
  }
  // El navegador puede negar el portapapeles; sin el try, el botón fallaría en silencio.
  try {
    await navigator.clipboard.writeText(lineas.join('\n'));
    porId('copiar-estado').textContent = 'Bitácora copiada';
  } catch (error) {
    porId('copiar-estado').textContent = 'El navegador no permitió copiar';
  }
}

// Flecha arriba y abajo recorren los comandos anteriores, como en una terminal.
function navegarHistorial(evento) {
  if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') {
    return;
  }
  evento.preventDefault();
  posicionHistorial = posicionHistorial + (evento.key === 'ArrowUp' ? -1 : 1);
  if (posicionHistorial < 0) {
    posicionHistorial = 0;
  }
  if (posicionHistorial > historialComandos.length) {
    posicionHistorial = historialComandos.length;
  }
  const entrada = posicionHistorial < historialComandos.length ? historialComandos[posicionHistorial] : '';
  porId('in-consola').value = entrada;
}

function mostrarCarrera(modo) {
  porId('carrera-salida').textContent = ejecutar('carrera ' + modo).join('\n');
}

function conectarEventos() {
  porId('btn-tick').addEventListener('click', function () {
    ejecutar('tick');
  });
  porId('btn-reset').addEventListener('click', function () {
    detenerAuto();
    porId('carrera-salida').textContent = '';
    ejecutar('reset');
  });
  porId('btn-auto').addEventListener('click', function () {
    if (temporizador === null) {
      iniciarAuto();
    } else {
      detenerAuto();
    }
  });
  // Si ya está corriendo, se reinicia el temporizador con la velocidad nueva.
  porId('sel-velocidad').addEventListener('change', function () {
    if (temporizador !== null) {
      detenerAuto();
      iniciarAuto();
    }
  });
  porId('form-crear').addEventListener('submit', function (evento) {
    evento.preventDefault();
    ejecutar('crear ' + porId('in-mb').value + ' ' + porId('in-rafaga').value, 'error-crear');
  });
  porId('btn-ejemplo').addEventListener('click', function () {
    ejecutar('ejemplo', 'error-crear');
  });
  porId('btn-carrera-sin').addEventListener('click', function () {
    mostrarCarrera('sin');
  });
  porId('btn-carrera-con').addEventListener('click', function () {
    mostrarCarrera('con');
  });
  porId('form-solicitar').addEventListener('submit', function (evento) {
    evento.preventDefault();
    ejecutar('solicitar ' + porId('in-pid').value + ' ' + porId('sel-recurso').value, 'error-recursos');
  });
  porId('btn-deadlock').addEventListener('click', function () {
    ejecutar('deadlock', 'error-recursos');
  });
  porId('form-consola').addEventListener('submit', function (evento) {
    evento.preventDefault();
    const comando = porId('in-consola').value;
    if (comando.trim() !== '') {
      historialComandos.push(comando);
      posicionHistorial = historialComandos.length;
      ejecutar(comando);
    }
    porId('in-consola').value = '';
  });
  porId('in-consola').addEventListener('keydown', navegarHistorial);
  porId('btn-copiar').addEventListener('click', copiarBitacora);
}

conectarEventos();
render();
