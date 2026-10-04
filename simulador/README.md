# Ensayo · Simulador de conversaciones difíciles

Elegís una situación (pedir un aumento, dar feedback negativo, atender a un cliente enojado…), practicás la charla con un personaje interpretado por Gemini (Google) y al terminar recibís un diagnóstico: tono, asertividad, empatía, claridad, dos aciertos y tres frases tuyas reescritas mejor.

## Qué incluye

| Fase | Qué hay |
|---|---|
| 0 | Proyecto Next.js 16 + TypeScript + Tailwind, listo para Vercel |
| 1 | 6 situaciones, chat en vivo con el personaje, tope de 10 mensajes |
| 2 | Diagnóstico en JSON (JSON mode de Gemini con `responseSchema`, validado con Zod) y pantalla de resultado |
| 3 | Login con email y contraseña (Supabase), aprobación de cuentas por el administrador, historial, límite de 3 prácticas por día |
| 4 | Landing, aviso de "no es terapia", eventos de Vercel Analytics y consultas de métricas |

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. En **SQL Editor**, pegá y corré `supabase/migrations/0001_init.sql` y después `supabase/migrations/0002_profiles.sql`.
   - Dejá activado **Authentication → Sign In / Providers → Email → Confirm email**: es lo que impide que alguien se registre con el mail del administrador.
3. En **Authentication → URL Configuration**:
   - **Site URL**: la URL de producción (por ejemplo `https://ensayo.vercel.app`).
   - **Redirect URLs**: agregá `http://localhost:3000/**` y `https://TU-DOMINIO/**` (los usan la confirmación del email y "olvidé mi contraseña").
4. En **Project Settings → API** copiá la URL, la `anon` key y la `service_role` key.

### 2. Gemini (gratis)

1. Entrá a [Google AI Studio](https://aistudio.google.com/apikey) con tu cuenta de Google y tocá **Create API key**.
2. Guardala como `GEMINI_API_KEY`. No hace falta cargar tarjeta: el plan gratuito alcanza para el MVP.
3. Modelo por defecto: `gemini-2.5-flash`. Si Google lo reemplaza por otro Flash gratuito, cambiá `GEMINI_MODEL` sin tocar el código.

Límites del plan gratuito: hay un tope de pedidos por minuto y por día (los valores vigentes están en la página de *Rate limits* de la documentación de Gemini). Si se agota, la app muestra "Se agotó la cuota gratuita de la IA por ahora". Cada práctica usa hasta 10 pedidos de chat más 1 de diagnóstico. En el plan gratuito, Google puede usar los datos de los pedidos para mejorar sus productos: avisalo en tus términos si vas a tener usuarios reales.

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
- `lib/ai.ts`: cliente de Gemini (`@google/genai`) y conversión del historial al formato de Gemini.
- `app/api/chat`: lee el historial **de la base**, llama a Gemini en vivo (sin razonamiento previo, para que responda rápido) y guarda el par de mensajes solo si la respuesta llegó completa. Corta en 10 mensajes.
- `app/api/feedback`: genera el diagnóstico una sola vez por práctica y la marca como terminada. Si Gemini devuelve un JSON que no cumple el formato, no se guarda nada y el usuario puede reintentar.
- `proxy.ts`: refresca la sesión de Supabase y protege `/practicar`, `/sesion`, `/admin`, `/pendiente` y `/cuenta`.
- `lib/access.ts`: cada cuenta nueva queda **pendiente** (tabla `profiles`) hasta que el administrador la acepta. Sin aprobación no se puede practicar, ni desde las páginas ni desde las API.
- Administrador: el email de `ADMIN_EMAIL` (por defecto `matipealv@gmail.com`; varios separados por coma), solo si Supabase confirmó ese email. Tiene prácticas ilimitadas y el panel `/admin` con usuarios (aceptar, denegar, quitar acceso), métricas y las prácticas de todos.
- Contraseñas: alta con confirmación del email una sola vez, login con contraseña y "olvidé mi contraseña" (`/cuenta/clave`).
- Base de datos: el navegador solo **lee** lo suyo (RLS). Todas las escrituras pasan por el servidor con la service role key, así nadie puede saltear los límites escribiendo directo en Supabase.

## Métricas del lanzamiento

- **Vercel Analytics**: eventos `practica_iniciada` (con `repetida`) y `diagnostico_pedido`.
- **Supabase**: `supabase/metricas.sql` calcula el % que llega al diagnóstico, cuántos repiten dentro de los 7 días y el puntaje promedio por situación.

Criterio para pasar a la v2 (voz, situaciones propias): más del 60% de las prácticas llega al diagnóstico y más del 25% de los usuarios repite en la semana.

## Prueba con usuarios (pendiente, la hacés vos)

1. Invitá a 15 a 20 personas (LinkedIn, grupos de RRHH, conocidos).
2. Pediles que hagan al menos 2 prácticas.
3. Hacé 5 charlas cortas: ¿qué les sirvió del diagnóstico?, ¿el personaje se sintió real?, ¿volverían?
