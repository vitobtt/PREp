// Pruebas de extremo a extremo de la API (servidor real en un puerto libre).
// Las llamadas a OpenAI se simulan; el resto de peticiones van al servidor de verdad.
process.env.OPENAI_API_KEY = 'sk-test'
process.env.LIMITE_ASISTENTE = '5'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const app = require('../src/app')

const fetchReal = global.fetch
let base, servidor
let respuestaOpenAI = null // función que devuelve la respuesta simulada

test.before(async () => {
  servidor = app.listen(0)
  await new Promise((r) => servidor.once('listening', r))
  base = `http://localhost:${servidor.address().port}`
  global.fetch = async (url, opciones) => {
    if (String(url).startsWith('https://api.openai.com')) return respuestaOpenAI()
    return fetchReal(url, opciones)
  }
})
test.after(() => { global.fetch = fetchReal; servidor.close() })

const post = (ruta, cuerpo, cabeceras = {}) =>
  fetchReal(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })

const openaiOk = (propuesta) => () => ({
  ok: true, status: 200, text: async () => '',
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ respuesta: 'ok', resumen: '', dudas: [], fueraDeCatalogo: [], servicios: [], ...propuesta }) } }] })
})
const chat = (texto, ip) => post('/api/asistente', { cliente: 'Cliente ficticio', mensajes: [{ role: 'user', content: texto }] }, { 'x-forwarded-for': ip })

// ---------- Las 6 situaciones del enunciado ----------

test('1. Solicitud clara que encaja con el catálogo', async () => {
  respuestaOpenAI = openaiOk({
    resumen: 'Web para restaurante con carta, reservas y dos idiomas',
    servicios: [
      { id: 'corporativa', cantidad: null, justificacion: 'Varias secciones' },
      { id: 'paginas-adicionales', cantidad: 2, justificacion: 'Carta y reservas' },
      { id: 'formulario', cantidad: null, justificacion: 'Reservas' },
      { id: 'segundo-idioma', cantidad: null, justificacion: 'Dos idiomas' }
    ]
  })
  const res = await chat('Necesito una web para un restaurante con carta, reservas y dos idiomas', '10.0.0.1')
  assert.equal(res.status, 200)
  const datos = await res.json()
  assert.deepEqual(datos.servicios.map((s) => s.id), ['corporativa', 'paginas-adicionales', 'formulario', 'segundo-idioma'])
})

test('2. Solicitud ambigua: propuesta con dudas por aclarar', async () => {
  respuestaOpenAI = openaiOk({
    servicios: [{ id: 'corporativa', cantidad: null, justificacion: '' }, { id: 'paginas-adicionales', cantidad: null, justificacion: '' }],
    dudas: ['¿Cuántas páginas necesitas?', '¿A qué se dedica tu negocio?']
  })
  const datos = await (await chat('Quiero algo sencillo para mi negocio', '10.0.0.2')).json()
  assert.equal(datos.dudas.length, 2)
  assert.equal(datos.servicios.find((s) => s.id === 'paginas-adicionales').cantidad, null) // el usuario deberá completarla
})

test('3. Servicio que no ofrecemos: queda como pendiente de valorar', async () => {
  respuestaOpenAI = openaiOk({
    servicios: [{ id: 'tienda-online', cantidad: null, justificacion: 'inventado' }],
    fueraDeCatalogo: [{ necesidad: 'Pasarela de pago', motivo: 'No está en el catálogo' }]
  })
  const datos = await (await chat('Necesito una tienda online con pasarela de pago', '10.0.0.3')).json()
  assert.deepEqual(datos.servicios, [])
  assert.deepEqual(datos.fueraDeCatalogo.map((f) => f.necesidad).sort(), ['Pasarela de pago', 'tienda-online'])
})

test('4. Descripción vacía o demasiado larga → 400', async () => {
  for (const texto of ['', '    ']) {
    const res = await chat(texto, '10.0.0.4')
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /vacía/)
  }
  const largo = await chat('a'.repeat(1501), '10.0.0.4')
  assert.equal(largo.status, 400)
  assert.equal((await post('/api/asistente', { mensajes: [] })).status, 400)
  assert.equal((await post('/api/asistente', '{json roto')).status, 400)
})

test('5. Fallo en la llamada a OpenAI → error con opción de reintentar', async () => {
  respuestaOpenAI = () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })
  const res = await chat('Web para un restaurante', '10.0.0.5')
  assert.equal(res.status, 502)
  const datos = await res.json()
  assert.equal(datos.reintentable, true)
  assert.ok(datos.error)
})

test('6. Modificación de servicios antes del PDF: el servidor recalcula con la selección final', async () => {
  const propuestaIA = { cliente: 'Restaurante Ficticio', resumen: 'Web', aclaraciones: ['¿Qué idioma?'], servicios: [
    { id: 'corporativa' }, { id: 'formulario' }, { id: 'segundo-idioma' }
  ] }
  const original = await (await post('/api/cotizacion', propuestaIA)).json()
  assert.equal(original.total, 830)

  // el usuario quita el segundo idioma y añade 3 páginas
  const modificada = { ...propuestaIA, servicios: [{ id: 'corporativa' }, { id: 'formulario' }, { id: 'paginas-adicionales', cantidad: 3 }] }
  const final = await (await post('/api/cotizacion', modificada)).json()
  assert.equal(final.total, 830 - 150 + 150)
  assert.deepEqual(final.lineas.map((l) => l.id), ['corporativa', 'formulario', 'paginas-adicionales'])

  const pdf = await post('/api/presupuesto/pdf', modificada)
  assert.equal(pdf.status, 200)
  assert.equal(pdf.headers.get('content-type'), 'application/pdf')
  assert.match(pdf.headers.get('content-disposition'), /presupuesto-restaurante-ficticio\.pdf/)
  const bytes = Buffer.from(await pdf.arrayBuffer())
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
})

// ---------- Otras comprobaciones ----------

test('el cliente no puede imponer precios: se ignoran y se usan las tarifas', async () => {
  const datos = await (await post('/api/cotizacion', { cliente: 'X', servicios: [{ id: 'landing', precio: 1 }], total: 1 })).json()
  assert.equal(datos.total, 300)
})

test('cotización y PDF exigen nombre del cliente y servicios válidos', async () => {
  assert.equal((await post('/api/cotizacion', { cliente: '', servicios: [{ id: 'landing' }] })).status, 400)
  assert.equal((await post('/api/presupuesto/pdf', { cliente: 'X', servicios: [{ id: 'landing' }, { id: 'paginas-adicionales' }] })).status, 400)
  assert.equal((await post('/api/cotizacion', { cliente: 'X', servicios: [{ id: 'hosting' }] })).status, 400)
})

test('límite de consultas al asistente por IP → 429', async () => {
  respuestaOpenAI = openaiOk({})
  const codigos = []
  for (let i = 0; i < 6; i++) codigos.push((await chat('hola', '10.9.9.9')).status)
  assert.deepEqual(codigos, [200, 200, 200, 200, 200, 429])
})

test('catálogo público sin claves ni datos internos', async () => {
  const res = await fetchReal(base + '/api/catalogo')
  const texto = await res.text()
  assert.equal(JSON.parse(texto).length, 5)
  assert.doesNotMatch(texto, /sk-/)
})

test('calculadora original: pruebas/caso1..9.json siguen dando el resultado esperado', async () => {
  const esperados = { 1: [200, 300], 2: [200, 830], 3: [200, 580], 4: [200, 1250], 5: [400], 6: [400], 7: [400], 8: [400], 9: [400] }
  for (const [n, [status, total]] of Object.entries(esperados)) {
    const cuerpo = fs.readFileSync(path.join(__dirname, '..', 'pruebas', `caso${n}.json`), 'utf8')
    const res = await post('/api/presupuesto', cuerpo)
    assert.equal(res.status, status, `caso ${n}`)
    if (total) assert.equal((await res.json()).total, total, `caso ${n}`)
  }
})
