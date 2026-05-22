const Juego = require('../models/Juego');
const Carton = require('../models/Carton');

async function verificarGanador(juegoId, cartonIdEspecifico = null) {
  try {
    const juego = await Juego.findById(juegoId);
    if (!juego || juego.estado !== 'jugando') return null;
    
    let query = cartonIdEspecifico 
      ? { numeroCarton: cartonIdEspecifico } 
      : { numeroCarton: { $in: juego.cartonesActivos } };
    
    const cartones = await Carton.find(query);
    const bolasCantadas = juego.bolasCantadas;
    
    let ganadores = [];
    let cartonesParaActualizar = [];
    
    for (const carton of cartones) {
      if (carton.modoMarcado === 'automatico') {
        const huboCambio = marcarAutomaticoSync(carton, bolasCantadas);
        if (huboCambio) {
          cartonesParaActualizar.push({
            updateOne: {
              filter: { _id: carton._id },
              update: { $set: { marcados: carton.marcados } }
            }
          });
        }
      }
      
      if (verificarModalidad(carton, juego.modalidad)) {
        ganadores.push({
          cartonId: carton.numeroCarton,
          tipo: juego.modalidad
        });
      }
    }

    // Actualización masiva de cartones que cambiaron
    if (cartonesParaActualizar.length > 0) {
      await Carton.bulkWrite(cartonesParaActualizar);
    }
    
    return ganadores.length > 0 ? ganadores : null;
    
  } catch (error) {
    console.error("Error en verificarGanador:", error);
    return null;
  }
}

/**
 * Versión síncrona de marcar automático que solo modifica el objeto en memoria
 */
function marcarAutomaticoSync(carton, bolasCantadas) {
  let huboCambio = false;
  const marcadosSet = new Set(carton.marcados);
  
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === 2 && j === 2) continue;
      
      const numero = carton.numeros[i][j];
      const posicion = `${i}-${j}`;
      
      if (numero && bolasCantadas.includes(numero) && !marcadosSet.has(posicion)) {
        carton.marcados.push(posicion);
        marcadosSet.add(posicion);
        huboCambio = true;
      }
    }
  }
  
  return huboCambio;
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

module.exports = {
  verificarGanador,
  verificarModalidad
};
