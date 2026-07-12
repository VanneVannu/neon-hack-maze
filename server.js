const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

let redesOcupadas = {};

// FUNCIÓN REUTILIZABLE PARA CREAR EL LABERINTO SIN DUPLICAR CÓDIGO
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

io.on('connection', (socket) => {
  console.log(`[CONEXIÓN]: ID: ${socket.id}`);

  socket.on('unirse-a-sala', (datosDeEntrada) => {
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
        contadorColor: 0,
        mapaUnicoServidor: esculpirLaberintoMatematico() // Genera el primer mapa
      };
    }

    let red = redesOcupadas[codigoSala];

    if (red.hacker1 === null) { red.hacker1 = socket.id; red.nombreH1 = apodoReal; socket.miSlotAsignado = "hacker1"; }
    else if (red.hacker2 === null) { red.hacker2 = socket.id; red.nombreH2 = apodoReal; socket.miSlotAsignado = "hacker2"; }
    else if (red.hacker3 === null) { red.hacker3 = socket.id; red.nombreH3 = apodoReal; socket.miSlotAsignado = "hacker3"; }
    else if (red.hacker4 === null) { red.hacker4 = socket.id; red.nombreH4 = apodoReal; socket.miSlotAsignado = "hacker4"; }
    else { socket.miSlotAsignado = "espectador"; }

    socket.miNumeroColor = red.contadorColor % 7;
    red.contadorColor++;

    socket.emit('recibir-mapa-sincronizado', { mapa: red.mapaUnicoServidor });

    io.to(codigoSala).emit('actualizar-lista-integrantes', {
      n1: red.nombreH1, n2: red.nombreH2, n3: red.nombreH3, n4: red.nombreH4,
      tuSlot: socket.miSlotAsignado
    });
  });

  socket.on('enviar-mensaje', (datosMensaje) => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      datosMensaje.numColor = socket.miNumeroColor;
      io.to(redNombre).emit('recibir-mensaje', datosMensaje);
    }
  });

  socket.on('solicitar-lanzamiento-dado', (datosDado) => {
    if (socket.miRedActual) io.to(socket.miRedActual).emit('servidor-retransmitir-dado', datosDado);
  });

  socket.on('solicitar-movimiento-hacker', (datosMovimiento) => {
    if (socket.miRedActual) io.to(socket.miRedActual).emit('servidor-retransmitir-movimiento', datosMovimiento);
  });

  socket.on('solicitar-inicio-partida', (datosSorteo) => {
    if (socket.miRedActual) io.to(socket.miRedActual).emit('servidor-confirmar-inicio', datosSorteo);
  });

  socket.on('solicitar-reiniciar-red', () => {
    const redNombre = socket.miRedActual;
    if (redNombre && redesOcupadas[redNombre]) {
      // Esculpimos una revancha limpia usando la función optimizada
      redesOcupadas[redNombre].mapaUnicoServidor = esculpirLaberintoMatematico();
      io.to(redNombre).emit('servidor-confirmar-reinicios', { nuevoMapa: redesOcupadas[redNombre].mapaUnicoServidor });
    }
  });

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

http.listen(PORT, () => { console.log(`NeonHackMaze activo en puerto -> ${PORT}`); });
