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

  // --- 1. ACCEDER A UN NODO DE RED PRIVADO ---
  socket.on('unirse-a-sala', (codigoSala) => {
    socket.miRedActual = codigoSala;
    socket.join(codigoSala); // Unir el dispositivo a la habitación digital oficial

    if (!redesOcupadas[codigoSala]) {
      // Si la red es nueva, creamos su registro de memoria base
      redesOcupadas[codigoSala] = {
        hacker1: null, nombreH1: null,
        hacker2: null, nombreH2: null,
        hacker3: null, nombreH3: null,
        hacker4: null, nombreH4: null,
        contadorColor: 0,
        mapaLogico: null,
        partidaIniciada: false,
        ordenTurnosServidor: null,
        indiceTurnoServidor: 0
      };
    }

    // Repartidor infinito de 7 colores neón para el chat
    socket.miNumeroColor = redesOcupadas[codigoSala].contadorColor % 7;
    redesOcupadas[codigoSala].contadorColor++;

    console.log(`[NODO]: Terminal ${socket.id} ingresó a la red: ${codigoSala.toUpperCase()} con color neón: ${socket.miNumeroColor}`);
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
    console.log(`[DESCONEXIÓN]: Terminal desconectado -> ID: ${socket.id}`);
    // Aquí limpiaremos más adelante los slots si un jugador cierra la pestaña
  });
});

// Encender los motores del servidor de internet
http.listen(PORT, () => {
  console.log(`[SERVIDOR]: NeonHackMaze operativo en puerto de red -> ${PORT}`);
});
