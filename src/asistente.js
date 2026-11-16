const { CATALOGO, POR_ID, IDS } = require('./catalogo')

const URL_OPENAI = 'https://api.openai.com/v1/chat/completions'
const TIEMPO_MAX_MS = 30000

class ErrorIA extends Error {
  constructor(mensaje, status = 502) {
    super(mensaje)
    this.status = status
  }
}

// Al modelo se le envía el catálogo SIN precios: así no puede citarlos ni inventarlos.
const catalogoParaIA = CATALOGO.map((s) => ({
  id: s.id,
  nombre: s.nombre,
  descripcion: s.descripcion,
  ...(s.cantidad ? { necesitaCantidad: `${s.cantidad.etiqueta} (${s.cantidad.min}-${s.cantidad.max})` } : {})
}))

const INSTRUCCIONES = `Eres el asistente comercial de "Presupuesta mi web", un estudio que hace páginas web.
Hablas en español, con tono cercano y breve. Tu trabajo es entender qué web necesita el cliente y proponer servicios del catálogo.

CATÁLOGO (los únicos servicios que existen):
${JSON.stringify(catalogoParaIA, null, 2)}

REGLAS OBLIGATORIAS:
- Usa solo los "id" del catálogo. Nunca inventes servicios.
- Elige exactamente un tipo de web base: "landing" o "corporativa".
- La web base ya incluye la primera página. Si el cliente necesita más páginas, añade "paginas-adicionales" con "cantidad" = número de páginas extra. Si no sabes cuántas, pon cantidad null y pregúntalo en "dudas".
- Los contenidos o secciones (carta, menú, galería, quiénes somos, servicios, contacto, equipo...) NO son servicios aparte: son páginas. Cúbrelos con la web base y "paginas-adicionales"; nunca los pongas en "fueraDeCatalogo".
- Para el resto de servicios, "cantidad" es null.
- Si el cliente pide algo que no está en el catálogo (tienda online, pasarela de pago, blog, SEO, logotipo, hosting, mantenimiento, sistema de reservas con disponibilidad en tiempo real...), NO lo encajes a la fuerza: añádelo a "fueraDeCatalogo" como necesidad pendiente de valorar.
- Si la petición es ambigua, propone lo razonable y anota en "dudas" las preguntas concretas que el cliente debe aclarar.
- NUNCA menciones precios, importes, descuentos, plazos ni fechas de entrega, ni hagas promesas o compromisos. Los importes los calcula el sistema aparte.
- Si el mensaje no tiene que ver con una web, responde amablemente que solo puedes ayudar con presupuestos web y devuelve servicios vacíos.

FORMATO: responde siempre con el JSON del esquema:
- "respuesta": mensaje para el chat (2-4 frases), explicando la propuesta o pidiendo lo que falta.
- "resumen": resumen del proyecto en 1-3 frases (vacío si aún no hay proyecto).
- "servicios": servicios propuestos con una justificación breve de cada uno.
- "dudas": preguntas o aspectos a aclarar.
- "fueraDeCatalogo": necesidades que no cubre el catálogo y por qué.
Cada respuesta debe contener la propuesta COMPLETA y actualizada con toda la conversación.`

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['respuesta', 'resumen', 'servicios', 'dudas', 'fueraDeCatalogo'],
  properties: {
    respuesta: { type: 'string' },
    resumen: { type: 'string' },
    servicios: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'cantidad', 'justificacion'],
        properties: {
          id: { type: 'string', enum: IDS },
          cantidad: { type: ['integer', 'null'] },
          justificacion: { type: 'string' }
        }
      }
    },
    dudas: { type: 'array', items: { type: 'string' } },
    fueraDeCatalogo: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['necesidad', 'motivo'],
        properties: { necesidad: { type: 'string' }, motivo: { type: 'string' } }
      }
    }
  }
}

const recortar = (t, n) => String(t ?? '').trim().slice(0, n)

// No nos fiamos de la respuesta del modelo: se comprueba todo contra el catálogo.
function normalizar(bruto) {
  const dudas = (Array.isArray(bruto.dudas) ? bruto.dudas : []).map((d) => recortar(d, 300)).filter(Boolean)
  const fueraDeCatalogo = (Array.isArray(bruto.fueraDeCatalogo) ? bruto.fueraDeCatalogo : [])
    .map((f) => ({ necesidad: recortar(f?.necesidad, 200), motivo: recortar(f?.motivo, 300) }))
    .filter((f) => f.necesidad)

  const servicios = []
  const vistos = new Set()
  for (const s of Array.isArray(bruto.servicios) ? bruto.servicios : []) {
    const servicio = POR_ID.get(s?.id)
    if (!servicio) {
      // id desconocido: no se usa, se deja como necesidad pendiente
      fueraDeCatalogo.push({ necesidad: recortar(s?.id, 100) || 'servicio desconocido', motivo: 'No existe en nuestro catálogo' })
      continue
    }
    if (vistos.has(servicio.id)) continue
    // solo una web base: si llegan dos, se queda la primera
    if (servicio.grupo === 'base' && servicios.some((x) => POR_ID.get(x.id).grupo === 'base')) continue
    vistos.add(servicio.id)

    let cantidad = null
    if (servicio.cantidad) {
      const { min, max } = servicio.cantidad
      cantidad = Number.isInteger(s.cantidad) && s.cantidad >= min && s.cantidad <= max ? s.cantidad : null
    }
    servicios.push({ id: servicio.id, cantidad, justificacion: recortar(s.justificacion, 400) })
  }

  return {
    respuesta: recortar(bruto.respuesta, 1500) || 'He actualizado la propuesta.',
    resumen: recortar(bruto.resumen, 800),
    servicios,
    dudas,
    fueraDeCatalogo
  }
}

async function pedirPropuesta({ cliente, mensajes }) {
  const clave = process.env.OPENAI_API_KEY
  if (!clave || clave.startsWith('sk-pon')) {
    throw new ErrorIA('El asistente no está configurado: falta OPENAI_API_KEY en .env.local.', 503)
  }

  const cuerpo = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: INSTRUCCIONES },
      ...(cliente ? [{ role: 'system', content: `El cliente se llama: ${cliente}` }] : []),
      ...mensajes
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'propuesta', strict: true, schema: ESQUEMA } }
  }

  let res
  try {
    res = await fetch(URL_OPENAI, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_MAX_MS)
    })
  } catch (e) {
    if (e.name === 'TimeoutError') throw new ErrorIA('El asistente ha tardado demasiado en responder.', 504)
    throw new ErrorIA('No se pudo conectar con el servicio de IA.', 502)
  }

  if (!res.ok) {
    console.error('OpenAI', res.status, await res.text().catch(() => ''))
    if (res.status === 401) throw new ErrorIA('La clave de OpenAI no es válida. Revisa .env.local.', 502)
    if (res.status === 429) throw new ErrorIA('El servicio de IA está saturado o sin saldo. Prueba en unos segundos.', 503)
    throw new ErrorIA(`El servicio de IA ha devuelto un error (${res.status}).`, 502)
  }

  const datos = await res.json()
  const mensaje = datos.choices?.[0]?.message
  if (mensaje?.refusal) throw new ErrorIA('El asistente no ha podido procesar esta petición.', 502)
  try {
    return normalizar(JSON.parse(mensaje?.content ?? ''))
  } catch {
    throw new ErrorIA('La respuesta del asistente no tiene el formato esperado.', 502)
  }
}

module.exports = { pedirPropuesta, normalizar, ErrorIA }
