# INDUSTRIAL MAINTENANCE
### Asset Integrity · Corrosion Management (ISO 4628 / ASTM D610) · Maintenance & Scaffolding Planning

Plataforma monorepo de ingeniería y relevamiento en planta industrial, optimizada para arquitectura serverless de alto desempeño y costo cero sobre **Vercel** (Frontend Next.js 14), **Neon** (PostgreSQL Serverless) y **Backblaze B2** (Object Storage S3 para planos y fotos de alta resolución), con cliente **PWA Mobile-First 100% Offline** en campo (IndexedDB / Dexie.js).

---

## 1. Arquitectura del Sistema

```
c:\Relevamiento\
├── .gitignore                           # Exclusión de node_modules, .next, builds y claves locales
├── README.md                            # Guía integral de módulos y operaciones
├── supabase/                            # Esquemas SQL compatibles con PostgreSQL (Neon / Supabase)
│   └── migrations/
│       └── 001_initial_schema.sql       # Tablas, relaciones, RLS y auditoría
└── apps/
    ├── api/                             # Microservicio de procesamiento analítico (Python / FastAPI)
    │   ├── requirements.txt             # ezdxf, PyMuPDF, openpyxl, psutil
    │   └── main.py                      # Algoritmos de cubicación y análisis de corrosión
    └── web/                             # Aplicación Principal Next.js 14+ (Vercel Ready)
        ├── package.json & tsconfig.json
        └── src/
            ├── app/
            │   ├── page.tsx             # Selector de acceso (/campo vs /ingenieria)
            │   ├── campo/page.tsx       # Módulo PWA: Relevamiento 100% Offline con QR y fotos
            │   └── ingenieria/
            │       ├── planos/page.tsx  # Visor CAD/PDF vectorial, polígonos, pines y Drawer
            │       ├── parametros/page.tsx # Matriz de criticidad, cubicador paramétrico y costos
            │       ├── campanas/page.tsx   # Optimización de andamio compartido y paradas de planta
            │       ├── presupuestos/page.tsx # Plan plurianual (3-5 años) y exportación SAP PM
            │       ├── diagnostico-ia/page.tsx # Diagnóstico IA (Gemini) Human-in-the-Loop
            │       └── sistema/page.tsx # Monitor de infraestructura y telemetría
            ├── components/
            │   ├── campo/               # VectorAnnotationCanvas, SyncStatusBadge, QRScannerModal
            │   ├── ingenieria/          # InteractivePlantMap, ZoneDrawer, ReplacePlanFileModal, UploadPlanModal
            │   └── sistema/             # MetricCard con semáforos en tiempo real
            └── lib/
                ├── db.ts                # Base de datos local IndexedDB (Dexie.js)
                ├── dxfParser.ts         # Parser de AutoCAD DXF a SVG nativo con filtrado de capas
                ├── pdfRenderer.ts       # Conversor vectorial nativo PDF (SVGGraphics) & Canvas Ultra-HD
                ├── imageCompression.ts   # Compresión WebP en navegador (<180 KB)
                ├── syncManager.ts        # Sincronización offline-first con cola y reintentos
                └── mockData.ts          # Semillas maestras de planta y datos iniciales
```

---

## 2. Stack de Infraestructura y Despliegue en la Nube

| Componente | Plataforma / Tecnología | Ventajas y Cuota Gratuita |
| :--- | :--- | :--- |
| **Frontend & Serverless Edge** | **Vercel** (Next.js 14) | Carga global instantánea (<1s), sin límite de 750 horas, despliegues automáticos vía Git. |
| **Base de Datos Relacional** | **Neon** (PostgreSQL Serverless) | Escalado a cero y reactivación en <500ms, sin suspensión destructiva a los 7 días. |
| **Storage de Planos y Fotos** | **Backblaze B2** (API S3) | **10 GB de almacenamiento gratuito**, descarga gratis con Cloudflare Bandwidth Alliance. |
| **Persistencia Local en Campo** | **Dexie.js** (IndexedDB) | Operación 100% desconectada en sótanos, túneles y áreas sin cobertura celular o WiFi. |

---

## 3. Módulos y Funcionalidades Principales

### 🗺️ Módulo de Planos y Planta Interactiva (`/ingenieria/planos`)
* **Motor Vectorial Nativo para Planos:**
  * **Soporte AutoCAD DXF (`.dxf`):** Parser directo de entidades CAD (`LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, `TEXT`) con filtrado automático de capas congeladas, apagadas, `DEFPOINTS` y espacio papel.
  * **Soporte PDF de Ultra Alta Resolución (1200 / 2400 DPI):** Renderizado vectorial directo mediante `pdfjsLib.SVGGraphics`, garantizando nitidez matemática infinita (sin pixelación al hacer zoom profundo).
* **Super-Zoom hasta 40x (4000%):** Navegación fluida con rueda de ratón centrada en el puntero, paneo libre (`limitToBounds: false`) y botones de salto rápido (`+2x`, `+6x`).
* **Etiquetado Mínimo no Invasivo:** Las zonas muestran únicamente un rótulo exterior compacto (ej. `[EDI-EF]`) para no tapar equipos, bombas, cañerías ni textos de ingeniería.
* **Ficha Técnica en Drawer Lateral (`ZoneDrawer`):** Al seleccionar una zona, el panel lateral muestra en detalle:
  * Código y nombre completo del sector.
  * Georreferenciación y Cota multinivel (`+146.000 m Suelo Base`, `+152.000 m Pasarelas`, etc.).
  * Disciplinas involucradas (Estructuras, Parral de Cañerías, Soportes, Hormigón).
  * Cubicación de andamios ($m^3$, altura de parada, criticidad).
  * Editor de vértices en plano (`P1..Pn`) y botones para recalcular parámetros.
* **Pines de Activos con Semáforo de Corrosión:**
  * 🟢 **Verde**: Condición normal (Ri 0 - Ri 1)
  * 🟡 **Amarillo**: Deterioro incipiente (Ri 2 - Ri 3)
  * 🟠 **Naranja**: Corrosión severa (Ri 4)
  * 🔴 **Rojo**: Reemplazo estructural crítico (Ri 5 con pulsación visual)
  * ⚪ **Gris**: Sin relevar

---

### 📱 Módulo de Campo Mobile-First (`/campo`)
* **100% Desconectado:** Diseñado para teléfonos y tablets industriales con UI de alto contraste para visibilidad bajo luz solar.
* **Lector QR Integrado:** Escaneo de chapas metálicas o etiquetas con cámara trasera para abrir la ficha del activo al instante.
* **Lienzo de Anotación Vectorial (`VectorAnnotationCanvas`):** Permite dibujar flechas, círculos y cotas sobre las fotografías capturadas, almacenando los trazos como vectores JSON livianos.
* **Compresión Inteligente en Cliente:** Reduce fotos pesadas de 12 MP a formatos WebP optimizados de ~180 KB antes de almacenarlas en IndexedDB.

---

### 🤖 Diagnóstico con Inteligencia Artificial (`/ingenieria/diagnostico-ia`)
* **Análisis Multimodal de Corrosión:** Clasificación automatizada de grado de oxidación según normas **ISO 4628** (Ri 1 a Ri 5) y **ASTM D610**.
* **Guardarraíl Human-in-the-Loop:** La IA genera una sugerencia técnica preliminar, pero requiere validación y firma digital del inspector para generar órdenes de trabajo.
* **Comparador Histórico Interanual:** Mapeo fotográfico año a año para calcular la velocidad de degradación (mm/año) y proyectar el tiempo hasta falla.

---

### 📊 Cubicaciones, Campañas y Plan Maestro (`/ingenieria/parametros` y `/presupuestos`)
* **Matriz de Criticidad Industrial:** Severidad $\times$ Probabilidad (1 a 25) con semaforización de prioridades (Parada de Planta, Campaña, Preventivo, Rutinario).
* **Cálculo de Andamio Compartido:** Algoritmo que detecta elementos contiguos para reutilizar una misma estructura tubular, mostrando el ahorro neto en USD y horas hombre.
* **Integración con SAP PM:** Exportación de presupuestos y campañas directamente a formato CSV compatible con ERP, incluyendo códigos de equipo y ubicaciones técnicas.

---

## 4. Guía de Ejecución Local

### Prerrequisitos:
* Node.js v18+ o v20+
* NPM / PNPM

### Pasos:
```bash
# 1. Clonar el repositorio
git clone https://github.com/diegoiq/industrial-maintenance.git
cd industrial-maintenance

# 2. Instalar dependencias del frontend web
cd apps/web
npm install

# 3. Iniciar en modo desarrollo
npm run dev

# 4. O compilar para producción
npm run build
npm start
```
Abre tu navegador en [http://localhost:3000](http://localhost:3000).

---

## 5. Variables de Entorno para Producción (Vercel)

Al conectar este repositorio con **Vercel**, configura las siguientes variables en el panel de Vercel:

```env
# Conexión a Neon PostgreSQL
DATABASE_URL=postgres://usuario:password@ep-ejemplo.us-east-2.aws.neon.tech/neondb?sslmode=require

# Conexión a Backblaze B2 (API S3)
B2_ENDPOINT=s3.us-east-005.backblazeb2.com
B2_BUCKET_NAME=industrial-maintenance-assets
B2_KEY_ID=tu_application_key_id
B2_APPLICATION_KEY=tu_application_key

# IA Multimodal (Opcional para Diagnóstico)
GEMINI_API_KEY=tu_clave_gemini
```
