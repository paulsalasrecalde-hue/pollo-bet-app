# Resumen de chat - Pollo Bet App

Fecha: 2026-06-30

## Contexto general
- App de apuestas tipo "pollazo" para Mundial 2026.
- Stack: Node.js + Express + frontend HTML/CSS/JS + SSE.
- Datos en memoria (se limpian al reiniciar servidor).

## Reglas de negocio trabajadas
- Registro por nombre.
- Creacion de apuesta por usuario.
- Aceptacion de apuesta por otro usuario.
- Bloqueo de auto-aceptacion (nadie debe apostarse a si mismo).
- Aceptacion automatica con equipo contrario y mismas presas.
- Bloqueo de apuestas si partido ya inicio/finalizo.

## Cambios de UI trabajados
- Secciones separadas para propuestas y vigentes.
- Ajustes de textos (POLLAZO BEAT, subtitulos, mensajes).
- Boton de aceptar en propuestas.
- Flujo de paso 1 / paso 2 y bloqueo-desbloqueo por nueva apuesta.

## Problema actual reportado por usuario
- "No permite confirmar" especificamente en apuestas creadas por el usuario principal.
- Entre otros usuarios si logran aceptarse.
- Persisten inconsistencias de identificacion de usuario en frontend.

## Ultimo requerimiento del usuario
- Eliminar campo de nombre en aceptacion y usar solo nombre confirmado en Paso 1.
- Mantener bloqueo estricto de auto-aceptacion.
- Guardar este chat para retomar sin perder contexto.

## Comandos utiles
- Arranque servidor (PowerShell):
  Set-Location 'C:\Users\corap\Desktop\pollo-bet-app'; $env:PORT='3001'; node .\server.js
- Limpieza total de estado (reinicio):
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

## Nota
- Este archivo se creo para conservar el contexto de la conversacion y continuar depuracion en la siguiente iteracion.
