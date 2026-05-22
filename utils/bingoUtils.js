/**
 * Genera una matriz de Bingo 5x5 siguiendo los rangos estándar:
 * B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
 * El centro (2,2) se marca como null (espacio libre).
 */
function generarMatrizBingo() {
    const matriz = [];
    const rangos = [
        [1, 15], [16, 30], [31, 45], [46, 60], [61, 75]
    ];
    
    for (let col = 0; col < 5; col++) {
        const columna = [];
        const numerosColumna = new Set();
        const [min, max] = rangos[col];
        
        while (numerosColumna.size < 5) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            numerosColumna.add(num);
        }
        
        columna.push(...Array.from(numerosColumna));
        columna.sort((a, b) => a - b);
        
        for (let fila = 0; fila < 5; fila++) {
            if (!matriz[fila]) matriz[fila] = [];
            matriz[fila][col] = columna[fila];
        }
    }
    
    // Espacio central gratuito
    matriz[2][2] = null;
    return matriz;
}

module.exports = {
    generarMatrizBingo
};
