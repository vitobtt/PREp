# Presupuesto mi web

API REST (Node.js + Express) que calcula el presupuesto de una página web.

## Requisitos

- Node.js 18 o superior (incluye npm)

## Instalación

```bash
cd presupuesto_mi_web
npm install
```

## Ejecución

```bash
npm start
```

Debe mostrarse `api en http://localhost:3000`. Para detener el servidor: `Ctrl + C`.

## Puerto

El servidor escucha en el puerto **3000** (definido en `src/local.js`).
Base de la API: `http://localhost:3000`

## Rutas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/estado` | Comprueba que la API funciona: `{ "status": "ok" }` |
| GET | `/api/tarifas` | Devuelve las tarifas vigentes |
| POST | `/api/presupuesto` | Calcula un presupuesto |

### POST /api/presupuesto

Cuerpo JSON:

| Campo | Tipo | Valores |
|---|---|---|
| `tipo` | texto | `"landing"` o `"corporativa"` |
| `paginas` | entero | de 1 a 20 |
| `formulario` | booleano | `true` / `false` |
| `segundoIdioma` | booleano | `true` / `false` |

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/presupuesto \
  -H "Content-Type: application/json" \
  -d @pruebas/caso2.json
```

Respuesta (200):

```json
{
  "base": 600,
  "paginasAdicionales": 150,
  "formulario": 80,
  "segundoIdioma": 0,
  "total": 830,
  "moneda": "EUR"
}
```

Si la solicitud es incorrecta se responde con **400** y un mensaje, por ejemplo:

```json
{ "error": "paginas debe ser un entero entre 1 y 20" }
```

## Interfaz React (opcional)

Carpeta `cliente/` (React + Vite). Formulario que envía la solicitud a la API y muestra el desglose o el error recibido. Las tarifas mostradas se leen de `GET /api/tarifas`.

Con la API arrancada (`npm start`), en otra terminal:

```bash
cd cliente
npm install
npm run dev
```

Abrir `http://localhost:5173`. Vite redirige las llamadas `/api` al puerto 3000.

## Tarifas

Landing 300 €, corporativa 600 €, página adicional 50 € (a partir de la segunda), formulario 80 €, segundo idioma 150 €.

## Pruebas

La carpeta `pruebas/` contiene un JSON por caso (`caso1.json` a `caso9.json`):

| Caso | Solicitud enviada | Resultado esperado | Resultado obtenido |
|---|---|---|---|
| 1 | `{"tipo":"landing","paginas":1,"formulario":false,"segundoIdioma":false}` | 200 · 300 € | 200 · total 300 ✅ |
| 2 | `{"tipo":"corporativa","paginas":4,"formulario":true,"segundoIdioma":false}` | 200 · 830 € | 200 · total 830 ✅ |
| 3 | `{"tipo":"landing","paginas":2,"formulario":true,"segundoIdioma":true}` | 200 · 580 € | 200 · total 580 ✅ |
| 4 | `{"tipo":"landing","paginas":20,"formulario":false,"segundoIdioma":false}` | 200 · 1250 € | 200 · total 1250 ✅ |
| 5 | `paginas: 0` (resto válido) | 400 | 400 · `paginas debe ser un entero entre 1 y 20` ✅ |
| 6 | `paginas: 21` (resto válido) | 400 | 400 · `paginas debe ser un entero entre 1 y 20` ✅ |
| 7 | `paginas: 2.5` (resto válido) | 400 | 400 · `paginas debe ser un entero entre 1 y 20` ✅ |
| 8 | `tipo: "tienda"` (resto válido) | 400 | 400 · `tipo debe ser "landing" o "corporativa"` ✅ |
| 9 | `formulario: "false"` (resto válido) | 400 | 400 · `formulario debe ser true o false` ✅ |

Cada solicitud está en `pruebas/casoN.json`.

Lanzar todos (con el servidor en marcha):

```bash
for f in pruebas/caso*.json; do
  echo "$f"
  curl -s -w " -> HTTP %{http_code}\n" -X POST http://localhost:3000/api/presupuesto \
    -H "Content-Type: application/json" -d @"$f"
done
```

---

## Asistente con IA (OpenAI)

El cliente describe su proyecto en un chat. La IA propone servicios del catálogo, el usuario los revisa y el servidor calcula los importes y genera el PDF.

### Configuración

1. Copia `.env.example` como `.env.local` (ya está creado) y pon tu clave real:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   ```
2. `.env.local` está en `.gitignore`: **no se sube al repositorio**. La clave solo se usa en el servidor.
3. `npm install` y `npm start` (el servidor carga `.env.local` con `process.loadEnvFile`, Node ≥ 20.12).

### Nuevas rutas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/catalogo` | Catálogo de servicios (id, nombre, descripción, precio, regla) |
| POST | `/api/asistente` | `{ cliente, mensajes: [{role, content}] }` → respuesta del chat + propuesta validada |
| POST | `/api/cotizacion` | `{ cliente, resumen, servicios: [{id, cantidad}], aclaraciones }` → importes calculados |
| POST | `/api/presupuesto/pdf` | Mismo cuerpo → descarga el PDF (se recalcula todo en el servidor) |

Archivos: `src/catalogo.js` (catálogo y cálculo), `src/asistente.js` (llamada a OpenAI con salida JSON estructurada y validación de ids), `src/pdf.js` (PDF con PDFKit).

### Límites y validaciones

- Mensaje vacío → 400. Máximo 1500 caracteres por mensaje y 20 mensajes por conversación.
- Los ids que devuelva la IA se comprueban contra el catálogo; los desconocidos pasan a "pendiente de valorar".
- Al modelo no se le envían precios y se le prohíbe mencionar importes o plazos.
- Fallo de OpenAI (clave errónea, sin saldo, timeout de 30 s, sin conexión) → 502/503/504 con mensaje y botón **Reintentar** en el chat.

### Librería PDF elegida: PDFKit

| Librería | Dónde | Valoración |
|---|---|---|
| **PDFKit** | Servidor | ✅ Elegida. Madura, ligera, texto real (seleccionable), el PDF se genera con los importes del servidor. |
| pdfmake | Cliente/servidor | ✅ Buena alternativa: definición declarativa de tablas. |
| @react-pdf/renderer | React | Buena si se quiere maquetar con componentes y previsualizar en el navegador. |
| jsPDF | Cliente | Correcta para cosas simples; las tablas requieren plugin. Al generarse en el navegador, el cliente podría alterar los importes. |
| Puppeteer / Playwright | Servidor | HTML→PDF fiel, pero descarga un Chromium entero (pesado y lento). |
| html2pdf.js / html2canvas | Cliente | ❌ No recomendable: convierte la página en imagen (texto no seleccionable, borroso, cortes de página). |
| pdf-lib | Ambos | Para modificar PDFs existentes o rellenar formularios; muy bajo nivel para crear uno desde cero. |

### Pruebas realizadas

| Caso | Resultado |
|---|---|
| Descripción vacía | 400 · `la descripción no puede estar vacía` ✅ |
| Mensaje de más de 1500 caracteres | 400 ✅ |
| Fallo en OpenAI (clave no válida) | 502 · `La clave de OpenAI no es válida…` + Reintentar ✅ |
| Cotización corporativa + 2 páginas + formulario + idioma | 200 · 930 € ✅ |
| Página adicional sin cantidad | 400 · pide completar el dato ✅ |
| Id que no existe (`tienda-online`) | 400 ✅ |
| Dos webs base | 400 ✅ |
| PDF | 200 · `application/pdf` con cliente, fecha, resumen, servicios, desglose, total y aclaraciones ✅ |

Pendiente de probar con una clave real: solicitud clara (restaurante), ambigua ("algo sencillo") y fuera de catálogo (tienda online); el chat incluye esos tres ejemplos.

## Despliegue en Vercel

- `npm run build` compila el cliente React en `public/` (Vercel lo sirve como estático).
- Vercel usa el preset **Express**: detecta `src/app.js` (exporta la app) y sirve `public/` como estático. No hay que configurar Output Directory.
- En Vercel → Settings → Environment Variables define `OPENAI_API_KEY` (y opcionalmente `OPENAI_MODEL`) y vuelve a desplegar.
- En local también puedes hacer `npm run build && npm start` y abrir `http://localhost:3000`.
