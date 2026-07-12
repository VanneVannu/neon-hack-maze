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

// === EL GRAN CONECTOR GENERAL (TODO DEBE VIVIR AQUÍ ADENTRO) ===
io.on('connection', (socket) => {
  console.log(`[CONEXIÓN]: Nuevo terminal enlazado al sistema -> ID: ${socket.id}`);

  // --- 1. ACCEDER A LA RED PRIV PRIVADA Y CONSTRUIR MAPA CENTRALIZADO ---
  socket.on('unirse-a-sala', (datosDeEntrada) => {
    const codigoSala = datosDeEntrada.sala || datosDeEntrada;
    const apodoReal = datosDeEntrada.apodo || "Anon";

    socket.miRedActual = codigoSala;
    socket.miApodoEnRed = apodoReal;
    socket.join(codigoSala); 

    if (!redesOcupadas[codigoSala]) {
      // Crear el objeto de la sala en el servidor si es nueva
      redesOcupadas[codigoSala] = {
        hacker1: null, nombreH1: "Esperando...",
        hacker2: null, nombreH2: "Esperando...",
        hacker3: null, nombreH3: "Esperando...",
        hacker4: null, nombreH4: "Esperando...",
        contadorColor: 0,
        mapaUnicoServidor: [] 
      };
      
      // EL SERVIDOR ESCULPE EL LABERINTO MATEMÁTICO ÚNICO DE 21X21
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
      
      redesOcupadas[codigoSala].mapaUnicoServidor = matriz;
    }

    let red = redesOcupadas[codigoSala];

    // Asignación de ranuras automáticas por orden de llegada al nodo
    if (red.hacker1 === null) { red.hacker1 = socket.id; red.nombreH1 = apodoReal; socket.miSlotAsignado = "hacker1"; }
    else if (red.hacker2 === null) { red.hacker2 = socket.id; red.nombreH2 = apodoReal; socket.miSlotAsignado = "hacker2"; }
    else if (red.hacker3 === null) { red.hacker3 = socket.id; red.nombreH3 = apodoReal; socket.miSlotAsignado = "hacker3"; }
    else if (red.hacker4 === null) { red.hacker4 = socket.id; red.nombreH4 = apodoReal; socket.miSlotAsignado = "hacker4"; }
    else { socket.miSlotAsignado = "espectador"; }

    socket.miNumeroColor = red.contadorColor % 7;
    red.contadorColor++;

    // 1. Le enviamos el mapa idéntico del servidor exclusivamente al jugador que acaba de entrar
    socket.emit('recibir-mapa-sincronizado', { mapa: red.mapaUnicoServidor });

    // 2. Le avisamos a TODOS en la sala cómo quedó la lista de integrantes conectada
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
      datosMensaje.numColor = socket.miNumeroColor;
      io.to(redNombre).emit('recibir-mensaje', datosMensaje);
    }
  });

  // --- 3. DESCONEXIÓN LIMPIA DE SLOTS ---
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
    console.log(`[DESCONEXIÓN]: Terminal desconectado -> ID: ${socket.id}`);
  });
});

// Encender los motores del servidor
http.listen(PORT, () => {
  console.log(`[SERVIDOR]: NeonHackMaze operativo en puerto de red -> ${PORT}`);
});
