# Laringe Studio

Simulador vocal en el navegador: analiza tu voz, la muestra en una cabeza humana animada (corte sagital), la modula en un coro de cuatro voces y genera música con ese coro para tu videojuego.

## Qué hace

1. **Simulador de cabeza**: corte sagital con pliegues vocales, faringe, velo del paladar, lengua, mandíbula y labios. Se mueve en tiempo real con tu voz:
   - el **tono** (frecuencia fundamental, YIN) hace vibrar los pliegues vocales y la glotis (vista superior);
   - los **formantes F1/F2** (LPC) colocan la lengua y abren la mandíbula;
   - la **vocal** detectada (A, E, I, O, U) redondea los labios.
2. **Muestra para el coro**: cantas una “aaa” sostenida 3 s y la app busca el tramo más estable.
3. **Perfil y reconocimiento**:
   - test de rango de 8 s → nota más grave y más aguda y tipo de voz (bajo, barítono, tenor, contralto, mezzo, soprano);
   - guardar perfiles con nombre (en el navegador, `localStorage`);
   - “¿Quién canta?” compara una grabación nueva con los perfiles guardados (espectro medio, formantes y tono).
4. **Voces del coro**: tu muestra se modula con **TD-PSOLA** en Soprano, Contralto, Tenor y Bajo. Cambia la nota conservando tus formantes, y además desplaza los formantes por voz para que suene más aguda o más grave. Puedes elegir de 1 a 4 cantantes por voz o mantener tu timbre exacto.
5. **Generador musical** con 7 estilos: Épico orquestal, Batalla / jefe final, Terror, Fantasía medieval, Chiptune 8-bit, Lo-fi tranquilo y Exploración ambiental. Cada pieza:
   - se compone nueva (armonía, conducción de voces, melodía, batería, capas) a partir de una “variación” (semilla) repetible;
   - termina en un **loop perfecto** (la cola de reverberación se suma al inicio);
   - se descarga como **WAV**: mezcla, solo coro o solo orquesta, para mezclar en tu motor (Godot, Unity, etc.).

Todo el audio se procesa en tu navegador; nada se sube a ningún servidor.

## Cómo usarlo

El micrófono solo funciona en `https://` o en `localhost`.

**Opción A: GitHub Pages**
En el repositorio: *Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`*. En un minuto estará en `https://<tu-usuario>.github.io/laringe-studio/`.

**Opción B: en tu computadora**

```bash
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Consejos para un buen coro

- Canta la muestra con una vocal abierta (“aaa” u “ooo”), sin vibrato fuerte y a volumen constante.
- Elige una nota media de tu rango; la modulación suena mejor si las voces no se alejan más de una octava de tu nota.
- Usa auriculares para que el micrófono no capte la música.
- Para el juego, exporta “solo coro” y “sin coro” por separado si quieres controlar el volumen del coro en el motor.

## Estructura

```
index.html        interfaz
css/style.css     estilos
js/analysis.js    tono (YIN), formantes (LPC), vocal, tipo de voz, huella vocal
js/voice.js       muestra, TD-PSOLA, desplazamiento de formantes, voz de ejemplo
js/head.js        dibujo de la cabeza y la glotis
js/music.js       composición, instrumentos sintetizados, render y exportación WAV
js/app.js         flujo de la app y animación
```

## Límites

- El reconocimiento de voz es una comparación sencilla de características; sirve para distinguir voces de tu equipo, no como sistema biométrico.
- El coro sale de una sola vocal grabada: canta todas las notas con esa vocal (no articula letra).
