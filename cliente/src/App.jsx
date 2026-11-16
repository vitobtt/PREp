import { useEffect, useMemo, useRef, useState } from 'react'

const eur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const MAX_MENSAJE = 1500

const EJEMPLOS = [
  'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas.',
  'Quiero algo sencillo para mi negocio, que se vea bien.',
  'Necesito una tienda online con pasarela de pago para vender ropa.'
]

const BIENVENIDA = {
  role: 'assistant',
  content: 'Hola, soy el asistente de presupuestos. Cuéntame qué web necesitas (a qué se dedica tu negocio, qué secciones quieres, si necesitas formularios o idiomas…) y te propondré los servicios.'
}

export default function App() {
  const [catalogo, setCatalogo] = useState([])
  const [cliente, setCliente] = useState('')

  // Chat
  const [mensajes, setMensajes] = useState([])
  const [borrador, setBorrador] = useState('')
  const [cargando, setCargando] = useState(false)
  const [errorIA, setErrorIA] = useState(null)
  const [heroTexto, setHeroTexto] = useState('')

  // Propuesta editable
  const [hayPropuesta, setHayPropuesta] = useState(false)
  const [resumen, setResumen] = useState('')
  const [seleccion, setSeleccion] = useState([])
  const [aclaraciones, setAclaraciones] = useState([])
  const [nuevaNota, setNuevaNota] = useState('')
  const [anadir, setAnadir] = useState('')

  // Presupuesto calculado por el servidor
  const [cotizacion, setCotizacion] = useState(null)
  const [firmaCotizacion, setFirmaCotizacion] = useState(null)
  const [errorCot, setErrorCot] = useState(null)
  const [calculando, setCalculando] = useState(false)
  const [descargando, setDescargando] = useState(false)

  const listaRef = useRef(null)
  const dialogoRef = useRef(null)

  useEffect(() => {
    fetch('/api/catalogo').then((r) => r.json()).then(setCatalogo).catch(() => {})
  }, [])

  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes, cargando, errorIA])

  const porId = useMemo(() => new Map(catalogo.map((s) => [s.id, s])), [catalogo])

  // ---------- Chat ----------
  async function llamar(conversacion) {
    setCargando(true)
    setErrorIA(null)
    try {
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente, mensajes: conversacion })
      })
      const datos = await res.json().catch(() => ({}))
      if (res.status === 400) {
        // error de validación: el mensaje no se añade a la conversación
        setErrorIA({ mensaje: datos.error, reintentable: false })
        return
      }
      setBorrador('')
      if (!res.ok) {
        setMensajes(conversacion)
        setErrorIA({ mensaje: datos.error || `Error ${res.status}`, reintentable: true })
        return
      }
      setMensajes([...conversacion, { role: 'assistant', content: datos.respuesta }])
      aplicarPropuesta(datos)
    } catch {
      setMensajes(conversacion)
      setBorrador('')
      setErrorIA({ mensaje: 'No se pudo conectar con el servidor. Comprueba que la API está arrancada.', reintentable: true })
    } finally {
      setCargando(false)
    }
  }

  function enviar(e, texto = borrador) {
    e?.preventDefault()
    if (cargando) return
    // se envía sin filtrar: el servidor valida que no esté vacío y su longitud
    llamar([...mensajes, { role: 'user', content: texto }])
  }

  function aplicarPropuesta(p) {
    // respuesta sin nada que mostrar (p. ej. tema ajeno a una web)
    if (p.servicios.length === 0 && !p.resumen && p.dudas.length === 0 && p.fueraDeCatalogo.length === 0) return
    setHayPropuesta(true)
    setResumen(p.resumen)
    setSeleccion(p.servicios.map((s) => ({ ...s, incluido: true, origen: 'ia' })))
    setAclaraciones([
      ...p.dudas.map((t) => ({ texto: t, tipo: 'duda' })),
      ...p.fueraDeCatalogo.map((f) => ({
        texto: `${f.necesidad}: no incluido en el catálogo, pendiente de valorar${f.motivo ? ` (${f.motivo})` : ''}.`,
        tipo: 'fuera'
      }))
    ])
  }

  function empezarDesdeHero(e) {
    e.preventDefault()
    document.getElementById('asistente').scrollIntoView({ behavior: 'smooth' })
    if (heroTexto.trim()) {
      enviar(null, heroTexto)
      setHeroTexto('')
    }
  }

  function nuevoProyecto() {
    setMensajes([]); setBorrador(''); setErrorIA(null)
    setHayPropuesta(false); setResumen(''); setSeleccion([]); setAclaraciones([])
    setCotizacion(null); setErrorCot(null)
  }

  // ---------- Edición de la propuesta ----------
  const cambiarServicio = (id, cambios) =>
    setSeleccion((sel) =>
      sel.map((s) => {
        if (s.id === id) return { ...s, ...cambios }
        // solo puede haber una web base incluida
        if (cambios.incluido && porId.get(id)?.grupo === 'base' && porId.get(s.id)?.grupo === 'base') {
          return { ...s, incluido: false }
        }
        return s
      })
    )

  function anadirServicio(e) {
    e.preventDefault()
    if (!anadir) return
    const esBase = porId.get(anadir)?.grupo === 'base'
    setSeleccion((sel) => [
      // si se añade una web base, la otra se desmarca
      ...sel.map((s) => (esBase && porId.get(s.id)?.grupo === 'base' ? { ...s, incluido: false } : s)),
      { id: anadir, cantidad: null, justificacion: '', incluido: true, origen: 'manual' }
    ])
    setAnadir('')
    setHayPropuesta(true)
  }

  const quitarServicio = (id) => setSeleccion((sel) => sel.filter((s) => s.id !== id))
  const disponibles = catalogo.filter((s) => !seleccion.some((x) => x.id === s.id))
  const incluidos = seleccion.filter((s) => s.incluido)

  const faltan = incluidos
    .map((s) => porId.get(s.id))
    .filter((def, i) => def?.cantidad && !(Number.isInteger(incluidos[i].cantidad) &&
      incluidos[i].cantidad >= def.cantidad.min && incluidos[i].cantidad <= def.cantidad.max))
  const sinBase = !incluidos.some((s) => porId.get(s.id)?.grupo === 'base')

  const cuerpo = {
    cliente,
    resumen,
    servicios: incluidos.map(({ id, cantidad, justificacion }) => ({ id, cantidad, justificacion })),
    aclaraciones: aclaraciones.map((a) => a.texto)
  }
  const firma = JSON.stringify(cuerpo)
  const obsoleto = cotizacion && firma !== firmaCotizacion

  async function calcular() {
    setCalculando(true)
    setErrorCot(null)
    try {
      const res = await fetch('/api/cotizacion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: firma
      })
      const datos = await res.json()
      if (!res.ok) { setCotizacion(null); setErrorCot(datos.error || `Error ${res.status}`); return }
      setCotizacion(datos)
      setFirmaCotizacion(firma)
    } catch {
      setErrorCot('No se pudo conectar con la API. Vuelve a intentarlo.')
    } finally {
      setCalculando(false)
    }
  }

  async function descargarPdf() {
    setDescargando(true)
    try {
      const res = await fetch('/api/presupuesto/pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: firmaCotizacion
      })
      if (!res.ok) {
        const datos = await res.json().catch(() => ({}))
        throw new Error(datos.error || `Error ${res.status}`)
      }
      const blob = await res.blob()
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'presupuesto.pdf'
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      dialogoRef.current?.close()
    } catch (e) {
      setErrorCot(`No se pudo generar el PDF: ${e.message}`)
      dialogoRef.current?.close()
    } finally {
      setDescargando(false)
    }
  }

  const visibles = [BIENVENIDA, ...mensajes]

  return (
    <>
      <a className="salto" href="#asistente">Saltar al asistente</a>

      <nav className="nav" aria-label="Principal">
        <a className="logo" href="#inicio">presupuesto<b>.web</b></a>
        <ul>
          <li><a href="#asistente">Asistente</a></li>
          <li><a href="#como">Cómo funciona</a></li>
        </ul>
      </nav>

      <header className="hero" id="inicio">
        <div className="orbe orbe-a" aria-hidden="true" />
        <div className="orbe orbe-b" aria-hidden="true" />
        <h1>Cuéntanos tu web<br />y te preparamos el presupuesto</h1>
        <p className="lead">
          Describe tu proyecto con tus palabras. Nuestro asistente te propone los servicios, tú los revisas y descargas el presupuesto en PDF.
        </p>
        <form className="hero-form" onSubmit={empezarDesdeHero}>
          <label className="sr" htmlFor="hero-texto">Describe tu proyecto</label>
          <input
            id="hero-texto"
            placeholder="Ej.: web para mi restaurante con carta y reservas"
            value={heroTexto}
            onChange={(e) => setHeroTexto(e.target.value)}
          />
          <button type="submit" className="btn-verde">Empezar</button>
        </form>
        <div className="hero-espacio" />
      </header>

      <main>
        <section className="seccion" id="asistente" aria-labelledby="t-asis">
          <div className="cab-seccion">
            <div>
              <h2 id="t-asis">Asistente de presupuestos</h2>
              <p className="sub">La IA propone los servicios; los precios los calcula nuestro servidor con las tarifas vigentes.</p>
            </div>
            {(mensajes.length > 0 || hayPropuesta) && (
              <button type="button" className="btn-link" onClick={nuevoProyecto}>Nuevo proyecto</button>
            )}
          </div>

          <div className="campo-cliente">
            <label htmlFor="cliente">Nombre del cliente o empresa</label>
            <input
              id="cliente"
              value={cliente}
              maxLength={120}
              placeholder="Ej.: Restaurante La Prueba S.L. (datos ficticios)"
              onChange={(e) => setCliente(e.target.value)}
            />
          </div>

          <div className="grid">
            {/* ---------- Chat ---------- */}
            <div className="card chat">
              <ol className="mensajes" ref={listaRef} aria-live="polite" aria-label="Conversación">
                {visibles.map((m, i) => (
                  <li key={i} className={`burbuja ${m.role === 'user' ? 'usuario' : 'bot'}`}>{m.content}</li>
                ))}
                {cargando && <li className="burbuja bot escribiendo">Analizando tu solicitud…</li>}
                {errorIA && (
                  <li className="error" role="alert">
                    <strong>{errorIA.reintentable ? 'El asistente no ha podido responder' : 'Revisa tu mensaje'}</strong>
                    <p>{errorIA.mensaje}</p>
                    {errorIA.reintentable && (
                      <button type="button" className="btn-sec peq" onClick={() => llamar(mensajes)} disabled={cargando}>
                        Reintentar
                      </button>
                    )}
                  </li>
                )}
                {mensajes.length === 0 && !cargando && (
                  <li className="ejemplos">
                    <span>Prueba con un ejemplo:</span>
                    {EJEMPLOS.map((t) => (
                      <button key={t} type="button" className="chip" onClick={() => setBorrador(t)}>{t}</button>
                    ))}
                  </li>
                )}
              </ol>

              <form className="entrada" onSubmit={enviar}>
                <label className="sr" htmlFor="mensaje">Describe tu proyecto</label>
                <textarea
                  id="mensaje"
                  rows={3}
                  value={borrador}
                  placeholder="Describe tu proyecto o responde a las dudas del asistente…"
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
                />
                <div className="entrada-pie">
                  <small className={borrador.length > MAX_MENSAJE ? 'contador excedido' : 'contador'}>
                    {borrador.length}/{MAX_MENSAJE}
                  </small>
                  <button className="btn" type="submit" disabled={cargando}>
                    {cargando ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </form>
            </div>

            {/* ---------- Propuesta ---------- */}
            <section className="card propuesta" aria-label="Propuesta">
              {!hayPropuesta ? (
                <div className="vacio">
                  <p><strong>Tu propuesta aparecerá aquí.</strong></p>
                  <p>Describe tu proyecto en el chat o añade servicios del catálogo manualmente.</p>
                </div>
              ) : (
                <>
                  <h3>Propuesta</h3>
                  <div className="campo">
                    <label htmlFor="resumen">Resumen del proyecto</label>
                    <textarea id="resumen" rows={3} value={resumen} maxLength={1500} onChange={(e) => setResumen(e.target.value)} />
                  </div>

                  <div>
                    <p className="etiqueta">Servicios</p>
                    {seleccion.length === 0 && <p className="hint">No hay servicios seleccionados.</p>}
                    <ul className="servicios">
                      {seleccion.map((s) => {
                        const def = porId.get(s.id)
                        if (!def) return null
                        const falta = s.incluido && faltan.includes(def)
                        return (
                          <li key={s.id} className={s.incluido ? 'servicio' : 'servicio descartado'}>
                            <label className="interruptor">
                              <input type="checkbox" checked={s.incluido} onChange={(e) => cambiarServicio(s.id, { incluido: e.target.checked })} />
                              <span>
                                <strong>{def.nombre}</strong>
                                <small>{def.regla === 'Precio fijo' ? eur(def.precio) : def.regla}</small>
                              </span>
                            </label>
                            <p className="desc">{def.descripcion}</p>
                            {s.justificacion && <p className="just">{s.origen === 'ia' ? 'Por qué: ' : ''}{s.justificacion}</p>}
                            {def.cantidad && s.incluido && (
                              <div className="cantidad">
                                <label htmlFor={`c-${s.id}`}>{def.cantidad.etiqueta}</label>
                                <input
                                  id={`c-${s.id}`}
                                  type="number"
                                  min={def.cantidad.min}
                                  max={def.cantidad.max}
                                  value={s.cantidad ?? ''}
                                  aria-invalid={falta}
                                  onChange={(e) => cambiarServicio(s.id, { cantidad: e.target.value === '' ? null : Number(e.target.value) })}
                                />
                                {falta && <p className="msg-error">Completa este dato ({def.cantidad.min}-{def.cantidad.max}) para continuar.</p>}
                              </div>
                            )}
                            {s.origen === 'manual' && (
                              <button type="button" className="btn-link peq" onClick={() => quitarServicio(s.id)}>Quitar</button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {disponibles.length > 0 && (
                      <form className="anadir" onSubmit={anadirServicio}>
                        <label className="sr" htmlFor="anadir">Añadir servicio del catálogo</label>
                        <select id="anadir" value={anadir} onChange={(e) => setAnadir(e.target.value)}>
                          <option value="">Añadir servicio del catálogo…</option>
                          {disponibles.map((s) => (
                            <option key={s.id} value={s.id}>{s.nombre} · {s.regla === 'Precio fijo' ? eur(s.precio) : s.regla}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn-sec peq" disabled={!anadir}>Añadir</button>
                      </form>
                    )}
                  </div>

                  <div>
                    <p className="etiqueta">Aclaraciones y pendientes</p>
                    {aclaraciones.length === 0 && <p className="hint">No hay aspectos pendientes.</p>}
                    <ul className="aclaraciones">
                      {aclaraciones.map((a, i) => (
                        <li key={i} className={a.tipo}>
                          <span>{a.texto}</span>
                          <button type="button" aria-label="Eliminar aclaración" onClick={() => setAclaraciones((l) => l.filter((_, j) => j !== i))}>×</button>
                        </li>
                      ))}
                    </ul>
                    <form className="anadir" onSubmit={(e) => {
                      e.preventDefault()
                      if (!nuevaNota.trim()) return
                      setAclaraciones((l) => [...l, { texto: nuevaNota.trim(), tipo: 'nota' }])
                      setNuevaNota('')
                    }}>
                      <label className="sr" htmlFor="nota">Añadir aclaración</label>
                      <input id="nota" value={nuevaNota} maxLength={400} placeholder="Añadir una nota…" onChange={(e) => setNuevaNota(e.target.value)} />
                      <button type="submit" className="btn-sec peq">Añadir</button>
                    </form>
                  </div>

                  {(faltan.length > 0 || sinBase) && (
                    <p className="msg-error">
                      {sinBase ? 'Incluye un tipo de web (landing o corporativa). ' : ''}
                      {faltan.length > 0 ? 'Faltan datos para calcular algunas partidas.' : ''}
                    </p>
                  )}

                  <button className="btn" type="button" onClick={calcular} disabled={calculando || faltan.length > 0}>
                    {calculando ? 'Calculando…' : cotizacion ? 'Recalcular presupuesto' : 'Calcular presupuesto'}
                  </button>

                  {errorCot && <div className="error" role="alert"><strong>No se pudo calcular</strong><p>{errorCot}</p></div>}

                  {cotizacion && (
                    <div className="resultado">
                      <div className="resultado-cab">
                        <h3>Presupuesto</h3>
                        {obsoleto && <span className="aviso">Has cambiado datos: recalcula</span>}
                      </div>
                      <dl className={obsoleto ? 'obsoleto' : ''}>
                        {cotizacion.lineas.map((l) => (
                          <div key={l.id}>
                            <dt>{l.nombre}{l.cantidad > 1 ? ` (${l.cantidad} × ${eur(l.precioUnitario)})` : ''}</dt>
                            <dd>{eur(l.importe)}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className={obsoleto ? 'total obsoleto' : 'total'}>
                        <span>Total</span>
                        <strong>{eur(cotizacion.total)}</strong>
                      </div>
                      <p className="hint">IVA no incluido. Importe calculado por el servidor.</p>
                      <button className="btn-verde" type="button" disabled={obsoleto} onClick={() => dialogoRef.current?.showModal()}>
                        Revisar y descargar PDF
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </section>

        <section className="seccion alt" id="como" aria-labelledby="t-como">
          <h2 id="t-como">Cómo funciona</h2>
          <ol className="pasos">
            <li><span>1</span><h3>Cuéntanos</h3><p>Explica tu proyecto en el chat. El asistente te propone servicios de nuestro catálogo.</p></li>
            <li><span>2</span><h3>Revisa</h3><p>Acepta, quita o añade servicios y resuelve las dudas pendientes.</p></li>
            <li><span>3</span><h3>Descarga</h3><p>El servidor calcula los importes y generas el presupuesto en PDF.</p></li>
          </ol>
        </section>
      </main>

      {/* ---------- Vista previa del PDF ---------- */}
      <dialog className="dialogo" ref={dialogoRef} aria-labelledby="t-prev">
        {cotizacion && (
          <>
            <h2 id="t-prev" className="sr">Vista previa del presupuesto</h2>
            <article className="papel">
              <header className="papel-cab">
                <strong>Presupuesta mi web</strong>
                <span>Presupuesto de desarrollo web</span>
              </header>
              <p><b>Cliente:</b> {cotizacion.cliente}<br /><b>Fecha:</b> {cotizacion.fecha}</p>
              <h3>Resumen del proyecto</h3>
              <p>{cotizacion.resumen || 'Sin resumen.'}</p>
              <h3>Servicios incluidos</h3>
              {cotizacion.lineas.map((l) => (
                <div key={l.id} className="papel-servicio">
                  <b>{l.nombre}{l.cantidad > 1 ? ` (x${l.cantidad})` : ''}</b>
                  <p>{l.descripcion}</p>
                  {l.justificacion && <p><i>Motivo: {l.justificacion}</i></p>}
                </div>
              ))}
              <h3>Desglose de importes</h3>
              <table>
                <tbody>
                  {cotizacion.lineas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nombre}{l.cantidad > 1 ? `: ${l.cantidad} × ${eur(l.precioUnitario)}` : ''}</td>
                      <td>{eur(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th>TOTAL</th><th>{eur(cotizacion.total)}</th></tr></tfoot>
              </table>
              <p className="papel-nota">IVA no incluido. Importes calculados con las tarifas vigentes.</p>
              <h3>Aclaraciones y aspectos pendientes</h3>
              {cotizacion.aclaraciones.length ? (
                <ul>{cotizacion.aclaraciones.map((a, i) => <li key={i}>{a}</li>)}</ul>
              ) : <p>No hay aspectos pendientes.</p>}
            </article>
            <div className="dialogo-acciones">
              <button type="button" className="btn-link" onClick={() => dialogoRef.current?.close()}>Volver a editar</button>
              <button type="button" className="btn-verde" onClick={descargarPdf} disabled={descargando}>
                {descargando ? 'Generando…' : 'Aceptar y descargar PDF'}
              </button>
            </div>
          </>
        )}
      </dialog>

      <footer className="pie">
        <p>presupuesto<b>.web</b> · Práctica de API con Express, React y OpenAI</p>
        <a href="#inicio">Volver arriba ↑</a>
      </footer>
    </>
  )
}
