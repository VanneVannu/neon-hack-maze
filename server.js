const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

// Servir los archivos físicos del juego (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Base de datos temporal en la memoria RAM para registrar las salas privadas activas
let redesOcupadas = {};

io.on('connection', (socket) => {
  console.log(`[CONEXIÓN]: Nuevo terminal enlazado al sistema -> ID: ${socket.id}`);

   // --- 1. ACCEDER A UN NODO DE RED PRIVADO Y REGISTRAR PARTICIPANTES ---
  socket.on('unirse-a-sala', (datosDeEntrada) => {
    // Soportamos que datosDeEntrada sea solo el código o un objeto: { sala: "e33mu", apodo: "Anon" }
    const codigoSala = datosDeEntrada.sala || datosDeEntrada;
    const apodoReal = datosDeEntrada.apodo || "Anon";

    socket.miRedActual = codigoSala;
    socket.miApodoEnRed = apodoReal;
    socket.join(codigoSala); 

    if (!redesOcupadas[codigoSala]) {
      redesOcupadas[codigoSala] = {
        hacker1: null, nombreH1: "Esperando...",
        hacker2: null, nombreH2: "Esperando...",
        hacker3: null, nombreH3: "Esperando...",
        hacker4: null, nombreH4: "Esperando...",
        contadorColor: 0
      };
    }

    let red = redesOcupadas[codigoSala];

    // Asignación automática de ranura (slot) libre por orden de llegada al nodo
    if (red.hacker1 === null) { red.hacker1 = socket.id; red.nombreH1 = apodoReal; socket.miSlotAsignado = "hacker1"; }
    else if (red.hacker2 === null) { red.hacker2 = socket.id; red.nombreH2 = apodoReal; socket.miSlotAsignado = "hacker2"; }
    else if (red.hacker3 === null) { red.hacker3 = socket.id; red.nombreH3 = apodoReal; socket.miSlotAsignado = "hacker3"; }
    else if (red.hacker4 === null) { red.hacker4 = socket.id; red.nombreH4 = apodoReal; socket.miSlotAsignado = "hacker4"; }
    else { socket.miSlotAsignado = "espectador"; } // Si está lleno, entra como espectador

    socket.miNumeroColor = red.contadorColor % 7;
    red.contadorColor++;

    // Transmitir de inmediato la lista de integrantes en tiempo real a toda la sala
    io.to(codigoSala).emit('actualizar-lista-integrantes', {
      n1: red.nombreH1, n2: red.nombreH2, n3: red.nombreH3, n4: red.nombreH4,
      tuSlot: socket.miSlotAsignado
    });

    console.log(`[NODO]: ${apodoReal} asignado al slot ${socket.miSlotAsignado} en la sala ${codigoSala}`);
  });


  // --- 2. CANAL DE COMUNICACIÓN (CHAT MULTICOLOR) ---
  socket.on('enviar-mensaje', (datosMensaje) => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      // Le inyectamos el color neón asignado al mensaje antes de retransmitirlo
      datosMensaje.numColor = socket.miNumeroColor;
      
      // Emitimos a todos los terminales enlazados a ese mismo nodo de acceso
      io.to(redNombre).emit('recibir-mensaje', datosMensaje);
    }
  });

  // --- 3. DESCONEXIÓN DEL TERMINAL ---
    socket.on('disconnect', () => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      let red = redesOcupadas[redNombre];
      if (red.hacker1 === socket.id) { red.hacker1 = null; red.nombreH1 = "Esperando..."; }
      if (red.hacker2 === socket.id) { red.hacker2 = null; red.nombreH2 = "Esperando..."; }
      if (red.hacker3 === socket.id) { red.hacker3 = null; red.nombreH3 = "Esperando..."; }
      if (red.hacker4 === socket.id) { red.hacker4 = null; red.nombreH4 = "Esperando..."; }

      io.to(redNombre).emit('actualizar-lista-integrantes', {
        n1: red.nombreH1, n2: red.nombreH2, n3: red.nombreH3, n4: red.nombreH4
      });
    }
  });

});

// Encender los motores del servidor de internet
http.listen(PORT, () => {
  console.log(`[SERVIDOR]: NeonHackMaze operativo en puerto de red -> ${PORT}`);
});

