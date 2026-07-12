// PARTE 1 DE 3: Variables, Selección de Equipos y Control del Lobby

// --- 1. CONEXIÓN INALÁMBRICA PROVISIONAL ---
const socket = io(); 

// --- 2. CONFIGURACIÓN BASE EVOLUCIONADA Y ELEMENTOS ---
const TAMANO = 21; 
let bandoAsignado = "espectador";
let partidaIniciada = false;
let juegoTerminado = false;
let pasosDisponibles = 0; 
let dadoLanzadoEsteTurno = false; 

const pantallaLobby = document.getElementById('pantalla-lobby');
const contenedorPrincipal = document.getElementById('contenedor-principal');
const entradaSala = document.getElementById('entrada-sala');
const btnCrearCodigoSala = document.getElementById('btn-crear-codigo-sala');
const btnEntrarSala = document.getElementById('btn-entrar-sala');
const txtSalaActual = document.getElementById('txt-sala-actual');
const entradaApodo = document.getElementById('entrada-apodo');
const tableroLaberinto = document.getElementById('tablero-laberinto');

const btnIniciarPartida = document.getElementById('btn-iniciar-partida');
const btnReiniciar = document.getElementById('btn-reiniciar');
const selectorBando = document.getElementById('selector-bando');
const bandoActualTxt = document.getElementById('bando-actual');
const btnTirarDado = document.getElementById('btn-tirar-dado');
const cuboNeonDado = document.getElementById('cubo-neon-dado');
const visorAccionSistema = document.getElementById('visor-accion-sistema');

// --- NUEVAS CAPTURAS DEL CANAL DE COMUNICACIÓN ---
const mensajesChat = document.getElementById('mensajes-chat');
const entradaMensaje = document.getElementById('entrada-mensaje');
const btnEnviarChat = document.getElementById('btn-enviar-chat');


let matrizLaberinto = []; 
let ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
let indiceTurnoActual = 0; 
let historialPosiciones = {}; 

// Fichas/Avatares únicos y compartidos por cada clan
let posicionesHackers = {
  "equipo-cian": { f: 0, c: 0, avatar: "💎", clase: "avatar-h1" },
  "equipo-azul": { f: 20, c: 20, avatar: "🔵", clase: "avatar-h2" }
};

// Historial del radar de exploración de la niebla de guerra
let nodosDescubiertosCian = {};
let nodosDescubiertosAzul = {};

// --- 3. LÓGICA DEL LOBBY DE BIENVENIDA ---
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

  // MODIFICADO: Enviamos un objeto completo al servidor con código y alias real
  socket.emit('unirse-a-sala', { sala: codigoSala, apodo: miAliasEscrito });

}


// Función local para procesar el envío de un mensaje hacia el servidor
function enviarMensajeTexto() {
  const texto = entradaMensaje.value.trim();
  if (texto === "") return;

  // Capturar el alias escrito por el usuario (si está vacío, usa "Anon")
  const alias = entradaApodo.value.trim() || "Anon";
  
  // Ponemos un emoji identificador según el equipo que tengas seleccionado
  const prefijoBando = bandoAsignado === "equipo-cian" ? "💎" : (bandoAsignado === "equipo-azul" ? "🔵" : "👁️");

  // La firma final unirá su emoji de clan con su nombre elegido
  const nombreRemitente = `${prefijoBando} ${alias}`;
  const datos = { remitente: nombreRemitente, texto: texto, clanEmisor: bandoAsignado };

  // El cliente solo envía el mensaje y espera a que el servidor se lo devuelva con su color neón
  socket.emit('enviar-mensaje', datos);
  
  entradaMensaje.value = "";
}

// Escuchar clics en el botón de la flecha o al presionar "Enter" en el teclado
btnEnviarChat.addEventListener('click', enviarMensajeTexto);
entradaMensaje.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') enviarMensajeTexto();
});


// PARTE 2 DE 3: Algoritmo DFS de Laberintos Perfectos y Motor de Radar

// --- 4. ALGORITMO DFS DE EXCAVACIÓN (LABERINTOS PERFECTOS 21X21) ---
function generarLaberintoProcedural() {
  matrizLaberinto = [];
  for (let f = 0; f < TAMANO; f++) {
    matrizLaberinto[f] = [];
    for (let c = 0; c < TAMANO; c++) { matrizLaberinto[f][c] = 1; }
  }

  let pila = [];
  let fActual = 0, cActual = 0;
  matrizLaberinto[fActual][cActual] = 0;
  
  while (true) {
    let vecinos = [];
    const direcciones = [{ df: -2, dc: 0 }, { df: 2, dc: 0 }, { df: 0, dc: -2 }, { df: 0, dc: 2 }];
    direcciones.forEach(d => {
      let nvF = fActual + d.df, nvC = cActual + d.dc;
      if (nvF >= 0 && nvF < TAMANO && nvC >= 0 && nvC < TAMANO) {
        if (matrizLaberinto[nvF][nvC] === 1) vecinos.push({ f: nvF, c: nvC, df: d.df, dc: d.dc });
      }
    });

    if (vecinos.length > 0) {
      let elegido = vecinos[Math.floor(Math.random() * vecinos.length)];
      matrizLaberinto[fActual + elegido.df / 2][cActual + elegido.dc / 2] = 0;
      matrizLaberinto[elegido.f][elegido.c] = 0;
      pila.push({ f: fActual, c: cActual });
      fActual = elegido.f; cActual = elegido.c;
    } else if (pila.length > 0) {
      let anterior = pila.pop();
      fActual = anterior.f; cActual = anterior.c;
    } else { break; }
  }

  const centro = Math.floor(TAMANO / 2); // Nodo central de la matriz (Fila 10, Columna 10)
  matrizLaberinto[centro][centro] = 2; 
  matrizLaberinto[centro-1][centro] = 0; matrizLaberinto[centro+1][centro] = 0;
  matrizLaberinto[centro][centro-1] = 0; matrizLaberinto[centro][centro+1] = 0;

  // Apertura controlada de los portales de inicio
  for (let f = 0; f <= 1; f++) { 
    for (let c = 0; c <= 1; c++) { matrizLaberinto[f][c] = 0; } 
  }
  for (let f = TAMANO - 2; f < TAMANO; f++) { 
    for (let c = TAMANO - 2; c < TAMANO; c++) { matrizLaberinto[f][c] = 0; } 
  }
}

// --- 5. MOTOR DE VISIÓN RADAR (NIEBLA DE GUERRA) ---
function calcularRangoRadarVision() {
  const cian = posicionesHackers["equipo-cian"];
  const azul = posicionesHackers["equipo-azul"];
  const radioVisibilidad = 2; // Rango de celdas visibles alrededor de la ficha

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

// Transforma segundos en formato digital de texto
function formatTiempoCustom(segundos) {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
}


//PARTE 3 DE 3: Movimientos del Laberinto, Dado de Acciones y Reinicios


// --- 6. RENDERIZADO DEL MAPA ASIMÉTRICO (CON CHIP CENTRAL SIEMPRE VISIBLE) ---
function dibujarLaberintoEnPantalla() {
  tableroLaberinto.innerHTML = "";
  
  const centro = Math.floor(TAMANO / 2); // Coordenadas del núcleo (10, 10)

  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      const celdaDiv = document.createElement('div');
      celdaDiv.classList.add('celda', 'iluminada');
      celdaDiv.setAttribute('data-fila', f);
      celdaDiv.setAttribute('data-col', c);

      // --- FILTRO DE NIEBLA DE GUERRA CALIBRADO ---
      let celdaVisible = false;
      
      // REGLA NUEVA: Si la partida NO ha iniciado, TODO el laberinto es visible al principio
      if (!partidaIniciada) {
        celdaVisible = true;
      } else {
        // Si ya inició, aplica el radar de cada equipo o la vista total de Espectador
        if (bandoAsignado === "espectador") celdaVisible = true;
        if (bandoAsignado === "equipo-cian" && nodosDescubiertosCian[`${f},${c}`]) celdaVisible = true;
        if (bandoAsignado === "equipo-azul" && nodosDescubiertosAzul[`${f},${c}`]) celdaVisible = true;
        
        // REGLA COMPLEMENTARIA: El chip central (10,10) NUNCA se oculta, siempre es visible
        if (f === centro && c === centro) celdaVisible = true;
      }

      if (!celdaVisible) {
        celdaDiv.classList.add('oscura'); // Tapamos el nodo con el velo negro Cyberpunk
      } else {
        // Si es visible, pintamos sus paredes o núcleo normales
        if (matrizLaberinto[f][c] === 1) celdaDiv.classList.add('pared');
        else if (matrizLaberinto[f][c] === 2) { 
          celdaDiv.classList.add('nucleo-central'); 
          celdaDiv.textContent = "💾"; 
        }
      }

      // Dibujar avatares compartidos en las celdas descubiertas
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


// --- 7. MOVIMIENTO DE NODOS COORDINADO POR INTERNET ---
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

  // Despachamos la solicitud de movimiento al servidor para que lo mueva en las 4 pantallas por igual
  socket.emit('solicitar-movimiento-hacker', {
    clan: clanActivo,
    fDes: fila,
    cDes: columna,
    hackerId: hackerIdActivo
  });
}

// Función ejecutora final que corre en las 4 pantallas de forma simultánea
function ejecutarMovimientoFisicoSincronizado(clan, fDes, cDes) {
  const datosAvatar = posicionesHackers[clan];
  historialPosiciones[clan] = { f: datosAvatar.f, c: datosAvatar.c };

  datosAvatar.f = fDes;
  datosAvatar.c = cDes;
  pasosDisponibles--;
  
  document.getElementById('visor-dado').textContent = `PASOS: ${pasosDisponibles}`;
  
  calcularRangoRadarVision(); 
  dibujarLaberintoEnPantalla();

  if (matrizLaberinto[fDes][cDes] === 2) {
    juegoTerminado = true;
    alert(`¡INFILTRACIÓN EXITOSA! El ${clan.toUpperCase()} quebro el núcleo central!`);
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
  document.getElementById('slot-cian-1').classList.remove('turno-activo');
  document.getElementById('slot-cian-2').classList.remove('turno-activo');
  document.getElementById('slot-azul-1').classList.remove('turno-activo');
  document.getElementById('slot-azul-2').classList.remove('turno-activo');

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  
  if (hackerIdActivo === "hacker1") document.getElementById('slot-cian-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker3") document.getElementById('slot-cian-2').classList.add('turno-activo');
  if (hackerIdActivo === "hacker2") document.getElementById('slot-azul-1').classList.add('turno-activo');
  if (hackerIdActivo === "hacker4") document.getElementById('slot-azul-2').classList.add('turno-activo');

  bandoActualTxt.textContent = ordenTurnos[indiceTurnoActual].toUpperCase().replace("HACKER", "HACKER ");
}

// --- 8. EMISORES Y RECEPTORES INALÁMBRICOS DE ACCIONES SUPERIORES ---

btnTirarDado.addEventListener('click', () => {
  if (!partidaIniciada || juegoTerminado || bandoAsignado === "espectador") return;

  const hackerIdActivo = ordenTurnos[indiceTurnoActual];
  const clanActivo = (hackerIdActivo === "hacker1" || hackerIdActivo === "hacker3") ? "equipo-cian" : "equipo-azul";

  if (bandoAsignado !== clanActivo) {
    alert("No es tu turno de lanzar el dado.");
    return;
  }

  if (dadoLanzadoEsteTurno) return;

  // El cliente calcula el dado e informa inmediatamente al servidor para sincronizarlo
  const resultadoDado = Math.floor(Math.random() * 6) + 1;
  socket.emit('solicitar-lanzamiento-dado', { numero: resultadoDado, hackerId: hackerIdActivo, clan: clanActivo });
});

btnIniciarPartida.addEventListener('click', () => {
  if (bandoAsignado === "espectador") {
    alert("Acceso denegado: Debes elegir un equipo para iniciar el hackeo.");
    return;
  }
  // Lanzamos la moneda digital del sorteo y le avisamos al servidor
  const sorteoInicial = Math.random() > 0.5;
  socket.emit('solicitar-inicio-partida', { sorteoCian: sorteoInicial });
});

btnReiniciar.addEventListener('click', () => {
  if (bandoAsignado === "espectador") return;
  socket.emit('solicitar-reiniciar-red');
});

// =======================================================
// --- SINTONIZACIÓN DE LAS NUEVAS ANTENAS DE RED ---
// =======================================================

// Receptor: Sincronizar el dado neón visual
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
    document.getElementById('visor-dado').textContent = `PASOS: ${pasosDisponibles}`;
  } 
  else {
    pasosDisponibles = 2;
    visorAccionSistema.textContent = "SOBRECARGA: AVANZA 2 NODOS ⚡";
    document.getElementById('visor-dado').textContent = `PASOS: ${pasosDisponibles}`;
  }
});

// Receptor: Sincronizar los pasos físicos del avatar
socket.on('servidor-retransmitir-movimiento', (datos) => {
  ejecutarMovimientoFisicoSincronizado(datos.clan, datos.fDes, datos.cDes);
});

// Receptor: Sincronizar el encendido e inicio por sorteo inalámbrico
socket.on('servidor-confirmar-inicio', (datos) => {
  partidaIniciada = true;
  btnIniciarPartida.classList.add('oculto');
  visorAccionSistema.textContent = "LANZA EL DADO EN TU TURNO";

  if (datos.sorteoCian) {
    ordenTurnos = ["hacker1", "hacker2", "hacker3", "hacker4"];
    alert("⚡ [SORTEO DE RED]: ¡Equipo Cian toma la iniciativa! Turno de Hacker 1.");
  } else {
    ordenTurnos = ["hacker2", "hacker1", "hacker4", "hacker3"];
    alert("⚡ [SORTEO DE RED]: ¡Equipo Azul toma la iniciativa! Turno de Hacker 2.");
  }
  indiceTurnoActual = 0;
  dibujarLaberintoEnPantalla(); 
  actualizarBrilloPanelesTurnos();
});

// Receptor: Sincronizar la limpieza total para la revancha
socket.on('servidor-confirmar-reinicios', (datos) => {
  partidaIniciada = false; juegoTerminado = false;
  selectorBando.value = "espectador"; bandoAsignado = "espectador";
  indiceTurnoActual = 0; dadoLanzadoEsteTurno = false; pasosDisponibles = 0;
  cuboNeonDado.textContent = "--"; cuboNeonDado.classList.remove('congelado', 'firewall');
  visorAccionSistema.textContent = "ESPERANDO INICIO...";
  document.getElementById('visor-dado').textContent = "DADO: --";
  historialPosiciones = {};
  nodosDescubiertosCian = {}; nodosDescubiertosAzul = {}; 
  
  posicionesHackers["equipo-cian"] = { f: 0, c: 0, avatar: "💎", clase: "avatar-h1" };
  posicionesHackers["equipo-azul"] = { f: 20, c: 20, avatar: "🔵", clase: "avatar-h2" };
  btnIniciarPartida.classList.remove('oculto');
  
  // Guardamos el nuevo mapa síncrono que esculpió el servidor
  matrizLaberinto = datos.nuevoMapa;
  
  calcularRangoRadarVision();
  dibujarLaberintoEnPantalla();
  actualizarBrilloPanelesTurnos();
  alert("La red se ha reiniciado por completo. Volviendo a escanear nodos...");
});
