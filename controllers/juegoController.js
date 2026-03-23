const Juego = require('../models/Juego');
const Carton = require('../models/Carton');

async function verificarGanador(juegoId, cartonIdEspecifico = null) {
  try {
    const juego = await Juego.findById(juegoId);
    if (!juego || juego.estado !== 'jugando') return null;
    
    let query = {};
    if (cartonIdEspecifico) {
      query = { numeroCarton: cartonIdEspecifico };
    } else {
      query = { numeroCarton: { $in: juego.cartonesActivos } };
    }
    
    const cartones = await Carton.find(query);
    const bolasCantadas = juego.bolasCantadas;
    
    for (const carton of cartones) {
      if (carton.modoMarcado === 'automatico') {
        await marcarAutomatico(carton, bolasCantadas);
      }
      
      const completo = verificarModalidad(carton, juego.modalidad);
      
      if (completo) {
        console.log(`🏆 Ganador detectado: Cartón #${carton.numeroCarton} en modalidad ${juego.modalidad}`);
        return {
          cartonId: carton.numeroCarton,
          tipo: juego.modalidad
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error en verificarGanador:", error);
    return null;
  }
}

function verificarModalidad(carton, modalidad) {
  const marcadosSet = new Set(carton.marcados);
  
  const centroPos = "2-2";
  marcadosSet.add(centroPos); 

  switch(modalidad) {
    case 'carton-lleno':
      return marcadosSet.size === 25;
    
    case 'linea':
      for (let i = 0; i < 5; i++) {
        let filaCompleta = true;
        for (let j = 0; j < 5; j++) {
          if (!marcadosSet.has(`${i}-${j}`)) {
            filaCompleta = false;
            break;
          }
        }
        if (filaCompleta) return true;
      }
      for (let j = 0; j < 5; j++) {
        let colCompleta = true;
        for (let i = 0; i < 5; i++) {
          if (!marcadosSet.has(`${i}-${j}`)) {
            colCompleta = false;
            break;
          }
        }
        if (colCompleta) return true;
      }
      return false;
    
    case 'dobles-linea':
      let lineasCompletas = 0;
      for (let i = 0; i < 5; i++) {
        if ([0,1,2,3,4].every(j => marcadosSet.has(`${i}-${j}`))) lineasCompletas++;
      }
      for (let j = 0; j < 5; j++) {
        if ([0,1,2,3,4].every(i => marcadosSet.has(`${i}-${j}`))) lineasCompletas++;
      }
      return lineasCompletas >= 2;
    
    case 'esquinas':
      const esquinas = ['0-0', '0-4', '4-0', '4-4'];
      return esquinas.every(pos => marcadosSet.has(pos));
    
    case 'forma-x':
      const diagonal1 = ['0-0', '1-1', '2-2', '3-3', '4-4'];
      const diagonal2 = ['0-4', '1-3', '2-2', '3-1', '4-0'];
      const d1Completa = diagonal1.every(pos => marcadosSet.has(pos));
      const d2Completa = diagonal2.every(pos => marcadosSet.has(pos));
      return d1Completa && d2Completa;
    
    default:
      return false;
  }
}

async function marcarAutomatico(carton, bolasCantadas) {
  let huboCambio = false;
  
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === 2 && j === 2) continue;
      
      const numero = carton.numeros[i][j];
      const posicion = `${i}-${j}`;
      
      if (numero && bolasCantadas.includes(numero) && !carton.marcados.includes(posicion)) {
        carton.marcados.push(posicion);
        huboCambio = true;
      }
    }
  }
  
  if (huboCambio) {
    carton.markModified('marcados'); 
    await carton.save();
  }
}

module.exports = {
  verificarGanador,
  verificarModalidad
};
