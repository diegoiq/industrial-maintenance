# INDUSTRIAL MAINTENANCE
### Asset Integrity · Corrosion Management (ISO 4628 / ASTM D610) · Maintenance Planning

Plataforma monorepo de uso interno en planta industrial, optimizada para desplegarse sobre **Render** (Node.js & Python FastAPI) y **Supabase** (PostgreSQL, Storage y Auth) dentro de las cuotas del nivel gratuito (Free Tier) o económico (Starter).

---

## 1. Arquitectura y Módulos del Sistema

```
c:\Relevamiento\
├── render.yaml                          # Despliegue unificado de frontend web y motor API en Render
├── README.md                            # Guía integral de módulos y operaciones
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql       # Tablas, RLS, Auditoría automática y RPC get_supabase_usage()
└── apps/
    ├── api/                             # Motor FastAPI (Python 3.11)
    │   ├── requirements.txt             # FastAPI, psutil, ezdxf, PyMuPDF, openpyxl
    │   └── main.py                      # Endpoints: /health/metrics, /api/v1/cubicar, /api/v1/ai/analyze-corrosion
    └── web/                             # Next.js 14+ (App Router, Tailwind CSS, TypeScript)
        ├── package.json & tsconfig.json
        └── src/
            ├── app/
            │   ├── page.tsx             # Selector de acceso (/campo vs /ingenieria)
            │   ├── campo/page.tsx       # Módulo 2: PWA Mobile-First 100% Offline (Dexie.js)
            │   └── ingenieria/
            │       ├── planos/page.tsx  # Módulo 1: Visor SVG interactivo, polígonos, pines y Drawer
            │       ├── parametros/page.tsx # Módulo 4: Parámetros, cubicador y Matriz de Criticidad
            │       ├── campanas/page.tsx   # Módulo 5: Campañas de intervención y andamio compartido
            │       ├── presupuestos/page.tsx # Módulo 6: Plan plurianual (3-5 años) y exportación SAP PM
            │       ├── diagnostico-ia/page.tsx # Módulo 3: Diagnóstico IA (Gemini) Human-in-the-Loop
            │       └── sistema/page.tsx # Módulo 7: Monitor de Salud y Límites (Admin)
            ├── components/
            │   ├── campo/               # VectorAnnotationCanvas, SyncStatusBadge, QRScannerModal
            │   ├── ingenieria/          # InteractivePlantMap, ZoneDrawer, QRLabelGeneratorModal
            │   └── sistema/             # MetricCard con semáforos (<70%, 70-85%, >85%)
            └── lib/
                ├── db.ts                # IndexedDB con Dexie.js
                ├── imageCompression.ts   # Compresión WebP en navegador (máx 1600px) y miniaturas (~20 KB)
                ├── syncManager.ts        # Cola con backoff y tolerancia a cold start de Render
                └── mockData.ts          # Semillas maestras de planta y telemetría
```

---

## 2. Detalle de Módulos Implementados

### Módulo 1 – Gestión de Planta y Planos (`/ingenieria/planos`)
- Visor SVG interactivo con pan & zoom.
- Polígonos de zonas de inspección (`131-Z04 Torres`, `131-Z02 Clarificadores`, `131-Z01 Bombas`).
- Pines con semáforo dinámico de corrosión:
  - 🟢 **Verde**: Condición normal (Ri 0 - Ri 1)
  - 🟡 **Amarillo**: Deterioro incipiente (Ri 2 - Ri 3)
  - 🟠 **Naranja**: Corrosión severa (Ri 4)
  - 🔴 **Rojo**: Reemplazo estructural crítico (Ri 5 con aura pulsante)
  - ⚪ **Gris**: Sin relevar
- Panel lateral (**Drawer**) con métricas de zona en vivo.
- Generador de etiquetas QR imprimibles por activo.

### Módulo 2 – App de Campo Offline (`/campo`)
- PWA mobile-first de alto contraste.
- **100% Offline con Dexie.js**: descarga y precarga local de áreas y planos.
- **Compresión WebP en cliente**: reduce fotos de 8-12 MB a ~180 KB antes de guardar en IndexedDB.
- **Lienzo de anotación vectorial (`VectorAnnotationCanvas`)**: círculos, flechas y cuadros delimitadores guardados como coordenadas JSON (0 KB extra en Storage).
- **SyncManager tolerante a Cold Starts**: aviso *"Despertando servidor de ingeniería en Render..."* y reintentos automáticos.

### Módulo 3 – Diagnóstico IA con Human-in-the-Loop (`/ingenieria/diagnostico-ia`)
- Análisis multimodal de corrosión con Gemini bajo norma **ISO 4628 / ASTM D610**.
- **Guardarraíl Human-in-the-Loop**: la IA solo emite pre-diagnósticos; el sistema bloquea órdenes de reemplazo hasta que un Ingeniero valide y firme el informe.
- **Comparador Histórico**: comparación año a año (2024 vs 2025/2026) con cálculo de velocidad de corrosión (mm/año) y proyección de vida útil remanente.

### Módulo 4 – Motor de Cubicaciones y Criticidad (`/ingenieria/parametros`)
- Tabla editable de coeficientes de planta (rendimientos HH, tarifas, costos de pintura, perfiles).
- **Matriz de Criticidad Interactiva**: Severidad (1 a 5) × Criticidad de Activo (1 a 5) = 1 a 25, con priorización automática (**P1 Parada**, **P2 Campaña**, **P3 Preventivo**, **P4 Rutinario**).
- **Simulador Paramétrico en Vivo**: cálculo automático de m² pintura, kg acero reemplazo, m³ andamio envolvente, desglose de HH y costo total estimado.
- Bitácora automática en `auditoria_cambios`.

### Módulo 5 – Campañas y Andamios (`/ingenieria/campanas`)
- Agrupación automática de intervenciones por zona física de acceso.
- Estrategia de **Andamio Compartido**: un solo montaje para múltiples activos, calculando y mostrando el ahorro económico en USD.
- Clasificación operativa: **Parada de Planta** vs **Ejecución en Marcha**.

### Módulo 6 – Presupuestos y Plan Maestro (`/ingenieria/presupuestos`)
- Simulador plurianual a 3 y 5 años con curva de inversión por especialidad (Estructuras, Pintura, Andamios) y proyección de HH.
- **Exportación en CSV/Excel compatible con SAP PM**: incluye campos `ubicacion_tecnica_erp` y `codigo_equipo_erp` para carga directa de órdenes de trabajo.
- Herramienta de archivado ZIP y backup de fotos para liberar almacenamiento en Supabase Storage.

### Módulo 7 – Monitor de Salud y Límites (`/ingenieria/sistema`)
- Panel exclusivo para rol `admin`.
- Semáforo preventivo:
  - 🟢 **Verde**: < 70%
  - 🟡 **Amarillo (Preventivo)**: 70% – 85%
  - 🔴 **Rojo (Crítico)**: > 85% con acciones inmediatas
- Medición de cuotas:
  - **Supabase DB**: vs 500 MB (vía RPC `get_supabase_usage()`).
  - **Supabase Storage**: vs 1 GB (desglose por bucket y botón de archivado ZIP).
  - **Supabase Egress**: vs 5 GB/mes.
  - **Render RAM**: vs 512 MB (vía `psutil` en `/health/metrics`).
  - **Prevención de suspensión Supabase**: botón de Keep-Alive semanal.
