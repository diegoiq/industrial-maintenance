import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { b2Client, BUCKET_NAME } from '@/lib/b2';

export const dynamic = 'force-dynamic';

const SAFE_B2_KEY_REGEX = /^(planos|inspecciones)\/[a-zA-Z0-9_:-]+(?:\/[a-zA-Z0-9_.-]+)?\.[a-z0-9]+$/;

async function resolveImageToInlineData(
  imageInput?: string | null
): Promise<{ mimeType: string; data: string } | null> {
  if (!imageInput || typeof imageInput !== 'string') return null;

  // 1. Data URL directa (subida desde PC o caché local)
  if (imageInput.startsWith('data:')) {
    const idx = imageInput.indexOf(';base64,');
    if (idx === -1) return null;
    const mimeType = imageInput.slice(5, idx).trim().toLowerCase();
    const data = imageInput.slice(idx + 8);
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(mimeType)) return null;
    return { mimeType, data };
  }

  // 2. Ruta interna segura /api/media?key=... -> leer directo desde Backblaze B2
  if (imageInput.startsWith('/api/media?')) {
    try {
      const urlObj = new URL(imageInput, 'http://localhost');
      const key = urlObj.searchParams.get('key');
      if (!key || key.includes('..') || !SAFE_B2_KEY_REGEX.test(key)) return null;

      const obj = await b2Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key
        })
      );
      if (!obj.Body) return null;
      const bytes = await obj.Body.transformToByteArray();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = obj.ContentType || (key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') ? 'image/jpeg' : 'image/webp');
      return { mimeType, data: base64 };
    } catch (err) {
      console.warn('No se pudo leer imagen desde B2 para análisis IA:', err);
      return null;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageUrl,
      zonaCodigo = 'GENERAL',
      zonaNombre = 'Sector Industrial',
      cotaM = 146.0,
      superficieM2 = 250,
      andamioM3 = 180,
      disciplinas = 'estructuras_acero',
      gradoCampo = 'Ri 3',
      porcentajeCampo = 20,
      observacionesCampo = '',
      evaluacionCivil = null
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        fallbackRequired: true,
        reason: 'GEMINI_API_KEY no configurada en el servidor.'
      });
    }

    const inlineImage = await resolveImageToInlineData(imageUrl);
    if (!inlineImage) {
      return NextResponse.json({
        success: false,
        fallbackRequired: true,
        reason: 'No hay fotografía válida disponible para análisis visual multimodal.'
      });
    }

    const promptText = `Eres un Ingeniero Especialista Senior en Integridad de Activos Industriales, Corrosión (ISO 4628-3 / ASTM D610 / ISO 12944) y Patologías Civiles de Hormigón Armado (ACI).
Analiza la fotografía adjunta tomada en planta industrial y el contexto técnico:
- Sector / Zona: [${zonaCodigo}] ${zonaNombre} (Cota +${cotaM} m, Superficie ref: ${superficieM2} m², Andamio est: ${andamioM3} m³)
- Disciplinas: ${disciplinas}
- Pre-evaluación del operario en campo: Grado ${gradoCampo}, afectación estimada ${porcentajeCampo}%
- Observaciones de campo: ${observacionesCampo || 'Ninguna'}
- Evaluación civil adjunta: ${evaluacionCivil ? JSON.stringify(evaluacionCivil) : 'No aplica'}

Responde ÚNICAMENTE con un objeto JSON válido con exactamente esta estructura:
{
  "norma_referencia": "ISO 4628-3 / ASTM D610 / ISO 12944 (o ACI si es civil)",
  "grado_corrosion_estimado": "Ri X (Descripción corta y % visual observado)",
  "tipo_morfologia": "Descripción técnica precisa de lo que ves en la foto (óxido laminar, pitting, ampollamiento, fisura, spalling, armadura expuesta, falla de junta, etc.)",
  "riesgo_perdida_seccion": "Bajo / Moderado / Alto / Crítico con justificación visual",
  "ensayo_complementario_sugerido": "Ensayos NDT recomendados (ej. UT espesores, Pull-Off, Esclerometría, etc.)",
  "requiere_reemplazo_estructural": false,
  "sistema_recomendado": "Procedimiento completo de saneamiento/reparación y esquema de recubrimiento o mortero civil",
  "descripcion_tecnica_automatica": "Memoria descriptiva profesional de 3 a 4 líneas lista para imprimir en el Informe Técnico Preliminar."
}`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: inlineImage.mimeType,
                    data: inlineImage.data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errTxt = await geminiRes.text().catch(() => '');
      console.warn('Error respuesta Gemini API:', geminiRes.status, errTxt);
      return NextResponse.json({
        success: false,
        fallbackRequired: true,
        reason: `Gemini API respondió HTTP ${geminiRes.status}`
      });
    }

    const geminiJson = await geminiRes.json();
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({
        success: false,
        fallbackRequired: true,
        reason: 'Respuesta vacía de Gemini.'
      });
    }

    const parsed = JSON.parse(rawText);

    return NextResponse.json({
      success: true,
      mode: 'gemini_vision',
      model: modelName,
      diagnosis: {
        status: 'success',
        mode: 'gemini_vision',
        human_in_the_loop_notice:
          'Pre-diagnóstico visual generado por Gemini Vision Multimodal. Requiere validación obligatoria de Ingeniería antes de liberar orden SAP PM.',
        evaluacion_normativa: {
          norma_referencia: parsed.norma_referencia || 'ISO 4628-3 / ASTM D610 / ISO 12944',
          grado_corrosion_estimado: parsed.grado_corrosion_estimado || gradoCampo,
          tipo_morfologia: parsed.tipo_morfologia || 'Evaluación visual completada',
          riesgo_perdida_seccion: parsed.riesgo_perdida_seccion || 'Evaluar en sitio',
          ensayo_complementario_sugerido: parsed.ensayo_complementario_sugerido || 'Control de espesores UT / EPS'
        },
        sugerencia_intervencion: {
          requiere_reemplazo_estructural: !!parsed.requiere_reemplazo_estructural,
          sistema_recomendado: parsed.sistema_recomendado || 'Saneamiento St3 + Esquema Epoxi-Poliuretano'
        },
        descripcion_tecnica_automatica: parsed.descripcion_tecnica_automatica || ''
      }
    });
  } catch (err) {
    console.error('Error en /api/ai/analyze:', err);
    return NextResponse.json({
      success: false,
      fallbackRequired: true,
      reason: 'Error procesando análisis multimodal.'
    });
  }
}
