// Bloque de Control de Proceso (PCB) y Bloque de Control de Hilo (TCB).
//
// El PCB es la estructura donde el sistema operativo guarda la información de
// cada proceso. Hay un PCB por proceso y gracias a él un proceso puede pausarse
// y reanudarse exactamente donde se quedó.
//
// Conexión con los demás módulos: kernel.js crea los PCB, planificador.js cambia
// su estado y su ráfaga, memoria.js entrega la dirección base, y semaforo.js y
// recursos.js provocan los bloqueos que aquí se registran.

// Estados del ciclo de vida de un proceso. Transiciones:
// admitido (NUEVO -> LISTO), despacho (LISTO -> EJECUCION),
// fin (EJECUCION -> TERMINADO), evento (EJECUCION -> BLOQUEADO)
// y evento listo (BLOQUEADO -> LISTO).
export const ESTADOS = {
  NUEVO: 'NUEVO',
  LISTO: 'LISTO',
  EJECUCION: 'EJECUCION',
  BLOQUEADO: 'BLOQUEADO',
  TERMINADO: 'TERMINADO',
};

// Crea el PCB con los datos que pide el enunciado (PID, estado, tamaño en memoria,
// ráfaga total y restante) y los datos necesarios para calcular las métricas.
export function crearPCB(pid, memoria, rafaga, llegada, inicioMemoria) {
  return {
    pid: pid,
    estado: ESTADOS.NUEVO,
    memoria: memoria,             // tamaño en MB
    inicioMemoria: inicioMemoria, // dirección base en la RAM simulada
    rafagaTotal: rafaga,
    rafagaRestante: rafaga,
    llegada: llegada,
    primeraEjecucion: null,       // null hasta que recibe CPU por primera vez
    fin: null,                    // null hasta que termina
    tiempoEspera: 0,              // suma de ticks en la cola de listos
    abortado: false,              // true si terminó por kill y no por completar su ráfaga
    esperandoRecurso: null,       // 'R1', 'R2' o null
    enColaSemaforo: false,
    // El simulador usa un hilo por proceso. El TCB guarda el contador de programa
    // (pc = unidades ejecutadas), que es lo que se salva y se restaura en cada
    // cambio de contexto.
    tcb: { tid: pid, pc: 0 },
  };
}

// Tiempo de retorno: desde que llega hasta que termina.
// Devuelve null si aún no termina; sin ese control, null - llegada daría un
// número sin sentido, porque JavaScript trata null como 0 al restar.
export function retorno(pcb) {
  if (pcb.fin === null) {
    return null;
  }
  return pcb.fin - pcb.llegada;
}

// Tiempo de respuesta: desde que llega hasta que recibe CPU por primera vez.
// Devuelve null si aún no se ha ejecutado, por la misma razón que retorno().
export function respuesta(pcb) {
  if (pcb.primeraEjecucion === null) {
    return null;
  }
  return pcb.primeraEjecucion - pcb.llegada;
}

// Tiempo de espera: lo que acumuló en la cola de listos. Lo cuenta el planificador
// tick por tick, porque un proceso puede entrar y salir de la cola varias veces.
export function espera(pcb) {
  return pcb.tiempoEspera;
}
