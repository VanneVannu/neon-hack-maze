const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

let redesOcupadas = {};

// FUNCIÓN GENERADORA DEL LABERINTO PROCEDURAL 21X21
function esculpirLaberintoMatematico() {
  const TAM = 21;
  let matriz = [];
  for (let f = 0; f < TAM; f++) {
    matriz[f] = [];
    for (let c = 0; c < TAM; c++) { matriz[f][c] = 1; }
  }
  let pila = [];
  let fActual = 0, cActual = 0;
  matriz[fActual][cActual] = 0;
  
  while (true) {
    let vecinos = [];
    const direcciones = [{ df: -2, dc: 0 }, { df: 2, dc: 0 }, { df: 0, dc: -2 }, { df: 0, dc: 2 }];
    direcciones.forEach(d => {
      let nvF = fActual + d.df, nvC = cActual + d.dc;
      if (nvF >= 0 && nvF < TAM && nvC >= 0 && nvC < TAM) {
        if (matriz[nvF][nvC] === 1) vecinos.push({ f: nvF, c: nvC, df: d.df, dc: d.dc });
      }
    });

    if (vecinos.length > 0) {
      let elegido = vecinos[Math.floor(Math.random() * vecinos.length)];
      matriz[fActual + elegido.df / 2][cActual + elegido.dc / 2] = 0;
      matriz[elegido.f][elegido.c] = 0;
      pila.push({ f: fActual, c: cActual });
      fActual = elegido.f; cActual = elegido.c;
    } else if (pila.length > 0) {
      let anterior = pila.pop();
      fActual = anterior.f; cActual = anterior.c;
    } else { break; }
  }

  const centro = Math.floor(TAM / 2); 
  matriz[centro][centro] = 2; 
  matriz[centro-1][centro] = 0; matriz[centro+1][centro] = 0;
  matriz[centro][centro-1] = 0; matriz[centro][centro+1] = 0;
  
  for (let f = 0; f <= 1; f++) { for (let c = 0; c <= 1; c++) { matriz[f][c] = 0; } }
  for (let f = TAM - 2; f < TAM; f++) { for (let c = TAM - 2; c < TAM; c++) { matriz[f][c] = 0; } }
  
  return matriz;
}

// === CONECTOR CENTRAL DE RED DE INTERNET ===
io.on('connection', (socket) => {
  console.log(`[CONEXIÓN]: Terminal enlazado -> ID: ${socket.id}`);

  // --- 1. ACCEDER AL NODO DE RED PRIVADO ---
  socket.on('unirse-a-sala', (datosDeEntrada) => {
    const codigoSala = datosDeEntrada.sala || datosDeEntrada;
    const apodoReal = datosDeEntrada.apodo || "Anon";

    socket.miRedActual = codigoSala;
    socket.miApodoEnRed = apodoReal;
    socket.join(codigoSala); 

    if (!redesOcupadas[codigoSala]) {
      redesOcupadas[codigoSala] = {
        hacker1: null, nombreH1: null,
        hacker2: null, nombreH2: null,
        hacker3: null, nombreH3: null,
        hacker4: null, nombreH4: null,
        contadorColor: 0,
        mapaUnicoServidor: esculpirLaberintoMatematico()
      };
    }

    let red = redesOcupadas[codigoSala];

    socket.miNumeroColor = red.contadorColor % 7;
    red.contadorColor++;

    // Despachar el mapa de inmediato al terminal
    socket.emit('recibir-mapa-sincronizado', { mapa: red.mapaUnicoServidor });

    // Informar el estado actual de los 4 slots de preparación para pintar los botones
    socket.emit('actualizar-slots-preparacion', {
      hacker1: red.nombreH1, hacker2: red.nombreH2, hacker3: red.nombreH3, hacker4: red.nombreH4
    });
  });

  // --- 2. NUEVO: APARTAR Y BLOQUEAR RANURA DE INFILTRACIÓN SELECCIONADA ---
  socket.on('solicitar-ocupar-slot-servidor', (datos) => {
    const redNombre = socket.miRedActual;
    if (!redNombre || !redesOcupadas[redNombre]) return;

    let red = redesOcupadas[redNombre];
    const slotPedido = datos.slot; // "hacker1", "hacker2", etc.
    const clanPedido = datos.clan; // "equipo-cian", "equipo-azul"

    // Validamos que el slot esté verdaderamente vacío en el servidor
    if (red[slotPedido] === null) {
      // Registramos el ID y el apodo del Hacker en la memoria RAM
      red[slotPedido] = socket.id;
      
      if (slotPedido === "hacker1") red.nombreH1 = socket.miApodoEnRed;
      if (slotPedido === "hacker2") red.nombreH2 = socket.miApodoEnRed;
      if (slotPedido === "hacker3") red.nombreH3 = socket.miApodoEnRed;
      if (slotPedido === "hacker4") red.nombreH4 = socket.miApodoEnRed;

      socket.miSlotOcupadoFisico = slotPedido;

      // 1. Confirmar de forma privada al jugador que su bando ha sido asegurado
      socket.emit('confirmar-tu-slot-asignado', { slot: slotPedido, clan: clanPedido });

      // 2. Retransmitir a TODOS el nuevo mapa de botones verdes neón ocupados
      io.to(redNombre).emit('actualizar-slots-preparacion', {
        hacker1: red.nombreH1, hacker2: red.nombreH2, hacker3: red.nombreH3, hacker4: red.nombreH4
      });
    }
  });

  // --- 3. CANAL DE COMUNICACIÓN (CHAT MULTICOLOR ENCRIPTADO) ---
  socket.on('enviar-mensaje', (datosMensaje) => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      datosMensaje.numColor = socket.miNumeroColor;
      io.to(redNombre).emit('recibir-mensaje', datosMensaje);
    }
  });

  // --- 4. ACCIONES DE JUEGO MULTIJUGADOR ---
  socket.on('solicitar-lanzamiento-dado', (datosDado) => {
    if (socket.miRedActual) io.to(socket.miRedActual).emit('servidor-retransmitir-dado', datosDado);
  });

  socket.on('solicitar-movimiento-hacker', (datosMovimiento) => {
    if (socket.miRedActual) io.to(socket.miRedActual).emit('servidor-retransmitir-movimiento', datosMovimiento);
  });

    // --- 5. MODIFICADO: RETRANSMITIR INICIO ADJUNTANDO LOS NOMBRES DE LA SALA ---
  socket.on('solicitar-inicio-partida', (datosSorteo) => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      let red = redesOcupadas[redNombre];

      // Acoplamos los nombres de los 4 slots al paquete de inicio
      datosSorteo.n1 = red.nombreH1 || "Esperando...";
      datosSorteo.n2 = red.nombreH2 || "Esperando...";
      datosSorteo.n3 = red.nombreH3 || "Esperando...";
      datosSorteo.n4 = red.nombreH4 || "Esperando...";

      // Enviamos el disparo de inicio con los alias incluidos
      io.to(redNombre).emit('servidor-confirmar-inicio', datosSorteo);
    }
  });


  socket.on('solicitar-reiniciar-red', () => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      let red = redesOcupadas[redNombre];
      
      // Vaciamos los slots del servidor para obligar a re-elegir bando en la revancha
      red.hacker1 = null; red.nombreH1 = null;
      red.hacker2 = null; red.nombreH2 = null;
      red.hacker3 = null; red.nombreH3 = null;
      red.hacker4 = null; red.nombreH4 = null;
      red.mapaUnicoServidor = esculpirLaberintoMatematico();

      io.to(redNombre).emit('servidor-confirmar-reinicios', { nuevoMapa: red.mapaUnicoServidor });
    }
  });

  // --- 6. DESCONEXIÓN LIMPIA DE TERMINALES ---
  socket.on('disconnect', () => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      let red = redesOcupadas[redNombre];
      const slot = socket.miSlotOcupadoFisico;

      if (slot) {
        red[slot] = null;
        if (slot === "hacker1") red.nombreH1 = null;
        if (slot === "hacker2") red.nombreH2 = null;
        if (slot === "hacker3") red.nombreH3 = null;
        if (slot === "hacker4") red.nombreH4 = null;

        io.to(redNombre).emit('actualizar-slots-preparacion', {
          hacker1: red.nombreH1, hacker2: red.nombreH2, hacker3: red.nombreH3, hacker4: red.nombreH4
        });
      }
    }
    console.log(`[DESCONEXIÓN]: Terminal liberado -> ID: ${socket.id}`);
  });
});

http.listen(PORT, () => {
  console.log(`[SERVIDOR]: NeonHackMaze operativo en puerto -> ${PORT}`);
});
