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

// --- 1. ACCEDER A LA RED PRIVADA Y CONSTRUIR MAPA CENTRALIZADO ---
  socket.on('unirse-a-sala', (datosDeEntrada) => {
    const codigoSala = datosDeEntrada.sala || datosDeEntrada;
    const apodoReal = datosDeEntrada.apodo || "Anon";

    socket.miRedActual = codigoSala;
    socket.miApodoEnRed = apodoReal;
    socket.join(codigoSala); 

    if (!redesOcupadas[codigoSala]) {
      // 1. Crear el objeto de la sala en el servidor
      redesOcupadas[codigoSala] = {
        hacker1: null, nombreH1: "Esperando...",
        hacker2: null, nombreH2: "Esperando...",
        hacker3: null, nombreH3: "Esperando...",
        hacker4: null, nombreH4: "Esperando...",
        contadorColor: 0,
        mapaUnicoServidor: [] // <-- AQUÍ SE GUARDARÁ EL LABERINTO OFICIAL
      };
      
      // 2. ¡EL SERVIDOR ESCULPE EL LABERINTO MATEMÁTICO ÚNICO!
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
      
      // Guardamos la matriz definitiva en la memoria del servidor para esa sala
      redesOcupadas[codigoSala].mapaUnicoServidor = matriz;
    }

    let red = redesOcupadas[codigoSala];

    // Asignación de ranuras (Mismo código de antes)
    if (red.hacker1 === null) { red.hacker1 = socket.id; red.nombreH1 = apodoReal; socket.miSlotAsignado = "hacker1"; }
    else if (red.hacker2 === null) { red.hacker2 = socket.id; red.nombreH2 = apodoReal; socket.miSlotAsignado = "hacker2"; }
    else if (red.hacker3 === null) { red.hacker3 = socket.id; red.nombreH3 = apodoReal; socket.miSlotAsignado = "hacker3"; }
    else if (red.hacker4 === null) { red.hacker4 = socket.id; red.nombreH4 = apodoReal; socket.miSlotAsignado = "hacker4"; }
    else { socket.miSlotAsignado = "espectador"; }

    socket.miNumeroColor = red.contadorColor % 7;
    red.contadorColor++;

    // NUEVO: Le enviamos a este jugador la lista de integrantes Y el mapa oficial del servidor
    socket.emit('recibir-mapa-sincronizado', { mapa: red.mapaUnicoServidor });

    io.to(codigoSala).emit('actualizar-lista-integrantes', {
      n1: red.nombreH1, n2: red.nombreH2, n3: red.nombreH3, n4: red.nombreH4,
      tuSlot: socket.miSlotAsignado
    });
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

// 1. ANTENA RECEPTORA MULTIJUGADOR: Sincroniza la lista de integrantes en los paneles
socket.on('actualizar-lista-integrantes', (datosSala) => {
  console.log("Lista de integrantes actualizada por red:", datosSala);
  
  // Inyectamos los apodos reales dentro de las ranuras correspondientes
  document.querySelector('#slot-cian-1 .nombre-slot').textContent = datosSala.n1;
  document.querySelector('#slot-azul-1 .nombre-slot').textContent = datosSala.n2;
  document.querySelector('#slot-cian-2 .nombre-slot').textContent = datosSala.n3;
  document.querySelector('#slot-azul-2 .nombre-slot').textContent = datosSala.n4;

  // Si el servidor nos asignó un slot de juego, configuramos nuestro bando automático
  if (datosSala.tuSlot && datosSala.tuSlot !== "espectador") {
    // Los slots 1 y 3 pertenecen al Clan Cian, el 2 y 4 al Clan Azul
    const miClanAsignado = (datosSala.tuSlot === "hacker1" || datosSala.tuSlot === "hacker3") ? "equipo-cian" : "equipo-azul";
    bandoAsignado = miClanAsignado;
    selectorBando.value = miClanAsignado; // Cambia el menú desplegable automáticamente
    dibujarLaberintoEnPantalla(); // Actualiza el radar según tu nuevo equipo
  }
});
