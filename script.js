// PARTE 1 DE 3: Inicialización, Elementos y Control del Lobby
// Captura de Elementos de Preparación y Control del Lobby

// =======================================================
// --- NEONHACKMAZE: MOTOR CLIENTE GLOBAL SINCRONIZADO ---
// =======================================================
// ==========================================
// --- PARTE 1: VARIABLES GLOBAL MULTIJUGADOR ---
// ==========================================
const socket = io(); // Enlazado inalámbrico oficial de Render

const TAMANO = 21; 
let bandoAsignado = "espectador";
let partidaIniciada = false;
let juegoTerminado = false;
let pasosDisponibles = 0; 
let dadoLanzadoEsteTurno = false; 

// Elementos del DOM - Fase 1 (Lobby Entrada)
const pantallaLobby = document.getElementById('pantalla-lobby');
const entradaSala = document.getElementById('entrada-sala');
const btnCrearCodigoSala = document.getElementById('btn-crear-codigo-sala');
const btnEntrarSala = document.getElementById('btn-entrar-sala');
const entradaApodo = document.getElementById('entrada-apodo');

// Elementos del DOM - Fase 2 (Lobby Espera / Slots)
const pantallaEsperaSlots = document.getElementById('pantalla-espera-slots');
const btnIniciarPartidaLobby = document.getElementById('btn-iniciar-partida-lobby');

// Elementos del DOM - Fase 3 (Tablero de Juego)
const contenedorPrincipal = document.getElementById('contenedor-principal');
const txtSalaActual = document.getElementById('txt-sala-actual');
const tableroLaberinto = document.getElementById('tablero-laberinto');
const btnReiniciar = document.getElementById('btn-reiniciar');
const bandoActualTxt = document.getElementById('bando-actual');
const btnTirarDado = document.getElementById('btn-tirar-dado');
const cuboNeonDado = document.getElementById('cubo-neon-dado');
const visorAccionSistema = document.getElementById('visor-accion-sistema');

// Elementos del DOM - Canal de Mensajes (Chat)
const mensajesChat = document.getElementById('mensajes-chat');
const entradaMensaje = document.getElementById('entrada-mensaje');
const btnEnviarChat = document.getElementById('btn-enviar-chat');

let matrizLaberinto = []; 
let ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
let indiceTurnoActual = 0; 
let historialPosiciones = {}; 

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
  pantallaEsperaSlots.classList.remove('oculto');
  
  const miAliasEscrito = entradaApodo.value.trim() || "Anon";
  const codigoMayusculas = codigoSala.toUpperCase();

  // Inyección robusta en las dos etiquetas
  const letreroTablero = document.getElementById('txt-sala-actual');
  const letreroLobbyEspera = document.getElementById('txt-sala-espera');
  
  if (letreroTablero) letreroTablero.textContent = codigoMayusculas;
  if (letreroLobbyEspera) letreroLobbyEspera.textContent = `RED: ${codigoMayusculas}`;

  // Emitimos los datos al servidor en Node.js
  socket.emit('unirse-a-sala', { sala: codigoSala, apodo: miAliasEscrito });
}


// PARTE 2 DE 3: Canal de Comunicación y Motores del Radar
// Canal de Mensajería, Radar y Renderizado del Laberinto

// --- CANAL DE COMUNICACIÓN (MESSAGING MOTOR) ---
function enviarMensajeTexto() {
  if (!entradaMensaje) return;
  const texto = entradaMensaje.value.trim();
  if (texto === "") return;

  const alias = entradaApodo.value.trim() || "Anon";
  const prefijoBando = bandoAsignado === "equipo-cian" ? "💎" : (bandoAsignado === "equipo-azul" ? "🔵" : "👁️");
  const nombreRemitente = `${prefijoBando} ${alias}`;
  
  const datos = { remitente: nombreRemitente, texto: texto, clanEmisor: bandoAsignado };
  socket.emit('enviar-mensaje', datos);
  entradaMensaje.value = "";
}

if (btnEnviarChat) btnEnviarChat.addEventListener('click', enviarMensajeTexto);
if (entradaMensaje) entradaMensaje.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensajeTexto(); });

function agregarMensajeAlCuadro(datos, claseOrigen) {
  if (!mensajesChat) return;
  const div = document.createElement('div');
  div.classList.add('mensaje', claseOrigen);
  
  const colorAsignado = (datos.numColor !== undefined) ? datos.numColor : 0;
  div.classList.add(`msg-neon-${colorAsignado}`);

  let textoFinal = datos.texto;
  if (bandoAsignado !== "espectador" && datos.clanEmisor !== "espectador" && datos.clanEmisor !== bandoAsignado) {
    const simbolos = ["#", "$", "@", "&", "%", "*", "!", "?", "X", "Z"];
    textoFinal = datos.texto.split('').map(() => simbolos[Math.floor(Math.random() * simbolos.length)]).join('');
  }
  
  div.innerHTML = `<span class="remitente">[${datos.remitente}]:</span> <span class="cuerpo-msg">${textoFinal}</span>`;
  mensajesChat.appendChild(div);
  mensajesChat.scrollTop = mensajesChat.scrollHeight;
}

// --- MOTORES DE EXPLORACIÓN RADAR ---
function calcularRangoRadarVision() {
  if (matrizLaberinto.length === 0) return;
  const cian = posicionesHackers["equipo-cian"];
  const azul = posicionesHackers["equipo-azul"];
  const radioVisibilidad = 2;

  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      if (Math.abs(f - cian.f) <= radioVisibilidad && Math.abs(c - cian.c) <= radioVisibilidad) nodosDescubiertosCian[`${f},${c}`] = true;
      if (Math.abs(f - azul.f) <= radioVisibilidad && Math.abs(c - azul.c) <= radioVisibilidad) nodosDescubiertosAzul[`${f},${c}`] = true;
    }
  }
}

function dibujarLaberintoEnPantalla() {
  if (!tableroLaberinto || matrizLaberinto.length === 0) return;
  tableroLaberinto.innerHTML = "";
  const centro = Math.floor(TAMANO / 2);

  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      const celdaDiv = document.createElement('div');
      celdaDiv.classList.add('celda', 'iluminada');
      celdaDiv.setAttribute('data-fila', f);
      celdaDiv.setAttribute('data-col', c);

      let celdaVisible = false;
      if (!partidaIniciada) celdaVisible = true;
      else {
        if (bandoAsignado === "espectador") celdaVisible = true;
        if (bandoAsignado === "equipo-cian" && nodosDescubiertosCian[`${f},${c}`]) celdaVisible = true;
        if (bandoAsignado === "equipo-azul" && nodosDescubiertosAzul[`${f},${c}`]) celdaVisible = true;
        if (f === centro && c === centro) celdaVisible = true;
      }

      if (!celdaVisible) {
        celdaDiv.classList.add('oscura'); 
      } else {
        if (matrizLaberinto[f][c] === 1) celdaDiv.classList.add('pared');
        else if (matrizLaberinto[f][c] === 2) { celdaDiv.classList.add('nucleo-central'); celdaDiv.textContent = "💾"; }
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


//PARTE 3 DE 3: Movimientos, Dados e Inalámbricos Sockets
//Clics de Casillas, Botones y Nuevas Antenas del Servidor

// --- MOVIMIENTOS POR INTERNET ---
function handleCasillaClick(fila, columna) {
  if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;
  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";
  const datosAvatarEquipo = posicionesHackers[clanActivo];

  if (bandoAsignado !== clanActivo || !dadoLanzadoEsteTurno) return;
  if (matrizLaberinto[fila][columna] === 1) return;

  const difF = Math.abs(fila - datosAvatarEquipo.f);
  const difC = Math.abs(columna - datosAvatarEquipo.c);
  if ((difF + difC) !== 1) return;

  socket.emit('solicitar-movimiento-hacker', { clan: clanActivo, fDes: fila, cDes: columna });
}

function ejecutarMovimientoFisicoSincronizado(clan, fDes, cDes) {
  const datosAvatar = posicionesHackers[clan];
  historialPosiciones[clan] = { f: datosAvatar.f, c: datosAvatar.c };
  datosAvatar.f = fDes; datosAvatar.c = cDes;
  pasosDisponibles--;
  if (visorAccionSistema) visorAccionSistema.textContent = `PASOS RESTANTES EN RED: ${pasosDisponibles}`;
  calcularRangoRadarVision(); 
  dibujarLaberintoEnPantalla();

  if (matrizLaberinto[fDes][cDes] === 2) {
    juegoTerminado = true;
    alert(`¡INFILTRACIÓN EXITOSA! ¡El núcleo central ha sido comprometido!`);
    return;
  }
  if (pasosDisponibles <= 0) rotarTurnoElectronico();
}

function rotarTurnoElectronico() {
  dadoLanzadoEsteTurno = false; pasosDisponibles = 0;
  if (cuboNeonDado) { cuboNeonDado.textContent = "--"; cuboNeonDado.classList.remove('congelado', 'firewall'); }
  if (visorAccionSistema) visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";
  indiceTurnoActual = (indiceTurnoActual + 1) % ordenTurnos.length;
  actualizarBrilloPanelesTurnos();
}

function actualizarBrilloPanelesTurnos() {
  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  if (bandoActualTxt) bandoActualTxt.textContent = hackerIdActivo.toUpperCase().replace("HACKER", "HACKER ");
}

// --- CONECTAR LOS 4 BOTONES INTERACTIVOS DEL LOBBY DE ESPERA ---
const botonesSlots = document.querySelectorAll('.btn-ocupar-slot');
botonesSlots.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (bandoAsignado !== "espectador") return;
    const idSlotPresionado = e.currentTarget.id.replace("action-", "");
    const clanElegido = (idSlotPresionado === "hacker1" || idSlotPresionado === "hacker3") ? "equipo-cian" : "equipo-azul";
    socket.emit('solicitar-ocupar-slot-servidor', { slot: idSlotPresionado, clan: clanElegido });
  });
});

if (btnIniciarPartidaLobby) {
  btnIniciarPartidaLobby.addEventListener('click', () => {
    if (bandoAsignado === "espectador") {
      alert("Acceso denegado: Debes asegurar y ocupar una ranura de hacker antes de iniciar la secuencia.");
      return;
    }
    socket.emit('solicitar-inicio-partida', { sorteoCian: Math.random() > 0.5 });
  });
}

if (btnReiniciar) {
  btnReiniciar.addEventListener('click', () => {
    if (bandoAsignado === "espectador") return;
    socket.emit('solicitar-reiniciar-red');
  });
}

if (btnTirarDado) {
  btnTirarDado.addEventListener('click', () => {
    if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;
    const hackerIdActivo = ordenTurnos[indiceTurnoActual];
    const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";
    if (bandoAsignado !== clanActivo || dadoLanzadoEsteTurno) return;

    const resultadoDado = Math.floor(Math.random() * 6) + 1;
    socket.emit('solicitar-lanzamiento-dado', { numero: resultadoDado, clan: clanActivo });
  });
}

// ==========================================
// --- RECEPTORES SINTONIZADOS MULTIJUGADOR ---
// ==========================================

socket.on('recibir-mapa-sincronizado', (datos) => {
  matrizLaberinto = datos.mapa;
});

socket.on('actualizar-slots-preparacion', (datosSlots) => {
  console.log("Estado de slots recibido:", datosSlots);
  for (let idSlot in datosSlots) {
    const btnFisico = document.getElementById(`action-${idSlot}`);
    if (!btnFisico) continue;

    if (datosSlots[idSlot] !== null) {
      btnFisico.classList.add('ocupado');
      btnFisico.textContent = datosSlots[idSlot].toUpperCase(); 
    } else {
      btnFisico.classList.remove('ocupado');
      btnFisico.textContent = `OCUPAR ${idSlot.toUpperCase().replace("HACKER", "HACKER ")}`;
    }
  }
});

socket.on('confirmar-tu-slot-asignado', (datos) => {
  bandoAsignado = datos.clan;
  alert(`[CONEXIÓN SECURE]: Has tomado control de la ranura: ${datos.slot.toUpperCase()}`);
});

socket.on('recibir-mensaje', (datos) => {
  const aliasActual = entradaApodo.value.trim() || "Anon";
  const prefijoBando = bandoAsignado === "equipo-cian" ? "💎" : (bandoAsignado === "equipo-azul" ? "🔵" : "👁️");
  const miFirmaCompleta = `${prefijoBando} ${aliasActual}`;
  if (datos.remitente === miFirmaCompleta) agregarMensajeAlCuadro(datos, "yo");
  else agregarMensajeAlCuadro(datos, "oponente");
});

socket.on('servidor-retransmitir-dado', (datos) => {
  dadoLanzadoEsteTurno = true;
  if (cuboNeonDado) { cuboNeonDado.classList.remove('congelado', 'firewall'); cuboNeonDado.textContent = datos.numero; }

  if (datos.numero === 1) {
    if (cuboNeonDado) cuboNeonDado.classList.add('congelado');
    if (visorAccionSistema) visorAccionSistema.textContent = "SISTEMA CONGELADO ❄️ (PIERDES TURNO)";
    setTimeout(rotarTurnoElectronico, 1500); 
  } 
  else if (datos.numero === 6) {
    if (cuboNeonDado) cuboNeonDado.classList.add('firewall');
    if (visorAccionSistema) visorAccionSistema.textContent = "ALERTA FIREWALL 🛡️ (RETROCEDES 1 PASO)";
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
    if (visorAccionSistema) visorAccionSistema.textContent = "AVANZA 1 NODO ⚙️";
  } 
  else {
    pasosDisponibles = 2;
    if (visorAccionSistema) visorAccionSistema.textContent = "SOBRECARGA: AVANZA 2 NODOS ⚡";
  }
});

socket.on('servidor-retransmitir-movimiento', (datos) => { ejecutarMovimientoFisicoSincronizado(datos.clan, datos.fDes, datos.cDes); });

socket.on('servidor-confirmar-inicio', (datos) => {
  partidaIniciada = true; 
  if (pantallaEsperaSlots) pantallaEsperaSlots.classList.add('oculto'); 
  if (contenedorPrincipal) contenedorPrincipal.classList.remove('oculto'); 
  
  if (visorAccionSistema) visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";
  if (datos.sorteoCian) ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
  else ordenTurnos = ["hacker2", "hacker1", "hacker4", "hacker3"];
  indiceTurnoActual = 0;
  
  calcularRangoRadarVision();
  dibujarLaberintoEnPantalla(); 
  actualizarBrilloPanelesTurnos();
});

socket.on('servidor-confirmar-reinicios', (datos) => {
  partidaIniciada = false; juegoTerminado = false; bandoAsignado = "espectador";
  indiceTurnoActual = 0; dadoLanzadoEsteTurno = false; pasosDisponibles = 0;
  if (cuboNeonDado) { cuboNeonDado.textContent = "--"; cuboNeonDado.classList.remove('congelado', 'firewall'); }
  if (visorAccionSistema) visorAccionSistema.textContent = "ESPERANDO INICIO...";
  historialPosiciones = {}; nodosDescubiertosCian = {}; nodosDescubiertosAzul = {}; 
  
  posicionesHackers["equipo-cian"] = { f: 0, c: 0, avatar: "💎", clase: "avatar-h1" };
  posicionesHackers["equipo-azul"] = { f: 20, c: 20, avatar: "🔵", clase: "avatar-h2" };
  
  if (contenedorPrincipal) contenedorPrincipal.classList.add('oculto');
  if (pantallaEsperaSlots) pantallaEsperaSlots.classList.remove('oculto');
  
  matrizLaberinto = datos.nuevoMapa;
  alert("La red se ha reiniciado por completo.");
});

