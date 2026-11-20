# Luma — Galería personal para Android

Galería en **React 19 + Vite + Capacitor 7**, con un plugin Android propio en Java. Interfaz en español, diseño adaptable, modo claro/oscuro y funcionamiento local, sin cuentas ni servicios externos.

## Abrir o descargar

- **Demo web:** https://lmiguelm24.github.io/luma-gallery/
- **APK para Android:** https://github.com/lmiguelm24/luma-gallery/releases/latest
- **Código:** https://github.com/lmiguelm24/luma-gallery

La demo usa los archivos que selecciones en el navegador. Para solicitar permisos y consultar la galería de Android, instala el APK de la sección Releases y pulsa **Dar acceso a mi galería**.

GitHub Actions ejecuta las pruebas, compila React y despliega GitHub Pages con cada cambio en `main`. Los APK se adjuntan por separado a las versiones publicadas.

## Funciones

- Consulta las fotos y videos compartidos que Android expone en **MediaStore**, incluidos los álbumes del dispositivo. No copia los originales a la app.
- Solicita permisos mediante el diálogo del sistema, únicamente al tocar **Dar acceso a mi galería**.
- Distingue acceso completo, parcial, seleccionado y denegado. Ofrece acceso a Ajustes y permite volver a solicitar la selección.
- Consulta por páginas de 300 registros y genera miniaturas nativas bajo demanda, con dos tareas simultáneas.
- Actualiza la biblioteca al volver a la app y cuando Android notifica cambios en los archivos.
- Búsqueda por nombre/álbum; filtros de fotos y videos; orden por fecha, nombre o tamaño; agrupación mensual.
- Visor de fotos y videos con controles, navegación por gestos y teclado, zoom, giro de vista, presentación, pantalla completa cuando esté disponible y detalles.
- Pellizco para ampliar fotos hasta 6×, doble toque, arrastre con límites y rueda del ratón. Deslizamiento horizontal para cambiar de foto o video sin interferir con la barra de reproducción.
- Estudio de fotos con 24 estilos (original y 23 filtros), brillo, contraste y saturación; recorte libre o con proporciones; giro y volteo; comparación con el original; deshacer y rehacer.
- Exportación de copias JPEG o PNG, con un máximo de 4096 px y 12 megapíxeles. En Android se guardan en `Pictures/Luma`; en la web, en el álbum local **Ediciones Luma**, desde donde se pueden descargar. No se modifica el original. El guardado nativo admite hasta 18 MB por copia.
- Velocidad de video entre 0,5× y 2×, repetición y presentación que espera al final de cada video antes de avanzar.
- Compartir archivos mediante el selector de Android.
- Favoritos, selección múltiple, organización por álbum y papelera **local a Luma**, persistidos en IndexedDB.
- Botón/gesto Atrás: cierra el visor, diálogo, menú o selección antes de salir de la pantalla principal.
- Versión web de prueba: importación múltiple, carpetas, arrastrar y soltar, detección de duplicados y descarga.

## Permisos de Android

Requiere **Android 10 o superior** y un Android System WebView actualizado.

| Versión | Permisos solicitados |
|---|---|
| Android 10–12L | `READ_EXTERNAL_STORAGE`, limitado en el manifiesto a API 32 |
| Android 13 | `READ_MEDIA_IMAGES` y `READ_MEDIA_VIDEO` |
| Android 14+ | Los anteriores y `READ_MEDIA_VISUAL_USER_SELECTED` |

En el diálogo, permite **todas las fotos y videos** para consultar toda la galería compartida. Si eliges solo algunos, Luma solo verá los archivos autorizados. No se solicita acceso general a todos los archivos (`MANAGE_EXTERNAL_STORAGE`), micrófono, contactos ni cámara.

Android no expone las carpetas privadas de otras apps, archivos no indexados, contenido exclusivamente en la nube o archivos protegidos. La reproducción de HEIC, RAW y los códecs de video depende del WebView/dispositivo. Si un archivo no se puede reproducir, se puede compartir con otra app.

La papelera oculta archivos de la vista de Luma; **no borra los originales del teléfono**. Los álbumes creados en Luma tampoco mueven carpetas físicas. Quitar un archivo de la papelera elimina su registro local: en Android volverá a aparecer al actualizar MediaStore. La organización local se pierde al borrar los datos o desinstalar la app.

## Novedades de la versión 1.2

- Transición horizontal direccional de 240 ms entre archivos, con fundido sutil. Respeta la preferencia **Reducir movimiento** del sistema.
- Las fotos próximas se precargan y decodifican antes de mostrarse; la foto actual permanece visible mientras se prepara el destino. Los cambios rápidos descartan resultados atrasados.
- Caché local al visor de hasta tres imágenes, con presupuesto de retención por píxeles; se libera al cerrar. No precarga videos y evita precargar vecinos con ahorro de datos o memoria declarada de 2 GB o menos. Una sola imagen puede superar el presupuesto de retención.
- El arrastre y el zoom se dibujan con `requestAnimationFrame`, sin volver a renderizar React en cada movimiento. La posición del visor se mide al iniciar el gesto o al cambiar de tamaño, en lugar de medirla por cada movimiento.
- Diecisiete estilos nuevos: Cine, Atardecer, Aurora, Océano, Bosque, Desierto, Coral, Lavanda, Mate, Intenso, Retrato, Urbano, Plata, Tinta, Sepia, Polaroid y Pastel.
- Los filtros usan una miniatura compartida de hasta 160 px en lugar de mostrar la foto completa en cada opción; las opciones están memoizadas para evitar renderizados innecesarios al ajustar la foto.

Estas optimizaciones reducen trabajo de carga, renderizado y composición; la fluidez real depende del tamaño de las fotos, el WebView y el dispositivo. No se ha medido una tasa de fotogramas en hardware.

## Usar los gestos y el editor

1. Abre una foto y separa dos dedos para ampliarla; arrástrala con un dedo para explorar. Un doble toque alterna entre ajuste y ampliación.
2. Con la imagen sin ampliar, desliza a izquierda o derecha para cambiar de archivo. En videos, desliza sobre la imagen, fuera de la barra de controles.
3. Pulsa **Editar**. Elige **Filtros**, **Ajustar**, **Recortar** o **Girar**. El marco del recorte se mueve con un dedo y se redimensiona desde sus esquinas.
4. **Comparar original** alterna la vista previa. **Deshacer/Rehacer** agrupa cada gesto o desplazamiento de un ajuste. En el teclado se pueden usar `Ctrl/Cmd+Z` y `Ctrl/Cmd+Shift+Z`.
5. Elige JPEG o PNG y pulsa **Guardar copia**. PNG conserva la transparencia; JPEG usa un fondo blanco. Las copias no conservan los metadatos EXIF del original.

Los filtros y recortes se aplican a fotos. Los videos disponen de navegación, velocidad y repetición. La edición necesita un WebView/navegador con soporte de filtros Canvas 2D.

## Desarrollo y vista previa

Desde `galeria-android/`, con Node.js 22 o superior:

```bash
npm ci
npm run dev
```

Abre `http://localhost:5173` en el navegador del mismo teléfono. Esta vista permite probar la interfaz e importar archivos, pero **los permisos y la consulta automática a Android solo funcionan dentro de la app instalada**.

```bash
npm test
npm run build
```

## Generar e instalar el APK

En una computadora con **Android Studio**, **JDK 21**, Android SDK Platform 35 y las herramientas de compilación:

```bash
npm ci
npm run android:sync
npm run android:open
```

Android Studio abrirá el proyecto `android/`. Espera a que sincronice Gradle, conecta tu Android y usa **Run**, o genera un APK de depuración desde el menú **Build → Generate App Bundles or APKs → Generate APKs** (el nombre puede variar según la versión).

También puedes compilar con el SDK configurado, desde `galeria-android/android/`:

```bash
./gradlew assembleDebug
```

En Windows usa `gradlew.bat assembleDebug`. El APK se genera en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Para instalar con un dispositivo autorizado por ADB, desde `galeria-android/`:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

La firma de distribución se configura por separado en Android Studio. No se incluyen claves de firma.

### Sobre Termux

El APK de depuración **se compiló y firmó correctamente en este Termux ARM64**. Las herramientas locales están en `.android-tools/` (excluidas de Git):

- OpenJDK 21 de Termux.
- Gradle 8.11.1, distribución oficial `bin`.
- Android SDK Platform 35 y Build Tools 34.0.0, instalados con las herramientas oficiales de Google.
- `aapt2` ARM64 con soporte para los recursos de Android 35. El `aapt2` 13.0.0.6 del repositorio de Termux no puede leer esta versión del SDK.

Para volver a compilar en **este entorno**, desde `galeria-android/`:

```bash
npm run android:sync
ANDROID_HOME="$PWD/.android-tools/sdk" \
ANDROID_SDK_ROOT="$PWD/.android-tools/sdk" \
bash .android-tools/gradle-8.11.1/bin/gradle -p android :app:assembleDebug \
  -Dorg.gradle.native=false \
  -Djava.net.preferIPv4Stack=true \
  -Pandroid.aapt2FromMavenOverride="$PWD/.android-tools/aapt2" \
  --no-daemon --max-workers=2 --console=plain
```

La primera compilación descarga las dependencias Maven; las siguientes reutilizan la caché. No uses el Gradle 9 del sistema para este proyecto. Las opciones específicas de Termux se pasan por la línea de comandos y no alteran la configuración de Android Studio.

El binario ARM64 de `aapt2` se obtuvo de [`poordevcode/termux-android-studio`](https://github.com/poordevcode/termux-android-studio), fijado al commit `76652ef44d86baa1c42957da5e7e5bbaaf95956d`, archivo `prebuilt/aapt2-aarch64`. Su SHA-256 es `b859b41f107939c743fd96065d125345d6829fcd4edc9bb6aabbbb63df93e4a0`.

El APK se verificó con `apksigner verify --verbose --print-certs` y `unzip -tq`. Está firmado con una clave de **depuración**, adecuado para instalarlo y probarlo; la firma de distribución sigue siendo un paso separado. Los permisos y el contenido multimedia deben probarse en la app instalada.

## Estructura

```text
src/App.jsx                  Biblioteca y guardado de copias
src/Viewer.jsx               Visor y controles de video
src/MediaStage.jsx           Gestos de pellizco, zoom, arrastre y swipe
src/image-cache.js           Precarga, decodificación y caché limitada del visor
src/PhotoEditor.jsx          Interfaz del estudio de fotos
src/photo-editing.js         Recorte, filtros, historial y exportación Canvas
src/gestures.js              Geometría del zoom y detección de swipe
src/ui.jsx                   Controles y gestión de foco de capas
src/db.js                    Persistencia local
src/native.js                Puente Capacitor
src/lib.js                   Filtros, orden y agrupación
src/styles.css               Diseño adaptable
src/editor.css               Diseño del visor táctil y del editor
tests/                       Pruebas de lógica e integración web
android/app/src/main/java/app/luma/gallery/
  GalleryPlugin.java         Permisos, MediaStore, miniaturas, copias y compartir
  MainActivity.java          Registro del plugin y navegación Atrás
```

Después de modificar React, ejecuta `npm run android:sync` antes de volver a compilar el APK. El plugin Java está en el proyecto Android y no requiere un paquete externo de galería.

## Verificación

Las pruebas automatizadas cubren filtros, exclusión de papelera, orden, importación y duplicados, favoritos, visor, álbumes, restauración y persistencia; pellizco y desplazamiento sin renderizar React en cada movimiento, cancelación de gestos, swipe de fotos y videos, decodificación y límites de caché, navegación rápida, limpieza de transiciones y movimiento reducido; geometría del recorte, miniaturas de filtros, exportación de filtros/giro/volteo, historial y guardado de copias sin reemplazar el original. Los eventos táctiles y Canvas se simulan en las pruebas de interfaz: no sustituyen las pruebas de sensibilidad táctil, permisos, renderizado y códecs en un dispositivo Android.

Para verificar la versión instalada: probar permiso completo, selección parcial y denegación; cambiar permisos desde Ajustes y regresar; ampliar y mover una foto; deslizar entre fotos y videos; guardar una foto filtrada y recortada y abrir su copia en otra galería; compartir; añadir un archivo con la cámara y actualizar; cerrar editor y visor con Atrás; y reiniciar Luma para comprobar favoritos y álbumes.
