// Arranque en local: npm start
const app = require('./app')
const PORT = process.env.PORT || 3000

app.listen(PORT, () => console.log(`api en http://localhost:${PORT}`))
