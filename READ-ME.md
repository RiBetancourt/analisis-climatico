# Climate Analyzer

Herramienta de análisis comparativo de clima para decisiones de expansión de negocio. Recibe una lista de ciudades y devuelve métricas climáticas, scores derivados y un ranking operacional para ayudar a decidir dónde conviene operar.

---

## Cómo correrlo

### Requisitos previos

- Python 3.11+
- Node.js 18+
- Una API key gratuita de OpenWeatherMap → https://openweathermap.org/api (el plan free incluye todo lo necesario)

---

### Backend (FastAPI)

```bash
cd climate-analyzer/backend

# Instalar dependencias
pip install -r requirements.txt

# Configurar la API key (opción recomendada)
export OWM_API_KEY="tu_api_key_aqui"

# Correr el servidor
uvicorn main:app --reload --port 8000
```

El servidor queda disponible en `http://localhost:8000`.
Documentación interactiva (Swagger) en `http://localhost:8000/docs`.

Si no quieres usar la variable de entorno, también puedes pasar la key directamente en cada request via el campo `api_key` del body (el frontend tiene un campo para esto).

---

### Frontend (React + Vite)

```bash
cd climate-analyzer/frontend

# Instalar dependencias
npm install

# Correr en desarrollo
npm run dev
```

La app queda en `http://localhost:5173`.

Si tu backend corre en una URL distinta, crea un archivo `.env` en la carpeta `frontend/`:

```
VITE_API_URL=http://localhost:8000
```

---

### Llamada directa al API (sin frontend)

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "cities": ["Monterrey", "Guadalajara", "Ciudad de México"],
    "api_key": "tu_api_key_aqui"
  }'
```

---

## Estructura del proyecto

```
climate-analyzer/
├── backend/
│   ├── main.py            # FastAPI app, endpoints, lógica de análisis
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx        # Componente principal, charts, cards
    │   ├── main.jsx       # Entry point
    │   └── index.css      # Variables CSS y estilos base
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## Decisiones técnicas

### Por qué FastAPI y no Flask/Django

FastAPI tiene soporte nativo para async/await, lo cual importa aquí porque necesitamos hacer varias llamadas a OpenWeatherMap en paralelo (una por ciudad). Con Flask tendríamos que meter threads o una librería externa. FastAPI también genera documentación automática con Swagger, lo que hace más fácil probar el endpoint sin necesidad del frontend.

### Por qué httpx y no requests

`requests` es síncrona. Como el endpoint usa `async def` y queremos hacer las llamadas a OWM en paralelo con `asyncio.gather`, necesitamos un cliente HTTP async. `httpx` tiene una API casi idéntica a `requests` pero con soporte completo para async.

### Pipeline de análisis por ciudad

Cada ciudad pasa por tres llamadas a OWM en secuencia:

1. **Geocoding** (`/geo/1.0/direct`) — convierte el nombre de ciudad a coordenadas. Esto es necesario porque los otros endpoints requieren lat/lon, y además nos da el nombre canónico y el país.
2. **Current weather** (`/data/2.5/weather`) — condiciones actuales: temperatura, humedad, viento, condición.
3. **5-day forecast** (`/data/2.5/forecast`) — pronóstico en intervalos de 3 horas (40 puntos). De aquí sacamos las métricas de tendencia.

Las tres llamadas son secuenciales por ciudad pero todas las ciudades se procesan en paralelo con `asyncio.gather`. Para 5 ciudades esto reduce el tiempo de respuesta de ~5× a ~1× el tiempo de una ciudad sola.

### Por qué errores parciales y no fail-fast

Si el usuario manda 5 ciudades y una tiene un typo, no queremos cancelar todo el análisis. El endpoint devuelve los resultados de las ciudades que sí funcionaron y reporta los errores de las que fallaron en un campo `errors[]` separado. El cliente puede ver resultados parciales y saber exactamente qué ciudades fallaron y por qué.

### Las tres métricas y cómo se calculan

**Confort (0–100)** — Responde a la pregunta: ¿qué tan agradable es el clima para operar y para el personal?

- Parte de 100 y aplica penalizaciones:
  - Temperatura promedio > 32°C: hasta –20 pts (calor que reduce productividad y aumenta consumo energético)
  - Temperatura promedio < 10°C: hasta –20 pts (frío que complica logística y aumenta costos de calefacción)
  - Humedad promedio > 80%: hasta –15 pts (bochorno, deterioro de ciertos inventarios)
  - Días de lluvia: hasta –25 pts proporcional al porcentaje (lluvia frecuente complica entregas y acceso)

**Estabilidad (0–100)** — Responde a: ¿qué tan predecible es el clima para planear operaciones?

- Usa la varianza estadística de todas las temperaturas del pronóstico de 5 días. Varianza baja significa que el clima es consistente y la planeación de inventario es más confiable.
- Fórmula base: `100 - varianza * 2`, con penalización adicional proporcional a los días con temperaturas extremas (> 35°C o < 5°C).

**Score Operacional (0–100)** — El número final para comparar ciudades:

- `50% Confort + 50% Estabilidad`
- Penalización adicional si llueve más del 60% de los días, porque lluvia frecuente tiene un impacto desproporcionado en logística y distribución.

Estos pesos son opinables — el cliente podría querer ponderar más la estabilidad si maneja productos perecederos, o más el confort si opera en retail con mucha afluencia de clientes. La lógica está centralizada en la función `compute_scores` en `main.py` para que sea fácil ajustar.

### Por qué Recharts y no Chart.js o D3

Recharts está construido sobre D3 pero expone una API declarativa de componentes React. Para este caso (radar chart, bar chart) es la opción que requiere menos código y se integra naturalmente con el árbol de componentes React. D3 directo hubiera dado más control pero mucho más boilerplate. Chart.js requiere refs y manipulación imperativa del DOM, lo cual se siente fuera de lugar en React.

### Por qué no usar un estado global (Redux/Zustand)

La app tiene un solo flujo de datos: el usuario manda un request, el servidor responde, se muestra el resultado. No hay estado compartido entre componentes que justifique una librería de estado global. Todo vive en `useState` en el componente raíz y baja como props. Si la app creciera (historial de búsquedas, favoritos, comparaciones guardadas), ahí sí tendría sentido agregar Zustand.

---

## Limitaciones conocidas

- **El plan gratuito de OWM** tiene rate limits (60 calls/minuto). Con 5 ciudades se hacen 15 calls simultáneas, lo cual está dentro del límite, pero con 10 ciudades (el máximo permitido) son 30 calls. Si el servidor recibe muchos requests simultáneos puede haber errores 429.
- **El forecast es de 5 días** con datos cada 3 horas. No hay datos históricos en el plan gratuito, así que los scores reflejan condiciones actuales/próximas, no promedios estacionales. Para una decisión de expansión real se necesitarían datos históricos de al menos un año.
- **Los nombres de ciudades ambiguos** (por ejemplo, "San José" puede ser Costa Rica o California) se resuelven tomando el primer resultado del geocoder. OWM generalmente prioriza la ciudad más grande con ese nombre.
