# Ensayo · Simulador de conversaciones difíciles

Elegís una situación (pedir un aumento, dar feedback negativo, atender a un cliente enojado…), practicás la charla con un personaje interpretado por Claude y al terminar recibís un diagnóstico: tono, asertividad, empatía, claridad, dos aciertos y tres frases tuyas reescritas mejor.

## Qué incluye

| Fase | Qué hay |
|---|---|
| 0 | Proyecto Next.js 16 + TypeScript + Tailwind, listo para Vercel |
| 1 | 6 situaciones, chat en vivo con el personaje, tope de 10 mensajes |
| 2 | Diagnóstico con salida estructurada validada con Zod y pantalla de resultado |
| 3 | Login con link mágico (Supabase), historial, límite de 3 prácticas por día |
| 4 | Landing, aviso de "no es terapia", eventos de Vercel Analytics y consultas de métricas |

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. En **SQL Editor**, pegá y corré `supabase/migrations/0001_init.sql`.
3. En **Authentication → URL Configuration**:
   - **Site URL**: la URL de producción (por ejemplo `https://ensayo.vercel.app`).
   - **Redirect URLs**: agregá `http://localhost:3000/auth/callback` y `https://TU-DOMINIO/auth/callback`.
4. En **Project Settings → API** copiá la URL, la `anon` key y la `service_role` key.

### 2. Claude

Creá una API key en [platform.claude.com](https://platform.claude.com) y configurá una **alerta de gasto** en la consola.

### 3. Local

```bash
cd simulador
cp .env.example .env.local   # completá las 4 variables
npm install
npm run dev                  # http://localhost:3000
```

### 4. Vercel

1. Nuevo proyecto desde este repo con **Root Directory = `simulador`** (no toca el sitio de la raíz).
2. Cargá las mismas variables de `.env.example`.
3. En la pestaña **Analytics**, activá Web Analytics.

## Cómo está armado

- `lib/scenarios.ts`: las situaciones y el prompt del personaje. Es solo de servidor: el navegador recibe la versión pública, sin el secreto de cada personaje.
- `app/api/sessions`: crea una práctica y controla el límite diario (horario de Argentina).
- `app/api/chat`: lee el historial **de la base**, llama a Claude en vivo y guarda el par de mensajes solo si la respuesta llegó completa. Corta en 10 mensajes.
- `app/api/feedback`: genera el diagnóstico una sola vez por práctica y la marca como terminada.
- `proxy.ts`: refresca la sesión de Supabase y protege `/practicar` y `/sesion`.
- Base de datos: el navegador solo **lee** lo suyo (RLS). Todas las escrituras pasan por el servidor con la service role key, así nadie puede saltear los límites escribiendo directo en Supabase.

## Métricas del lanzamiento

- **Vercel Analytics**: eventos `practica_iniciada` (con `repetida`) y `diagnostico_pedido`.
- **Supabase**: `supabase/metricas.sql` calcula el % que llega al diagnóstico, cuántos repiten dentro de los 7 días y el puntaje promedio por situación.

Criterio para pasar a la v2 (voz, situaciones propias): más del 60% de las prácticas llega al diagnóstico y más del 25% de los usuarios repite en la semana.

## Prueba con usuarios (pendiente, la hacés vos)

1. Invitá a 15 a 20 personas (LinkedIn, grupos de RRHH, conocidos).
2. Pediles que hagan al menos 2 prácticas.
3. Hacé 5 charlas cortas: ¿qué les sirvió del diagnóstico?, ¿el personaje se sintió real?, ¿volverían?
