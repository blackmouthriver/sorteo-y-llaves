# Sorteo y Llaves

Torneo de eliminación directa en tiempo real. Node.js 18+ sin dependencias (no hace falta `npm install`).

## Las tres pantallas

| Dirección   | Para quién      | Qué hace |
|-------------|-----------------|----------|
| `/`         | Concursantes    | Escriben su nombre, reciben un avatar y ven su estado (rival, turno, felicitación o consuelo). |
| `/pantalla` | Proyector       | Lista de inscritos con QR, sorteo en vivo, llaves, duelo con cuenta regresiva, animaciones y podio. |
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
2. En `/admin` ajusta el tiempo por fase. Cuando estén todos inscritos pulsa **Sortear**.
3. Pulsa **Iniciar fase** y luego **Iniciar tiempo**: un solo cronómetro corre para todos los duelos de la fase. Al terminar, marca al ganador de cada duelo.
4. Cuando todos los duelos de la fase tengan ganador, inicia la siguiente.
5. En la fase final aparecen dos duelos: tercer y cuarto puesto (entre los perdedores de las semifinales) y la final.

No hay cupo fijo: el torneo se arma con todos los inscritos al momento del sorteo. Si el número no es potencia de 2 (por ejemplo 11), algunos pasan directo a la segunda ronda por sorteo.
