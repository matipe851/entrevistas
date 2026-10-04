# Ensayo · Simulador de conversaciones difíciles

MVP: elegís una situación (pedir un aumento, dar feedback negativo, cliente enojado…) y practicás la charla con un personaje interpretado por Claude.

Estado: Fase 0 y Fase 1 (6 situaciones, chat en vivo, tope de 10 mensajes). El diagnóstico, el login y el historial llegan en las fases 2 y 3.

## Correrlo

```bash
cd simulador
cp .env.example .env.local   # completá ANTHROPIC_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

## Deploy en Vercel

Creá un proyecto nuevo en Vercel con **Root Directory = `simulador`** y la variable `ANTHROPIC_API_KEY`. No toca el sitio que ya está en la raíz del repo.

## Estructura

- `lib/scenarios.ts`: las 6 situaciones y el prompt del personaje.
- `app/api/chat/route.ts`: llama a Claude y devuelve la respuesta en vivo; valida el historial y el tope de mensajes.
- `app/page.tsx`: lista de situaciones.
- `app/practicar/[slug]/`: pantalla de práctica.
