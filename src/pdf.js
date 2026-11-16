const PDFDocument = require('pdfkit')

const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)
const MORADO = '#5b3fd6'
const GRIS = '#555566'

// Escribe el PDF del presupuesto en el stream `salida`.
// `datos` ya viene validado y con los importes calculados por el servidor.
function generarPdf(datos, salida) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Presupuesto - ${datos.cliente}` } })
  doc.pipe(salida)
  const ancho = doc.page.width - 100

  // Cabecera
  doc.rect(0, 0, doc.page.width, 90).fill(MORADO)
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text('Presupuesta mi web', 50, 30)
  doc.font('Helvetica').fontSize(11).text('Presupuesto de desarrollo web', 50, 58)
  doc.fillColor('#000').moveDown(3)

  doc.y = 115
  doc.font('Helvetica-Bold').fontSize(11).text('Cliente: ', 50, doc.y, { continued: true })
  doc.font('Helvetica').text(datos.cliente)
  doc.font('Helvetica-Bold').text('Fecha: ', { continued: true })
  doc.font('Helvetica').text(datos.fecha)
  doc.moveDown()

  const titulo = (t) => {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor(MORADO).text(t, 50)
    doc.moveTo(50, doc.y + 2).lineTo(50 + ancho, doc.y + 2).strokeColor('#ccccdd').stroke()
    doc.moveDown(0.5).fillColor('#000').font('Helvetica').fontSize(10.5)
  }

  titulo('Resumen del proyecto')
  doc.text(datos.resumen || 'Sin resumen.', { width: ancho })

  titulo('Servicios incluidos')
  for (const l of datos.lineas) {
    if (doc.y > doc.page.height - 120) doc.addPage()
    doc.font('Helvetica-Bold').text(l.cantidad > 1 ? `${l.nombre} (x${l.cantidad})` : l.nombre)
    doc.font('Helvetica').fillColor(GRIS).text(l.descripcion, { width: ancho })
    if (l.justificacion) doc.font('Helvetica-Oblique').text(`Motivo: ${l.justificacion}`, { width: ancho })
    doc.fillColor('#000').moveDown(0.5)
  }

  titulo('Desglose de importes')
  const colImporte = 50 + ancho - 100
  for (const l of datos.lineas) {
    const y = doc.y
    const concepto = l.cantidad > 1 ? `${l.nombre}: ${l.cantidad} x ${eur(l.precioUnitario)}` : l.nombre
    doc.text(concepto, 50, y, { width: ancho - 110 })
    doc.text(eur(l.importe), colImporte, y, { width: 100, align: 'right' })
    doc.moveDown(0.3)
  }
  doc.moveTo(50, doc.y + 2).lineTo(50 + ancho, doc.y + 2).strokeColor('#000').stroke()
  doc.moveDown(0.5)
  const yTotal = doc.y
  doc.font('Helvetica-Bold').fontSize(13).text('TOTAL', 50, yTotal)
  doc.fillColor(MORADO).text(eur(datos.total), colImporte - 50, yTotal, { width: 150, align: 'right' })
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text('IVA no incluido. Importes calculados con las tarifas vigentes.', 50)
  doc.fillColor('#000')

  titulo('Aclaraciones y aspectos pendientes')
  if (datos.aclaraciones.length === 0) {
    doc.text('No hay aspectos pendientes.')
  } else {
    for (const a of datos.aclaraciones) doc.text(`•  ${a}`, { width: ancho, paragraphGap: 3 })
  }

  doc.end()
}

module.exports = { generarPdf }
