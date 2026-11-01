// Interbloqueo: recursos exclusivos R1 y R2, y detección de deadlock.
//
// Un deadlock necesita cuatro condiciones a la vez (Coffman): exclusión mutua,
// retención y espera, no apropiación y espera circular. Este simulador no intenta
// prevenirlo: lo detecta y se recupera por terminación con el comando kill.
//
// Conexión con los demás módulos: kernel.js llama estos métodos y traduce el resultado
// a estados del PCB. Aquí solo se manejan identificadores de proceso.

export class GestorRecursos {
  constructor() {
    // Una sola instancia por recurso: cada uno tiene a lo sumo un dueño.
    this.recursos = {
      R1: { duenio: null, cola: [] },
      R2: { duenio: null, cola: [] },
    };
  }

  // Devuelve true si se asignó, o false si el proceso quedó en la cola del recurso.
  solicitar(pid, rid) {
    const recurso = this.recursos[rid];
    if (recurso.duenio === null) {
      recurso.duenio = pid;
      return true;
    }
    recurso.cola.push(pid);
    return false;
  }

  // Libera todo lo que retiene un proceso. Primero lo saca de las colas, para que un
  // recurso liberado nunca se le entregue al mismo proceso que se está yendo.
  // Devuelve la lista [{ rid, nuevoDuenio }] de los recursos liberados.
  liberarDe(pid) {
    const nombres = Object.keys(this.recursos);
    for (let i = 0; i < nombres.length; i++) {
      const cola = this.recursos[nombres[i]].cola;
      const posicion = cola.indexOf(pid);
      if (posicion !== -1) {
        cola.splice(posicion, 1);
      }
    }
    const liberados = [];
    for (let i = 0; i < nombres.length; i++) {
      const recurso = this.recursos[nombres[i]];
      if (recurso.duenio === pid) {
        recurso.duenio = recurso.cola.length > 0 ? recurso.cola.shift() : null;
        liberados.push({ rid: nombres[i], nuevoDuenio: recurso.duenio });
      }
    }
    return liberados;
  }

  // Devuelve el recurso que espera un proceso, o null si no espera ninguno.
  recursoEsperado(pid) {
    const nombres = Object.keys(this.recursos);
    for (let i = 0; i < nombres.length; i++) {
      if (this.recursos[nombres[i]].cola.includes(pid)) {
        return nombres[i];
      }
    }
    return null;
  }

  // Grafo de espera: con una sola instancia por recurso, un ciclo confirma el deadlock.
  // Cada proceso espera a lo sumo un recurso y cada recurso tiene a lo sumo un dueño,
  // así que basta seguir la cadena proceso -> recurso -> dueño -> recurso.
  // Devuelve la ruta, por ejemplo ['P4', 'R2', 'P5', 'R1', 'P4'], o null si no hay ciclo.
  detectarCiclo() {
    const procesos = this.procesosEnEspera();
    for (let i = 0; i < procesos.length; i++) {
      const ruta = this.seguirCadena(procesos[i]);
      if (ruta !== null) {
        return ruta;
      }
    }
    return null;
  }

  // Se ordenan por pid para que la ruta reportada empiece siempre por el mismo proceso.
  procesosEnEspera() {
    const procesos = [];
    const nombres = Object.keys(this.recursos);
    for (let i = 0; i < nombres.length; i++) {
      const cola = this.recursos[nombres[i]].cola;
      for (let j = 0; j < cola.length; j++) {
        procesos.push(cola[j]);
      }
    }
    procesos.sort(function (a, b) {
      return a - b;
    });
    return procesos;
  }

  // Devuelve la ruta si la cadena vuelve al inicio. Si llega a un proceso ya visitado,
  // el inicio solo conduce a un ciclo sin ser parte de él: lo hallará otro punto de
  // partida. Sin este control, ese caso daría vueltas para siempre.
  seguirCadena(inicio) {
    const ruta = ['P' + inicio];
    const visitados = [inicio];
    let actual = inicio;
    while (true) {
      const rid = this.recursoEsperado(actual);
      if (rid === null) {
        return null;
      }
      const duenio = this.recursos[rid].duenio;
      ruta.push(rid, 'P' + duenio);
      if (duenio === inicio) {
        return ruta;
      }
      if (visitados.includes(duenio)) {
        return null;
      }
      visitados.push(duenio);
      actual = duenio;
    }
  }
}
