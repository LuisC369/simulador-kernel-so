// Gestión de memoria: RAM física simulada de 100 MB con asignación contigua
// dinámica (particiones variables) y primer ajuste.
//
// Cada partición mide exactamente lo que pide el proceso, así que no hay
// fragmentación interna. A cambio aparece la fragmentación externa: puede haber
// memoria libre suficiente en total sin un hueco contiguo que alcance. Por eso
// un proceso puede recibir Out of Memory aunque la suma de lo libre le alcance.
// La compactación lo arreglaría, pero cuesta CPU y detiene procesos; este
// simulador no la usa.
//
// Conexión con los demás módulos: kernel.js llama asignar() al crear un proceso
// y guarda la dirección en su PCB, y llama liberar() cuando el proceso termina
// o se aborta. Este módulo no conoce el PCB; solo maneja pids y tamaños.

export const MEMORIA_TOTAL = 100;

export class Memoria {
  constructor(total = MEMORIA_TOTAL) {
    this.total = total;
    // Lista de bloques ordenada por dirección. Al inicio, un solo hueco libre.
    // pid === null significa que el bloque está libre.
    this.bloques = [{ inicio: 0, tamano: total, pid: null }];
  }

  // Primer ajuste: toma el primer hueco que alcance. Se prefiere sobre el mejor
  // ajuste porque este recorre toda la lista y deja sobrantes diminutos inservibles.
  // Devuelve la dirección base, o null si ningún hueco contiguo alcanza.
  asignar(pid, tamano) {
    for (let i = 0; i < this.bloques.length; i++) {
      const bloque = this.bloques[i];
      if (bloque.pid === null && bloque.tamano >= tamano) {
        const sobrante = bloque.tamano - tamano;
        bloque.tamano = tamano;
        bloque.pid = pid;
        // Lo que sobra queda como un hueco nuevo justo después, para mantener
        // la lista ordenada por dirección.
        if (sobrante > 0) {
          this.bloques.splice(i + 1, 0, {
            inicio: bloque.inicio + tamano,
            tamano: sobrante,
            pid: null,
          });
        }
        return bloque.inicio;
      }
    }
    return null;
  }

  // Marca como libre el bloque del proceso y fusiona los huecos vecinos.
  // Devuelve true si el proceso tenía memoria asignada.
  liberar(pid) {
    let encontrado = false;
    for (let i = 0; i < this.bloques.length; i++) {
      if (this.bloques[i].pid === pid) {
        this.bloques[i].pid = null;
        encontrado = true;
      }
    }
    if (encontrado) {
      this.fusionarHuecos();
    }
    return encontrado;
  }

  // Sin la fusión, dos huecos vecinos de 30 MB no podrían recibir un proceso de
  // 50 MB, y la memoria se fragmentaría cada vez más aunque estuviera libre.
  // Cubre los cuatro casos al liberar: sin vecinos libres, con el vecino anterior,
  // con el siguiente o con ambos.
  fusionarHuecos() {
    let i = 0;
    while (i < this.bloques.length - 1) {
      const actual = this.bloques[i];
      const siguiente = this.bloques[i + 1];
      if (actual.pid === null && siguiente.pid === null) {
        actual.tamano = actual.tamano + siguiente.tamano;
        this.bloques.splice(i + 1, 1);
        // No se avanza i: el bloque ya agrandado se compara con su nuevo vecino.
      } else {
        i++;
      }
    }
  }

  // Suma de todos los huecos, aunque no estén contiguos.
  libreTotal() {
    let libre = 0;
    for (let i = 0; i < this.bloques.length; i++) {
      if (this.bloques[i].pid === null) {
        libre = libre + this.bloques[i].tamano;
      }
    }
    return libre;
  }

  usada() {
    return this.total - this.libreTotal();
  }

  // El proceso más grande que cabe ahora. Comparado con libreTotal(), muestra
  // cuánta fragmentación externa hay.
  huecoMayor() {
    let mayor = 0;
    for (let i = 0; i < this.bloques.length; i++) {
      const bloque = this.bloques[i];
      if (bloque.pid === null && bloque.tamano > mayor) {
        mayor = bloque.tamano;
      }
    }
    return mayor;
  }
}
