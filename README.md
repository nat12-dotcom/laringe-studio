# Laringe Studio

Simulador vocal en el navegador: analiza tu voz, la muestra en una cabeza humana animada (corte sagital), la modula en un coro de cuatro voces y genera música con ese coro para tu videojuego.

## Descargar

Ve a **[Releases](https://github.com/nat12-dotcom/laringe-studio/releases/latest)** y descarga:

- **LaringeStudio-Windows.zip**: app para Windows. Descomprime y abre `Laringe Studio.exe`.
- **LaringeStudio.html**: la app en un solo archivo; ábrelo con doble clic en Chrome o Edge (cualquier sistema).

## Qué hace

1. **Graba tu voz**: canta tu canción completa o varias frases (hasta 4 minutos), con pequeñas pausas entre frases, y pulsa *Terminar*. La app separa tus frases, detecta cada nota y sílaba y **te reconoce** si tienes un perfil guardado.
2. **Simulador holográfico**: corte sagital de la cabeza que se mueve en tiempo real con tu voz (pliegues vocales, lengua, mandíbula, labios; tono por YIN y formantes por LPC).
3. **Perfil y reconocimiento**: perfiles con nombre guardados en el dispositivo, test de rango y tipo de voz, y “¿Quién canta?”.
4. **Voces del coro**: tu voz modulada (TD-PSOLA) en Soprano, Contralto, Tenor y Bajo.
5. **Generar canción** (2 o 3 minutos) en 7 estilos: Épico orquestal, Batalla / jefe final, Terror, Fantasía medieval, Chiptune 8-bit, Lo-fi tranquilo y Exploración ambiental.
   - Estructura completa: Intro → Verso → Estribillo → Verso → Estribillo → Puente → Estribillo → Final, con intensidad distinta en cada parte.
   - Tus frases son la voz principal: los versos van en el orden en que cantaste y el estribillo se repite; cada sílaba se afina a la tonalidad y a los acordes, y se estira al compás.
   - Armonías con tu misma voz en los estribillos y coro de fondo.
   - También hay **loops** de 8, 16 o 32 compases que suenan en bucle sin cortes, para niveles del juego.
6. **Remix con tu instrumental**: sube una instrumental (por ejemplo, hecha con Gemini) en MP3 o WAV.
   - La app detecta su **tempo**, el **inicio de cada compás**, la **tonalidad**, los **acordes de cada compás** y sus partes suaves y fuertes.
   - Canta encima con tu voz grabada: al compás, afinada a sus acordes, con armonías y coro de tu voz en las partes fuertes.
   - Si algo se detecta mal, se corrige con los botones de tempo (×2 / ÷2), inicio del compás y tonalidad.

7. **Efectos de sonido para tu juego**: escribe lo que necesitas (“rugido de dragón gigante y enojado”, “cueva oscura con goteo”, “moneda 8-bit”) y la app crea tres variaciones para elegir.
   - Más de 40 tipos: jefes y criaturas (rugido, gruñido, chillido, risa malvada, ladrido, aparición, derrota, pisotón), escenarios en loop sin cortes (cueva, bosque, lluvia, viento, fuego, río, lava, trueno) y sonidos de juego (espada, explosión, metal, golpe, whoosh, magia, curación, moneda, salto, láser, disparo, subir de nivel, daño, game over, victoria, puerta, pasos, menú, portal, electricidad, alarma, latido, fantasma, robot, campana).
   - Entiende cómo debe sonar: *gigante / pequeño, lejano, fuerte / suave, oscuro, mágico, eléctrico, metálico, de hielo, de fuego, 8-bit* y duraciones como “10 segundos”.
   - Las criaturas y jefes pueden hacerse **con tu propia voz**, transformada en monstruo.
   - Cada sonido se descarga en WAV. Son sonidos sintetizados con recetas de diseño sonoro (no una IA generativa): los efectos típicos de videojuego salen bien; algo muy específico y realista sale aproximado.

Todo se descarga en **WAV**: mezcla, solo voces, o solo orquesta / instrumental.

Todo el audio se procesa en tu navegador; nada se sube a ningún servidor.

## Calidad de sonido

- **Grabación:** se graba en un hilo de audio propio (sin cortes), sin el procesado automático del navegador que deforma la voz cantada. Después se quitan los graves molestos (golpes, zumbido) y el ruido de fondo, aprendido de tus pausas. La app avisa si la grabación saturó o quedó muy baja.
- **Modulación:** los ciclos de las cuerdas vocales se siguen comparando la forma de onda de cada ciclo con el anterior (voz más limpia, menos áspera), y los cambios de nota tienen un portamento natural de unos 30 ms.
- **Mezcla:** cada sílaba se encaja en la corchea más cercana; la voz pasa por una cadena de estudio (filtro de graves, ecualización de presencia y aire, compresor, eco a corchea con puntillo y reverberación); la música baja unos 3 dB mientras cantas, y todas las frases se igualan en volumen.

## Cómo usarlo

Laringe Studio es una **app instalable**: se abre desde el navegador una vez, se instala con un clic y después funciona como cualquier app, incluso sin internet.

**1. Publicarla (solo la primera vez)**
En el repositorio: *Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save*. En un par de minutos estará en `https://nat12-dotcom.github.io/laringe-studio/`.

**2. Instalarla**
- **Computadora (Chrome o Edge):** abre el enlace y pulsa **Instalar app** (arriba a la derecha de la página, o el icono de instalar en la barra de direcciones).
- **Android (Chrome):** abre el enlace y pulsa **Instalar app**, o menú ⋮ → *Instalar aplicación*.
- **iPhone / iPad (Safari):** abre el enlace, pulsa *Compartir* → *Añadir a pantalla de inicio*.

Queda con su icono, se abre en su propia ventana, usa tu micrófono y funciona sin conexión. Cuando hay internet, se actualiza sola con las mejoras que se suban al repositorio.

**Alternativa sin instalar:** en una copia descargada del repositorio, ejecuta `python3 -m http.server 8000` en la carpeta y abre `http://localhost:8000`.

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
js/app.js         flujo de la app, animación e instalación
sw.js             modo sin conexión
manifest.webmanifest, icons/   datos e iconos de la app instalable
```

## Límites

- El reconocimiento de voz es una comparación sencilla de características; sirve para distinguir voces de tu equipo, no como sistema biométrico.
- La letra la canta tu frase (voz principal y armonías). El coro de fondo usa una sola vocal, sin letra.
- La app no transcribe la letra a texto.
