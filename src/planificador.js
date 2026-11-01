// Planificador de corto plazo con Round Robin.
//
// Round Robin es apropiativo: cada proceso recibe un quantum fijo y rotativo, y si
// no termina vuelve al final de la cola de listos. Es equitativo y da buena
// respuesta, a costa de más cambios de contexto.
//
// Conexión con los demás módulos: kernel.js le entrega los PCB y llama paso() una
// vez por tick. El reloj vive en el kernel; aquí solo se recibe su valor para
// registrar la primera ejecución de cada proceso.

import { ESTADOS } from './pcb.js';

export const QUANTUM = 3;

export class Planificador {
  constructor(quantum = QUANTUM) {
    this.quantum = quantum;
    this.cola = [];          // cola de listos, en orden de llegada al final
    this.enEjecucion = null; // PCB que tiene la CPU
    this.quantumUsado = 0;
    this.pcCPU = 0;          // registro contador de programa de la CPU
    this.cambiosContexto = 0;
  }

  // Admite un proceso: pasa a LISTO y entra al final de la cola.
  agregar(pcb) {
    pcb.estado = ESTADOS.LISTO;
    this.cola.push(pcb);
  }

  // Saca un proceso de la cola o de la CPU. Si estaba en CPU guarda su contexto,
  // para que pueda continuar donde se quedó si más adelante vuelve a la cola.
  quitar(pid) {
    if (this.enEjecucion !== null && this.enEjecucion.pid === pid) {
      this.guardarContexto();
      this.enEjecucion = null;
      this.quantumUsado = 0;
      return true;
    }
    for (let i = 0; i < this.cola.length; i++) {
      if (this.cola[i].pid === pid) {
        this.cola.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  // Cambio de contexto, parte 1: el registro de la CPU se copia al TCB.
  guardarContexto() {
    this.enEjecucion.tcb.pc = this.pcCPU;
  }

  // Ejecuta exactamente 1 unidad de tiempo. El orden de los pasos es importante:
  // de él dependen los tiempos de espera y el orden de la cola.
  paso(reloj) {
    const eventos = [];
    this.resolverExpropiacion(eventos);
    this.despachar(reloj, eventos);
    this.contarEspera();

    if (this.enEjecucion === null) {
      return { pidEjecutado: null, terminado: null, eventos: eventos };
    }

    const proceso = this.enEjecucion;
    proceso.rafagaRestante--;
    this.pcCPU++;
    proceso.tcb.pc = this.pcCPU;
    this.quantumUsado++;

    let terminado = null;
    if (proceso.rafagaRestante === 0) {
      proceso.estado = ESTADOS.TERMINADO;
      this.enEjecucion = null;
      terminado = proceso;
    }
    return { pidEjecutado: proceso.pid, terminado: terminado, eventos: eventos };
  }

  // Se resuelve al INICIO del tick, no al final. Así, un proceso que llega en el
  // mismo instante en que otro agota su quantum queda antes en la cola, porque el
  // kernel lo crea antes de llamar paso(). Es la regla de la presentación del
  // catedrático: en la diapositiva 27, P3 llega en t=2 y queda antes que P1.
  resolverExpropiacion(eventos) {
    if (this.enEjecucion === null || this.quantumUsado !== this.quantum) {
      return;
    }
    if (this.cola.length === 0) {
      // Nadie más quiere la CPU: sigue el mismo proceso, sin cambio de contexto.
      this.quantumUsado = 0;
      return;
    }
    const proceso = this.enEjecucion;
    this.guardarContexto();
    proceso.estado = ESTADOS.LISTO;
    this.cola.push(proceso);
    this.enEjecucion = null;
    this.cambiosContexto++;
    eventos.push('Quantum agotado: P' + proceso.pid + ' vuelve al final de la cola');
  }

  // Cambio de contexto, parte 2: si la CPU está libre, entra el primero de la cola
  // y su TCB se copia al registro de la CPU.
  despachar(reloj, eventos) {
    if (this.enEjecucion !== null || this.cola.length === 0) {
      return;
    }
    const proceso = this.cola.shift();
    proceso.estado = ESTADOS.EJECUCION;
    this.enEjecucion = proceso;
    this.quantumUsado = 0;
    this.pcCPU = proceso.tcb.pc;
    if (proceso.primeraEjecucion === null) {
      proceso.primeraEjecucion = reloj;
    }
    eventos.push('Despacho: P' + proceso.pid + ' entra a la CPU');
  }

  // La espera se cuenta aquí, después del despacho: quien acaba de entrar a la CPU
  // ya no está esperando durante este tick.
  contarEspera() {
    for (let i = 0; i < this.cola.length; i++) {
      this.cola[i].tiempoEspera++;
    }
  }
}
