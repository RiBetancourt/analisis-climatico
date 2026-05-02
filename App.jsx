import { useState, useRef } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, Legend
} from 'recharts'

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const PALETTE = [
  '#4af0a8', '#0ef7ff', '#f0a84a', '#f05a9a',
  '#a84af0', '#f0e84a', '#5a8af0', '#f07a4a',
]

const VERDICT_META = {
  Excelente: { color: '#4af0a8', emoji: '✦', bg: '#4af0a808' },
  Bueno:     { color: '#f0d44a', emoji: '◈', bg: '#f0d44a08' },
  Regular:   { color: '#f0a84a', emoji: '◇', bg: '#f0a84a08' },
  Difícil:   { color: '#f05a5a', emoji: '✕', bg: '#f05a5a08' },
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 75) return 'var(--score-hi)'
  if (s >= 55) return 'var(--score-mid)'
  if (s >= 35) return 'var(--score-lo)'
  return 'var(--score-bad)'
}

function fmt1(n) { return typeof n === 'number' ? n.toFixed(1) : n }

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ value, label, delay = 0 }) {
  const c = scoreColor(value)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
        <span style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        <span style={{ color: c, fontWeight: 500 }}>{fmt1(value)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`, background: c,
          borderRadius: 2,
          transition: 'width .8s cubic-bezier(.4,0,.2,1)',
          transitionDelay: `${delay}ms`
        }} />
      </div>
    </div>
  )
}

function Chip({ children, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 3,
      background: color + '18', color, border: `1px solid ${color}44`,
      fontSize: 11, fontWeight: 500, letterSpacing: '.03em'
    }}>
      {children}
    </span>
  )
}

function CityCard({ city, rank, color, isBest, style }) {
  const vm = VERDICT_META[city.verdict] || VERDICT_META['Regular']
  return (
    <div className="fade-up" style={{
      background: isBest
        ? `linear-gradient(135deg, ${color}10, var(--surface))`
        : 'var(--surface)',
      border: `1px solid ${isBest ? color + '55' : 'var(--border)'}`,
      borderRadius: 12, padding: '22px 20px', position: 'relative',
      ...style
    }}>
      {/* Rank badge */}
      <div style={{
        position: 'absolute', top: 14, right: 16,
        fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 32,
        color: color + '22', lineHeight: 1, userSelect: 'none'
      }}>
        {String(rank).padStart(2, '0')}
      </div>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 20,
            color: 'var(--text)', lineHeight: 1
          }}>
            {city.city_name}
          </span>
          <Chip color={vm.color}>{vm.emoji} {city.verdict}</Chip>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 16 }}>
          {city.country} · {fmt1(city.lat)}°N {fmt1(city.lon)}°E
        </div>
      </div>

      {/* Current conditions */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16
      }}>
        {[
          { label: 'Ahora', value: `${fmt1(city.current_temp)}°C`, sub: `Sensación ${fmt1(city.current_feels_like)}°C` },
          { label: 'Condición', value: city.current_condition, sub: `Humedad ${city.current_humidity}%` },
          { label: 'Viento', value: `${fmt1(city.current_wind_kph)} km/h`, sub: '' },
          { label: 'Humedad prom.', value: `${fmt1(city.humidity_avg)}%`, sub: '5 días' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px'
          }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.2 }}>{item.value}</div>
            {item.sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Forecast stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6, marginBottom: 16,
        background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px'
      }}>
        {[
          { label: 'Máx prom.', value: `${fmt1(city.temp_avg_max)}°C`, color: 'var(--warn)' },
          { label: 'Mín prom.', value: `${fmt1(city.temp_avg_min)}°C`, color: 'var(--accent2)' },
          { label: 'Días lluvia', value: `${city.rain_days}/${city.total_forecast_days}`, color: city.rain_days_pct > 50 ? 'var(--danger)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {city.extreme_days > 0 && (
        <div style={{
          background: '#f0a84a0d', border: '1px solid #f0a84a33',
          borderRadius: 6, padding: '7px 10px', marginBottom: 10,
          fontSize: 11, color: 'var(--warn)'
        }}>
          ⚠ {city.extreme_days} día(s) con temperatura extrema (&gt;35°C o &lt;5°C)
        </div>
      )}

      {/* Scores */}
      <div style={{ marginTop: 4 }}>
        <ScoreBar value={city.comfort_index}    label="Confort"    delay={100} />
        <ScoreBar value={city.stability_index}  label="Estabilidad" delay={200} />
        <ScoreBar value={city.operational_score} label="Score operacional" delay={300} />
      </div>

      {/* Recommendation */}
      <div style={{
        marginTop: 14, padding: '10px 12px',
        background: 'var(--surface2)', borderRadius: 8,
        fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
        borderLeft: `3px solid ${color}`
      }}>
        {city.recommendation}
      </div>
    </div>
  )
}

// Radar comparativo
function RadarComparison({ cities }) {
  const data = [
    { axis: 'Confort',      fullMark: 100 },
    { axis: 'Estabilidad',  fullMark: 100 },
    { axis: 'Operacional',  fullMark: 100 },
    { axis: 'Sin Lluvia',   fullMark: 100 },
    { axis: 'Sin Extremos', fullMark: 100 },
  ].map(d => {
    const obj = { ...d }
    cities.forEach((c, i) => {
      obj[c.city_name + '_' + i] = (
        d.axis === 'Confort'      ? c.comfort_index
        : d.axis === 'Estabilidad'  ? c.stability_index
        : d.axis === 'Operacional'  ? c.operational_score
        : d.axis === 'Sin Lluvia'   ? Math.max(0, 100 - c.rain_days_pct)
        : Math.max(0, 100 - c.extreme_days * 20)
      )
    })
    return obj
  })

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '24px 20px'
    }}>
      <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Radar comparativo
      </h3>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        5 dimensiones clave para operaciones · mayor área = mejor opción
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          />
          <PolarRadiusAxis
            angle={30} domain={[0, 100]} tick={false} axisLine={false}
          />
          {cities.map((c, i) => (
            <Radar
              key={c.city_name}
              name={c.city_name}
              dataKey={c.city_name + '_' + i}
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.12}
              strokeWidth={1.5}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)',
              color: 'var(--text)'
            }}
            formatter={(v, name) => [fmt1(v), name.split('_')[0]]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Bar chart de scores
function ScoresBars({ cities }) {
  const data = cities.map((c, i) => ({
    name: c.city_name,
    Confort:      c.comfort_index,
    Estabilidad:  c.stability_index,
    Operacional:  c.operational_score,
    color: PALETTE[i % PALETTE.length],
  }))

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 8, padding: '10px 14px', fontSize: 12, fontFamily: 'var(--font-mono)'
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.fill || 'var(--muted)', marginBottom: 2 }}>
            {p.name}: <strong>{fmt1(p.value)}</strong>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '24px 20px'
    }}>
      <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Scores por ciudad
      </h3>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
        Escala 0–100 · score operacional = 50% confort + 50% estabilidad
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barCategoryGap="30%" barGap={3}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.5 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }} />
          <Bar dataKey="Confort"     fill="#4af0a844" stroke="#4af0a8" strokeWidth={1} radius={[3,3,0,0]} />
          <Bar dataKey="Estabilidad" fill="#0ef7ff44" stroke="#0ef7ff" strokeWidth={1} radius={[3,3,0,0]} />
          <Bar dataKey="Operacional" fill="#f0a84a44" stroke="#f0a84a" strokeWidth={1} radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Tabla ranking
function RankingTable({ cities, ranking }) {
  const sorted = [...cities].sort((a, b) => b.operational_score - a.operational_score)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden'
    }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15 }}>
          Ranking operacional
        </h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {['#', 'Ciudad', 'País', 'Temp actual', 'Máx / Mín', 'Lluvia', 'Varianza', 'Confort', 'Estabilidad', 'Operacional', 'Veredicto'].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left', color: 'var(--muted)',
                  fontWeight: 500, fontSize: 10, textTransform: 'uppercase',
                  letterSpacing: '.07em', whiteSpace: 'nowrap',
                  borderBottom: '1px solid var(--border)'
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const vm = VERDICT_META[c.verdict] || VERDICT_META['Regular']
              const color = PALETTE[cities.indexOf(c) % PALETTE.length]
              return (
                <tr key={c.city_name} style={{
                  borderBottom: '1px solid var(--border)',
                  background: i === 0 ? `${color}06` : 'transparent'
                }}>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)', fontWeight: 700 }}>
                    {i === 0 ? '★' : i + 1}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{c.city_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>{c.country}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text)' }}>{fmt1(c.current_temp)}°C</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--warn)' }}>{fmt1(c.temp_avg_max)}°</span>
                    {' / '}
                    <span style={{ color: 'var(--accent2)' }}>{fmt1(c.temp_avg_min)}°</span>
                  </td>
                  <td style={{ padding: '12px 14px', color: c.rain_days_pct > 50 ? 'var(--danger)' : 'var(--muted)' }}>
                    {c.rain_days_pct}%
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted)' }}>
                    {fmt1(c.temp_variance)}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: scoreColor(c.comfort_index), fontWeight: 600 }}>
                      {fmt1(c.comfort_index)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: scoreColor(c.stability_index), fontWeight: 600 }}>
                      {fmt1(c.stability_index)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      color: scoreColor(c.operational_score),
                      fontWeight: 700, fontSize: 14
                    }}>
                      {fmt1(c.operational_score)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <Chip color={vm.color}>{vm.emoji} {c.verdict}</Chip>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [citiesRaw, setCitiesRaw] = useState('Monterrey, Guadalajara, CDMX, Tijuana, Mérida')
  const [apiKey, setApiKey]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [data, setData]           = useState(null)
  const [errors, setErrors]       = useState([])
  const [globalError, setGlobalError] = useState('')
  const resultsRef = useRef(null)

  async function handleSubmit() {
    const cities = citiesRaw.split(',').map(s => s.trim()).filter(Boolean)
    if (!cities.length) { setGlobalError('Ingresa al menos una ciudad.'); return }
    if (!apiKey.trim()) { setGlobalError('Ingresa tu API key de OpenWeatherMap.'); return }

    setLoading(true); setGlobalError(''); setData(null); setErrors([])

    try {
      const resp = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities, api_key: apiKey.trim() })
      })
      const json = await resp.json()

      if (!resp.ok) {
        const msg = typeof json.detail === 'string'
          ? json.detail
          : json.detail?.message || 'Error del servidor.'
        setGlobalError(msg)
        if (json.detail?.errors) setErrors(json.detail.errors)
        return
      }

      setData(json)
      setErrors(json.errors || [])
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)

    } catch {
      setGlobalError(`No se pudo conectar al backend en ${API_BASE}. ¿Está corriendo uvicorn?`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', backdropFilter: 'blur(12px)'
      }}>
        <span style={{ fontSize: 18 }}>◈</span>
        <span style={{
          fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 14,
          letterSpacing: '.12em', textTransform: 'uppercase',
          background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>
          Climate Analyzer
        </span>
        <span style={{ color: 'var(--muted2)', fontSize: 12 }}>/ herramienta de expansión de negocio</span>
      </header>

      <main style={{ maxWidth: 1140, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* ── Hero ── */}
        <div className="fade-up" style={{ marginBottom: 48 }}>
          <h1 style={{
            fontFamily: 'var(--font-head)', fontWeight: 800,
            fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.1,
            marginBottom: 16
          }}>
            ¿En qué ciudad<br />conviene operar?
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 520, lineHeight: 1.7 }}>
            Ingresa las ciudades candidatas. Analizamos temperatura, lluvia,
            humedad y varianza climática para darte un <strong style={{ color: 'var(--text)' }}>score operacional</strong> por ciudad.
          </p>
        </div>

        {/* ── Input form ── */}
        <div className="fade-up fade-up-delay-1" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '28px 28px 24px', marginBottom: 36
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
                Ciudades (separadas por coma)
              </label>
              <input
                value={citiesRaw}
                onChange={e => setCitiesRaw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="ej: Monterrey, Guadalajara, Ciudad de México"
                style={{
                  width: '100%', background: 'var(--surface2)',
                  border: '1px solid var(--border2)', borderRadius: 8,
                  padding: '11px 14px', color: 'var(--text)', fontSize: 14,
                  outline: 'none', transition: 'border .2s'
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border2)'}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: loading ? 'var(--surface2)' : 'var(--accent)',
                  color: loading ? 'var(--muted)' : '#000',
                  border: 'none', borderRadius: 8,
                  padding: '11px 26px', fontSize: 13, fontWeight: 600,
                  letterSpacing: '.04em', transition: 'all .2s',
                  opacity: loading ? .7 : 1
                }}
              >
                {loading ? '...' : 'Analizar →'}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              API Key de OpenWeatherMap
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Tu OWM API key (gratis en openweathermap.org)"
              style={{
                width: '100%', maxWidth: 380,
                background: 'var(--surface2)', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '9px 14px', color: 'var(--muted)',
                fontSize: 13, outline: 'none'
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 12 }}>
              También configurable via <code style={{ color: 'var(--muted)' }}>OWM_API_KEY</code> en el backend
            </span>
          </div>
        </div>

        {/* ── Error global ── */}
        {globalError && (
          <div style={{
            background: '#f05a5a0d', border: '1px solid #f05a5a44',
            borderRadius: 10, padding: '12px 16px', marginBottom: 24,
            fontSize: 13, color: 'var(--danger)'
          }}>
            ✕ {globalError}
          </div>
        )}

        {/* ── Errores parciales ── */}
        {errors.length > 0 && (
          <div style={{
            background: '#f0a84a0d', border: '1px solid #f0a84a33',
            borderRadius: 10, padding: '14px 18px', marginBottom: 24
          }}>
            <div style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600, marginBottom: 8 }}>
              Algunas ciudades no se pudieron procesar:
            </div>
            {errors.map(e => (
              <div key={e.city_input} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                <span style={{ color: 'var(--warn)' }}>{e.city_input}</span> — {e.error}
              </div>
            ))}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{
              width: 40, height: 40, border: '2px solid var(--border2)',
              borderTop: '2px solid var(--accent)', borderRadius: '50%',
              animation: 'spin .8s linear infinite', margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Consultando OpenWeatherMap para cada ciudad…
            </p>
          </div>
        )}

        {/* ── Results ── */}
        {data && (
          <div ref={resultsRef}>

            {/* Summary banner */}
            <div className="fade-up" style={{
              background: 'linear-gradient(135deg, var(--surface), var(--surface2))',
              border: '1px solid var(--border)',
              borderRadius: 12, padding: '20px 24px', marginBottom: 28,
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              gap: 16, flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  Resumen del análisis
                </div>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, maxWidth: 680 }}>
                  {data.summary}
                </p>
              </div>
              {data.best_city && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
                    Mejor opción
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22,
                    background: 'linear-gradient(90deg, var(--accent), var(--accent2))',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                  }}>
                    {data.best_city}
                  </div>
                </div>
              )}
            </div>

            {/* Charts row */}
            <div className="fade-up fade-up-delay-1" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16
            }}>
              <RadarComparison cities={data.results} />
              <ScoresBars cities={data.results} />
            </div>

            {/* Ranking table */}
            <div className="fade-up fade-up-delay-2" style={{ marginBottom: 16 }}>
              <RankingTable cities={data.results} ranking={data.ranking} />
            </div>

            {/* City cards */}
            <div className="fade-up fade-up-delay-3" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16, marginBottom: 32
            }}>
              {[...data.results]
                .sort((a, b) => b.operational_score - a.operational_score)
                .map((city, i) => (
                  <CityCard
                    key={city.city_name}
                    city={city}
                    rank={i + 1}
                    color={PALETTE[data.results.indexOf(city) % PALETTE.length]}
                    isBest={city.city_name === data.best_city}
                  />
                ))}
            </div>

            {/* Methodology footnote */}
            <div style={{
              borderTop: '1px solid var(--border)', paddingTop: 20,
              fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8
            }}>
              <strong style={{ color: 'var(--muted)' }}>Metodología:</strong>{' '}
              <strong>Confort</strong> (base 100) penaliza temperatura &gt;32°C o &lt;10°C, humedad &gt;80%, y lluvia frecuente.{' '}
              <strong>Estabilidad</strong> mide la varianza de temperatura en el pronóstico de 5 días (varianza baja = clima predecible).{' '}
              <strong>Score Operacional</strong> = 50% Confort + 50% Estabilidad, con penalización adicional si llueve más del 60% de los días.
              Datos: OpenWeatherMap Current Weather API + 5-Day Forecast API.
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
