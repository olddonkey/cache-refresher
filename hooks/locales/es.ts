import type { Messages } from './en'
import { es419 } from './es-419'
import { makeSpan } from './shared'

const spanEs = makeSpan({ units: { s: 's', m: 'min', h: 'h' } })

// The concise tú interface is shared; Spain uses coste and cuenta atrás.
export const es: Messages = {
  ...es419,
  name: 'Español (España)',
  tag: 'es-ES',
  fonts: '',
  cmdStatus: 'Ver el estado de la caché de prompts, el tiempo restante y el coste estimado de reconstrucción',
  pingApiError: (error, status) => `Renovación fallida: error de API (${error}, estado ${status ?? 'ninguno'}). La cuenta atrás no se reinició.`,
  pingCut: 'La renovación se interrumpió antes de la respuesta de la API. La cuenta atrás no se reinició.',
  pingHit: (counts, cost, ttl) => `Caché renovada: ${counts}.${cost} Cuenta atrás reiniciada a ${spanEs(ttl)}.`,
  reportNothing: 'Caché de prompts: todavía vacía. La cuenta atrás empieza tras la próxima respuesta.',
  reportNoPrice: '  Coste: sin precios para este modelo',
  reportPingNone: (ping, isMeasured) => `  Una renovación: unos ${ping} (tokens extra ${isMeasured ? 'medidos' : 'estimados'}). Supera el coste extra de caducar, así que renovar no compensa`,
  reportFooter: 'Costes estimados a precios de lista de la API. Con una suscripción reflejan uso del plan, no cargos.',
  autoOnNone: cap => `  Renovación automática: activada (límite ${cap}), sin envíos: renovar cuesta más que el coste extra de caducar para esta caché`,
  autoNotWorth: 'No compensa con esta caché',
  paneNothing: 'Todavía vacía. La cuenta atrás empieza tras la próxima respuesta.',
}
