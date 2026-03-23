function numeroAFormatoBingo(numero) {
    if (numero >= 1 && numero <= 15) return `B${numero}`;
    if (numero >= 16 && numero <= 30) return `I${numero}`;
    if (numero >= 31 && numero <= 45) return `N${numero}`;
    if (numero >= 46 && numero <= 60) return `G${numero}`;
    if (numero >= 61 && numero <= 75) return `O${numero}`;
    return numero.toString();
}

function getLetraBingo(numero) {
    if (numero >= 1 && numero <= 15) return 'B';
    if (numero >= 16 && numero <= 30) return 'I';
    if (numero >= 31 && numero <= 45) return 'N';
    if (numero >= 46 && numero <= 60) return 'G';
    if (numero >= 61 && numero <= 75) return 'O';
    return '';
}

function getColorPorLetra(letra) {
    const colores = {
        'B': 'bg-blue-500',
        'I': 'bg-yellow-500',
        'N': 'bg-red-500',
        'G': 'bg-green-500',
        'O': 'bg-purple-500'
    };
    return colores[letra] || 'bg-gray-500';
}

function getColorPorNumero(numero) {
    const letra = getLetraBingo(numero);
    return getColorPorLetra(letra);
}

module.exports = {
    numeroAFormatoBingo,
    getLetraBingo,
    getColorPorLetra,
    getColorPorNumero
};