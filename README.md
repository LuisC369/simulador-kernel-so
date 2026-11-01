# Simulador de Funciones del Kernel

Proyecto final del curso Sistemas Operativos I de la Universidad Mariano Gálvez de Guatemala, con el Ing. Julio Gómez.

Desarrollé un simulador del núcleo de un sistema operativo en JavaScript. No toca el hardware real: gestiona estructuras de datos que representan los componentes internos del sistema. Integra planificación Round Robin, memoria de 100 MB, un semáforo binario para la sección crítica y la detección y eliminación de un deadlock. Se usa por consola o desde una página web.

## Requisitos

- Node 18 o superior
- Git

No hace falta ejecutar `npm install`, porque el proyecto no tiene dependencias.

## Levantarlo en 3 comandos

```powershell
git clone https://github.com/LuisC369/simulador-kernel-so.git
cd simulador-kernel-so
node server.js
```

Después abro http://localhost:3000 en Chrome o Edge. El servidor se detiene con `Ctrl+C`.

Para usar la consola en lugar de la página:

```powershell
node cli.js
```

Si el puerto 3000 está ocupado, puedo usar otro con la variable de entorno `PORT`, que es la única del proyecto. No usa claves de API ni conexiones externas.

```powershell
$env:PORT=3001; node server.js
```

## Comandos del simulador

Funcionan igual en la consola y en la página.

| Comando | Acción |
|---|---|
| `ayuda` | Muestra la lista de comandos |
| `crear <MB> <rafaga>` | Crea un proceso (MB y ráfaga de 1 a 100) |
| `ejemplo` | Reinicia y carga la Tarea 12, Ejercicio 1 |
| `ps` | Muestra la tabla de procesos (PCB) y las métricas |
| `mem` | Muestra el mapa de la memoria RAM |
| `tick [n]` | Avanza n unidades de tiempo (1 a 100; por defecto 1) |
| `run` | Ejecuta hasta que no queden procesos ejecutables, con un límite de 500 ticks por llamada |
| `gantt` | Muestra el diagrama de Gantt en texto |
| `wait <pid>` | El proceso pide entrar a la sección crítica |
| `signal <pid>` | El proceso sale de la sección crítica |
| `sem` | Muestra el semáforo, su cola y la variable compartida |
| `carrera <sin\|con>` | Demuestra la condición de carrera, sin o con semáforo |
| `solicitar <pid> <R1\|R2>` | El proceso pide un recurso |
| `deadlock` | Fuerza una espera circular entre dos procesos nuevos |
| `kill <pid>` | Aborta un proceso y libera lo que retiene |
| `reset` | Reinicia el simulador |
| `salir` | Termina el programa (solo en la consola) |

El pid se puede escribir como `3` o como `P3`.

## Casos de prueba

Los guiones de `pruebas/` generan los volcados de texto comentados de la bitácora:

```powershell
node cli.js pruebas/01-memoria.txt pruebas/02-round-robin.txt pruebas/03-semaforo.txt pruebas/04-deadlock.txt
```

También se pueden ejecutar uno por uno. Con `npm run casos` se obtiene lo mismo.

| Guion | Qué demuestra |
|---|---|
| `01-memoria.txt` | Rechazo por falta de RAM y fragmentación externa |
| `02-round-robin.txt` | Sucesión de ráfagas y comparación con los valores teóricos |
| `03-semaforo.txt` | Condición de carrera y cola de espera del semáforo |
| `04-deadlock.txt` | Detección y eliminación de un deadlock |

## Pruebas automáticas

```powershell
node --test
```

También funciona `npm test`. Si PowerShell bloquea `npm` por su política de ejecución, se puede usar `npm.cmd test` o los comandos con `node` de esta guía.

## Estructura de carpetas

```
simulador-kernel-so/
├── src/
│   ├── pcb.js            # PCB, TCB y estados
│   ├── memoria.js        # 100 MB, asignación contigua, primer ajuste
│   ├── planificador.js   # Round Robin, cola de listos, cambio de contexto
│   ├── semaforo.js       # semáforo binario y condición de carrera
│   ├── recursos.js       # R1, R2, grafo de espera y detección de ciclos
│   ├── kernel.js         # reloj y coordinación de los módulos
│   └── comandos.js       # intérprete compartido por la consola y la web
├── web/                  # interfaz web: index.html, app.js, estilos.css
├── tests/                # pruebas automáticas
├── pruebas/              # guiones de comandos para la bitácora
├── cli.js                # consola de comandos
├── server.js             # servidor estático de la interfaz web
└── package.json
```

## Decisiones de diseño

- **Planificación:** Round Robin con quantum 3. La expropiación se resuelve al inicio del tick, así que un proceso que llega cuando otro agota su quantum queda antes en la cola, como en la presentación del curso.
- **Memoria:** asignación contigua dinámica con primer ajuste y fusión de huecos al liberar. No tiene fragmentación interna, pero sí puede tener fragmentación externa.
- **Sincronización:** semáforo binario con cola FIFO, que evita la inanición. Solo el proceso que está dentro puede hacer `signal`.
- **Deadlock:** detección con un grafo de espera sobre R1 y R2, y recuperación por terminación con `kill`. Con una sola instancia por recurso, un ciclo confirma el deadlock.
- **Arquitectura:** el núcleo en `src/` no imprime nada ni usa el navegador. La consola y la web pasan por el mismo intérprete, así que un comando hace lo mismo en las dos.
- **Sin dependencias:** uso JavaScript puro para que el proyecto se levante solo con Node. `server.js` existe porque Chrome no carga módulos desde `file://`.

## Autor

Luis Pablo de Jesús López Carrera, carné 7690-26-6662.

## Enlaces

- Video de demostración en YouTube: [PENDIENTE: enlace al video]
- Documento técnico en PDF: [PENDIENTE: enlace al documento]
