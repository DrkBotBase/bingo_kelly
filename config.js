require("dotenv")
module.exports = {
  info: {
    name_page: process.env.NAME || 'Bingo Online',
    dominio: process.env.DOMINIO || '',
    ws: process.env.WS || '',
    group: process.env.GROUP || ''
  }
}