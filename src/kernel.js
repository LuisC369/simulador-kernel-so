// Núcleo del simulador: tiene el reloj y coordina los módulos.
//
// Este archivo no imprime nada ni toca la interfaz. Devuelve datos o lanza un
// Error con un mensaje claro, y por eso la consola y la web pueden usarlo igual.
// Lo que ocurre queda registrado en la bitácora (this.eventos).

import { ESTADOS, crearPCB, retorno, respuesta, espera } from './pcb.js';
import { Memoria, MEMORIA_TOTAL } from './memoria.js';
import { Planificador, QUANTUM } from './planificador.js';
import { SemaforoBinario, SALDO_INICIAL } from './semaforo.js';

const RAFAGA_MAXIMA = 100;

// Única validación de enteros del simulador. Recibe texto porque así llega desde
// la consola y la web. La expresión /^\d+$/ rechaza letras, negativos, decimales
// y notación científica, que Number() o parseInt() podrían aceptar a medias.
export function validarEntero(texto, nombre, minimo, maximo) {
  const limpio = texto === undefined || texto === null ? '' : String(texto).trim();
  const rango = 'Debe ser un entero entre ' + minimo + ' y ' + maximo + '.';
  if (limpio === '') {
    throw new Error('Falta ' + nombre + '. ' + rango);
  }
  if (!/^\d+$/.test(limpio)) {
    throw new Error('Valor inválido para ' + nombre + ': "' + limpio + '". ' + rango);
  }
  const numero = Number(limpio);
  if (numero < minimo || numero > maximo) {
    throw new Error('Valor fuera de rango para ' + nombre + ': ' + limpio + '. ' + rango);
  }
  return numero;
}

export class Kernel {
  constructor({ quantum = QUANTUM, memoriaTotal = MEMORIA_TOTAL } = {}) {
    this.quantum = quantum;
    this.memoriaTotal = memoriaTotal;
    this.reset();
  }

  // Vuelve todo al estado inicial. El constructor la usa para no repetir el código.
  reset() {
    this.reloj = 0;
    this.siguientePid = 1;
    this.procesos = [];
    this.memoria = new Memoria(this.memoriaTotal);
    this.planificador = new Planificador(this.quantum);
    this.semaforo = new SemaforoBinario();
    this.variableCompartida = SALDO_INICIAL; // región protegida por el semáforo
    this.historial = [];  // pid o null por cada tick; es la base del diagrama de Gantt
    this.eventos = [];    // bitácora
  }

  registrar(tipo, texto) {
    this.eventos.push({ t: this.reloj, tipo: tipo, texto: texto });
  }

  // Busca un proceso activo o lanza Error. La usan los comandos que reciben un pid.
  obtenerActivo(pid) {
    for (let i = 0; i < this.procesos.length; i++) {
      const proceso = this.procesos[i];
      if (proceso.pid === pid) {
        if (proceso.estado === ESTADOS.TERMINADO) {
          throw new Error('El proceso P' + pid + ' ya terminó.');
        }
        return proceso;
      }
    }
    throw new Error('No existe el proceso P' + pid + '.');
  }

  // Valida primero y reserva memoria después, para que un dato inválido no altere
  // nada. El PID solo se consume si el proceso de verdad se crea.
  crearProceso(memoriaTexto, rafagaTexto) {
    const tamano = validarEntero(memoriaTexto, 'memoria (MB)', 1, this.memoriaTotal);
    const rafaga = validarEntero(rafagaTexto, 'ráfaga', 1, RAFAGA_MAXIMA);
    const pid = this.siguientePid;

    const inicio = this.memoria.asignar(pid, tamano);
    if (inicio === null) {
      const mensaje = 'Out of Memory: P' + pid + ' requiere ' + tamano + ' MB; hueco contiguo mayor '
        + this.memoria.huecoMayor() + ' MB; libre total ' + this.memoria.libreTotal() + ' MB';
      this.registrar('error', mensaje);
      throw new Error(mensaje);
    }

    this.siguientePid++;
    const pcb = crearPCB(pid, tamano, rafaga, this.reloj, inicio);
    this.procesos.push(pcb);
    this.planificador.agregar(pcb);
    this.registrar('ok', 'P' + pid + ' creado: ' + tamano + ' MB en la dirección ' + inicio + ', ráfaga ' + rafaga);
    return pcb;
  }

  // Avanza n unidades de tiempo. Si no hay nada que ejecutar, el reloj avanza
  // igual y el tick queda en null: es tiempo de CPU ociosa.
  tick(n = 1) {
    for (let i = 0; i < n; i++) {
      const resultado = this.planificador.paso(this.reloj);
      for (let j = 0; j < resultado.eventos.length; j++) {
        this.registrar('info', resultado.eventos[j]);
      }
      this.historial.push(resultado.pidEjecutado);
      this.reloj++;
      if (resultado.terminado !== null) {
        this.finalizar(resultado.terminado);
      }
    }
  }

  // Un proceso que completó su ráfaga devuelve su memoria y su lugar en el semáforo.
  finalizar(pcb) {
    pcb.fin = this.reloj;
    this.memoria.liberar(pcb.pid);
    this.registrar('ok', 'P' + pcb.pid + ' terminó y liberó ' + pcb.memoria + ' MB');
    this.liberarSemaforo(pcb.pid);
  }

  // Un proceso intenta entrar a la sección crítica. Si está ocupada, se bloquea: sale
  // del planificador para no gastar CPU mientras espera.
  wait(pid) {
    const proceso = this.obtenerActivo(pid);
    if (this.semaforo.dentro === pid) {
      throw new Error('P' + pid + ' ya está dentro de la sección crítica.');
    }
    if (proceso.estado === ESTADOS.BLOQUEADO) {
      throw new Error('P' + pid + ' está bloqueado y no puede hacer wait.');
    }
    if (this.semaforo.wait(pid)) {
      this.registrar('ok', 'P' + pid + ' entró a la sección crítica');
      return true;
    }
    this.planificador.quitar(pid);
    proceso.estado = ESTADOS.BLOQUEADO;
    proceso.enColaSemaforo = true;
    this.registrar('info', 'P' + pid + ' se bloquea: la sección crítica está ocupada por P' + this.semaforo.dentro);
    return false;
  }

  // El proceso sale de la sección crítica. Si el pid no es el dueño, el semáforo lanza Error.
  signal(pid) {
    this.obtenerActivo(pid);
    const despertado = this.semaforo.signal(pid);
    this.registrar('ok', 'P' + pid + ' salió de la sección crítica');
    this.despertarDeSemaforo(despertado);
    return despertado;
  }

  // Quita a un proceso que termina o se aborta, y despierta al siguiente si corresponde.
  liberarSemaforo(pid) {
    this.despertarDeSemaforo(this.semaforo.quitar(pid));
  }

  // El despertado ya es el nuevo dueño de la sección; pasa de BLOQUEADO a LISTO.
  despertarDeSemaforo(pid) {
    if (pid === null) {
      return;
    }
    const proceso = this.obtenerActivo(pid);
    proceso.enColaSemaforo = false;
    this.planificador.agregar(proceso);
    this.registrar('ok', 'P' + pid + ' despierta y entra a la sección crítica');
  }

  // El límite garantiza que el comando siempre devuelva el control. Con muchos
  // procesos largos se puede repetir para continuar.
  ejecutarHastaTerminar(limite = 500) {
    let ticks = 0;
    while (this.hayEjecutables() && ticks < limite) {
      this.tick();
      ticks++;
    }
    const limiteAlcanzado = this.hayEjecutables();
    if (limiteAlcanzado) {
      this.registrar('alerta', 'Se alcanzó el límite de ' + limite + ' ticks; repita el comando para continuar');
    }
    let bloqueados = 0;
    for (let i = 0; i < this.procesos.length; i++) {
      if (this.procesos[i].estado === ESTADOS.BLOQUEADO) {
        bloqueados++;
      }
    }
    if (bloqueados > 0) {
      this.registrar('alerta', 'Quedan ' + bloqueados + ' procesos bloqueados');
    }
    return { ticks: ticks, bloqueados: bloqueados, limiteAlcanzado: limiteAlcanzado };
  }

  hayEjecutables() {
    return this.planificador.enEjecucion !== null || this.planificador.cola.length > 0;
  }

  // Aborta un proceso: lo saca del planificador y libera su memoria y su semáforo.
  kill(pid) {
    const proceso = this.obtenerActivo(pid);
    this.planificador.quitar(pid);
    this.memoria.liberar(pid);
    proceso.estado = ESTADOS.TERMINADO;
    proceso.abortado = true;
    proceso.enColaSemaforo = false;
    proceso.fin = this.reloj;
    this.registrar('alerta', 'P' + pid + ' abortado; liberó ' + proceso.memoria + ' MB');
    this.liberarSemaforo(pid);
    return proceso;
  }

  // Definiciones del catedrático. Los promedios solo incluyen procesos que
  // terminaron normalmente: un abortado no completó su trabajo.
  metricas() {
    let ocupados = 0;
    for (let i = 0; i < this.historial.length; i++) {
      if (this.historial[i] !== null) {
        ocupados++;
      }
    }
    let terminados = 0;
    let sumaEspera = 0;
    let sumaRetorno = 0;
    let sumaRespuesta = 0;
    for (let i = 0; i < this.procesos.length; i++) {
      const proceso = this.procesos[i];
      if (proceso.estado === ESTADOS.TERMINADO && !proceso.abortado) {
        terminados++;
        sumaEspera = sumaEspera + espera(proceso);
        sumaRetorno = sumaRetorno + retorno(proceso);
        sumaRespuesta = sumaRespuesta + respuesta(proceso);
      }
    }
    return {
      utilizacion: this.reloj === 0 ? 0 : (ocupados / this.reloj) * 100,
      productividad: this.reloj === 0 ? 0 : terminados / this.reloj,
      esperaPromedio: terminados === 0 ? 0 : sumaEspera / terminados,
      retornoPromedio: terminados === 0 ? 0 : sumaRetorno / terminados,
      respuestaPromedio: terminados === 0 ? 0 : sumaRespuesta / terminados,
      cambiosContexto: this.planificador.cambiosContexto,
    };
  }
}
