# Presentación Corporativa con Objetivos

Esta es una aplicación web sencilla para presentar diapositivas de resultados, comparar cuotas vs ventas reales, e interactuar con animaciones festivas y puntajes.

## Estructura de Archivos

- `index.html`: La pantalla principal.
- `styles.css`: Estilos visuales.
- `script.js`: La lógica de la aplicación.
- `content.json`: **¡Aquí es donde actualizas las diapositivas cada semana!**
- `assets/`: Carpeta para guardar tus imagenes y sonidos.

## Cómo actualizar las diapositivas (Cada Semana)

1. Abre el archivo `content.json` con cualquier editor de texto (Bloc de notas, VS Code, etc.).
2. Verás una lista bajo `"slides"`. Cada sección entre `{ }` es una diapositiva.
3. Puedes cambiar:
    - `"title"`: El título grande que aparece.
    - `"image"`: La URL o ruta de la imagen de fondo.
      - Para usar imagenes locales, guarda la imagen en `assets/images/foto.jpg` y pon `"assets/images/foto.jpg"` en el archivo json.
    - `"defaultQuota"`: La meta esperada.
    - `"defaultCurrent"`: Lo que se lleva actualmente (usualmente 0 para llenarlo en vivo).

## Cómo agregar música

Guarda un archivo mp3 con sonido de fanfarrea o aplausos en:
`assets/sounds/fanfare.mp3`

O cambia la ruta en `content.json` bajo `"soundEffect"`.

## Cómo usar el Panel de Control

El panel gris en la parte inferior es para el operador (quien presenta):
1. **Navegación:** Usa los botones "Anterior" y "Siguiente" o las flechas del teclado.
2. **Datos:** Escribe la Meta y el dato Actual en las cajas de texto.
3. **Validar:** Presiona "Validar y Celebrar". 
    - Si `Actual >= Meta`, saldrá confeti y sonará la fanfarrea.
    - Aparecerá una ventana para dar puntos (1, 2 o 3).
4. **Puntaje:** El puntaje total se acumula en la parte inferior central.

## Ejecución

Simplemente abre el archivo `index.html` en tu navegador (Chrome, Edge, Firefox). Para mejor experiencia, presiona `F11` para pantalla completa.
