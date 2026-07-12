// PARTE 1 DE 3: Inicialización, Elementos y Control del Lobby

// =======================================================
// --- NEONHACKMAZE: MOTOR CLIENTE GLOBAL SINCRONIZADO ---
// =======================================================
const socket = io(); // Enlace inalámbrico oficial

const TAMANO = 21; 
let bandoAsignado = "espectador";
let partidaIniciada = false;
let juegoTerminado = false;
let pasosDisponibles = 0; 
let dadoLanzadoEsteTurno = false; 

// Capturas del DOM - Lobby
const pantallaLobby = document.getElementById('pantalla-lobby');
const contenedorPrincipal = document.getElementById('contenedor-principal');
const entradaSala = document.getElementById('entrada-sala');
const btnCrearCodigoSala = document.getElementById('btn-crear-codigo-sala');
const btnEntrarSala = document.getElementById('btn-entrar-sala');
const txtSalaActual = document.getElementById('txt-sala-actual');
const entradaApodo = document.getElementById('entrada-apodo');
const tableroLaberinto = document.getElementById('tablero-laberinto');

// Capturas del DOM - Barra de Control y Dado
const btnIniciarPartida = document.getElementById('btn-iniciar-partida');
const btnReiniciar = document.getElementById('btn-reiniciar');
const selectorBando = document.getElementById('selector-bando');
const bandoActualTxt = document.getElementById('bando-actual');
const btnTirarDado = document.getElementById('btn-tirar-dado');
const cuboNeonDado = document.getElementById('cubo-neon-dado');
const visorAccionSistema = document.getElementById('visor-accion-sistema');

// Capturas del DOM - Canal de Comunicación
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

// --- CONTROL DE ACCESO (LOBBY) ---
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
  socket.emit('unirse-a-sala', { sala: codigoSala, apodo: miAliasEscrito });
  socket.emit('solicitar-mapa-inicial');
}

//PARTE 2 DE 3: Canal de Comunicación y Motores del Radar

// --- CANAL DE COMUNICACIÓN (MESSAGING MOTOR) ---
function enviarMensajeTexto() {
  const texto = entradaMensaje.value.trim();
  if (texto === "") return;

  const alias = entradaApodo.value.trim() || "Anon";
  const prefijoBando = bandoAsignado === "equipo-cian" ? "💎" : (bandoAsignado === "equipo-azul" ? "🔵" : "👁️");
  const nombreRemitente = `${prefijoBando} ${alias}`;
  
  const datos = { remitente: nombreRemitente, texto: texto, clanEmisor: bandoAsignado };
  socket.emit('enviar-mensaje', datos);
  entradaMensaje.value = "";
}

btnEnviarChat.addEventListener('click', enviarMensajeTexto);
entradaMensaje.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensajeTexto(); });

function agregarMensajeAlCuadro(datos, claseOrigen) {
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
  tableroLaberinto.innerHTML = "";
  if (matrizLaberinto.length === 0) return;
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
  visorAccionSistema.textContent = `PASOS RESTANTES EN RED: ${pasosDisponibles}`;
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
  cuboNeonDado.textContent = "--"; cuboNeonDado.classList.remove('congelado', 'firewall');
  visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";
  indiceTurnoActual = (indiceTurnoActual + 1) % ordenTurnos.length;
  actualizarBrilloPanelesTurnos();
}

function actualizarBrilloPanelesTurnos() {
  document.getElementById('slot-cian-1').classList.remove('turno-activo');
  document.getElementById('slot-cian-2').classList.remove('turno-activo');
  document.getElementById('slot-azul-1').classList.remove('turno-activo');
  document.getElementById('slot-azul-2').classList.remove('turno-activo');

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  if (hackerIdActivo === "hacker1") document.getElementById('slot-cian-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker3") document.getElementById('slot-cian-2').classList.add('turno-activo');
  if (hackerIdActivo === "hacker2") document.getElementById('slot-azul-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker4") document.getElementById('slot-azul-2').classList.add('turno-activo');
  bandoActualTxt.textContent = hackerIdActivo.toUpperCase().replace("HACKER", "HACKER ");
}

// --- ESCUCHAS DE BOTONES ---
btnTirarDado.addEventListener('click', () => {
  if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;
  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";
  if (bandoAsignado !== clanActivo || dadoLanzadoEsteTurno) return;

  const resultadoDado = Math.floor(Math.random() * 6) + 1;
  socket.emit('solicitar-lanzamiento-dado', { numero: resultadoDado, clan: clanActivo });
});

btnIniciarPartida.addEventListener('click', () => {
  if (bandoAsignado === "espectador") return;
  socket.emit('solicitar-inicio-partida', { sorteoCian: Math.random() > 0.5 });
});

btnReiniciar.addEventListener('click', () => {
  if (bandoAsignado === "espectador") return;
  socket.emit('solicitar-reiniciar-red');
});

// ==========================================
// --- RECEPTORES SINTONIZADOS MULTIJUGADOR ---
// ==========================================
socket.on('recibir-mapa-sincronizado', (datos) => {
  matrizLaberinto = datos.mapa;
  calcularRangoRadarVision();
  dibujarLaberintoEnPantalla();
});

socket.on('actualizar-lista-integrantes', (datosSala) => {
  document.querySelector('#slot-cian-1 .nombre-slot').textContent = datosSala.n1;
  document.querySelector('#slot-azul-1 .nombre-slot').textContent = datosSala.n2;
  document.querySelector('#slot-cian-2 .nombre-slot').textContent = datosSala.n3;
  document.querySelector('#slot-azul-2 .nombre-slot').textContent = datosSala.n4;

  if (datosSala.tuSlot && datosSala.tuSlot !== "espectador" && bandoAsignado === "espectador") {
    const miClanAsignado = (datosSala.tuSlot === "hacker1" || datosSala.tuSlot === "hacker3") ? "equipo-cian" : "equipo-azul";
    bandoAsignado = miClanAsignado;
    selectorBando.value = miClanAsignado;
    dibujarLaberintoEnPantalla();
  }
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

socket.on('servidor-retransmitir-movimiento', (datos) => { ejecutarMovimientoFisicoSincronizado(datos.clan, datos.fDes, datos.cDes); });

socket.on('servidor-confirmar-inicio', (datos) => {
  partidaIniciada = true; btnIniciarPartida.classList.add('oculto');
  visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";
  if (datos.sorteoCian) ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
  else ordenTurnos = ["hacker2", "hacker1", "hacker4", "hacker3"];
  indiceTurnoActual = 0;
  dibujarLaberintoEnPantalla(); actualizarBrilloPanelesTurnos();
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
  calcularRangoRadarVision(); dibujarLaberintoEnPantalla(); actualizarBrilloPanelesTurnos();
  alert("La red se ha reiniciado por completo.");
});
