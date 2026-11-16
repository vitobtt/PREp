// Cálculo de importes con las tarifas del servidor
const test = require('node:test')
const assert = require('node:assert/strict')
const { CATALOGO, calcularCotizacion } = require('../src/catalogo')

test('cada servicio del catálogo tiene id, nombre, descripción, precio y regla', () => {
  for (const s of CATALOGO) {
    assert.ok(s.id && s.nombre && s.descripcion && s.regla, s.id)
    assert.equal(typeof s.precio, 'number')
  }
})

test('restaurante: corporativa + 2 páginas + formulario + idioma = 930 €', () => {
  const r = calcularCotizacion([
    { id: 'corporativa' },
    { id: 'paginas-adicionales', cantidad: 2 },
    { id: 'formulario' },
    { id: 'segundo-idioma' }
  ])
  assert.equal(r.total, 930)
  assert.equal(r.lineas.find((l) => l.id === 'paginas-adicionales').importe, 100)
})

test('modificar la selección cambia el total (quitar formulario)', () => {
  const antes = calcularCotizacion([{ id: 'landing' }, { id: 'formulario' }]).total
  const despues = calcularCotizacion([{ id: 'landing' }]).total
  assert.equal(antes, 380)
  assert.equal(despues, 300)
})

test('falta la cantidad de páginas adicionales → error', () => {
  const r = calcularCotizacion([{ id: 'landing' }, { id: 'paginas-adicionales', cantidad: null }])
  assert.match(r.error, /páginas adicionales/i)
})

test('cantidad fuera de rango o no entera → error', () => {
  for (const cantidad of [0, 20, 2.5, '3']) {
    assert.ok(calcularCotizacion([{ id: 'landing' }, { id: 'paginas-adicionales', cantidad }]).error, String(cantidad))
  }
})

test('servicio inexistente → error', () => {
  assert.match(calcularCotizacion([{ id: 'landing' }, { id: 'tienda-online' }]).error, /no existe/)
})

test('sin web base o con dos webs base → error', () => {
  assert.match(calcularCotizacion([{ id: 'formulario' }]).error, /tipo de web/)
  assert.match(calcularCotizacion([{ id: 'landing' }, { id: 'corporativa' }]).error, /tipo de web/)
})

test('selección vacía o repetida → error', () => {
  assert.ok(calcularCotizacion([]).error)
  assert.ok(calcularCotizacion(null).error)
  assert.match(calcularCotizacion([{ id: 'landing' }, { id: 'landing' }]).error, /repetido/)
})
