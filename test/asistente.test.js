// Integración con OpenAI: validación de la respuesta y gestión de fallos.
// fetch se sustituye por respuestas simuladas: no se llama a OpenAI ni se gasta saldo.
const test = require('node:test')
const assert = require('node:assert/strict')
const { pedirPropuesta, normalizar, ErrorIA } = require('../src/asistente')

const fetchReal = global.fetch
const mensajes = [{ role: 'user', content: 'Web para un restaurante' }]

function simularOpenAI(respuesta) {
  global.fetch = async () => respuesta()
}
const ok = (contenido) => () => ({
  ok: true, status: 200, text: async () => '',
  json: async () => ({ choices: [{ message: { content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido) } }] })
})
const fallo = (status) => () => ({ ok: false, status, text: async () => 'error', json: async () => ({}) })

test.beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test' })
test.afterEach(() => { global.fetch = fetchReal })

test('normalizar: los ids que no existen pasan a "fuera de catálogo"', () => {
  const r = normalizar({
    respuesta: 'ok', resumen: 'x', dudas: [], fueraDeCatalogo: [],
    servicios: [{ id: 'landing', cantidad: null, justificacion: 'a' }, { id: 'hosting', cantidad: null, justificacion: 'b' }]
  })
  assert.deepEqual(r.servicios.map((s) => s.id), ['landing'])
  assert.equal(r.fueraDeCatalogo[0].necesidad, 'hosting')
})

test('normalizar: solo una web base, sin duplicados y cantidad inválida → null', () => {
  const r = normalizar({
    respuesta: '', resumen: '', dudas: [], fueraDeCatalogo: [],
    servicios: [
      { id: 'corporativa', cantidad: null, justificacion: '' },
      { id: 'landing', cantidad: null, justificacion: '' },
      { id: 'formulario', cantidad: null, justificacion: '' },
      { id: 'formulario', cantidad: null, justificacion: '' },
      { id: 'paginas-adicionales', cantidad: 99, justificacion: '' }
    ]
  })
  assert.deepEqual(r.servicios.map((s) => s.id), ['corporativa', 'formulario', 'paginas-adicionales'])
  assert.equal(r.servicios[2].cantidad, null)
})

test('normalizar: tolera campos ausentes o con tipo incorrecto', () => {
  const r = normalizar({ servicios: 'no es lista', dudas: null })
  assert.deepEqual(r.servicios, [])
  assert.deepEqual(r.dudas, [])
  assert.ok(r.respuesta)
})

test('solicitud clara: devuelve la propuesta validada', async () => {
  simularOpenAI(ok({
    respuesta: 'Te propongo...', resumen: 'Web de restaurante', dudas: ['¿Cuántas páginas?'], fueraDeCatalogo: [],
    servicios: [{ id: 'corporativa', cantidad: null, justificacion: 'Varias secciones' }, { id: 'formulario', cantidad: null, justificacion: 'Reservas' }]
  }))
  const r = await pedirPropuesta({ cliente: 'Test', mensajes })
  assert.deepEqual(r.servicios.map((s) => s.id), ['corporativa', 'formulario'])
  assert.equal(r.dudas.length, 1)
})

test('se envía el catálogo y un esquema JSON estricto, sin precios', async () => {
  let cuerpo
  global.fetch = async (url, opciones) => { cuerpo = JSON.parse(opciones.body); return ok({ respuesta: '', resumen: '', servicios: [], dudas: [], fueraDeCatalogo: [] })() }
  await pedirPropuesta({ cliente: '', mensajes })
  assert.equal(cuerpo.response_format.json_schema.strict, true)
  const sistema = cuerpo.messages[0].content
  assert.match(sistema, /paginas-adicionales/)
  assert.doesNotMatch(sistema, /€|precio":/)
})

test('fallo de OpenAI: clave inválida (401)', async () => {
  simularOpenAI(fallo(401))
  await assert.rejects(pedirPropuesta({ mensajes }), (e) => e instanceof ErrorIA && /clave/.test(e.message))
})

test('fallo de OpenAI: saturado o sin saldo (429)', async () => {
  simularOpenAI(fallo(429))
  await assert.rejects(pedirPropuesta({ mensajes }), (e) => e.status === 503)
})

test('fallo de OpenAI: tiempo de espera agotado', async () => {
  global.fetch = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }
  await assert.rejects(pedirPropuesta({ mensajes }), (e) => e.status === 504)
})

test('fallo de OpenAI: sin conexión', async () => {
  global.fetch = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(pedirPropuesta({ mensajes }), (e) => e instanceof ErrorIA && e.status === 502)
})

test('fallo de OpenAI: respuesta que no es JSON', async () => {
  simularOpenAI(ok('esto no es json'))
  await assert.rejects(pedirPropuesta({ mensajes }), /formato/)
})

test('sin clave configurada → error 503 sin llamar a OpenAI', async () => {
  delete process.env.OPENAI_API_KEY
  let llamado = false
  global.fetch = async () => { llamado = true }
  await assert.rejects(pedirPropuesta({ mensajes }), (e) => e.status === 503)
  assert.equal(llamado, false)
})
