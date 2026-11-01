// Servidor estático de la interfaz web. No forma parte del kernel simulado.
// Existe porque Chrome no carga <script type="module"> desde file://, así que
// la página debe abrirse por http. Sirve la raíz del proyecto para que
// web/app.js pueda importar los módulos de ../src/.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = process.env.PORT || 3000;

// Solo se sirven estas extensiones. text/javascript es obligatorio para que el
// navegador acepte los módulos. Cualquier otro archivo (por ejemplo, lo que hay
// dentro de .git) responde 404.
const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

function responder(res, codigo, texto) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(texto);
}

// Convierte la URL en una ruta del disco. Devuelve null si la ruta sale de la
// raíz del proyecto; sin este control, /../../archivo leería todo el disco.
function resolverRuta(url) {
  let ruta = decodeURIComponent(url.split('?')[0]);
  if (ruta === '/') {
    ruta = '/web/index.html';
  }
  const completa = path.resolve(RAIZ, '.' + ruta);
  if (!completa.startsWith(RAIZ + path.sep)) {
    return null;
  }
  return completa;
}

const servidor = http.createServer(function (req, res) {
  // El try evita que una URL mal formada (como /%E0%A4%A) tumbe el servidor.
  try {
    const archivo = resolverRuta(req.url);
    const tipo = archivo === null ? undefined : TIPOS_MIME[path.extname(archivo)];
    if (tipo === undefined) {
      responder(res, 404, 'No encontrado');
      return;
    }
    fs.readFile(archivo, function (error, contenido) {
      if (error) {
        responder(res, 404, 'No encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': tipo });
      res.end(contenido);
    });
  } catch (error) {
    responder(res, 400, 'Solicitud inválida');
  }
});

// Sin este manejador, un puerto ocupado termina con un error difícil de leer.
servidor.on('error', function (error) {
  if (error.code === 'EADDRINUSE') {
    console.error('El puerto ' + PUERTO + ' está ocupado. Probá con otro: $env:PORT=3001; npm run web');
  } else {
    console.error('No se pudo iniciar el servidor: ' + error.message);
  }
  process.exit(1);
});

// Se escucha solo en este equipo: el simulador no necesita exponerse a la red.
servidor.listen(PUERTO, '127.0.0.1', function () {
  console.log('Simulador disponible en http://localhost:' + PUERTO);
});
