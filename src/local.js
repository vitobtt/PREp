// Arranque en local: npm start (en Vercel se usa src/app.js o api/index.js)
const app = require('./app')
const PORT = process.env.PORT || 3000

app.listen(PORT, () => console.log(`api en http://localhost:${PORT}`))
