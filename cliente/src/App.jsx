import { useEffect, useMemo, useRef, useState } from 'react'
import mascota from './assets/mascota.webp'
import mascotaCara from './assets/mascota-cara.webp'

const eur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

const MAX_MENSAJE = 1500

const EJEMPLOS = [
  { etiqueta: 'Restaurante con reservas', texto: 'Necesito una web para un restaurante. Quiero mostrar la carta, tener un formulario para solicitar reservas y ofrecer el contenido en dos idiomas.' },
  { etiqueta: 'Algo sencillo', texto: 'Quiero algo sencillo para mi negocio, que se vea bien.' },
  { etiqueta: 'Tienda online', texto: 'Necesito una tienda online con pasarela de pago para vender ropa.' }
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
  const textareaRef = useRef(null)

  useEffect(() => {
    fetch('/api/catalogo').then((r) => r.json()).then(setCatalogo).catch(() => {})
  }, [])

  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensajes, cargando, errorIA])

  // la caja de texto crece con el contenido (hasta un máximo)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [borrador])

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
  const paso = cotizacion && !obsoleto ? 3 : hayPropuesta ? 2 : 1
  const precioTexto = (def) => (def.regla === 'Precio fijo' ? eur(def.precio) : def.regla)

  function ajustarCantidad(id, def, delta) {
    const s = seleccion.find((x) => x.id === id)
    const actual = Number.isInteger(s?.cantidad) ? s.cantidad : def.cantidad.min - (delta > 0 ? 1 : 0)
    cambiarServicio(id, { cantidad: Math.min(def.cantidad.max, Math.max(def.cantidad.min, actual + delta)) })
  }

  return (
    <>
      <a className="salto" href="#asistente">Saltar al asistente</a>

      <nav className="nav" aria-label="Principal">
        <a className="logo" href="#inicio">
          <img src={mascotaCara} alt="" width="30" height="30" />
          <span>presupuesto<b>.web</b></span>
        </a>
        <ul>
          <li><a href="#como">Cómo funciona</a></li>
          <li><a className="nav-cta" href="#asistente">Pedir presupuesto</a></li>
        </ul>
      </nav>

      <header className="hero" id="inicio">
        <div className="hero-grid">
          <div className="hero-texto">
            <span className="eyebrow"><IconoChispa /> Presupuestos web con IA</span>
            <h1>Cuéntanos tu web y te preparamos el <span className="degradado">presupuesto</span></h1>
            <p className="lead">
              Descríbela con tus palabras. El asistente te propone los servicios, tú decides qué se queda y descargas el presupuesto en PDF.
            </p>
            <form className="hero-form" onSubmit={empezarDesdeHero}>
              <label className="sr" htmlFor="hero-texto">Describe tu proyecto</label>
              <input
                id="hero-texto"
                placeholder="Ej.: web para mi restaurante con carta y reservas"
                value={heroTexto}
                onChange={(e) => setHeroTexto(e.target.value)}
              />
              <button type="submit" className="btn btn-primario">
                Empezar <IconoFlecha />
              </button>
            </form>
            <ul className="ventajas">
              <li><IconoCheck /> Tarifas reales, sin sorpresas</li>
              <li><IconoCheck /> Tú revisas cada servicio</li>
              <li><IconoCheck /> PDF al momento</li>
            </ul>
          </div>
          <figure className="hero-mascota" aria-hidden="true">
            <span className="bocadillo">¿Hablamos de tu web?</span>
            <img src={mascota} alt="" width="520" height="847" />
          </figure>
        </div>
      </header>

      <main>
        <section className="seccion" id="asistente" aria-labelledby="t-asis">
          <div className="cab-seccion">
            <div>
              <h2 id="t-asis">Tu presupuesto en tres pasos</h2>
              <p className="sub">La IA propone los servicios; los importes los calcula nuestro servidor con las tarifas vigentes.</p>
            </div>
            {(mensajes.length > 0 || hayPropuesta) && (
              <button type="button" className="btn btn-fantasma" onClick={nuevoProyecto}>
                <IconoReiniciar /> Nuevo proyecto
              </button>
            )}
          </div>

          <ol className="progreso" aria-label="Progreso">
            {['Describe tu proyecto', 'Revisa la propuesta', 'Descarga el PDF'].map((t, i) => (
              <li key={t} className={paso > i + 1 ? 'hecho' : paso === i + 1 ? 'actual' : ''} aria-current={paso === i + 1 ? 'step' : undefined}>
                <span>{paso > i + 1 ? <IconoCheck /> : i + 1}</span>{t}
              </li>
            ))}
          </ol>

          <div className="grid">
            {/* ---------- Chat ---------- */}
            <div className="card chat">
              <div className="chat-cab">
                <img className="avatar grande" src={mascotaCara} alt="" width="44" height="44" />
                <div>
                  <strong>Asistente de presupuestos</strong>
                  <small><i className={cargando ? 'punto activo' : 'punto'} aria-hidden="true" />{cargando ? 'Escribiendo…' : 'En línea'}</small>
                </div>
              </div>

              <ol className="mensajes" ref={listaRef} aria-live="polite" aria-label="Conversación">
                {visibles.map((m, i) =>
                  m.role === 'user' ? (
                    <li key={i} className="burbuja usuario">{m.content}</li>
                  ) : (
                    <li key={i} className="fila-bot">
                      <img className="avatar" src={mascotaCara} alt="" width="30" height="30" />
                      <span className="burbuja bot">{m.content}</span>
                    </li>
                  )
                )}
                {cargando && (
                  <li className="fila-bot">
                    <img className="avatar" src={mascotaCara} alt="" width="30" height="30" />
                    <span className="burbuja bot puntos" aria-label="El asistente está escribiendo"><i /><i /><i /></span>
                  </li>
                )}
                {errorIA && (
                  <li className="aviso-error" role="alert">
                    <IconoAlerta />
                    <div>
                      <strong>{errorIA.reintentable ? 'El asistente no ha podido responder' : 'Revisa tu mensaje'}</strong>
                      <p>{errorIA.mensaje}</p>
                      {errorIA.reintentable && (
                        <button type="button" className="btn btn-secundario peq" onClick={() => llamar(mensajes)} disabled={cargando}>
                          <IconoReiniciar /> Reintentar
                        </button>
                      )}
                    </div>
                  </li>
                )}
              </ol>

              {mensajes.length === 0 && !cargando && (
                <div className="ejemplos" role="group" aria-label="Ejemplos">
                  <span>Prueba con:</span>
                  {EJEMPLOS.map((e) => (
                    <button key={e.etiqueta} type="button" className="chip" title={e.texto} onClick={() => { setBorrador(e.texto); textareaRef.current?.focus() }}>
                      {e.etiqueta}
                    </button>
                  ))}
                </div>
              )}

              <form className="entrada" onSubmit={enviar}>
                <label className="sr" htmlFor="mensaje">Describe tu proyecto</label>
                <div className="entrada-caja">
                  <textarea
                    id="mensaje"
                    ref={textareaRef}
                    rows={1}
                    value={borrador}
                    placeholder="Escribe tu mensaje…"
                    onChange={(e) => setBorrador(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) enviar(e) }}
                  />
                  <button className="enviar" type="submit" disabled={cargando} aria-label="Enviar">
                    <IconoEnviar />
                  </button>
                </div>
                <div className="entrada-pie">
                  <small>Enter para enviar · Shift + Enter para nueva línea</small>
                  <small className={borrador.length > MAX_MENSAJE ? 'contador excedido' : 'contador'}>
                    {borrador.length}/{MAX_MENSAJE}
                  </small>
                </div>
              </form>
            </div>

            {/* ---------- Propuesta ---------- */}
            <section className="card propuesta" aria-labelledby="t-prop">
              <div className="bloque">
                <h3 id="t-prop">Datos del presupuesto</h3>
                <label className="etiqueta" htmlFor="cliente">Cliente o empresa</label>
                <input
                  id="cliente"
                  value={cliente}
                  maxLength={120}
                  placeholder="Ej.: Restaurante La Prueba S.L."
                  onChange={(e) => setCliente(e.target.value)}
                />
              </div>

              {!hayPropuesta ? (
                <div className="bloque">
                  <p className="etiqueta">Lo que ofrecemos</p>
                  <ul className="catalogo">
                    {catalogo.map((s) => (
                      <li key={s.id}>
                        <div><strong>{s.nombre}</strong><small>{s.descripcion}</small></div>
                        <span className="precio">{precioTexto(s)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="hint centrado">Cuéntale tu proyecto al asistente y aquí aparecerá tu propuesta.</p>
                </div>
              ) : (
                <>
                  <div className="bloque">
                    <label className="etiqueta" htmlFor="resumen">Resumen del proyecto</label>
                    <textarea id="resumen" rows={3} value={resumen} maxLength={1500} onChange={(e) => setResumen(e.target.value)} />
                  </div>

                  <div className="bloque">
                    <p className="etiqueta">Servicios <span className="contador-servicios">{incluidos.length} incluidos</span></p>
                    {seleccion.length === 0 && <p className="hint">No hay servicios seleccionados.</p>}
                    <ul className="servicios">
                      {seleccion.map((s) => {
                        const def = porId.get(s.id)
                        if (!def) return null
                        const falta = s.incluido && faltan.includes(def)
                        return (
                          <li key={s.id} className={`servicio${s.incluido ? '' : ' descartado'}${falta ? ' incompleto' : ''}`}>
                            <div className="servicio-cab">
                              <label className="switch">
                                <input type="checkbox" checked={s.incluido} onChange={(e) => cambiarServicio(s.id, { incluido: e.target.checked })} />
                                <i aria-hidden="true" />
                                <strong>{def.nombre}</strong>
                              </label>
                              <span className={s.origen === 'ia' ? 'etiq ia' : 'etiq manual'}>{s.origen === 'ia' ? 'Sugerido' : 'Añadido'}</span>
                              <span className="precio">{precioTexto(def)}</span>
                            </div>
                            <p className="desc">{def.descripcion}</p>
                            {s.justificacion && <p className="just"><IconoChispa /> {s.justificacion}</p>}
                            {def.cantidad && s.incluido && (
                              <div className="cantidad">
                                <label htmlFor={`c-${s.id}`}>{def.cantidad.etiqueta}</label>
                                <div className="stepper">
                                  <button type="button" aria-label="Restar" onClick={() => ajustarCantidad(s.id, def, -1)}>−</button>
                                  <input
                                    id={`c-${s.id}`}
                                    type="number"
                                    min={def.cantidad.min}
                                    max={def.cantidad.max}
                                    value={s.cantidad ?? ''}
                                    placeholder="?"
                                    aria-invalid={falta}
                                    onChange={(e) => cambiarServicio(s.id, { cantidad: e.target.value === '' ? null : Number(e.target.value) })}
                                  />
                                  <button type="button" aria-label="Sumar" onClick={() => ajustarCantidad(s.id, def, 1)}>+</button>
                                </div>
                                {falta && <p className="msg-error">Indica un número entre {def.cantidad.min} y {def.cantidad.max} para continuar.</p>}
                              </div>
                            )}
                            {s.origen === 'manual' && (
                              <button type="button" className="quitar" onClick={() => quitarServicio(s.id)}>Quitar</button>
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
                            <option key={s.id} value={s.id}>{s.nombre} · {precioTexto(s)}</option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secundario peq" disabled={!anadir}>Añadir</button>
                      </form>
                    )}
                  </div>

                  <div className="bloque">
                    <p className="etiqueta">Aclaraciones y pendientes</p>
                    {aclaraciones.length === 0 && <p className="hint">No hay aspectos pendientes.</p>}
                    <ul className="aclaraciones">
                      {aclaraciones.map((a, i) => (
                        <li key={i} className={a.tipo}>
                          <span className="etiq">{a.tipo === 'duda' ? 'Duda' : a.tipo === 'fuera' ? 'Fuera de catálogo' : 'Nota'}</span>
                          <span className="texto">{a.texto}</span>
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
                      <button type="submit" className="btn btn-secundario peq">Añadir</button>
                    </form>
                  </div>

                  <div className="bloque acciones-finales">
                    {/* el nombre se repite aquí (mismo estado que el campo de arriba) para tenerlo a la vista al calcular */}
                    <div className={cliente.trim() ? 'campo-final' : 'campo-final falta-cliente'}>
                      <label className="etiqueta" htmlFor="cliente-final">Presupuesto a nombre de</label>
                      <input
                        id="cliente-final"
                        value={cliente}
                        maxLength={120}
                        placeholder="Nombre del cliente o empresa"
                        onChange={(e) => setCliente(e.target.value)}
                      />
                      {!cliente.trim() && <p className="hint">Indícalo para poder calcular. Aparecerá en el presupuesto y en el PDF.</p>}
                    </div>
                    {(faltan.length > 0 || sinBase) && (
                      <p className="msg-error">
                        <IconoAlerta />
                        {sinBase ? 'Incluye un tipo de web (landing o corporativa). ' : ''}
                        {faltan.length > 0 ? 'Faltan datos para calcular algunas partidas.' : ''}
                      </p>
                    )}
                    <button className="btn btn-primario ancho" type="button" onClick={calcular} disabled={calculando || faltan.length > 0 || !cliente.trim()}>
                      {calculando ? 'Calculando…' : cotizacion ? 'Recalcular presupuesto' : 'Calcular presupuesto'}
                    </button>

                    {errorCot && (
                      <div className="aviso-error" role="alert">
                        <IconoAlerta />
                        <div><strong>No se pudo calcular</strong><p>{errorCot}</p></div>
                      </div>
                    )}

                    {cotizacion && (
                      <div className={obsoleto ? 'resultado obsoleto' : 'resultado'}>
                        <div className="resultado-cab">
                          <small>Presupuesto para</small>
                          <strong>{cotizacion.cliente}</strong>
                          <small>{cotizacion.fecha}</small>
                        </div>
                        {obsoleto && <span className="aviso">Has cambiado datos: recalcula</span>}
                        <dl>
                          {cotizacion.lineas.map((l) => (
                            <div key={l.id}>
                              <dt>{l.nombre}{l.cantidad > 1 ? <small> {l.cantidad} × {eur(l.precioUnitario)}</small> : null}</dt>
                              <dd>{eur(l.importe)}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="total">
                          <span>Total <small>IVA no incluido</small></span>
                          <strong>{eur(cotizacion.total)}</strong>
                        </div>
                        <button className="btn btn-verde ancho" type="button" disabled={obsoleto} onClick={() => dialogoRef.current?.showModal()}>
                          <IconoDoc /> Revisar y descargar PDF
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        </section>

        <section className="seccion alt" id="como" aria-labelledby="t-como">
          <h2 id="t-como">Cómo funciona</h2>
          <p className="sub">Tú pones la idea; nosotros la convertimos en un presupuesto claro.</p>
          <ol className="pasos">
            <li><span className="icono"><IconoChat /></span><h3>Cuéntanos</h3><p>Explica tu proyecto en el chat. El asistente lo relaciona con los servicios de nuestro catálogo.</p></li>
            <li><span className="icono"><IconoLista /></span><h3>Revisa</h3><p>Acepta, quita o añade servicios, completa los datos que falten y resuelve las dudas.</p></li>
            <li><span className="icono"><IconoDoc /></span><h3>Descarga</h3><p>El servidor calcula los importes con las tarifas vigentes y generas el PDF.</p></li>
          </ol>
        </section>
      </main>

      {/* ---------- Vista previa del PDF ---------- */}
      <dialog className="dialogo" ref={dialogoRef} aria-labelledby="t-prev">
        {cotizacion && (
          <>
            <div className="dialogo-cab">
              <h2 id="t-prev">Presupuesto para {cotizacion.cliente}</h2>
              <button type="button" className="cerrar" aria-label="Cerrar" onClick={() => dialogoRef.current?.close()}>×</button>
            </div>
            <div className="dialogo-cuerpo">
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
            </div>
            <div className="dialogo-acciones">
              <button type="button" className="btn btn-fantasma" onClick={() => dialogoRef.current?.close()}>Volver a editar</button>
              <button type="button" className="btn btn-verde" onClick={descargarPdf} disabled={descargando}>
                <IconoDescarga /> {descargando ? 'Generando…' : 'Aceptar y descargar PDF'}
              </button>
            </div>
          </>
        )}
      </dialog>

      <footer className="pie">
        <a className="logo" href="#inicio">
          <img src={mascotaCara} alt="" width="26" height="26" />
          <span>presupuesto<b>.web</b></span>
        </a>
        <p>Práctica de API con Express, React y OpenAI · Precios orientativos, IVA no incluido</p>
        <a href="#inicio">Volver arriba ↑</a>
      </footer>
    </>
  )
}

/* ---------- Iconos (SVG en línea, heredan el color del texto) ---------- */
const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const IconoEnviar = () => <svg {...svg}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
const IconoFlecha = () => <svg {...svg}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
const IconoCheck = () => <svg {...svg}><path d="M20 6 9 17l-5-5" /></svg>
const IconoChispa = () => <svg {...svg}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></svg>
const IconoReiniciar = () => <svg {...svg}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" /></svg>
const IconoAlerta = () => <svg {...svg}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
const IconoDoc = () => <svg {...svg}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>
const IconoDescarga = () => <svg {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>
const IconoChat = () => <svg {...svg}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
const IconoLista = () => <svg {...svg}><path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m3 6 1 1 2-2" /><path d="m3 12 1 1 2-2" /><path d="m3 18 1 1 2-2" /></svg>
