// ==========================================
// --- PARTE 1: VARIABLES GLOBAL MULTIJUGADOR ---
// ==========================================
const socket = io(); // Enlazado oficial al servidor

const TAMANO = 21; 
let bandoAsignado = "espectador";
let partidaIniciada = false;
let juegoTerminado = false;
let pasosDisponibles = 0; 
let dadoLanzadoEsteTurno = false; 

// Elementos del DOM - Capturas del Lobby
const pantallaLobby = document.getElementById('pantalla-lobby');
const contenedorPrincipal = document.getElementById('contenedor-principal');
const entradaSala = document.getElementById('entrada-sala');
const btnCrearCodigoSala = document.getElementById('btn-crear-codigo-sala');
const btnEntrarSala = document.getElementById('btn-entrar-sala');
const txtSalaActual = document.getElementById('txt-sala-actual');
const entradaApodo = document.getElementById('entrada-apodo');
const tableroLaberinto = document.getElementById('tablero-laberinto');

// Elementos del DOM - Barra de Herramientas y Módulo Dado
const btnIniciarPartida = document.getElementById('btn-iniciar-partida');
const btnReiniciar = document.getElementById('btn-reiniciar');
const selectorBando = document.getElementById('selector-bando');
const bandoActualTxt = document.getElementById('bando-actual');
const btnTirarDado = document.getElementById('btn-tirar-dado');
const cuboNeonDado = document.getElementById('cubo-neon-dado');
const visorAccionSistema = document.getElementById('visor-accion-sistema');

let matrizLaberinto = []; 
let ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
let indiceTurnoActual = 0; 
let historialPosiciones = {}; 

// Coordenadas fijas de los Avatares de Clan
let posicionesHackers = {
  "equipo-cian": { f: 0, c: 0, avatar: "💎", clase: "avatar-h1" },
  "equipo-azul": { f: 20, c: 20, avatar: "🔵", clase: "avatar-h2" }
};

let nodosDescubiertosCian = {};
let nodosDescubiertosAzul = {};

// --- CONTROL DE ACCESO ---
function generarCodigoSala() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let resultado = '';
  for (let i = 0; i < 5; i++) { resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length)); }
  return resultado;
}

btnCrearCodigoSala.addEventListener('click', () => entrarAlJuego(generarCodigoSala().toLowerCase()));
btnEntrarSala.addEventListener('click', () => {
  const codigo = entradaSala.value.trim().toLowerCase();
  if (codigo !== "") entrarAlJuego(codigo);
});

function entrarAlJuego(codigoSala) {
  pantallaLobby.classList.add('oculto');
  contenedorPrincipal.classList.remove('oculto');
  txtSalaActual.textContent = codigoSala.toUpperCase();
  
  const miAliasEscrito = entradaApodo.value.trim() || "Anon";
  
  // Enviamos los datos al servidor en internet
  socket.emit('unirse-a-sala', { sala: codigoSala, apodo: miAliasEscrito });
  
  // Le pedimos formalmente la matriz al servidor
  socket.emit('solicitar-mapa-inicial');
}


// ==========================================
// --- PARTE 2: MOTORES DE EXPLORACIÓN Y VISIÓN ---
// ==========================================

function calcularRangoRadarVision() {
  // Verificamos que la matriz ya exista antes de escanear radares
  if (matrizLaberinto.length === 0) return;

  const cian = posicionesHackers["equipo-cian"];
  const azul = posicionesHackers["equipo-azul"];
  const radioVisibilidad = 2;

  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      if (Math.abs(f - cian.f) <= radioVisibilidad && Math.abs(c - cian.c) <= radioVisibilidad) {
        nodosDescubiertosCian[`${f},${c}`] = true;
      }
      if (Math.abs(f - azul.f) <= radioVisibilidad && Math.abs(c - azul.c) <= radioVisibilidad) {
        nodosDescubiertosAzul[`${f},${c}`] = true;
      }
    }
  }
}

function dibujarLaberintoEnPantalla() {
  tableroLaberinto.innerHTML = "";
  if (matrizLaberinto.length === 0) return; // Candado de seguridad preventivo

  const centro = Math.floor(TAMANO / 2);

  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      const celdaDiv = document.createElement('div');
      celdaDiv.classList.add('celda', 'iluminada');
      celdaDiv.setAttribute('data-fila', f);
      celdaDiv.setAttribute('data-col', c);

      let celdaVisible = false;
      if (!partidaIniciada) {
        celdaVisible = true; // Visible completo antes del hackeo
      } else {
        if (bandoAsignado === "espectador") celdaVisible = true;
        if (bandoAsignado === "equipo-cian" && nodosDescubiertosCian[`${f},${c}`]) celdaVisible = true;
        if (bandoAsignado === "equipo-azul" && nodosDescubiertosAzul[`${f},${c}`]) celdaVisible = true;
        if (f === centro && c === centro) celdaVisible = true; // Faro central
      }

      if (!celdaVisible) {
        celdaDiv.classList.add('oscura'); 
      } else {
        if (matrizLaberinto[f][c] === 1) celdaDiv.classList.add('pared');
        else if (matrizLaberinto[f][c] === 2) { 
          celdaDiv.classList.add('nucleo-central'); 
          celdaDiv.textContent = "💾"; 
        }
      }

      for (let idClan in posicionesHackers) {
        const h = posicionesHackers[idClan];
        if (h.f === f && h.c === c && celdaVisible) {
          const avatarSpan = document.createElement('span');
          avatarSpan.classList.add('hacker-avatar', h.clase);
          avatarSpan.textContent = h.avatar;
          celdaDiv.appendChild(avatarSpan);
        }
      }
      celdaDiv.addEventListener('click', () => handleCasillaClick(f, c));
      tableroLaberinto.appendChild(celdaDiv);
    }
  }
}


// ==========================================
// --- PARTE 3: MOVIMIENTOS, DADOS Y ANTENAS INALÁMBRICAS ---
// ==========================================

function handleCasillaClick(fila, columna) {
  if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";
  const datosAvatarEquipo = posicionesHackers[clanActivo];

  if (bandoAsignado !== clanActivo) {
    alert(`No es tu turno. Esperando la transmisión de datos del otro bando.`);
    return;
  }

  if (!dadoLanzadoEsteTurno) {
    alert("Debes lanzar el Dado Táctico antes de realizar tus movimientos de red.");
    return;
  }

  if (matrizLaberinto[fila][columna] === 1) return;

  const difF = Math.abs(fila - datosAvatarEquipo.f);
  const difC = Math.abs(columna - datosAvatarEquipo.c);
  if ((difF + difC) !== 1) return;

  // Despachamos el paso por internet al servidor
  socket.emit('solicitar-movimiento-hacker', { clan: clanActivo, fDes: fila, cDes: columna });
}

function ejecutarMovimientoFisicoSincronizado(clan, fDes, cDes) {
  const datosAvatar = posicionesHackers[clan];
  historialPosiciones[clan] = { f: datosAvatar.f, c: datosAvatar.c };

  datosAvatar.f = fDes;
  datosAvatar.c = cDes;
  pasosDisponibles--;
  
  visorAccionSistema.textContent = `PASOS RESTANTES EN RED: ${pasosDisponibles}`;
  
  calcularRangoRadarVision(); 
  dibujarLaberintoEnPantalla();

  if (matrizLaberinto[fDes][cDes] === 2) {
    juegoTerminado = true;
    alert(`¡INFILTRACIÓN EXITOSA! ¡El núcleo central ha sido comprometido!`);
    return;
  }

  if (pasosDisponibles <= 0) {
    rotarTurnoElectronico();
  }
}

function rotarTurnoElectronico() {
  dadoLanzadoEsteTurno = false;
  pasosDisponibles = 0;
  cuboNeonDado.textContent = "--";
  cuboNeonDado.classList.remove('congelado', 'firewall');
  visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";

  indiceTurnoActual = (indiceTurnoActual + 1) % ordenTurnos.length;
  actualizarBrilloPanelesTurnos();
}

function actualizarBrilloPanelesTurnos() {
  // Limpiamos la luz neón de las 4 ranuras laterales
  document.getElementById('slot-cian-1').classList.remove('turno-activo');
  document.getElementById('slot-cian-2').classList.remove('turno-activo');
  document.getElementById('slot-azul-1').classList.remove('turno-activo');
  document.getElementById('slot-azul-2').classList.remove('turno-activo');

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  
  // Encendemos el neón únicamente en el slot que le toca hackear
  if (hackerIdActivo === "hacker1") document.getElementById('slot-cian-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker3") document.getElementById('slot-cian-2').classList.add('turno-activo');
  if (hackerIdActivo === "hacker2") document.getElementById('slot-azul-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker4") document.getElementById('slot-azul-2').classList.add('turno-activo');

  // Cambiar el letrero superior de la barra de forma limpia
  bandoActualTxt.textContent = hackerIdActivo.toUpperCase().replace("HACKER", "HACKER ");
}


// --- ESCUCHAS DE BOTONES DE BARRA DE CONTROL ---
btnTirarDado.addEventListener('click', () => {
  if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";

  if (bandoAsignado !== clanActivo) {
    alert("No es tu turno de lanzar el dado.");
    return;
  }

  if (dadoLanzadoEsteTurno) return;

  const resultadoDado = Math.floor(Math.random() * 6) + 1;
  socket.emit('solicitar-lanzamiento-dado', { numero: resultadoDado, clan: clanActivo });
});

btnIniciarPartida.addEventListener('click', () => {
  if (bandoAsignado === "espectador") {
    alert("Acceso denegado: Elige un equipo para iniciar el hackeo.");
    return;
  }
  const sorteoInicial = Math.random() > 0.5;
  socket.emit('solicitar-inicio-partida', { sorteoCian: sorteoInicial });
});

btnReiniciar.addEventListener('click', () => {
  if (bandoAsignado === "espectador") return;
  socket.emit('solicitar-reiniciar-red');
});

// ==========================================
// --- RECEPTORES SINTONIZADOS DE INTERNET ---
// ==========================================

socket.on('recibir-mapa-sincronizado', (datos) => {
  console.log("¡Mapa síncronizado recibido!");
  matrizLaberinto = datos.mapa;
  calcularRangoRadarVision();
  dibujarLaberintoEnPantalla();
});

socket.on('actualizar-lista-integrantes', (datosSala) => {
  // 1. Sincronizar los apodos en los cuadros laterales
  document.querySelector('#slot-cian-1 .nombre-slot').textContent = datosSala.n1;
  document.querySelector('#slot-azul-1 .nombre-slot').textContent = datosSala.n2;
  document.querySelector('#slot-cian-2 .nombre-slot').textContent = datosSala.n3;
  document.querySelector('#slot-azul-2 .nombre-slot').textContent = datosSala.n4;

  // 2. CORREGIDO: Solo te asigna equipo de forma estática la PRIMERA VEZ que entras de lobby
  if (datosSala.tuSlot && datosSala.tuSlot !== "espectador" && bandoAsignado === "espectador") {
    const miClanAsignado = (datosSala.tuSlot === "hacker1" || datosSala.tuSlot === "hacker3") ? "equipo-cian" : "equipo-azul";
    bandoAsignado = miClanAsignado;
    selectorBando.value = miClanAsignado; // Fija tu menú desplegable de forma permanente
    dibujarLaberintoEnPantalla();
  }
});


socket.on('servidor-retransmitir-dado', (datos) => {
  dadoLanzadoEsteTurno = true;
  cuboNeonDado.classList.remove('congelado', 'firewall');
  cuboNeonDado.textContent = datos.numero;

  if (datos.numero === 1) {
    cuboNeonDado.classList.add('congelado');
    visorAccionSistema.textContent = "SISTEMA CONGELADO ❄️ (PIERDES TURNO)";
    setTimeout(rotarTurnoElectronico, 1500); 
  } 
  else if (datos.numero === 6) {
    cuboNeonDado.classList.add('firewall');
    visorAccionSistema.textContent = "ALERTA FIREWALL 🛡️ (RETROCEDES 1 PASO)";
    if (historialPosiciones[datos.clan]) {
      posicionesHackers[datos.clan].f = historialPosiciones[datos.clan].f;
      posicionesHackers[datos.clan].c = historialPosiciones[datos.clan].c;
      calcularRangoRadarVision();
      dibujarLaberintoEnPantalla();
    }
    setTimeout(rotarTurnoElectronico, 1500);
  } 
  else if (datos.numero === 2 || datos.numero === 3) {
    pasosDisponibles = 1;
    visorAccionSistema.textContent = "AVANZA 1 NODO ⚙️";
  } 
  else {
    pasosDisponibles = 2;
    visorAccionSistema.textContent = "SOBRECARGA: AVANZA 2 NODOS ⚡";
  }
});

socket.on('servidor-retransmitir-movimiento', (datos) => {
  ejecutarMovimientoFisicoSincronizado(datos.clan, datos.fDes, datos.cDes);
});

socket.on('servidor-confirmar-inicio', (datos) => {
  partidaIniciada = true;
  btnIniciarPartida.classList.add('oculto');
  visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";

  if (datos.sorteoCian) {
    ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
    alert("⚡ [SORTEO]: ¡Equipo Cian toma la iniciativa! Turno de Hacker 1.");
  } else {
    ordenTurnos = ["hacker2", "hacker1", "hacker4", "hacker3"];
    alert("⚡ [SORTEO]: ¡Equipo Azul toma la iniciativa! Turno de Hacker 2.");
  }
  indiceTurnoActual = 0;
  dibujarLaberintoEnPantalla(); 
  actualizarBrilloPanelesTurnos();
});

socket.on('servidor-confirmar-reinicios', (datos) => {
  partidaIniciada = false; juegoTerminado = false;
  selectorBando.value = "espectador"; bandoAsignado = "espectador";
  indiceTurnoActual = 0; dadoLanzadoEsteTurno = false; pasosDisponibles = 0;
  cuboNeonDado.textContent = "--"; cuboNeonDado.classList.remove('congelado', 'firewall');
  visorAccionSistema.textContent = "ESPERANDO INICIO...";
  historialPosiciones = {};
  nodosDescubiertosCian = {}; nodosDescubiertosAzul = {}; 
  
  posicionesHackers["equipo-cian"] = { f: 0, c: 0, avatar: "💎", clase: "avatar-h1" };
  posicionesHackers["equipo-azul"] = { f: 20, c: 20, avatar: "🔵", clase: "avatar-h2" };
  btnIniciarPartida.classList.remove('oculto');
  
  matrizLaberinto = datos.nuevoMapa;
  calcularRangoRadarVision();
  dibujarLaberintoEnPantalla();
  actualizarBrilloPanelesTurnos();
  alert("La red se ha reiniciado por completo.");
});


// ==========================================
// --- RECEPTOR INALÁMBRICO DE MENSAJES DEL CHAT ---
// ==========================================
socket.on('recibir-mensaje', (datosRecibidos) => {
  const aliasActual = entradaApodo.value.trim() || "Anon";
  const prefijoBando = bandoAsignado === "equipo-cian" ? "💎" : (bandoAsignado === "equipo-azul" ? "🔵" : "👁️");
  const miFirmaCompleta = `${prefijoBando} ${aliasActual}`;

  // Si el mensaje es mío va a la derecha, si es del rival a la izquierda
  if (datosRecibidos.remitente === miFirmaCompleta) {
    agregarMensajeAlCuadro(datosRecibidos, "yo");
  } else {
    agregarMensajeAlCuadro(datosRecibidos, "oponente");
  }
});
