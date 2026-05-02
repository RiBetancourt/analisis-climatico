"""
Climate Analyzer API
--------------------

Métricas:
- temp_avg_max / temp_avg_min  → Temperaturas promedio del pronóstico
- temp_variance                → Varianza de temperaturas (predictibilidad)
- rain_days_pct                → % de días con lluvia en los próximos 5 días
- extreme_days                 → Días con calor >35°C o frío <5°C
- humidity_avg                 → Humedad media
- comfort_index (0-100)        → Qué tan agradable es el clima para operar
- stability_index (0-100)      → Qué tan predecible/estable es el clima
- operational_score (0-100)    → Score final para decisión de negocio
"""

import os
import statistics
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Climate Analyzer API",
    description="Análisis comparativo de clima para decisiones de expansión de negocio.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # En producción restringir al dominio del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OWM_BASE = "https://api.openweathermap.org/data/2.5"
OWM_GEO  = "https://api.openweathermap.org/geo/1.0"


# ─── Pydantic models ──────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    cities: list[str]
    api_key: Optional[str] = None   # Permite pasar la key por request (útil en dev)

    @field_validator("cities")
    @classmethod
    def cities_not_empty(cls, v):
        if not v or len(v) == 0:
            raise ValueError("La lista de ciudades no puede estar vacía.")
        if len(v) > 10:
            raise ValueError("Máximo 10 ciudades por request.")
        cleaned = [c.strip() for c in v if c.strip()]
        if not cleaned:
            raise ValueError("Las ciudades no pueden ser strings vacíos.")
        return cleaned


class CityMetrics(BaseModel):
    city_name: str          # Nombre canonico según OWM
    country: str
    lat: float
    lon: float
    # Condiciones actuales
    current_temp: float
    current_feels_like: float
    current_condition: str
    current_icon: str
    current_humidity: int
    current_wind_kph: float
    # Métricas de pronóstico (5 días)
    temp_avg_max: float
    temp_avg_min: float
    temp_variance: float     # Varianza entre todas las temperaturas del forecast
    rain_days: int
    total_forecast_days: int
    rain_days_pct: float     # 0-100
    extreme_days: int        # días >35°C o <5°C
    humidity_avg: float
    # Scores derivados (0-100)
    comfort_index: float
    stability_index: float
    operational_score: float
    # Interpretación
    verdict: str             # "Excelente" | "Bueno" | "Regular" | "Difícil"
    recommendation: str      # Texto libre para el cliente


class CityError(BaseModel):
    city_input: str
    error: str


class AnalyzeResponse(BaseModel):
    results: list[CityMetrics]
    errors: list[CityError]
    best_city: Optional[str]
    ranking: list[str]       # Ciudades ordenadas por operational_score desc
    summary: str


# ─── OpenWeatherMap helpers ───────────────────────────────────────────────────

async def geocode(client: httpx.AsyncClient, city: str, api_key: str) -> dict:
    """Devuelve {lat, lon, name, country} o lanza ValueError."""
    resp = await client.get(
        f"{OWM_GEO}/direct",
        params={"q": city, "limit": 1, "appid": api_key},
        timeout=8,
    )
    if resp.status_code == 401:
        raise ValueError("API key inválida o no autorizada.")
    if resp.status_code != 200:
        raise ValueError(f"Error de geocodificación (HTTP {resp.status_code}).")
    data = resp.json()
    if not data:
        raise ValueError(f"Ciudad '{city}' no encontrada. Verifica el nombre.")
    return {
        "lat": data[0]["lat"],
        "lon": data[0]["lon"],
        "name": data[0].get("local_names", {}).get("es") or data[0]["name"],
        "country": data[0].get("country", "??"),
    }


async def get_current_weather(
    client: httpx.AsyncClient, lat: float, lon: float, api_key: str
) -> dict:
    resp = await client.get(
        f"{OWM_BASE}/weather",
        params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric", "lang": "es"},
        timeout=8,
    )
    resp.raise_for_status()
    return resp.json()


async def get_forecast(
    client: httpx.AsyncClient, lat: float, lon: float, api_key: str
) -> dict:
    """5-day forecast en intervalos de 3h (40 puntos)."""
    resp = await client.get(
        f"{OWM_BASE}/forecast",
        params={"lat": lat, "lon": lon, "appid": api_key, "units": "metric", "lang": "es"},
        timeout=8,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Score calculation ────────────────────────────────────────────────────────

def compute_scores(
    temps: list[float],
    rain_days_pct: float,
    extreme_days: int,
    total_days: int,
    humidity_avg: float,
) -> tuple[float, float, float]:
    """
    Devuelve (comfort_index, stability_index, operational_score), todos 0-100.

    comfort_index:
      - Base 100
      - -20 pts si temp promedio >32°C (calor intenso reduce productividad)
      - -20 pts si temp promedio <10°C (frío intenso)
      - -15 pts si humedad >80% (bochorno)
      - -25 pts proporcional a % de días de lluvia
      - Mínimo 0

    stability_index:
      - Mide qué tan predecible es el clima (baja varianza = mejor)
      - Varianza alta → score bajo; escala logarítmica suavizada
      - -30 pts por cada día extremo sobre el total (días extremos son disruptivos)

    operational_score:
      - 50% comfort_index + 50% stability_index
      - Penalización extra por lluvia frecuente (logística)
    """
    avg_temp = statistics.mean(temps) if temps else 20.0
    variance = statistics.variance(temps) if len(temps) > 1 else 0.0

    # Comfort index
    comfort = 100.0
    if avg_temp > 32:
        comfort -= min(20,(avg_temp - 32)*3)
    if avg_temp < 10:
        comfort -= min(20,(10-avg_temp)*3)
    if humidity_avg > 80:
        comfort -= min(15,(humidity_avg - 80) * 0.75)
    comfort -= rain_days_pct * 0.25   # -25 si llueve todos los días
    comfort = max(0.0, min(100.0, comfort))

    # Stability index  (variance 0 → 100 pts, variance 50+ → ~0 pts)
    stability = max(0.0, 100.0 - variance * 2)
    if total_days > 0:
        extreme_pct = extreme_days / total_days
        stability -= extreme_pct * 30
    stability = max(0.0, min(100.0, stability))

    # Operational score
    operational = (comfort * 0.50 + stability * 0.50)
    # Penalización adicional por lluvia frecuente (afecta logística)
    if rain_days_pct > 60:
        operational -= (rain_days_pct - 60) * 0.2
    operational = max(0.0, min(100.0, operational))

    return round(comfort, 1), round(stability, 1), round(operational, 1)


def score_to_verdict(score: float) -> str:
    if score >= 75:
        return "Excelente"
    if score >= 55:
        return "Bueno"
    if score >= 35:
        return "Regular"
    return "Difícil"


def build_recommendation(metrics: dict) -> str:
    verdict = score_to_verdict(metrics["operational_score"])
    city = metrics["city_name"]

    lines = []
    if verdict == "Excelente":
        lines.append(f"{city} es una opción muy favorable para operaciones.")
    elif verdict == "Bueno":
        lines.append(f"{city} es viable con planificación estándar.")
    elif verdict == "Regular":
        lines.append(f"{city} presenta desafíos climáticos a considerar.")
    else:
        lines.append(f"{city} tiene condiciones difíciles; evalúa bien los costos operativos.")

    if metrics["rain_days_pct"] > 50:
        lines.append(f"Alta probabilidad de lluvia ({metrics['rain_days_pct']:.0f}% de los días): planea inventario impermeable y rutas de entrega alternativas.")
    if metrics["extreme_days"] > 0:
        lines.append(f"{metrics['extreme_days']} día(s) con temperaturas extremas: considera almacenamiento climatizado.")
    if metrics["humidity_avg"] > 75:
        lines.append("Humedad elevada: productos sensibles a la humedad requieren embalaje especial.")
    if metrics["temp_variance"] < 5:
        lines.append("Temperatura muy estable: excelente para planning de inventario.")

    return " ".join(lines)


# ─── City analysis pipeline ───────────────────────────────────────────────────

async def analyze_city(
    client: httpx.AsyncClient, city_input: str, api_key: str
) -> CityMetrics:
    """Ejecuta el pipeline completo para una ciudad."""

    # 1. Geocodificación
    geo = await geocode(client, city_input, api_key)

    # 2. Datos actuales
    current = await get_current_weather(client, geo["lat"], geo["lon"], api_key)

    # 3. Pronóstico
    forecast = await get_forecast(client, geo["lat"], geo["lon"], api_key)

    # 4. Parsear pronóstico
    # Agrupar por día para contar días de lluvia
    days: dict[str, dict] = {}
    all_temps: list[float] = []
    all_humidity: list[int] = []

    for item in forecast["list"]:
        date_str = item["dt_txt"][:10]
        temp = item["main"]["temp"]
        hum  = item["main"]["humidity"]
        all_temps.append(temp)
        all_humidity.append(hum)
        is_rain = any(
            w["main"] in ("Rain", "Drizzle", "Thunderstorm")
            for w in item.get("weather", [])
        )
        if date_str not in days:
            days[date_str] = {"temps": [], "has_rain": False}
        days[date_str]["temps"].append(temp)
        if is_rain:
            days[date_str]["has_rain"] = True

    total_days = len(days)
    rain_days = sum(1 for d in days.values() if d["has_rain"])
    rain_days_pct = round((rain_days / total_days) * 100, 1) if total_days else 0.0

    daily_maxes = [max(d["temps"]) for d in days.values()]
    daily_mins  = [min(d["temps"])  for d in days.values()]
    extreme_days = sum(
        1 for mx, mn in zip(daily_maxes, daily_mins)
        if mx > 35 or mn < 5
    )

    temp_avg_max = round(statistics.mean(daily_maxes), 1) if daily_maxes else 0.0
    temp_avg_min = round(statistics.mean(daily_mins), 1) if daily_mins else 0.0
    temp_variance = round(statistics.variance(all_temps), 2) if len(all_temps) > 1 else 0.0
    humidity_avg = round(statistics.mean(all_humidity), 1) if all_humidity else 0.0

    # 5. Scores
    comfort, stability, operational = compute_scores(
        all_temps, rain_days_pct, extreme_days, total_days, humidity_avg
    )

    # 6. Construir objeto
    raw = {
        "city_name": geo["name"],
        "country": geo["country"],
        "lat": geo["lat"],
        "lon": geo["lon"],
        "current_temp": round(current["main"]["temp"], 1),
        "current_feels_like": round(current["main"]["feels_like"], 1),
        "current_condition": current["weather"][0]["description"].capitalize(),
        "current_icon": current["weather"][0]["icon"],
        "current_humidity": current["main"]["humidity"],
        "current_wind_kph": round(current["wind"]["speed"] * 3.6, 1),
        "temp_avg_max": temp_avg_max,
        "temp_avg_min": temp_avg_min,
        "temp_variance": temp_variance,
        "rain_days": rain_days,
        "total_forecast_days": total_days,
        "rain_days_pct": rain_days_pct,
        "extreme_days": extreme_days,
        "humidity_avg": humidity_avg,
        "comfort_index": comfort,
        "stability_index": stability,
        "operational_score": operational,
        "verdict": score_to_verdict(operational),
        "recommendation": "",
    }
    raw["recommendation"] = build_recommendation(raw)

    return CityMetrics(**raw)


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@app.post("/analyze", response_model=AnalyzeResponse, summary="Analizar clima de ciudades")
async def analyze(body: AnalyzeRequest):
    """
    Recibe una lista de ciudades y devuelve análisis comparativo de clima.

    - Fuente: OpenWeatherMap (Current Weather + 5-Day Forecast)
    - Métricas: temperaturas promedio, varianza, días de lluvia, días extremos, humedad
    - Scores derivados: confort, estabilidad, score operacional (0-100)
    """
    api_key = body.api_key or os.getenv("OWM_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=422,
            detail=(
                "API key de OpenWeatherMap requerida. "
                "Pásala en el campo 'api_key' del request o "
                "configura la variable de entorno OWM_API_KEY."
            ),
        )

    results: list[CityMetrics] = []
    errors:  list[CityError]   = []

    async with httpx.AsyncClient() as client:
        for city in body.cities:
            try:
                metrics = await analyze_city(client, city, api_key)
                results.append(metrics)
            except httpx.HTTPStatusError as e:
                errors.append(CityError(
                    city_input=city,
                    error=f"Error HTTP {e.response.status_code} al consultar OpenWeatherMap."
                ))
            except httpx.RequestError:
                errors.append(CityError(
                    city_input=city,
                    error="No se pudo conectar a OpenWeatherMap. Verifica tu conexión."
                ))
            except ValueError as e:
                errors.append(CityError(city_input=city, error=str(e)))
            except Exception as e:
                errors.append(CityError(city_input=city, error=f"Error inesperado: {str(e)}"))

    if not results and errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No se pudo obtener datos para ninguna ciudad.",
                "errors": [e.model_dump() for e in errors],
            },
        )

    # Ranking por operational_score
    ranked = sorted(results, key=lambda r: r.operational_score, reverse=True)
    ranking = [r.city_name for r in ranked]
    best_city = ranking[0] if ranking else None

    if len(ranked) == 1:
        summary = (
            f"{ranked[0].city_name} tiene un score operacional de "
            f"{ranked[0].operational_score}/100 ({ranked[0].verdict})."
        )
    elif ranked:
        summary = (
            f"Analizadas {len(ranked)} ciudades. "
            f"Mejor opción: {ranked[0].city_name} ({ranked[0].operational_score}/100). "
            f"Menor score: {ranked[-1].city_name} ({ranked[-1].operational_score}/100). "
            f"Score operacional = 50% confort + 50% estabilidad, con penalización por lluvia frecuente."
        )
    else:
        summary = "Sin resultados."

    return AnalyzeResponse(
        results=results,
        errors=errors,
        best_city=best_city,
        ranking=ranking,
        summary=summary,
    )


@app.get("/health")
def health():
    return {"status": "ok"}