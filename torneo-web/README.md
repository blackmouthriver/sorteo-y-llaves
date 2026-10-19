# Torneo de Prompts TEINCO 2026

Torneo de eliminación directa en tiempo real. Node.js 18+ sin dependencias (no hace falta `npm install`).

## Las tres pantallas

| Dirección   | Para quién      | Qué hace |
|-------------|-----------------|----------|
| `/`         | Concursantes    | Escriben su nombre, reciben un avatar, ven en qué ronda están y suben la imagen de cada duelo. |
| `/pantalla` | Proyector       | Lista de inscritos con QR, sorteo en vivo, duelos con las dos imágenes lado a lado, cuenta regresiva, llaves, animaciones y podio. |
| `/admin`    | Administrador   | Clave, tiempo por fase, Excel, sorteo, inicio de cada fase, reloj y ganadores. |

## Probar en tu computador

```
node server.js
```

Abre http://localhost:3000/admin (clave por defecto: `admin123`). Para cambiarla:

- Windows (PowerShell): `$env:ADMIN_KEY="miClave"; node server.js`
- Linux / macOS: `ADMIN_KEY=miClave node server.js`

## Publicar gratis en Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En https://render.com crea una cuenta y elige **New > Web Service**; conecta el repositorio.
3. Runtime **Node**, Build Command vacío (o `npm install`), Start Command `node server.js`, Instance Type **Free**.
4. En **Environment** agrega la variable `ADMIN_KEY` con tu clave.
5. Al terminar el despliegue tendrás una dirección `https://tu-nombre.onrender.com`. Ese es el link de inscripción.

Dos cosas del plan gratuito que debes saber:

- El servicio se duerme tras 15 minutos sin visitas y tarda cerca de un minuto en despertar. Abre `/pantalla` unos minutos antes del evento; mientras haya una pantalla abierta, la página lo mantiene despierto.
- El disco no es permanente: si Render reinicia el servicio, el servidor pierde el torneo. Por eso el panel de administrador guarda una copia en tu navegador y, si eso pasa, te ofrece **Restaurar la copia**.

## Cómo se dirige un torneo

1. Proyecta `/pantalla` y pulsa "Activar sonido". Los concursantes se inscriben con el QR.
2. En `/admin` ajusta, en minutos, el tiempo para mostrar la referencia y el tiempo de duración de ronda. Cuando estén todos inscritos pulsa **Sortear**.
3. En **Referencia de la ronda** escribe el texto y/o sube la imagen que deben seguir, y pulsa **Guardar referencia**. Puedes dejar listas las de todas las rondas desde el principio.
4. Pulsa **Iniciar fase** y luego **Mostrar referencia**. Cada fase avanza sola:
   - **Referencia:** todos la ven en la pantalla y en su celular durante el tiempo configurado.
   - **Carga de imágenes:** la referencia se oculta y cada estudiante sube su imagen desde su celular.
   - **Resultados:** quien no subió imagen pierde automáticamente. La pantalla muestra los demás duelos uno por uno (imagen A, referencia, imagen B); haces clic en el nombre del ganador y pasa a la siguiente llave hasta terminar la ronda.
5. Cuando todos los duelos de la fase tengan ganador, inicia la siguiente.
6. En la fase final se juegan la final y el tercer y cuarto puesto con la misma referencia.

## Sonido y voz

- Sonidos y voz vienen encendidos. En `/admin` > Configuración > **Sonido y voz** puedes apagarlos por separado para la pantalla principal y para los celulares.
- En `/pantalla` haz un clic en **Clic aquí para habilitar sonido y voz** (el navegador lo exige) y, si quieres, elige otra voz del narrador.
- Para una voz masculina natural, abre la pantalla en **Microsoft Edge** y elige una voz "Natural" (por ejemplo Gonzalo, de Colombia, o Jorge, de México). Chrome solo trae voces más robóticas.
- En el celular, el sonido se habilita al inscribirse; si recarga la página, aparece un botón para tocar. La voz depende del teléfono.

No hay cupo fijo: el torneo se arma con todos los inscritos al momento del sorteo. Si el número no es potencia de 2 (por ejemplo 11), algunos pasan directo a la segunda ronda por sorteo.

Las imágenes se guardan en la carpeta `img-data/` del servidor. En Render gratis se pierden si el servicio se reinicia o se vuelve a desplegar, así que no despliegues cambios en pleno torneo.
