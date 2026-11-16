# Laringe Studio

Simulador vocal en el navegador: analiza tu voz, la muestra en una cabeza humana animada (corte sagital), la modula en un coro de cuatro voces y genera música con ese coro para tu videojuego.

## Qué hace

El flujo principal: **grabas una frase cantada con letra → la app te reconoce → arma una canción con tu voz en el estilo que elijas**, lista para usar en tu juego.

1. **Graba tu voz**: canta una frase corta de tu canción (hasta 8 s).
   - Detecta cada nota/sílaba y corrige errores de octava.
   - Si tienes un perfil guardado, te **reconoce** al terminar de grabar.
   - De la misma frase sale el coro de fondo (opcionalmente puedes grabar una “aaa” sostenida para un coro más limpio).
2. **Simulador holográfico**: corte sagital de una cabeza en estilo holograma, con pliegues vocales, faringe, velo del paladar, lengua, mandíbula y labios. Se mueve en tiempo real con tu voz:
   - el **tono** (YIN) hace vibrar los pliegues vocales y la glotis (vista superior);
   - los **formantes F1/F2** (LPC) colocan la lengua y abren la mandíbula;
   - la **vocal** detectada (A, E, I, O, U) redondea los labios.
3. **Perfil y reconocimiento**: guarda perfiles con nombre (en el navegador, con tu frase y tu muestra para reutilizarlas otro día), test de rango de 8 s con tipo de voz, y “¿Quién canta?”.
4. **Voces del coro**: tu voz se modula con **TD-PSOLA** en Soprano, Contralto, Tenor y Bajo, cambiando la nota sin perder tu timbre y desplazando formantes por voz.
5. **Generar canción** en 7 estilos: Épico orquestal, Batalla / jefe final, Terror, Fantasía medieval, Chiptune 8-bit, Lo-fi tranquilo y Exploración ambiental.
   - Tu frase es la **voz principal**: se estira al compás y cada sílaba se afina a la tonalidad del estilo, respetando tu melodía y tu letra.
   - **Armonías** con tu misma voz y letra: una tercera arriba y una sexta abajo.
   - Coro de fondo, orquesta y batería compuestos para el estilo, con una “variación” (semilla) repetible.
   - Termina en un **loop perfecto** y se descarga en **WAV**: mezcla, solo voces o solo orquesta.

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

- Canta la frase con voz clara y a volumen parejo; frases de 2 a 6 segundos funcionan mejor.
- Si grabas la nota sostenida, usa una vocal abierta (“aaa” u “ooo”), sin vibrato fuerte.
- Elige una nota media de tu rango; la modulación suena mejor si las voces no se alejan más de una octava de tu nota.
- Usa auriculares para que el micrófono no capte la música.
- Para el juego, exporta “solo voces” y “sin coro” por separado si quieres controlar el volumen de tu voz en el motor.

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
- La letra la canta tu frase (voz principal y armonías). El coro de fondo usa una sola vocal, sin letra.
- La app no transcribe la letra a texto.
