const path = require('path')
const express = require('express')
const { calcularPresupuesto } = require('./presupuesto')
const { CATALOGO, calcularCotizacion } = require('./catalogo')
const { pedirPropuesta, ErrorIA } = require('./asistente')
const { generarPdf } = require('./pdf')
const TARIFAS = require('./tarifas')

// Carga OPENAI_API_KEY desde .env.local (fuera del repositorio)
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'))
} catch {
  console.warn('Aviso: no se encontró .env.local; el asistente no funcionará sin OPENAI_API_KEY.')
}

const app = express()
const PORT = process.env.PORT || 3000

const MAX_MENSAJE = 1500
const MAX_MENSAJES = 20
const MAX_CLIENTE = 120

app.use(express.json({ limit: '100kb' }))

function validar(body) {
      if (typeof body !== 'object' || body === null) {
    return 'el cuerpo debe ser un objeto json'
  }

  const tiposValidos = ['landing', 'corporativa']
  if (!tiposValidos.includes(body.tipo)) {
    return 'tipo debe ser "landing" o "corporativa"'
  }

  const paginasOk = Number.isInteger(body.paginas) && body.paginas >= 1 && body.paginas <= 20
  if (!paginasOk) {
    return 'paginas debe ser un entero entre 1 y 20'
  }

  if (typeof body.formulario !== 'boolean') {
    return 'formulario debe ser true o false'
  }

  if (typeof body.segundoIdioma !== 'boolean') {
    return 'segundoIdioma debe ser true o false'
  }

  return null
}

function validarChat(body) {
  if (typeof body !== 'object' || body === null) return 'el cuerpo debe ser un objeto json'
  if (body.cliente !== undefined && (typeof body.cliente !== 'string' || body.cliente.length > MAX_CLIENTE)) {
    return `el nombre del cliente debe ser un texto de hasta ${MAX_CLIENTE} caracteres`
  }
  const { mensajes } = body
  if (!Array.isArray(mensajes) || mensajes.length === 0) return 'escribe una descripción de tu proyecto'
  if (mensajes.length > MAX_MENSAJES) return 'la conversación es demasiado larga: empieza una nueva'
  for (const m of mensajes) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') {
      return 'formato de mensajes no válido'
    }
    if (m.content.length > MAX_MENSAJE) return `cada mensaje puede tener como máximo ${MAX_MENSAJE} caracteres`
  }
  const ultimo = mensajes[mensajes.length - 1]
  if (ultimo.role !== 'user' || ultimo.content.trim() === '') return 'la descripción no puede estar vacía'
  return null
}

// Valida los datos del presupuesto final y calcula los importes con las tarifas del servidor.
function prepararDocumento(body) {
  if (typeof body !== 'object' || body === null) return { error: 'el cuerpo debe ser un objeto json' }
  const cliente = typeof body.cliente === 'string' ? body.cliente.trim() : ''
  if (!cliente) return { error: 'indica el nombre del cliente o empresa' }
  if (cliente.length > MAX_CLIENTE) return { error: `el nombre del cliente admite como máximo ${MAX_CLIENTE} caracteres` }
  if (body.resumen !== undefined && (typeof body.resumen !== 'string' || body.resumen.length > 1500)) {
    return { error: 'el resumen debe ser un texto de hasta 1500 caracteres' }
  }
  const aclaraciones = body.aclaraciones ?? []
  if (!Array.isArray(aclaraciones) || aclaraciones.length > 30 ||
      aclaraciones.some((a) => typeof a !== 'string' || a.length > 400)) {
    return { error: 'las aclaraciones deben ser una lista de textos cortos' }
  }

  const calculo = calcularCotizacion(body.servicios)
  if (calculo.error) return calculo

  const justificaciones = new Map(
    (body.servicios || []).map((s) => [s.id, typeof s.justificacion === 'string' ? s.justificacion.slice(0, 400) : ''])
  )
  return {
    cliente,
    fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
    resumen: (body.resumen || '').trim(),
    lineas: calculo.lineas.map((l) => ({ ...l, justificacion: justificaciones.get(l.id) || '' })),
    total: calculo.total,
    moneda: calculo.moneda,
    aclaraciones: aclaraciones.map((a) => a.trim()).filter(Boolean)
  }
}

app.get('/api/estado', (req, res) => {
    res.json({ status: 'ok'})
})

app.get('/api/tarifas', (req, res) => {
    res.json(TARIFAS)
})

app.get('/api/catalogo', (req, res) => {
  res.json(CATALOGO)
})

// Calculadora original (se mantiene por compatibilidad con pruebas/caso*.json)
app.post('/api/presupuesto', (req, res) => {
  const error = validar(req.body)
  if (error) {
    return res.status(400).json({ error })
  }
  const { tipo, paginas, formulario, segundoIdioma } = req.body
  res.json(calcularPresupuesto({ tipo, paginas, formulario, segundoIdioma }))
})

// Chat con el asistente: devuelve su respuesta y la propuesta validada contra el catálogo
app.post('/api/asistente', async (req, res) => {
  const error = validarChat(req.body)
  if (error) return res.status(400).json({ error })
  try {
    const mensajes = req.body.mensajes.map((m) => ({ role: m.role, content: m.content.trim() }))
    const propuesta = await pedirPropuesta({ cliente: (req.body.cliente || '').trim(), mensajes })
    res.json(propuesta)
  } catch (e) {
    if (e instanceof ErrorIA) return res.status(e.status).json({ error: e.message, reintentable: true })
    console.error(e)
    res.status(500).json({ error: 'Error inesperado del asistente.', reintentable: true })
  }
})

// Presupuesto con los servicios confirmados por el usuario
app.post('/api/cotizacion', (req, res) => {
  const doc = prepararDocumento(req.body)
  if (doc.error) return res.status(400).json({ error: doc.error })
  res.json(doc)
})

// PDF: se recalcula todo aquí para que refleje la selección final y las tarifas del servidor
app.post('/api/presupuesto/pdf', (req, res) => {
  const doc = prepararDocumento(req.body)
  if (doc.error) return res.status(400).json({ error: doc.error })
  const nombre = 'presupuesto-' + doc.cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${nombre || 'presupuesto'}.pdf"`)
  generarPdf(doc, res)
})

app.use((err, req, res, next) => {
  if (err.status === 400 || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'el cuerpo no es un json valido' })
  }
  next(err)
})

app.listen(PORT, () => console.log(`api en http://localhost:${PORT}`))
