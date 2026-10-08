/** Lightweight data-center plant sim for the trainer UI. */

export type ChillerMode = 'lead' | 'lag' | 'standby' | 'offline' | 'alarm'

export interface PlantSnapshot {
  t: number
  itLoadMw: number
  hallSupplyF: number
  hallReturnF: number
  lchltSet: number
  lchltAct: number
  cwetF: number
  oatF: number
  wbF: number
  towerFanPct: number
  dryFanPct: number
  chwDpPsi: number
  cwDpPsi: number
  glycolDpPsi: number
  chwValvePct: number
  cwValvePct: number
  glycolValvePct: number
  chwGain: number
  cwHeadGain: number
  glycolGain: number
  freeCoolPct: number
  chwTargetPsi: number
  chwrF: number
  chwsF: number
  chwrPsi: number
  chwsPsi: number
  cwrF: number
  cwsF: number
  cwrPsi: number
  cwsPsi: number
  glyR: number
  glyS: number
  glyRPsi: number
  glySPsi: number
  reason: string
  ch01: { mode: ChillerMode; rla: number; condPsig: number; mbc: 'LEVITATED' | 'LANDED' | 'FAULT' }
  ch02: { mode: ChillerMode; rla: number; condPsig: number; mbc: 'LEVITATED' | 'LANDED' | 'FAULT' }
  alarm: string | null
  weather: 'mild' | 'design' | 'extreme'
}

export class PlantSim {
  private t0 = performance.now()
  lchltSet = 55
  /** Balancing-valve opening. Header ΔP follows flow through the valve. */
  chwValvePct = 72
  cwValvePct = 78
  /** Closed glycol loop to the outdoor dry cooler. */
  glycolValvePct = 70
  /** Outdoor dry bulb. The tower follows wet bulb; the dry cooler follows this. */
  oatF = 75
  weather: PlantSnapshot['weather'] = 'mild'
  incident: null | 'high-head' | 'hall-hot' | 'landing' | 'failover' = null
  ch01Running = true
  ch02Running = false

  setHeaderValve(loop: 'chw' | 'cw' | 'gly', pct: number) {
    const v = Math.max(15, Math.min(100, Math.round(pct)))
    if (loop === 'chw') this.chwValvePct = v
    else if (loop === 'cw') this.cwValvePct = v
    else this.glycolValvePct = v
  }

  setOutdoor(f: number) {
    this.oatF = Math.max(15, Math.min(110, Math.round(f)))
    this.weather = this.oatF >= 95 ? 'extreme' : this.oatF >= 78 ? 'design' : 'mild'
  }

  tick(): PlantSnapshot {
    const t = (performance.now() - this.t0) / 1000
    const oat = this.oatF
    const wb = Math.min(oat - 8, oat - 4 - Math.max(0, 70 - oat) * 0.15)
    const baseIt = 4.2 + Math.sin(t / 18) * 0.55 + Math.sin(t / 7) * 0.15
    let itLoadMw = baseIt
    let lchltAct = this.lchltSet + 0.4 + Math.sin(t / 5) * 0.25
    let hallSupplyF = 72 + (lchltAct - this.lchltSet) * 0.8
    let hallReturnF = hallSupplyF + 14 + itLoadMw * 0.35
    const chwFlow = this.chwValvePct / 100
    const cwFlow = this.cwValvePct / 100
    const glyFlow = this.glycolValvePct / 100
    let chwDpPsi = chwDpAt(this.chwValvePct) + Math.sin(t / 9) * 0.3
    let cwDpPsi = cwDpAt(this.cwValvePct) + Math.sin(t / 11) * 0.2
    let glycolDpPsi = glycolDpAt(this.glycolValvePct, oat)
    const chwrGuess = lchltAct + 10
    let dryFanPct = oat + 12 < chwrGuess ? Math.max(25, Math.min(100, 55 + (55 - oat) * 1.4)) : 20
    let towerFanPct = Math.max(18, Math.min(100, 25 + (wb - 58) * 2.2 + Math.max(0, itLoadMw - 3.5) * 10))
    const glyOffCooler = oat + 9 + (100 - dryFanPct) * 0.1
    const freeLift = Math.max(0, chwrGuess - glyOffCooler)
    let freeCoolPct = Math.max(0, Math.min(65, freeLift * glyFlow * 4.2))
    let chillerMw = itLoadMw * (1 - freeCoolPct / 100)
    let approach = 6 + (100 - towerFanPct) * 0.09 + (1 - cwFlow) * 5
    let cwsF = wb + approach
    let range = (6 + chillerMw * 1.3) / Math.max(cwFlow, 0.28)
    let cwrF = cwsF + range
    let condTemp = cwrF + 3
    let cond = 71 + (condTemp - 70) * 1.75
    let ch01Rla = this.ch01Running ? 28 + chillerMw * 9 + Math.max(0, condTemp - 85) * 0.85 : 0
    let ch02Rla = this.ch02Running ? 22 + chillerMw * 5 : 0
    let alarm: string | null = null
    let mbc1: PlantSnapshot['ch01']['mbc'] = this.ch01Running ? 'LEVITATED' : 'LANDED'
    let mbc2: PlantSnapshot['ch02']['mbc'] = this.ch02Running ? 'LEVITATED' : 'LANDED'
    let mode1: ChillerMode = this.ch01Running ? 'lead' : 'standby'
    let mode2: ChillerMode = this.ch02Running ? (this.ch01Running ? 'lag' : 'lead') : 'standby'

    if (this.incident === 'high-head') {
      towerFanPct = 100
      cwsF += 10
      cwrF += 10
      cond += 28
      ch01Rla = Math.min(105, ch01Rla + 22)
      alarm = 'HIGH CONDENSER PRESSURE · tower rejection limited'
      mode1 = 'alarm'
    } else if (this.incident === 'hall-hot') {
      hallSupplyF += 9
      hallReturnF += 11
      chwDpPsi = 9.5
      ch01Rla = Math.max(18, ch01Rla * 0.45)
      lchltAct = this.lchltSet + 0.2
      alarm = 'HALL HOT · CHW delivery / CRAH path suspect (chiller unloaded)'
    } else if (this.incident === 'landing') {
      mbc1 = 'LANDED'
      mode1 = 'alarm'
      ch01Rla = 0
      this.ch01Running = false
      alarm = 'MBC POWER-FAIL LANDING · investigate UPS / ATS'
    } else if (this.incident === 'failover') {
      this.ch01Running = false
      mode1 = 'offline'
      ch01Rla = 0
      mbc1 = 'LANDED'
      if (!this.ch02Running) {
        alarm = 'LEAD OFFLINE · STANDBY START INHIBIT'
        mode2 = 'alarm'
        hallSupplyF += 6
      } else {
        mode2 = 'lead'
        ch02Rla = 55 + itLoadMw * 5
        alarm = 'FAILOVER ACTIVE · CH-02 carrying load'
      }
    }

    if (!this.incident && this.chwValvePct < 42) {
      const starve = (42 - this.chwValvePct) / 42
      hallSupplyF += starve * 6
      hallReturnF += starve * 7
      alarm = 'LOW CHW ΔP · header valve is starving CRAHs'
    } else if (!this.incident && this.cwValvePct < 40) {
      cond += (40 - this.cwValvePct) * 0.55
      alarm = 'LOW CW ΔP · tower water flow is down, head will climb'
    } else if (!this.incident && oat < 48 && this.glycolValvePct < 30 && freeCoolPct < 8) {
      alarm = 'Glycol economizer is shut. The dry cooler could be carrying part of this load.'
    }

    const chwTargetPsi = oat >= 92 ? 20 : oat <= 48 ? 14 : 17
    const chwGain = gainPer10(chwDpAt, this.chwValvePct)
    const glycolGain = gainPer10((p) => glycolDpAt(p, oat), this.glycolValvePct)
    const fansPinned = towerFanPct >= 98 && oat >= 90
    const cwHeadGain = Math.round(((range - range * cwFlow / Math.min(cwFlow + 0.1, 1)) * 1.75 * (fansPinned ? 0.35 : 1)) * 10) / 10
    const reason = plantReason({
      oat,
      wb,
      chwTargetPsi,
      chwValve: this.chwValvePct,
      chwGain,
      glycolGain,
      cwHeadGain,
      freeCoolPct,
      fansPinned,
      dryFanPct,
    })

    towerFanPct = Math.max(0, Math.min(100, towerFanPct))
    ch01Rla = Math.max(0, Math.min(110, ch01Rla))
    ch02Rla = Math.max(0, Math.min(110, ch02Rla))

    return {
      t,
      itLoadMw: round(itLoadMw, 2),
      hallSupplyF: round(hallSupplyF, 1),
      hallReturnF: round(hallReturnF, 1),
      lchltSet: this.lchltSet,
      lchltAct: round(lchltAct, 1),
      cwetF: round(wb, 1),
      oatF: oat,
      wbF: round(wb, 1),
      towerFanPct: round(towerFanPct, 0),
      dryFanPct: round(dryFanPct, 0),
      chwDpPsi: round(chwDpPsi, 1),
      cwDpPsi: round(cwDpPsi, 1),
      glycolDpPsi: round(glycolDpPsi, 1),
      chwValvePct: this.chwValvePct,
      cwValvePct: this.cwValvePct,
      glycolValvePct: this.glycolValvePct,
      chwGain: round(chwGain, 1),
      cwHeadGain,
      glycolGain: round(glycolGain, 1),
      freeCoolPct: round(freeCoolPct, 0),
      chwTargetPsi,
      chwsF: round(lchltAct, 1),
      chwrF: round(lchltAct + 8 + (1 - chwFlow) * 10, 1),
      chwrPsi: 52,
      chwsPsi: round(52 - chwDpPsi, 1),
      cwsF: round(cwsF, 1),
      cwrF: round(cwrF, 1),
      cwsPsi: round(48, 1),
      cwrPsi: round(48 - cwDpPsi, 1),
      glyS: round(glyOffCooler, 1),
      glyR: round(glyOffCooler + 6 + chillerMw * (1 - glyFlow) * 2, 1),
      glySPsi: round(36 + glycolDpPsi, 1),
      glyRPsi: 36,
      reason,
      ch01: {
        mode: mode1,
        rla: round(ch01Rla, 0),
        condPsig: round(cond, 0),
        mbc: mbc1,
      },
      ch02: {
        mode: mode2,
        rla: round(ch02Rla, 0),
        condPsig: round(cond - (this.ch02Running ? 4 : 12), 0),
        mbc: mbc2,
      },
      alarm,
      weather: this.weather,
    }
  }
}

function chwDpAt(pct: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  return 6 + Math.pow(f, 1.35) * 20
}

function cwDpAt(pct: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  return 4 + Math.pow(f, 1.35) * 12
}

function glycolDpAt(pct: number, oat: number) {
  const f = Math.max(15, Math.min(100, pct)) / 100
  const thicker = 1 + Math.max(0, 55 - oat) * 0.04
  return (3.5 + Math.pow(f, 1.4) * 12) * thicker
}

function gainPer10(at: (pct: number) => number, pct: number) {
  const hi = Math.min(100, pct + 10)
  const lo = Math.max(15, hi - 10)
  return at(hi) - at(lo)
}

function plantReason(p: {
  oat: number
  wb: number
  chwTargetPsi: number
  chwValve: number
  chwGain: number
  glycolGain: number
  cwHeadGain: number
  freeCoolPct: number
  fansPinned: boolean
  dryFanPct: number
}) {
  const heat =
    p.oat <= 48
      ? `At ${p.oat}°F the dry cooler can take about ${Math.round(p.freeCoolPct)}% of the load in glycol, so the tower and the chiller both unload. Hold CHW water ΔP near ${p.chwTargetPsi} psi.`
      : p.oat >= 92
        ? `At ${p.oat}°F glycol leaving the dry cooler is warmer than chilled-water return, so free cooling is gone. The tower (wet bulb ${p.wb.toFixed(0)}°F) is the heat sink. Hold CHW ΔP near ${p.chwTargetPsi} psi while head is high.`
        : `Outdoor ${p.oat}°F, tower wet bulb ${p.wb.toFixed(0)}°F. Water ΔP target is about ${p.chwTargetPsi} psi. Glycol is only a trim.`
  const valve =
    p.chwValve < 40
      ? ` The CHW water valve is on the steep part of the curve: 10% of stem is about ${p.chwGain.toFixed(1)} psi.`
      : p.chwValve > 85
        ? ` The CHW valve is almost wide open, so 10% more stem is only about ${p.chwGain.toFixed(1)} psi. Piping and coils are the restriction now.`
        : ''
  const sink = p.fansPinned
    ? ` Tower fans are pinned, so the condenser-water valve barely moves head (${p.cwHeadGain.toFixed(1)} psi per 10%).`
    : p.oat <= 48
      ? ` Cold glycol is thicker, so the glycol valve is touchy: about ${p.glycolGain.toFixed(1)} psi per 10%, and it changes free cooling.`
      : ` Condenser-water valve still moves head, about ${p.cwHeadGain.toFixed(1)} psi per 10%, because the tower has fan left.`
  return heat + valve + sink
}

function round(n: number, d: number) {
  const p = 10 ** d
  return Math.round(n * p) / p
}

export function rankFor(mastery: number, xp: number): { title: string; tier: number } {
  const score = mastery * 0.7 + Math.min(xp, 400) / 400 * 30
  if (score >= 85) return { title: 'Plant Lead', tier: 4 }
  if (score >= 60) return { title: 'Shift Operator', tier: 3 }
  if (score >= 30) return { title: 'NOC Trainee', tier: 2 }
  return { title: 'Yard Hand', tier: 1 }
}
