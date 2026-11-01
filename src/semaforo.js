// Concurrencia: semáforo binario que protege la sección crítica, y una demostración
// de condición de carrera.
//
// La sección crítica es donde se lee o modifica un recurso compartido; solo puede
// entrar un proceso a la vez (exclusión mutua). Una condición de carrera ocurre
// cuando el resultado depende de un orden de ejecución no controlado.
//
// Conexión con los demás módulos: kernel.js llama wait() y signal(), y traduce el
// resultado a estados del PCB (BLOQUEADO y LISTO). Aquí solo se manejan identificadores.

export const SALDO_INICIAL = 1000;

// Se comporta como un mutex con dueño: solo quien está dentro puede hacer signal.
// En un semáforo binario clásico, cualquier proceso podría hacer signal; aquí se
// impide para que un proceso ajeno no libere una sección que no le pertenece.
export class SemaforoBinario {
  constructor() {
    this.valor = 1;     // 1 = libre, 0 = ocupado
    this.dentro = null; // quién está en la sección crítica
    this.cola = [];     // FIFO: atiende por orden de llegada y así evita la inanición
  }

  // Devuelve true si entró, o false si quedó en la cola de espera.
  wait(pid) {
    if (this.valor === 1) {
      this.valor = 0;
      this.dentro = pid;
      return true;
    }
    this.cola.push(pid);
    return false;
  }

  // Si hay alguien esperando, la sección pasa directo a ese proceso y el valor
  // sigue en 0: así nadie puede colarse entre la salida de uno y la entrada del otro.
  // Devuelve el identificador del despertado, o null si la cola estaba vacía.
  signal(pid) {
    if (pid !== this.dentro) {
      throw new Error('P' + pid + ' no está dentro de la sección crítica.');
    }
    if (this.cola.length > 0) {
      this.dentro = this.cola.shift();
      return this.dentro;
    }
    this.valor = 1;
    this.dentro = null;
    return null;
  }

  // Lo usa el kernel cuando un proceso termina o se aborta. Sin esto, si el proceso
  // estaba dentro, la sección crítica quedaría tomada para siempre.
  quitar(pid) {
    if (this.dentro === pid) {
      return this.signal(pid);
    }
    for (let i = 0; i < this.cola.length; i++) {
      if (this.cola[i] === pid) {
        this.cola.splice(i, 1);
        break;
      }
    }
    return null;
  }
}

// Demostración independiente del kernel. A deposita Q500 y B retira Q200, con turnos
// alternados A, B, A, B. Un proceso bloqueado cede su turno.
// Sin semáforo se pierde una actualización, porque ambos leen el mismo saldo y la
// última escritura borra a la anterior.
export function simularCarrera(conSemaforo, saldoInicial = SALDO_INICIAL) {
  const programa = conSemaforo ? ['wait', 'leer', 'escribir', 'signal'] : ['leer', 'escribir'];
  const procesos = [
    { nombre: 'A', monto: 500, siguiente: 0, local: null, bloqueado: false },
    { nombre: 'B', monto: -200, siguiente: 0, local: null, bloqueado: false },
  ];
  const semaforo = new SemaforoBinario();
  const pasos = [];
  let saldo = saldoInicial;
  let turno = 0;

  while (procesos[0].siguiente < programa.length || procesos[1].siguiente < programa.length) {
    const proceso = procesos[turno];
    turno = (turno + 1) % 2;
    if (proceso.bloqueado || proceso.siguiente >= programa.length) {
      continue;
    }
    const instruccion = programa[proceso.siguiente];
    proceso.siguiente++;
    let accion = '';

    if (instruccion === 'wait') {
      if (semaforo.wait(proceso.nombre)) {
        accion = 'wait: entra a la sección crítica';
      } else {
        proceso.bloqueado = true;
        accion = 'wait: se bloquea y va a la cola';
      }
    } else if (instruccion === 'leer') {
      proceso.local = saldo;
      accion = 'lee el saldo';
    } else if (instruccion === 'escribir') {
      proceso.local = proceso.local + proceso.monto;
      saldo = proceso.local;
      accion = 'escribe el saldo';
    } else {
      const despertado = semaforo.signal(proceso.nombre);
      accion = 'signal: libera la sección';
      if (despertado !== null) {
        accion = 'signal: despierta a ' + despertado;
        for (let i = 0; i < procesos.length; i++) {
          if (procesos[i].nombre === despertado) {
            procesos[i].bloqueado = false;
          }
        }
      }
    }
    pasos.push({ proceso: proceso.nombre, accion: accion, valorLocal: proceso.local, saldo: saldo });
  }

  return { pasos: pasos, final: saldo, esperado: saldoInicial + 500 - 200 };
}
