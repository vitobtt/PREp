const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const C = {
  morado: '#5b3fd6',
  cian: '#22d3ee',
  tinta: '#1b1b2e',
  gris: '#5d5f7a',
  grisClaro: '#9a9cb5',
  linea: '#e3e4ef',
  zebra: '#f6f5fd',
  fondoSuave: '#f3f1fe',
  ambar: '#b45309',
  fondoAmbar: '#fff7e6'
}

let LOGO = null
try { LOGO = fs.readFileSync(path.join(__dirname, 'assets', 'logo.png')) } catch { /* el PDF funciona sin logo */ }

const M = 50 // margen

// Escribe el PDF del presupuesto en el stream `salida`.
// `datos` ya viene validado y con los importes calculados por el servidor.
function generarPdf(datos, salida) {
  const doc = new PDFDocument({
    size: 'A4', margins: { top: M, bottom: 70, left: M, right: M }, bufferPages: true,
    info: { Title: `Presupuesto ${datos.referencia} - ${datos.cliente}`, Author: 'Presupuesta mi web' }
  })
  doc.pipe(salida)
  const W = doc.page.width
  const ancho = W - M * 2
  const limite = () => doc.page.height - 78

  // ---------- Cabecera ----------
  const grad = doc.linearGradient(0, 0, W, 0)
  grad.stop(0, C.morado).stop(1, '#2bb7d9')
  doc.rect(0, 0, W, 118).fill(grad)
  if (LOGO) {
    doc.circle(M + 30, 59, 32).fill('#ffffff')
    doc.image(LOGO, M, 29, { width: 60, height: 60 })
  }
  const xt = LOGO ? M + 76 : M
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(21).text('Presupuesta mi web', xt, 38)
  doc.font('Helvetica').fontSize(10.5).fillColor('#e9e4ff').text('Diseño y desarrollo de páginas web', xt, 64)

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#ffffff').text('PRESUPUESTO', M, 34, { width: ancho, align: 'right' })
  doc.font('Helvetica').fontSize(10).fillColor('#e9e4ff')
    .text(`Ref. ${datos.referencia}`, M, 58, { width: ancho, align: 'right' })
    .text(datos.fecha, M, 73, { width: ancho, align: 'right' })

  // ---------- Cliente ----------
  let y = 134
  doc.roundedRect(M, y, ancho, 50, 8).fill(C.fondoSuave)
  doc.fillColor(C.grisClaro).font('Helvetica-Bold').fontSize(8).text('PREPARADO PARA', M + 16, y + 11, { characterSpacing: 1 })
  doc.fillColor(C.tinta).font('Helvetica-Bold').fontSize(14).text(datos.cliente, M + 16, y + 24, { width: ancho - 32, height: 18, ellipsis: true })
  y += 66

  const titulo = (t) => {
    if (y > limite() - 40) { doc.addPage(); y = M }
    doc.fillColor(C.morado).font('Helvetica-Bold').fontSize(12).text(t.toUpperCase(), M, y, { characterSpacing: 0.6 })
    y = doc.y + 4
    doc.rect(M, y, 28, 2.5).fill(C.cian)
    y += 12
  }

  // ---------- Resumen ----------
  titulo('Resumen del proyecto')
  doc.fillColor(C.tinta).font('Helvetica').fontSize(10.5)
    .text(datos.resumen || 'Sin resumen.', M, y, { width: ancho, lineGap: 2 })
  y = doc.y + 16

  // ---------- Tabla de servicios ----------
  titulo('Servicios incluidos')
  const col = { concepto: M + 12, cant: M + ancho - 210, unit: M + ancho - 160, imp: M + ancho - 82 }
  const anchoConcepto = col.cant - col.concepto - 12

  const cabeceraTabla = () => {
    doc.roundedRect(M, y, ancho, 24, 5).fill(C.tinta)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5)
    doc.text('CONCEPTO', col.concepto, y + 8)
    doc.text('CANT.', col.cant, y + 8, { width: 40, align: 'center' })
    doc.text('PRECIO', col.unit, y + 8, { width: 70, align: 'right' })
    doc.text('IMPORTE', col.imp, y + 8, { width: 70, align: 'right' })
    y += 24
  }
  cabeceraTabla()

  datos.lineas.forEach((l, i) => {
    // altura de la fila según el texto
    doc.font('Helvetica').fontSize(8.8)
    const hDesc = doc.heightOfString(l.descripcion, { width: anchoConcepto })
    doc.font('Helvetica-Oblique').fontSize(8.5)
    const hJust = l.justificacion ? doc.heightOfString(`Motivo: ${l.justificacion}`, { width: anchoConcepto }) + 3 : 0
    const alto = 10 + 15 + hDesc + hJust + 10

    if (y + alto > limite()) { doc.addPage(); y = M; cabeceraTabla() }
    if (i % 2 === 1) doc.rect(M, y, ancho, alto).fill(C.zebra)

    let yy = y + 10
    doc.fillColor(C.tinta).font('Helvetica-Bold').fontSize(10.5).text(l.nombre, col.concepto, yy, { width: anchoConcepto })
    doc.font('Helvetica').fontSize(10)
    doc.text(String(l.cantidad), col.cant, yy, { width: 40, align: 'center' })
    doc.fillColor(C.gris).text(eur(l.precioUnitario), col.unit, yy, { width: 70, align: 'right' })
    doc.fillColor(C.tinta).font('Helvetica-Bold').text(eur(l.importe), col.imp, yy, { width: 70, align: 'right' })
    yy += 15
    doc.fillColor(C.gris).font('Helvetica').fontSize(8.8).text(l.descripcion, col.concepto, yy, { width: anchoConcepto })
    if (l.justificacion) {
      doc.fillColor(C.morado).font('Helvetica-Oblique').fontSize(8.5)
        .text(`Motivo: ${l.justificacion}`, col.concepto, doc.y + 3, { width: anchoConcepto })
    }
    y += alto
    doc.moveTo(M, y).lineTo(M + ancho, y).lineWidth(0.6).strokeColor(C.linea).stroke()
  })

  // ---------- Total ----------
  y += 14
  if (y + 50 > limite()) { doc.addPage(); y = M }
  const anchoTotal = 230
  const xTotal = M + ancho - anchoTotal
  doc.fillColor(C.grisClaro).font('Helvetica').fontSize(8.5)
    .text('Importes calculados con las tarifas vigentes.', M, y + 9, { width: ancho - anchoTotal - 20 })
    .text('IVA no incluido.', M, y + 21, { width: ancho - anchoTotal - 20 })
  doc.roundedRect(xTotal, y, anchoTotal, 40, 8).fill(C.morado)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('TOTAL', xTotal + 16, y + 14)
  doc.fontSize(17).text(eur(datos.total), xTotal + 70, y + 11, { width: anchoTotal - 86, align: 'right' })
  y += 62

  // ---------- Aclaraciones ----------
  doc.font('Helvetica').fontSize(9.8)
  const alturas = datos.aclaraciones.map((a) => doc.heightOfString(a, { width: ancho - 46 }) + 6)
  const altoCaja = datos.aclaraciones.length ? alturas.reduce((s, h) => s + h, 0) + 22 : 16
  // el título nunca se queda solo al final de una página
  if (y + 34 + Math.min(altoCaja, 160) > limite()) { doc.addPage(); y = M }
  titulo('Aclaraciones y aspectos pendientes')
  if (datos.aclaraciones.length === 0) {
    doc.fillColor(C.gris).font('Helvetica').fontSize(10).text('No hay aspectos pendientes.', M, y)
  } else {
    doc.roundedRect(M, y, ancho, altoCaja, 8).fill(C.fondoAmbar)
    doc.rect(M, y, 3.5, altoCaja).fill('#f59e0b')
    let ya = y + 12
    datos.aclaraciones.forEach((a, i) => {
      if (ya + alturas[i] > limite()) { doc.addPage(); ya = M }
      doc.circle(M + 20, ya + 5, 2.4).fill('#f59e0b')
      doc.fillColor(C.tinta).font('Helvetica').fontSize(9.8).text(a, M + 32, ya, { width: ancho - 46 })
      ya += alturas[i]
    })
  }

  // ---------- Pie en todas las páginas ----------
  const paginas = doc.bufferedPageRange()
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i)
    doc.page.margins.bottom = 0 // escribir en el pie sin que PDFKit cree páginas nuevas
    const yp = doc.page.height - 48
    doc.moveTo(M, yp - 8).lineTo(W - M, yp - 8).lineWidth(0.6).strokeColor(C.linea).stroke()
    doc.fillColor(C.grisClaro).font('Helvetica').fontSize(8)
      .text('Presupuesto orientativo calculado con las tarifas vigentes. Importes sin IVA.', M, yp, { width: ancho - 80, lineBreak: false })
      .text(`Página ${i + 1} de ${paginas.count}`, M, yp, { width: ancho, align: 'right', lineBreak: false })
  }

  doc.end()
}

module.exports = { generarPdf }
