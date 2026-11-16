const TARIFAS = require('./tarifas')

// Catálogo de servicios. Es la única fuente de verdad: la IA solo puede elegir
// estos identificadores y los importes se calculan siempre aquí, en el servidor.
const CATALOGO = [
  {
    id: 'landing',
    nombre: 'Web landing',
    descripcion: 'Web de una sola página centrada en una acción (presentar un producto, captar contactos). Incluye diseño adaptado a móvil y la primera página.',
    grupo: 'base',
    precio: TARIFAS.landing,
    regla: 'Precio fijo'
  },
  {
    id: 'corporativa',
    nombre: 'Web corporativa',
    descripcion: 'Web con varias secciones para presentar una empresa y sus servicios. Incluye diseño adaptado a móvil y la primera página.',
    grupo: 'base',
    precio: TARIFAS.corporativa,
    regla: 'Precio fijo'
  },
  {
    id: 'paginas-adicionales',
    nombre: 'Páginas adicionales',
    descripcion: 'Cada página extra además de la incluida en la web base (por ejemplo: carta, galería, quiénes somos, contacto).',
    grupo: 'extra',
    precio: TARIFAS.paginaAdicional,
    regla: `${TARIFAS.paginaAdicional} € por página`,
    cantidad: { etiqueta: 'Número de páginas adicionales', min: 1, max: 19 }
  },
  {
    id: 'formulario',
    nombre: 'Formulario',
    descripcion: 'Formulario web (contacto, reservas, solicitudes) que envía los datos por correo electrónico.',
    grupo: 'extra',
    precio: TARIFAS.formulario,
    regla: 'Precio fijo'
  },
  {
    id: 'segundo-idioma',
    nombre: 'Segundo idioma',
    descripcion: 'Versión de todo el contenido de la web en un segundo idioma, con selector de idioma.',
    grupo: 'extra',
    precio: TARIFAS.segundoIdioma,
    regla: 'Precio fijo'
  }
]

const POR_ID = new Map(CATALOGO.map((s) => [s.id, s]))
const IDS = CATALOGO.map((s) => s.id)

// Valida una selección [{ id, cantidad }] y calcula los importes.
// Devuelve { error } o { lineas, total, moneda }.
function calcularCotizacion(servicios) {
  if (!Array.isArray(servicios) || servicios.length === 0) {
    return { error: 'selecciona al menos un servicio del catálogo' }
  }
  const vistos = new Set()
  const lineas = []
  for (const item of servicios) {
    const servicio = item && POR_ID.get(item.id)
    if (!servicio) return { error: `el servicio "${item?.id}" no existe en el catálogo` }
    if (vistos.has(servicio.id)) return { error: `el servicio "${servicio.id}" está repetido` }
    vistos.add(servicio.id)

    let cantidad = 1
    if (servicio.cantidad) {
      const { min, max, etiqueta } = servicio.cantidad
      if (!Number.isInteger(item.cantidad) || item.cantidad < min || item.cantidad > max) {
        return { error: `${etiqueta}: indica un número entero entre ${min} y ${max}` }
      }
      cantidad = item.cantidad
    }
    lineas.push({
      id: servicio.id,
      nombre: servicio.nombre,
      descripcion: servicio.descripcion,
      cantidad,
      precioUnitario: servicio.precio,
      importe: servicio.precio * cantidad
    })
  }

  const bases = lineas.filter((l) => POR_ID.get(l.id).grupo === 'base')
  if (bases.length !== 1) {
    return { error: 'elige exactamente un tipo de web: landing o corporativa' }
  }

  return {
    lineas,
    total: lineas.reduce((s, l) => s + l.importe, 0),
    moneda: 'EUR'
  }
}

module.exports = { CATALOGO, POR_ID, IDS, calcularCotizacion }
