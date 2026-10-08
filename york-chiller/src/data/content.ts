export type ComponentId =
  | 'evaporator'
  | 'condenser'
  | 'compressor'
  | 'vsd'
  | 'optiview'
  | 'mbc'
  | 'power'
  | 'waterboxes'

export interface ComponentInfo {
  id: ComponentId
  name: string
  short: string
  color: string
  icon: string
  summary: string
  details: string[]
  operatorTip: string
}

export const COMPONENTS: ComponentInfo[] = [
  {
    id: 'evaporator',
    name: 'Evaporator (CHW Cooler)',
    short: 'Evap',
    color: '#3ECFCF',
    icon: 'evaporator',
    summary:
      'Produces chilled water for CRAH/CRAC coils and CDU loops that reject IT heat from the data hall.',
    details: [
      'Leaving chilled liquid temperature (LCHLT) is the primary control target for the plant.',
      'In a data center, setpoint changes are change-controlled — they affect hall supply air and PDU density headroom.',
      'Rising evaporator approach often means fouling, low CHW flow, or air in the loop — investigate before the hall warms.',
    ],
    operatorTip: 'Trend LCHLT vs hall return air / CRAH valve position. Drift here is an early IT-risk signal.',
  },
  {
    id: 'condenser',
    name: 'Condenser (Heat Rejection)',
    short: 'Cond',
    color: '#F0A202',
    icon: 'condenser',
    summary:
      'Rejects compressor heat as condenser water to the cooling tower. A separate glycol loop to the dry cooler free-cools only when outdoor air is colder than the chilled-water return.',
    details: [
      'High condenser pressure during peak outdoor wet-bulb is a common data-center capacity cliff.',
      'Coordinate with tower chemical treatment and strainer PM — fouling shows up as approach rise under IT load.',
      'Never chase high head by defeating safeties; shed noncritical load or bring redundant chillers per SOP.',
    ],
    operatorTip: 'On red-alert weather days, watch CWET, tower fans, and condenser approach before IT load peaks.',
  },
  {
    id: 'compressor',
    name: 'Magnetic Bearing Compressor',
    short: 'Comp',
    color: '#7DD3FC',
    icon: 'compressor',
    summary:
      'Oil-free PM centrifugal with active magnetic bearings — preferred in 24/7 plants for efficiency and low maintenance.',
    details: [
      'Partial-load efficiency matters: data centers rarely sit at design load all day.',
      'Landing counters after utility blips or ATS transfers need tickets — power quality is a facility issue.',
      'Soft stop only for planned work; unplanned stops require incident communication to NOC / facilities lead.',
    ],
    operatorTip: 'In N+1 plants, never stop the last online chiller without confirming redundant capacity is online and loaded.',
  },
  {
    id: 'vsd',
    name: 'OptiSpeed VSD',
    short: 'VSD',
    color: '#A78BFA',
    icon: 'vsd',
    summary:
      'Variable-speed drive that tracks IT load. Harmonics / power quality can matter on shared campus buses.',
    details: [
      'Keep VSD coolant and heat-exchanger PM on schedule — thermal trips take cooling offline.',
      'Coordinate electrical work with EPMS / UPS maintenance windows.',
      'Voltage imbalance under generator or UPS feed can look like a “compressor problem.”',
    ],
    operatorTip: 'After generator tests or UPS maintenance, verify VSD health and phase balance before declaring the plant normal.',
  },
  {
    id: 'optiview',
    name: 'OptiView™ Control Center',
    short: 'Panel',
    color: '#34D399',
    icon: 'optiview',
    summary:
      'Local operator HMI. In data centers it usually also talks to BMS / EPMS for monitoring and remote enable.',
    details: [
      'Know which setpoints are local vs BMS-supervised — fighting the BMS causes oscillations.',
      'Classify messages: warning vs cycling vs safety — each has a different escalation path to the NOC.',
      'Capture stable operating data after MOP completion for the site baseline library.',
    ],
    operatorTip: 'If BMS and OptiView disagree, trust instruments — then reconcile points, don’t guess.',
  },
  {
    id: 'mbc',
    name: 'Magnetic Bearing Controller',
    short: 'MBC',
    color: '#FB7185',
    icon: 'mbc',
    summary:
      'Levitates the rotor and streams vibration / landing data — critical when utility / UPS events are common.',
    details: [
      'ATS transfers and brief outages can increment landings even if the hall never notices.',
      'UPS battery health on the chiller controls is part of protecting the driveline.',
      'Rising 1× vibration trends deserve a work order before a weekend peak.',
    ],
    operatorTip: 'Any new power-fail landing during generator exercise → open a ticket the same shift.',
  },
  {
    id: 'power',
    name: 'Power / Battery Panel',
    short: 'Power',
    color: '#FBBF24',
    icon: 'power',
    summary:
      'Feeds controls and bearing hold-up power. In a data center, this sits inside a larger critical-power topology.',
    details: [
      'Know which UPS / panel feeds this chiller before you rack out a breaker.',
      'Schedule LOTO with the same rigor as IT change control.',
      'Monthly connection checks prevent nuisance trips that cascade into hall alarms.',
    ],
    operatorTip: 'Never assume “chiller power” is noncritical — cooling loss is an IT incident.',
  },
  {
    id: 'waterboxes',
    name: 'Waterboxes & CHW / CW Headers',
    short: 'Water',
    color: '#60A5FA',
    icon: 'water',
    summary:
      'Ties the machine into primary/secondary CHW and condenser-water headers shared across the plant.',
    details: [
      'Isolation valves and strainers are MOP-critical before any tube or waterbox work.',
      'Wrong flow or closed balancing valves starve CRAHs even if the chiller looks “happy.”',
      'Differential pressure and flow meters are your friends during capacity shortfalls.',
    ],
    operatorTip: 'When hall temps rise but chiller %RLA is low, look at pumps, valves, and distribution — not just the YMC².',
  },
]

export const PLANT_NODES = [
  {
    id: 'it',
    label: 'IT Load',
    detail:
      'Servers reject heat to air or liquid. Cooling demand follows compute — often spiky during batch / AI jobs.',
  },
  {
    id: 'crah',
    label: 'CRAH / CDU',
    detail:
      'Hall units transfer heat into the chilled-water loop. Valve position and ΔT tell you if the plant is keeping up.',
  },
  {
    id: 'chw',
    label: 'CHW Loop',
    detail:
      'Pumps and headers move chilled water between chillers and the white space. Redundancy lives here (N+1 / 2N).',
  },
  {
    id: 'ymc2',
    label: 'YMC² Chiller',
    detail:
      'Magnetic-bearing centrifugal makes LCHLT. One machine of several — always know which is lead / lag / standby.',
  },
  {
    id: 'tower',
    label: 'Towers / CW',
    detail:
      'Heat leaves the building. Peak wet-bulb days are when data-center plants run out of rejection capacity first.',
  },
  {
    id: 'bms',
    label: 'BMS / NOC',
    detail:
      'Monitoring, sequencing, and escalation. Operators work the plant; the NOC owns the incident clock.',
  },
]

export const STARTUP_STEPS = [
  {
    id: 'mop',
    title: 'MOP / change ticket live',
    body: 'Confirm approved method of procedure, window, and NOC awareness before touching a production chiller.',
  },
  {
    id: 'redundancy',
    title: 'Verify redundant capacity',
    body: 'Confirm sister chillers / pumps can carry IT load. Never start work that collapses N+1 without a plan.',
  },
  {
    id: 'power',
    title: 'Verify power path',
    body: 'Check VSD / control power, UPS feed status, and that no concurrent electrical work conflicts.',
  },
  {
    id: 'water',
    title: 'Prove CHW & CW systems',
    body: 'Start pumps per sequence, prove flows / switches, confirm tower readiness and header valves.',
  },
  {
    id: 'setpoints',
    title: 'Align OptiView ↔ BMS',
    body: 'Confirm LCHLT, enables, and cutouts match the live plant SOP — not a lab default.',
  },
  {
    id: 'start',
    title: 'Start & watch levitation',
    body: 'Command start. Verify MBC levitated, VSD ramp, and LCHLT trending toward setpoint without inhibits.',
  },
  {
    id: 'stabilize',
    title: 'Stabilize, load-share, log',
    body: 'Confirm plant sequencing (lead/lag), capture operating data, close the ticket with as-left conditions.',
  },
]

export const SHUTDOWN_STEPS = [
  {
    id: 'noc',
    title: 'NOC / facilities approval',
    body: 'Planned stop only with awareness. Unplanned stop = incident — communicate immediately.',
  },
  {
    id: 'redundant',
    title: 'Bring redundant unit online',
    body: 'Start / load the standby chiller and confirm hall / CHW temps stable before stopping this machine.',
  },
  {
    id: 'soft',
    title: 'Soft shutdown',
    body: 'Use OptiView soft stop so the driveline decelerates under control.',
  },
  {
    id: 'isolate',
    title: 'Isolate per MOP',
    body: 'Valves, electrical LOTO, and tags only as the approved procedure directs.',
  },
  {
    id: 'secure',
    title: 'Secure & hand back',
    body: 'Record as-left state, messages, and who owns the next action. Update BMS notes / ticket.',
  },
]

export interface QuizQuestion {
  id: string
  prompt: string
  choices: string[]
  answer: number
  explain: string
  topic: 'operation' | 'components' | 'maintenance' | 'troubleshoot' | 'datacenter'
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'In a data-center plant, what should you confirm before stopping a running YMC² for maintenance?',
    choices: [
      'That the OptiView language is set to English',
      'That redundant cooling capacity is online and carrying load',
      'That all CRAHs are in manual',
      'That the tower basin is empty',
    ],
    answer: 1,
    explain: 'N+1 / 2N only works if standby capacity is actually online before you remove a machine.',
    topic: 'datacenter',
  },
  {
    id: 'q2',
    prompt: 'What is the primary leaving-temperature control target on a YMC²?',
    choices: [
      'Entering condenser water temperature',
      'Leaving chilled liquid temperature (LCHLT)',
      'Hot-aisle temperature',
      'Oil sump temperature',
    ],
    answer: 1,
    explain: 'OptiView holds LCHLT; hall air temps are downstream of CRAHs / CDUs on that CHW.',
    topic: 'operation',
  },
  {
    id: 'q3',
    prompt: 'Magnetic bearings keep the rotor levitated. When do touchdown bearings engage?',
    choices: [
      'Continuously at full IT load',
      'Only during oil flush cycles',
      'On shutdown landings or magnetic-bearing power loss',
      'Whenever a CRAH valve opens',
    ],
    answer: 2,
    explain: 'Touchdown bearings engage when rotation stops or magnetic support is lost — e.g. power events.',
    topic: 'components',
  },
  {
    id: 'q4',
    prompt: 'Hall temps rising while the lead chiller shows low %RLA most likely means…',
    choices: [
      'The compressor needs more refrigerant oil',
      'A distribution / pump / valve / CRAH issue, not necessarily chiller capacity',
      'OptiView should be rebooted hourly',
      'You should open the relief valve',
    ],
    answer: 1,
    explain: 'If the machine is unloaded but the hall is hot, chase CHW distribution and terminal units.',
    topic: 'troubleshoot',
  },
  {
    id: 'q5',
    prompt: 'If power-fail landing count increases by 1 after a generator test…',
    choices: [
      'Ignore it — generator tests always do that',
      'Reset the counter so trends look clean',
      'Document it and have service investigate power / UPS health',
      'Raise LCHLT 5°F permanently',
    ],
    answer: 2,
    explain: 'O&M expects investigation when landings increase — especially after known electrical events.',
    topic: 'maintenance',
  },
  {
    id: 'q6',
    prompt: 'Who typically owns the incident clock if cooling threatens IT availability?',
    choices: [
      'Only the refrigerant vendor',
      'NOC / facilities incident process (operators execute plant response)',
      'The first person who walks by the chiller',
      'Automatic OptiView email alone',
    ],
    answer: 1,
    explain: 'Data-center ops escalate through NOC / incident command; operators stabilize the plant.',
    topic: 'datacenter',
  },
  {
    id: 'q7',
    prompt: 'Normal planned stop from the operator station should be…',
    choices: [
      'Opening the main disconnect under load',
      'Hitting safety stop every time',
      'OptiView soft shutdown after redundant capacity is confirmed',
      'Killing CHW pumps first to “save the servers”',
    ],
    answer: 2,
    explain: 'Soft stop after redundancy is live. Killing pumps first is how you create a thermal event.',
    topic: 'operation',
  },
  {
    id: 'q8',
    prompt: 'Peak outdoor wet-bulb days threaten data-center plants mainly by…',
    choices: [
      'Changing OptiView units to metric',
      'Reducing tower heat-rejection capability → high head / capacity limits',
      'Increasing magnetic bearing gap automatically',
      'Lowering server idle power only',
    ],
    answer: 1,
    explain: 'Heat rejection is the usual summer cliff. Watch towers, CW, and condenser approach early.',
    topic: 'datacenter',
  },
  {
    id: 'q9',
    prompt: 'A cycling shutdown differs from a safety shutdown because…',
    choices: [
      'Cycling is ignored in data centers',
      'Cycling may clear and allow auto-restart logic; safety is a hard protective trip',
      'Safety trips only affect CRAHs',
      'They are identical messages',
    ],
    answer: 1,
    explain: 'Message class drives restart rules and escalation — read the exact text.',
    topic: 'troubleshoot',
  },
  {
    id: 'q10',
    prompt: 'Before changing LCHLT on a live campus plant you should…',
    choices: [
      'Slide it freely — magnetic chillers self-optimize halls',
      'Follow change control / SOP and understand CRAH and IT impact',
      'Set it to 32°F for “extra safety margin”',
      'Disable BMS supervision permanently',
    ],
    answer: 1,
    explain: 'Setpoint moves are operational changes with hall consequences — use the site process.',
    topic: 'datacenter',
  },
]

export interface MatchPair {
  id: string
  icon: string
  label: string
  blurb: string
}

export const MATCH_PAIRS: MatchPair[] = COMPONENTS.map((c) => ({
  id: c.id,
  icon: c.icon,
  label: c.name,
  blurb: c.summary,
}))

export interface TroubleCase {
  id: string
  title: string
  symptoms: string[]
  options: { text: string; correct: boolean; feedback: string }[]
  teach: string
}

export const TROUBLE_CASES: TroubleCase[] = [
  {
    id: 'high-head',
    title: 'High head on a peak weather day',
    symptoms: [
      'Elevated condenser pressure / limited capacity',
      'Outdoor wet-bulb near design',
      'NOC reports warm aisle alarms starting',
    ],
    options: [
      {
        text: 'Check towers, CW flow, strainer ΔP, condenser approach; stage redundant chillers per SOP',
        correct: true,
        feedback: 'Correct — fix rejection and use plant redundancy before the hall cooks.',
      },
      {
        text: 'Raise LCHLT 10°F immediately with no ticket',
        correct: false,
        feedback: 'May be an emergency lever in SOP — but it is not the first diagnosis, and needs control.',
      },
      {
        text: 'Open refrigerant relief to atmosphere',
        correct: false,
        feedback: 'Never vent refrigerant as a pressure fix.',
      },
      {
        text: 'Disable safeties so the machine “pushes through”',
        correct: false,
        feedback: 'Safeties protect the asset — bypassing them risks a worse outage.',
      },
    ],
    teach: 'Weather-driven high head is a plant problem: towers + redundancy + clear NOC comms.',
  },
  {
    id: 'landing',
    title: 'Landing after ATS / generator exercise',
    symptoms: [
      'MBC landing counter +1',
      'Generator test completed an hour ago',
      'Chiller is back running; hall stable',
    ],
    options: [
      {
        text: 'Document in the ticket log and engage service on power / UPS health',
        correct: true,
        feedback: 'Right — electrical events plus landings are a facilities follow-up, not “noise.”',
      },
      {
        text: 'Clear the counter so the dashboard stays green',
        correct: false,
        feedback: 'Erasing the trend hides the failure mode.',
      },
      {
        text: 'Pull the chiller offline until next quarter',
        correct: false,
        feedback: 'Overreaction if redundant capacity isn’t planned — investigate while it runs if safe.',
      },
      {
        text: 'Ignore — data centers always land bearings',
        correct: false,
        feedback: 'Landings are abnormal events to trend.',
      },
    ],
    teach: 'Coordinate chiller power quality with EPMS / UPS / generator programs.',
  },
  {
    id: 'hall-hot-chiller-idle',
    title: 'Hall hot, chiller unloaded',
    symptoms: [
      'Hot-aisle alarms',
      'Lead YMC² at low %RLA / near setpoint',
      'Some CRAH valves wide open',
    ],
    options: [
      {
        text: 'Check CHW pumps, header valves, differential pressure, and CRAH/CDU operation',
        correct: true,
        feedback: 'Distribution failed — the chiller never got the load.',
      },
      {
        text: 'Force the compressor to 100% speed regardless of LCHLT',
        correct: false,
        feedback: 'Fighting a satisfied LCHLT won’t fix a starved hall loop.',
      },
      {
        text: 'Shut all redundant chillers to “focus flow”',
        correct: false,
        feedback: 'Removing redundancy during an event is dangerous.',
      },
      {
        text: 'Reboot every rack PDU',
        correct: false,
        feedback: 'Not a cooling distribution fix.',
      },
    ],
    teach: 'Separate “make cold water” from “deliver cold water.” Both must work.',
  },
  {
    id: 'no-start',
    title: 'Standby chiller won’t start during failover',
    symptoms: [
      'Lead unit tripped',
      'Standby start inhibit on OptiView',
      'NOC escalating IT risk',
    ],
    options: [
      {
        text: 'Read the inhibit, clear the stated interlock (flow, remote enable, BMS stop), escalate if stuck',
        correct: true,
        feedback: 'Inhibit text is the checklist — speed matters, shortcuts don’t.',
      },
      {
        text: 'Hot-wire the flow switch to force a start',
        correct: false,
        feedback: 'Never defeat flow proving — risk equipment and people.',
      },
      {
        text: 'Silence NOC until the inhibit clears itself',
        correct: false,
        feedback: 'Communicate status while you work the plant.',
      },
      {
        text: 'Switch display units to Celsius to bypass inhibits',
        correct: false,
        feedback: 'Display units do not clear interlocks.',
      },
    ],
    teach: 'Failover drills exist so inhibit hunting is muscle memory under pressure.',
  },
  {
    id: 'bms-fight',
    title: 'BMS and OptiView fighting setpoint',
    symptoms: [
      'LCHLT oscillating',
      'BMS writing a different setpoint than the panel',
      'Valves hunting on CRAHs',
    ],
    options: [
      {
        text: 'Stabilize per SOP (often place in a known control mode), then reconcile BMS vs local ownership',
        correct: true,
        feedback: 'Stop the fight first, then fix the integration — don’t keep bumping both.',
      },
      {
        text: 'Disable all safeties in OptiView',
        correct: false,
        feedback: 'Unrelated and unsafe.',
      },
      {
        text: 'Unplug the network drop permanently',
        correct: false,
        feedback: 'May be a temporary isolate in SOP — not a permanent “fix.”',
      },
      {
        text: 'Ignore oscillation; AI load will average it out',
        correct: false,
        feedback: 'Oscillation wastes capacity and risks trips.',
      },
    ],
    teach: 'Know the site’s control hierarchy: who is master for enable and setpoint.',
  },
]

export const CYCLE_NODES = [
  {
    id: 'evap',
    label: 'Evaporator',
    phase: 'CHW heat in → refrigerant vapor',
    detail: 'IT heat arrives as warm chilled-water return; refrigerant absorbs it.',
  },
  {
    id: 'comp',
    label: 'Compressor',
    phase: 'Vapor compressed',
    detail: 'Magnetic-bearing PM motor raises pressure — speed tracks plant load.',
  },
  {
    id: 'cond',
    label: 'Condenser',
    phase: 'Heat out to CW / towers',
    detail: 'Heat leaves toward the cooling towers — the summer bottleneck.',
  },
  {
    id: 'feed',
    label: 'Level / feed',
    phase: 'Liquid metered back',
    detail: 'Level control feeds the evaporator so LCHLT stays stable for the hall.',
  },
]

export const MAINT_ITEMS = [
  { id: 'd1', when: 'Each shift', text: 'Review CHW LCHLT, hall alarms, and chiller status in BMS / OptiView' },
  { id: 'd2', when: 'Each shift', text: 'Scan for new warnings, landings, or capacity limits' },
  { id: 'd3', when: 'Daily', text: 'Record operating conditions on the plant log form' },
  { id: 'w1', when: 'Weekly', text: 'Verify CHW & CW flows / header DP vs normal band' },
  { id: 'w2', when: 'Weekly', text: 'Walk towers / strainers; note basin level & fan status' },
  { id: 'm1', when: 'Monthly', text: 'Check 3-phase voltage / current balance' },
  { id: 'm2', when: 'Monthly', text: 'Tighten electrical connections (LOTO as required)' },
  { id: 'm3', when: 'Monthly', text: 'Confirm setpoints & cutouts match live SOP' },
  { id: 'm4', when: 'Monthly', text: 'Failover awareness: which unit is lead / lag / standby' },
  { id: 'y1', when: 'Yearly', text: 'VSD heat-exchanger clean / coolant service' },
  { id: 'y2', when: 'Yearly', text: 'UPS battery health check for bearing hold-up' },
  { id: 'y3', when: 'Yearly', text: 'Refrigerant analysis (qualified tech)' },
  { id: 'y4', when: 'Yearly', text: 'Review MBC vibration / landing trends with service' },
  { id: 'n1', when: '2–5 yr', text: 'Eddy-current tube testing during planned outage window' },
]

export type ViewId =
  | 'home'
  | 'plant'
  | 'explorer'
  | 'cycle'
  | 'operation'
  | 'optiview'
  | 'match'
  | 'quiz'
  | 'trouble'
  | 'maintenance'

/** Snapshot fields the info panel may quote. Values are formatted like the cards. */
export type InfoLive =
  | 'hallSupply'
  | 'hallReturn'
  | 'lchltAct'
  | 'lchltSet'
  | 'itLoad'
  | 'head'
  | 'outdoor'
  | 'wetBulb'
  | 'rla'
  | 'mode'
  | 'chwDp'
  | 'cwDp'
  | 'glyDp'
  | 'chwValve'
  | 'cwValve'
  | 'glyValve'
  | 'chwr'
  | 'chws'
  | 'cws'
  | 'cwr'
  | 'glyS'
  | 'glyR'
  | 'towerFan'
  | 'dryFan'
  | 'freeCool'
  | 'mbc'
  | 'landings'
  | 'vibe'
  | 'evapPsig'
  | 'alarm'
  | 'optiAct'
  | 'optiRla'

export interface InfoEntry {
  title: string
  /** Three to five short teaching points. */
  points: readonly string[]
  live?: readonly InfoLive[]
}

const point = (title: string, points: readonly string[], live?: readonly InfoLive[]): InfoEntry => ({
  title,
  points,
  live,
})

/** Teaching copy for every card and slider. Review it here, not in the views. */
export const INFO = {
  'kpi-hall': point(
    'Hall supply',
    [
      'Hall supply air is what the IT equipment feels after the CRAHs or CDUs.',
      'It sits downstream of leaving chilled-water temperature, so a warm hall can be a plant problem or a distribution problem.',
      'This board flags the tile when supply air is above 78°F.',
      'Trend it against return air and CRAH valve position before you move a chiller setpoint.',
    ],
    ['hallSupply', 'hallReturn'],
  ),
  'kpi-lchlt': point(
    'LCHLT',
    [
      'Leaving chilled liquid temperature is the chiller’s primary control target.',
      'The trainer starts the setpoint at 55°F. Actual temperature should stay near that setpoint while the plant is loaded.',
      'A satisfied LCHLT with a hot hall means the cold water is not reaching the coils.',
      'Setpoint changes affect hall supply air and density headroom, so they belong in change control.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'kpi-it': point(
    'IT load',
    [
      'IT load is the heat the servers reject into air or liquid.',
      'Cooling demand follows compute and can spike during batch or AI jobs.',
      'The chiller and the towers have to reject that heat, not a nameplate that assumes a flat day.',
      'If load jumps and head or hall temperature follows, tell the NOC what the plant is doing.',
    ],
    ['itLoad'],
  ),
  'kpi-head': point(
    'Condenser head',
    [
      'Head here is condenser pressure on CH-01. High head means the machine is struggling to reject heat.',
      'This board warns above 115 psig.',
      'Peak wet-bulb weather, low condenser-water flow, and fouled towers are the usual causes.',
      'Do not defeat safeties to push through. Use towers, flow, and redundant chillers per the site SOP.',
    ],
    ['head'],
  ),
  'kpi-outdoor': point(
    'Outdoor temperature',
    [
      'Outdoor dry bulb drives the dry cooler. The tower follows wet bulb, which this sim keeps below the dry bulb.',
      'The live board’s 40°F, 75°F, and 100°F presets are the same outdoor setting as the field slider.',
      'Cold air can let the glycol loop carry part of the load. Hot air puts the tower on the critical path.',
      'Read the plant note under the mimic before you chase a single chiller alarm.',
    ],
    ['outdoor', 'wetBulb'],
  ),
  'kpi-ch01': point(
    'CH-01 load',
    [
      '%RLA is how hard the lead compressor is working, not how healthy the hall is.',
      'Low %RLA with a hot hall usually means pumps, valves, or CRAHs, not a need for more speed.',
      'High %RLA with high head means heat rejection or condenser flow is the limit.',
      'In an N+1 plant, know whether CH-01 is lead, lag, standby, or in alarm before you stop anything.',
    ],
    ['rla', 'mode'],
  ),
  'mimic-it': point(
    'IT load',
    [
      'This block is the heat source. Servers reject heat to air or to liquid.',
      'The number is compute heat in megawatts from the live sim.',
      'Spikes are normal in batch and AI work. The plant has to follow them.',
      'Use the knowledge gate if you need the operating rules behind the number.',
    ],
    ['itLoad'],
  ),
  'mimic-crah': point(
    'CRAH / CDU',
    [
      'Hall units move IT heat into the chilled-water loop.',
      'Supply air and return air are the pair to watch. A wide gap with valves already open means the water is not cold enough or not arriving.',
      'Valve position and the water-side ΔT tell you whether the plant is keeping up.',
      'Do not reboot racks to fix a cooling-distribution problem.',
    ],
    ['hallSupply', 'hallReturn'],
  ),
  'mimic-chw': point(
    'CHW loop',
    [
      'Pumps and headers carry chilled water between the chillers and the white space.',
      'Differential pressure is the delivery signal. The field card shows the current target next to ΔP.',
      'This trainer marks CHW ΔP bad below 12 psi or above 24 psi.',
      'Redundancy lives in this loop. A happy chiller does not prove the hall is fed.',
    ],
    ['chwDp', 'chwValve'],
  ),
  'mimic-chiller': point(
    'CH-01 YMC²',
    [
      'This is one magnetic-bearing centrifugal in a larger plant. Always know lead, lag, and standby.',
      'It makes leaving chilled liquid temperature. It does not, by itself, deliver that water to every CRAH.',
      'Alarm mode means read the banner and the inhibit or head limit before you touch a setpoint.',
      'Open the 3D plant room to walk the machine, or OptiView to drive CH-01.',
    ],
    ['mode', 'rla', 'lchltAct'],
  ),
  'mimic-tower': point(
    'Tower and dry cooler',
    [
      'The tower rejects condenser heat. The dry cooler can take glycol load only when outdoor air is colder than the chilled-water return.',
      'Wet bulb, dry bulb, and the glycol free-cool percent are the three numbers on this block.',
      'Heat rejection is the usual summer limit. Watch it before IT load peaks.',
      'The refrigerant-loop view is the path of heat inside the machine. This block is where that heat leaves the building.',
    ],
    ['wetBulb', 'outdoor', 'freeCool', 'towerFan', 'dryFan'],
  ),
  'mimic-noc': point(
    'NOC / BMS',
    [
      'Operators work the plant. The NOC owns the incident clock when cooling threatens IT.',
      'A green watch desk means no active sim alarm. Escalated means say what you see and what you are doing.',
      'If the BMS and the local panel disagree, trust the instruments, then reconcile the points.',
      'Do not silence the desk and hope an inhibit clears itself.',
    ],
    ['alarm'],
  ),
  'weather-preset': point(
    'Weather presets',
    [
      'These three buttons set outdoor dry bulb to 40°F, 75°F, or 100°F.',
      '40°F is the economizer case: the dry cooler can carry part of the load. 100°F is the heat-rejection case.',
      'They write the same outdoor value as the field-instrument slider.',
      'Read wet bulb and the plant note after you change the weather. The tower follows wet bulb, not the dry-bulb label alone.',
    ],
    ['outdoor', 'wetBulb', 'freeCool'],
  ),
  'drill-queue': point(
    'Drill queue',
    [
      'Each row is a trainer module, not a live plant command.',
      'Work cooling chain, walkdown, refrigerant loop, and MOP before you treat the panel as muscle memory.',
      'Done means you cleared that module in this browser. It is not a site qualification.',
      'The live board above the queue keeps running while you train.',
    ],
  ),
  'mission-plant': point(
    'Cooling chain drill',
    [
      'Walk IT heat from the hall to the tower so you know upstream and downstream.',
      'The YMC² is one link. Pumps, CRAHs, and heat rejection can fail while the chiller looks fine.',
      'Finish the chain once for walkthrough credit in this trainer.',
    ],
  ),
  'mission-explorer': point(
    '3D walkdown',
    [
      'The plant room is a spatial walkdown of CH-01, the three water loops, the tower, and the dry cooler.',
      'Teal is chilled water, gold is condenser water, violet is glycol.',
      'Clear all eight assemblies for walkdown credit. The buttons under the model work if WebGL does not.',
    ],
  ),
  'mission-cycle': point(
    'Refrigerant loop drill',
    [
      'This is the vapor-compression path inside the machine: evaporator, compressor, condenser, and feed.',
      'IT heat arrives as warm chilled-water return and leaves toward the towers.',
      'Use it to name the stage you are talking about before you open a work order.',
    ],
  ),
  'mission-operation': point(
    'MOP start and stop',
    [
      'Startup is ticket, redundancy, power, water, aligned setpoints, then start.',
      'A planned stop waits until the standby machine is online and the hall is stable.',
      'Unplanned stops are incidents. Say so, and use a soft stop rather than pulling power under load.',
    ],
  ),
  'mission-optiview': point(
    'OptiView drill',
    [
      'The panel is tied to the same sim as the live board.',
      'Practice setpoint, soft stop, and safety stop, and read MBC status before you call it a chiller problem.',
      'Know which setpoints the BMS owns so you do not fight the building system.',
    ],
  ),
  'mission-match': point(
    'Icon match',
    [
      'Match the mark to the system until the eight assemblies are instant.',
      'The info button names the system. Use it to learn, then shuffle and try without it.',
      'A perfect board is trainer credit, not a license to skip the walkdown.',
    ],
  ),
  'mission-quiz': point(
    'Knowledge gate',
    [
      'Ten questions on operation, components, maintenance, and data-center practice.',
      'The info button teaches the idea. Answer from that, then read the feedback.',
      'Eight of ten is the trainer’s bar. The site SOP is still the bar on a live plant.',
    ],
  ),
  'mission-trouble': point(
    'Incident clock',
    [
      'You get a failing plant and a short NOC timer. Pick the first safe action.',
      'The live board is stressed to match the story. Read it before you tap.',
      'Communicate while you work. The clock expiring does not make a bad action correct.',
    ],
  ),
  'mission-maintenance': point(
    'Shift deck',
    [
      'These are awareness items for a 24/7 plant: each shift, weekly, monthly, and outage work.',
      'Tapping them records that you saw them in the trainer.',
      'Live work still follows the site MOP, LOTO, and the qualified-service list.',
    ],
  ),
  'chaos-board': point(
    'Chaos injects',
    [
      'These buttons stress the live sim. They are drills, not remedies.',
      'After an inject, read the alarm banner and the tiles before you change a valve or a setpoint.',
      'Clear incident returns CH-01 to lead and CH-02 to standby in this trainer.',
      'Open Incident Clock if you want the same failure as a timed decision.',
    ],
  ),
  'chaos-high-head': point(
    'Peak weather high head',
    [
      'This inject limits tower rejection and drives condenser pressure up.',
      'Expect the head tile and the alarm banner to move. %RLA often rises with head.',
      'First checks are towers, condenser-water flow, strainer difference, and approach. Then stage a redundant chiller per SOP.',
      'Do not vent refrigerant or bypass a safety to “push through.”',
    ],
    ['head', 'rla', 'alarm'],
  ),
  'chaos-hall-hot': point(
    'Hall hot, chiller idle',
    [
      'This inject warms the hall and unloads the chiller, with CHW ΔP pulled down.',
      'A low %RLA next to a hot supply air reading is the signature.',
      'Check pumps, header valves, differential pressure, and CRAH or CDU valves.',
      'Forcing the compressor to full speed does not fix water that never reaches the hall.',
    ],
    ['hallSupply', 'rla', 'chwDp', 'alarm'],
  ),
  'chaos-landing': point(
    'ATS landing',
    [
      'This inject records a magnetic-bearing landing, the kind of count that moves after an ATS transfer or generator test.',
      'The hall can look stable while the landing counter has changed. That is still a follow-up.',
      'Document it and have service look at power and UPS health. Do not clear the counter to keep the dashboard green.',
      'The MBC screen on OptiView shows the landing count for this drill.',
    ],
    ['mbc', 'landings'],
  ),
  'chaos-failover': point(
    'Lead trip failover',
    [
      'CH-01 is taken offline. If CH-02 is not already running, the sim raises a standby start inhibit.',
      'Read the inhibit. Flow, remote enable, and a BMS stop are typical reasons a standby machine will not start.',
      'Do not hot-wire a flow switch. Escalate if the stated interlock will not clear.',
      'Tell the NOC the lead is down and whether the standby has picked up.',
    ],
    ['mode', 'alarm', 'rla'],
  ),
  'chaos-clear': point(
    'Clear incident',
    [
      'This removes the injected failure and puts CH-01 back in the lead with CH-02 in standby.',
      'Use it when you want a clean board. It does not undo a setpoint or a valve you moved.',
      'On a real plant, “clear” is an as-left log and a ticket update, not a button that forgets the event.',
    ],
    ['alarm', 'mode'],
  ),
  'chain-it': point(
    'IT load',
    [
      'Servers reject heat to air or liquid. That heat is the load the plant must remove.',
      'Demand follows compute and is often spiky.',
      'Name the load before you talk about chiller percent. A small load should not need every machine at full head.',
    ],
    ['itLoad'],
  ),
  'chain-crah': point(
    'CRAH / CDU',
    [
      'Hall units transfer IT heat into the chilled-water loop.',
      'Valve position and the temperature rise across the coil tell you if the water is keeping up.',
      'Wide-open valves and a rising hall are a reason to look at CHW flow, not just compressor speed.',
    ],
    ['hallSupply', 'hallReturn'],
  ),
  'chain-chw': point(
    'CHW loop',
    [
      'Pumps and headers move chilled water between the chillers and the white space.',
      'N+1 and 2N redundancy live in this loop: pumps, headers, and more than one chiller.',
      'Differential pressure and the balancing valve decide whether the hall is fed.',
      'Wrong flow starves CRAHs even when the chiller display looks satisfied.',
    ],
    ['chwDp', 'chwValve'],
  ),
  'chain-ymc2': point(
    'YMC² chiller',
    [
      'The magnetic-bearing centrifugal makes leaving chilled liquid temperature.',
      'It is one machine of several. Know which is lead, lag, or standby before you isolate it.',
      'Partial load is normal in a data center. Efficiency at part load matters more than a single design-day number.',
    ],
    ['lchltAct', 'rla', 'mode'],
  ),
  'chain-tower': point(
    'Towers and condenser water',
    [
      'Heat leaves the building at the towers. A separate glycol loop can free-cool only when outdoor air is cold enough.',
      'Peak wet-bulb days are when plants run out of rejection capacity first.',
      'Coordinate tower fans, flow, and water treatment. Fouling shows up as approach under IT load.',
    ],
    ['wetBulb', 'towerFan', 'freeCool'],
  ),
  'chain-bms': point(
    'BMS / NOC',
    [
      'The BMS sequences and supervises. The NOC owns the incident clock.',
      'Operators execute the plant response and say what changed.',
      'If the BMS and OptiView disagree on setpoint or enable, stop the fight per SOP, then reconcile which system is master.',
    ],
    ['alarm'],
  ),
  'detail-ready': point(
    'Plant-room walkdown',
    [
      'Tap a part of the model or a chip on the rail. Each assembly has a short brief here.',
      'Teal pipes are chilled water to the hall, gold pipes are condenser water to the tower, and violet pipes are glycol to the dry cooler.',
      'Clear all eight assemblies for walkdown credit.',
      'The field cards under the model are the live loop readings.',
    ],
  ),
  'comp-evaporator': point(
    'Evaporator',
    [
      'The evaporator makes chilled water for CRAH, CRAC, and CDU loops.',
      'Leaving chilled liquid temperature is the control target. This trainer’s setpoint starts at 55°F.',
      'A rising approach often means fouling, low flow, or air in the loop. Investigate before the hall warms.',
      'Trend LCHLT against hall return air and CRAH valve position.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'comp-condenser': point(
    'Condenser',
    [
      'The condenser rejects compressor heat into condenser water and on to the tower.',
      'Glycol to the dry cooler is a separate loop. It free-cools only when outdoor air is colder than the chilled-water return.',
      'High condenser pressure on a peak wet-bulb day is a capacity cliff.',
      'Do not chase high head by defeating safeties. Shed noncritical load or bring a redundant chiller per SOP.',
    ],
    ['head', 'cws', 'cwr'],
  ),
  'comp-compressor': point(
    'Compressor',
    [
      'This is an oil-free centrifugal with active magnetic bearings, the usual choice where a plant runs all day.',
      'Data centers rarely sit at design load. Part-load behavior matters.',
      'Landings after a utility blip or an ATS transfer need a ticket. Power quality is a facilities issue.',
      'Never stop the last online chiller until redundant capacity is online and loaded.',
    ],
    ['rla', 'mode'],
  ),
  'comp-vsd': point(
    'Variable-speed drive',
    [
      'The drive tracks IT load by changing compressor speed.',
      'On a shared campus bus, harmonics and voltage balance can look like a compressor fault.',
      'Keep drive coolant and heat-exchanger maintenance on the outage plan. A thermal trip takes cooling offline.',
      'After a generator test or UPS work, check drive health before you call the plant normal.',
    ],
    ['rla'],
  ),
  'comp-optiview': point(
    'OptiView',
    [
      'This is the local operator panel. On a data-center plant it usually also reports to the BMS.',
      'Know which setpoints are local and which the BMS writes. Fighting both causes the loop to hunt.',
      'Read the message class. A warning, a cycling shutdown, and a safety trip escalate differently.',
      'If the panel and the BMS disagree, trust the instruments, then reconcile the points.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'comp-mbc': point(
    'Magnetic bearing controller',
    [
      'The controller levitates the rotor and reports vibration and landings.',
      'Touchdown bearings engage when rotation stops or magnetic support is lost, including a power event.',
      'An ATS transfer can add a landing even if the hall never alarms.',
      'A new power-fail landing during a generator exercise gets a ticket the same shift.',
    ],
    ['mbc', 'landings', 'vibe'],
  ),
  'comp-power': point(
    'Power and battery panel',
    [
      'This feed holds up controls and the magnetic bearings. It sits inside the critical-power topology, not off to the side.',
      'Know which UPS and which panel feed this chiller before you rack out a breaker.',
      'Lockout for electrical work uses the same rigor as an IT change.',
      'Cooling loss is an IT incident. Do not treat chiller power as noncritical.',
    ],
  ),
  'comp-waterboxes': point(
    'Waterboxes and headers',
    [
      'The waterboxes tie the machine into the shared chilled-water and condenser-water headers.',
      'Isolation valves and strainers are part of the MOP before any tube or waterbox work.',
      'A closed balancing valve starves the hall even if the chiller looks fine.',
      'When hall temperature rises and %RLA is low, look at pumps, valves, and distribution.',
    ],
    ['chwDp', 'cwDp', 'chwValve', 'cwValve'],
  ),
  'pipe-chw': point(
    'Chilled-water loop',
    [
      'CHWR is warm return from the hall. CHWS is the water the chiller sends back out.',
      'The valve on this card is the balancing valve for the whole chilled-water loop, so both rows move together.',
      'This trainer flags ΔP below 12 psi or above 24 psi. The target next to ΔP depends on the outdoor temperature.',
      'Open the valve if ΔP is low and the hall is warming. Ease it back if ΔP is high.',
    ],
    ['chwr', 'chws', 'chwDp', 'chwValve'],
  ),
  'pipe-cw': point(
    'Condenser-water loop',
    [
      'CWS is water from the tower to the condenser. CWR is the warmer water going back to the tower.',
      'Tower fan percent is the heat-rejection knob. Low flow and a hot wet bulb both raise head.',
      'This trainer flags condenser ΔP below 8 psi or above 18 psi.',
      'If CW ΔP collapses, head will climb. Prove flow before you blame the compressor.',
    ],
    ['cws', 'cwr', 'cwDp', 'cwValve', 'towerFan'],
  ),
  'pipe-gly': point(
    'Glycol loop',
    [
      'GLS and GLR are the glycol pair to the dry cooler, separate from the tower water.',
      'Free cooling is available when outdoor air is cold enough that the dry cooler can take heat the chiller would otherwise lift.',
      'On a cold day with the glycol valve nearly shut, the plant note will say the economizer is being left idle.',
      'Dry-cooler fan percent is the rejection knob on this loop. It is not the tower fan.',
    ],
    ['glyS', 'glyR', 'glyDp', 'glyValve', 'dryFan', 'freeCool'],
  ),
  'slider-chw': point(
    'CHW balancing valve',
    [
      'This slider is the chilled-water balancing valve, from 15% to 100% open in the trainer.',
      'More stem raises flow and ΔP until the piping and coils, not the valve, are the restriction.',
      'Below about 42% open, this sim starts to starve the CRAHs and warm the hall.',
      'Move it while you watch ΔP and hall supply. The gain line tells you how many psi a 10% move is worth right now.',
    ],
    ['chwValve', 'chwDp'],
  ),
  'slider-cw': point(
    'CW balancing valve',
    [
      'This slider is the condenser-water balancing valve, from 15% to 100% open.',
      'It sets flow to the tower circuit. Low flow shows up as low ΔP and then as higher head.',
      'This sim warns when the valve is under 40% open.',
      'Pair the valve with tower fan percent. Fans cannot reject heat the pump is not delivering.',
    ],
    ['cwValve', 'cwDp', 'head'],
  ),
  'slider-gly': point(
    'Glycol balancing valve',
    [
      'This slider is the glycol balancing valve to the dry cooler, from 15% to 100% open.',
      'It only carries useful load when outdoor air is cold enough for free cooling.',
      'Shutting it on a cold day leaves the chiller and the tower doing work the dry cooler could share.',
      'Watch glycol ΔP and the free-cool percent together.',
    ],
    ['glyValve', 'glyDp', 'freeCool', 'outdoor'],
  ),
  'slider-oat': point(
    'Outdoor dry bulb',
    [
      'This slider sets outdoor dry bulb from 20°F to 110°F. The live-board presets are the same setting at 40°F, 75°F, and 100°F.',
      'Dry bulb drives the dry cooler. Wet bulb, shown in the plant note and the tower card, drives the tower.',
      'The CHW ΔP target on the chilled-water card changes with this temperature: higher in extreme heat, lower in cold weather.',
      'Change the weather, then read the plant note before you retune valves.',
    ],
    ['outdoor', 'wetBulb'],
  ),
  'cycle-evap': point(
    'Evaporator stage',
    [
      'Warm chilled-water return from the hall gives its heat to the refrigerant here.',
      'The refrigerant boils. That is the “CHW heat in” side of the loop.',
      'If this stage is the story, the water-side readings are CHWR, CHWS, and LCHLT, not the tower.',
    ],
    ['chwr', 'chws', 'lchltAct'],
  ),
  'cycle-comp': point(
    'Compressor stage',
    [
      'The magnetic-bearing motor compresses the vapor and raises its pressure.',
      'Speed follows plant load through the variable-speed drive.',
      'Landings and vibration belong to this stage. A power event can land the rotor even when the hall stays up.',
    ],
    ['rla', 'mbc'],
  ),
  'cycle-cond': point(
    'Condenser stage',
    [
      'Heat leaves the refrigerant and goes to condenser water, then the towers.',
      'This is the summer bottleneck. High outdoor wet bulb shows up here first.',
      'CWS, CWR, tower fans, and head are the readings that belong to this stage.',
    ],
    ['cws', 'cwr', 'head', 'towerFan'],
  ),
  'cycle-feed': point(
    'Level and feed',
    [
      'Liquid refrigerant is metered back to the evaporator so the leaving water temperature stays stable.',
      'Level control is what keeps LCHLT from wandering while IT load moves.',
      'Do not invent a feed setpoint the panel is not showing. Use the LCHLT setpoint the trainer actually has.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'mop-mop': point(
    'MOP and ticket',
    [
      'Confirm the approved method of procedure, the window, and NOC awareness before you touch a production chiller.',
      'A change ticket is how the hall finds out cooling work is happening.',
      'If there is no ticket, you are not in a planned start.',
    ],
  ),
  'mop-redundancy': point(
    'Redundant capacity',
    [
      'Confirm a sister chiller and the pumps can carry the IT load before you remove a machine.',
      'N+1 only counts if the standby unit is actually able to run.',
      'Never start work that collapses redundancy without a written plan.',
    ],
  ),
  'mop-power': point(
    'Power path',
    [
      'Check drive and control power, the UPS feed, and that no other electrical job is on the same window.',
      'Bearing hold-up power is part of this check. A dead hold-up battery turns a blip into a landing.',
      'After generator or UPS work, verify the drive before you call the start normal.',
    ],
  ),
  'mop-water': point(
    'CHW and CW proof',
    [
      'Start pumps in sequence, prove flow switches, and confirm the tower and the header valves.',
      'A chiller that starts without proven water flow is how tubes and seals get hurt.',
      'The field cards are the proof: ΔP and valve position, not a green light alone.',
    ],
    ['chwDp', 'cwDp'],
  ),
  'mop-setpoints': point(
    'Setpoints',
    [
      'Match LCHLT, enables, and cutouts to the live plant SOP. A lab default is not a campus setpoint.',
      'This trainer’s LCHLT setpoint starts at 55°F and the OptiView slider runs from 42°F to 65°F.',
      'Know whether the BMS or the panel is allowed to write the number.',
    ],
    ['lchltSet'],
  ),
  'mop-start': point(
    'Start and levitation',
    [
      'Command start, then watch the bearing controller levitate, the drive ramp, and LCHLT move toward setpoint.',
      'An inhibit is a checklist. Read it. Do not jump a flow switch.',
      'If it will not start, say that to the NOC while you still have the lead machine online.',
    ],
    ['mbc', 'lchltAct', 'rla'],
  ),
  'mop-stabilize': point(
    'Stabilize and log',
    [
      'Confirm lead and lag, let temperatures settle, and capture as-left readings.',
      'Close the ticket with what you left: setpoint, which machine is lead, and any new messages.',
      'A start is not finished while the hall supply is still moving.',
    ],
    ['hallSupply', 'lchltAct'],
  ),
  'stop-noc': point(
    'NOC approval to stop',
    [
      'A planned stop needs facilities and NOC awareness.',
      'An unplanned stop is an incident. Communicate it immediately.',
      'Do not treat a local soft key as permission if the ticket is not open.',
    ],
  ),
  'stop-redundant': point(
    'Standby online',
    [
      'Start and load the standby chiller and confirm hall and CHW temperatures before you stop this one.',
      'Stopping the last machine that is actually carrying load is how you make a thermal event.',
      'Redundancy that is offline does not count.',
    ],
    ['hallSupply', 'mode'],
  ),
  'stop-soft': point(
    'Soft shutdown',
    [
      'Use the OptiView soft stop so the driveline slows under control.',
      'A safety stop is for protection, not for a tidy planned shutdown.',
      'Opening the main disconnect under load is not a stop procedure.',
    ],
  ),
  'stop-isolate': point(
    'Isolate',
    [
      'Valves, electrical lockout, and tags happen only as the approved procedure says.',
      'Isolating water before the machine is stopped and the standby is carrying load strands the hall.',
      'Know which breaker is the chiller before you rack anything out.',
    ],
  ),
  'stop-secure': point(
    'Secure and hand back',
    [
      'Record as-left state, messages, and who owns the next action.',
      'Update the BMS note and the ticket. The next shift should not have to guess.',
      'Handback includes whether the standby is now the lead.',
    ],
  ),
  'gauge-set': point(
    'LCHLT setpoint',
    [
      'This is the leaving chilled-water target the panel is trying to hold.',
      'The trainer starts at 55°F. The slider beside these gauges runs from 42°F to 65°F.',
      'Moving it is an operational change. It moves hall supply air.',
      'If the BMS is also writing a setpoint, stop and reconcile. Do not bump both.',
    ],
    ['lchltSet'],
  ),
  'gauge-act': point(
    'LCHLT actual',
    [
      'Actual leaving temperature should sit near the setpoint while CH-01 is running.',
      'When the trainer shows the machine stopped, this gauge holds 58.2°F so you can see a non-running panel.',
      'Actual on setpoint with a hot hall means look at distribution, not at compressor speed.',
    ],
    ['optiAct', 'lchltSet'],
  ),
  'gauge-rla': point(
    'Percent RLA',
    [
      '%RLA is compressor load. It is not hall health.',
      'The gauge shows 0% when you have stopped CH-01 in this trainer.',
      'Low load and a hot hall means the chiller is not seeing the heat. High load and high head means rejection or condenser flow.',
    ],
    ['optiRla'],
  ),
  'gauge-evap': point(
    'Evaporator pressure',
    [
      'This gauge is evaporator refrigerant pressure on the trainer panel.',
      'While CH-01 is running the panel shows 36 psig. Stopped, it shows 48 psig.',
      'Use it with LCHLT, not instead of the water temperatures. The hall cares about the water.',
    ],
    ['evapPsig'],
  ),
  'gauge-cond': point(
    'Condenser pressure',
    [
      'This is the head number, in psig, from the live sim.',
      'The live board warns above 115 psig.',
      'Towers, condenser-water flow, and outdoor wet bulb move it. Safeties exist so you do not “push through.”',
    ],
    ['head'],
  ),
  'gauge-hall': point(
    'Hall supply air',
    [
      'Hall supply is the air temperature after the CRAHs, from the same sim as the live board.',
      'The live board flags it above 78°F.',
      'If this rises while LCHLT is on setpoint, the problem is between the chiller and the racks.',
    ],
    ['hallSupply'],
  ),
  'gauge-mbc': point(
    'Bearing state',
    [
      'LEVITATED means the rotor is being held by the magnets. LANDED means it is on the touchdown bearings.',
      'Landing is normal at a controlled stop. Landing on a power blip is an event to record.',
      'FAULT is not a reset-and-hope state. Read the message and escalate.',
    ],
    ['mbc'],
  ),
  'gauge-landings': point(
    'Landing count',
    [
      'This trainer shows 1 after the ATS landing inject and 0 otherwise.',
      'A count that steps up during a generator exercise still gets a ticket, even if the hall stayed up.',
      'Do not zero the counter to make the trend look clean.',
    ],
    ['landings'],
  ),
  'gauge-vibe': point(
    '1× vibration',
    [
      'The MBC screen shows a 1× vibration figure so you remember to trend it.',
      'In this trainer it moves slightly around 0.12. It is a teaching trace, not a field calibration.',
      'A real rising 1× trend gets a work order before a peak weekend, not a reboot.',
    ],
    ['vibe'],
  ),
  'slider-lchlt': point(
    'LCHLT setpoint slider',
    [
      'This sets leaving chilled liquid temperature from 42°F to 65°F. The sim starts at 55°F.',
      'The plant will try to make that water. Hall supply air follows it.',
      'On a live campus this move is change-controlled. Do not slide it to chase a single rack.',
      'If the BMS owns the setpoint, write it in one place or the valves will hunt.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'opti-start': point(
    'Start',
    [
      'Start levitates the bearings and ramps the drive, if the interlocks are met.',
      'Prove water flow and redundant capacity before you start a machine you just isolated.',
      'Watch LCHLT move toward setpoint. A start that never loads is an inhibit, not a success.',
    ],
    ['mbc', 'rla'],
  ),
  'opti-soft': point(
    'Soft shutdown',
    [
      'Soft stop decelerates the driveline under control. It is the planned stop.',
      'Use it only after the standby machine is carrying the hall.',
      'It is not the button for a refrigerant or electrical emergency.',
    ],
  ),
  'opti-safety': point(
    'Safety stop',
    [
      'Safety stop is the protective trip. It takes CH-01 offline now.',
      'Use it when the machine or a person is at risk, not as a tidy way to end a MOP.',
      'Afterward, read the message, tell the NOC, and do not restart until the cause is known.',
    ],
  ),
  'opti-warn': point(
    'Hall warning',
    [
      'This logs a warning so you can practice message class. A warning is not yet a safety trip.',
      'Warnings still get eyes: approach, flow, and hall temperature.',
      'Escalation depends on the class. Do not treat every line as a full plant shutdown.',
    ],
  ),
  'opti-noc': point(
    'Page NOC',
    [
      'Paging the NOC opens the incident path. Operators keep working the plant.',
      'Say the symptom, the machine, and what you already checked.',
      'The NOC owns the clock if cooling can affect IT. You own the valves and the panel.',
    ],
  ),
  'opti-done': point(
    'Mark OptiView complete',
    [
      'This only records that you finished the trainer module.',
      'It does not clear alarms or change the sim.',
      'On a real panel, “done” is an as-left log, not a software trophy.',
    ],
  ),
  'quiz-q1': point(
    'Stopping a running chiller',
    [
      'Before you stop a machine that is carrying a data hall, redundant capacity has to be online and loaded.',
      'N+1 on a drawing does not count if the sister chiller is inhibited.',
      'Language settings and an empty tower basin are not the gate.',
    ],
  ),
  'quiz-q2': point(
    'Primary temperature target',
    [
      'The controlled temperature on this chiller is leaving chilled liquid temperature.',
      'Entering condenser water, hot-aisle air, and an oil sump are different measurements.',
      'Hall air is downstream, after the CRAHs and CDUs.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'quiz-q3': point(
    'Touchdown bearings',
    [
      'Magnetic bearings hold the rotor while it spins. Touchdown bearings are the backup.',
      'They engage when rotation stops or when magnetic support is lost, such as a power event.',
      'They are not in contact at normal IT load, and there is no oil flush on this oil-free machine.',
    ],
  ),
  'quiz-q4': point(
    'Hot hall, low load',
    [
      'If the hall is hot and the lead chiller is at low %RLA, the machine is not seeing the heat.',
      'Look at pumps, valves, differential pressure, and the CRAHs.',
      'Adding oil or opening a relief valve does not deliver water to the coils.',
    ],
    ['hallSupply', 'rla'],
  ),
  'quiz-q5': point(
    'Landing after a generator test',
    [
      'A landing count that increases after a generator or ATS test is a power-quality follow-up.',
      'Document it and have service look at the UPS and the feed. Do not reset the counter to hide the trend.',
      'You do not have to pull the machine offline if it is running safely and redundancy is intact. You do have to investigate.',
    ],
    ['landings'],
  ),
  'quiz-q6': point(
    'Who owns the incident clock',
    [
      'If cooling threatens IT, the NOC and the facilities incident process own the clock.',
      'Operators execute the plant response. A vendor and a passerby do not own the incident.',
      'An automatic email is not a substitute for telling the desk what you are doing.',
    ],
  ),
  'quiz-q7': point(
    'Planned stop',
    [
      'A normal planned stop is a soft shutdown from the operator panel, after redundant capacity is confirmed.',
      'Opening the disconnect under load, hitting safety stop out of habit, or killing the chilled-water pumps first are how you create the event you meant to avoid.',
      'Confirm the standby is carrying load, then use the site MOP. This trainer is not a substitute for that procedure.',
    ],
  ),
  'quiz-q8': point(
    'Peak wet bulb',
    [
      'A hot, humid day reduces what the tower can reject.',
      'That shows up as high head and a capacity limit, often before the chiller itself is “broken.”',
      'Watch towers, condenser water, and approach early. Display units and bearing gap are not the summer problem.',
    ],
    ['wetBulb', 'head'],
  ),
  'quiz-q9': point(
    'Cycling versus safety',
    [
      'A cycling shutdown may clear and allow a restart. A safety shutdown is a hard protective trip.',
      'The message class decides who you call and whether a restart is even allowed.',
      'Read the exact text. They are not the same alarm.',
    ],
  ),
  'quiz-q10': point(
    'Changing LCHLT',
    [
      'Changing leaving chilled-water setpoint is an operational change with hall consequences.',
      'Follow the site change process. Do not slide it for margin, and do not disable BMS supervision to win an argument.',
      'In this trainer the slider is 42°F to 65°F and the starting setpoint is 55°F.',
    ],
    ['lchltSet'],
  ),
  'quiz-done': point(
    'Gate complete',
    [
      'The score is how many of the ten questions you had right in this pass.',
      'Retry shuffles the same bank. It does not add new plant states.',
      'A high score is still not a substitute for the site SOP or for qualified service.',
    ],
  ),
  'trouble-high-head': point(
    'High head on a hot day',
    [
      'Elevated condenser pressure with a high wet bulb is a rejection problem.',
      'Check towers, condenser-water flow, strainer difference, and approach. Stage another chiller if the SOP says so.',
      'Raising LCHLT can be an emergency lever later. It is not the first diagnosis, and it needs change control.',
      'Never vent refrigerant or defeat a safety to ride through the weather.',
    ],
    ['head', 'wetBulb', 'alarm'],
  ),
  'trouble-landing': point(
    'Landing after a generator exercise',
    [
      'The bearing controller counted a landing. The hall can still look stable.',
      'Document it and engage service on power and UPS health.',
      'Clearing the counter hides the failure. Pulling the chiller offline without a redundancy plan is the other overreaction.',
      'Landings are events to trend, not background noise.',
    ],
    ['landings', 'mbc'],
  ),
  'trouble-hall-hot-chiller-idle': point(
    'Hall hot, chiller unloaded',
    [
      'Hot aisles, low %RLA, and CRAH valves already open mean the heat is not arriving at the chiller.',
      'Check chilled-water pumps, header valves, differential pressure, and the CRAH or CDU path.',
      'Forcing 100% speed against a satisfied LCHLT will not feed a starved loop.',
      'Do not shut the redundant machines, and do not reboot rack power to fix water.',
    ],
    ['hallSupply', 'rla', 'chwDp'],
  ),
  'trouble-no-start': point(
    'Standby will not start',
    [
      'The lead machine is down and the standby start is inhibited.',
      'Read the inhibit and clear the interlock it names: flow, remote enable, or a BMS stop.',
      'Do not jumper a flow switch. Tell the NOC if you are stuck.',
      'Display units do not clear interlocks.',
    ],
    ['mode', 'alarm'],
  ),
  'trouble-bms-fight': point(
    'BMS fighting the panel',
    [
      'LCHLT oscillating, with the BMS writing a different setpoint than OptiView, means two masters.',
      'Stabilize in the mode the SOP names, then decide who owns enable and setpoint.',
      'Do not disable safeties, and do not leave the network unplugged as a permanent fix.',
      'Hunting valves waste capacity and can trip the plant. IT load will not average that away.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'maint-d1': point(
    'Shift review',
    [
      'Each shift, look at LCHLT, hall alarms, and chiller status in the BMS and on OptiView.',
      'You are looking for drift, not for a new setpoint.',
      'Write down what is lead and what is in alarm before you leave the desk.',
    ],
    ['lchltAct', 'hallSupply'],
  ),
  'maint-d2': point(
    'Shift scan',
    [
      'Scan for new warnings, landings, or capacity limits.',
      'A new landing or a new high-head warning is the thing you hand over.',
      'Do not clear messages you have not read.',
    ],
    ['landings', 'alarm'],
  ),
  'maint-d3': point(
    'Daily plant log',
    [
      'Record operating conditions on the plant log: temperatures, pressures, which machine is lead, and outdoor conditions.',
      'The log is how next week’s approach gets compared with today’s.',
      'A blank log is how a slow fouling problem stays invisible.',
    ],
    ['lchltAct', 'head', 'outdoor'],
  ),
  'maint-w1': point(
    'Weekly flows',
    [
      'Once a week, compare chilled-water and condenser-water flow or header ΔP with the normal band.',
      'This trainer flags CHW ΔP outside 12 to 24 psi and CW ΔP outside 8 to 18 psi.',
      'A valve someone left throttled will show up here before the hall alarms.',
    ],
    ['chwDp', 'cwDp'],
  ),
  'maint-w2': point(
    'Weekly tower walk',
    [
      'Walk the towers and strainers. Note basin level and whether the fans are doing what the plant is asking.',
      'Fouling and a low basin show up as approach and head under load.',
      'The dry cooler is a separate walk: fans, coil face, and the glycol valves.',
    ],
    ['towerFan', 'dryFan', 'head'],
  ),
  'maint-m1': point(
    'Monthly power balance',
    [
      'Check three-phase voltage and current balance on the chiller feed.',
      'Imbalance under generator or UPS can look like a compressor or drive fault.',
      'This is a measurement, not a setpoint change.',
    ],
  ),
  'maint-m2': point(
    'Monthly connections',
    [
      'Tighten electrical connections on the schedule, with lockout where the procedure requires it.',
      'Loose power connections cause the nuisance trips that become hall alarms.',
      'Do not do this live because the calendar said monthly.',
    ],
  ),
  'maint-m3': point(
    'Monthly setpoints',
    [
      'Confirm setpoints and cutouts still match the live SOP.',
      'In this trainer, LCHLT starts at 55°F. A campus plant may be different. The SOP wins.',
      'Look for a BMS value and a panel value that have drifted apart.',
    ],
    ['lchltSet'],
  ),
  'maint-m4': point(
    'Monthly lead and standby',
    [
      'Know which unit is lead, lag, and standby, and whether the standby will actually start.',
      'Failover practice is how an inhibit gets found on a Tuesday instead of during an outage.',
      'A standby that has been inhibited for a month is not redundancy.',
    ],
    ['mode'],
  ),
  'maint-y1': point(
    'Drive heat exchanger',
    [
      'Yearly, the variable-speed drive heat exchanger and coolant are serviced on a planned window.',
      'A drive that overheats takes the compressor offline.',
      'Qualified electrical practice and the outage plan apply. This row is the reminder, not the procedure.',
    ],
  ),
  'maint-y2': point(
    'Bearing hold-up batteries',
    [
      'The UPS or battery that holds the magnetic bearings through a blip gets a yearly health check.',
      'A dead hold-up source is how a short transfer becomes a landing.',
      'Coordinate it with the electrical maintenance window.',
    ],
  ),
  'maint-y3': point(
    'Refrigerant analysis',
    [
      'Yearly refrigerant analysis belongs to a qualified technician.',
      'It is not an operator venting or topping-off task.',
      'The result belongs in the service record, next to leak checks and the charge history.',
    ],
  ),
  'maint-y4': point(
    'Bearing trend review',
    [
      'Once a year, review vibration and landing trends with the service contractor.',
      'A slow rise in 1× vibration is the point of keeping the history.',
      'Bring the generator-test dates. Landings cluster around electrical events.',
    ],
    ['landings', 'vibe'],
  ),
  'maint-n1': point(
    'Tube testing',
    [
      'Eddy-current testing of tubes is planned outage work, on a multi-year interval.',
      'It happens with the machine isolated under a MOP, not on a Tuesday walkdown.',
      'Fouling and approach that you logged all year are the reason this window exists.',
    ],
  ),
} as const satisfies Record<string, InfoEntry>

export type InfoId = keyof typeof INFO

export function infoAttr(id: InfoId): string {
  return `data-info="${id}"`
}

export function componentInfoId(id: ComponentId): InfoId {
  switch (id) {
    case 'evaporator':
      return 'comp-evaporator'
    case 'condenser':
      return 'comp-condenser'
    case 'compressor':
      return 'comp-compressor'
    case 'vsd':
      return 'comp-vsd'
    case 'optiview':
      return 'comp-optiview'
    case 'mbc':
      return 'comp-mbc'
    case 'power':
      return 'comp-power'
    case 'waterboxes':
      return 'comp-waterboxes'
    default: {
      const unknown: never = id
      return unknown
    }
  }
}

const CHAIN_INFO = {
  it: 'chain-it',
  crah: 'chain-crah',
  chw: 'chain-chw',
  ymc2: 'chain-ymc2',
  tower: 'chain-tower',
  bms: 'chain-bms',
} as const satisfies Record<string, InfoId>

export function chainInfoId(id: string): InfoId {
  const key = CHAIN_INFO[id as keyof typeof CHAIN_INFO]
  if (!key) throw new Error(`No cooling-chain info for ${id}`)
  return key
}

const CYCLE_INFO = {
  evap: 'cycle-evap',
  comp: 'cycle-comp',
  cond: 'cycle-cond',
  feed: 'cycle-feed',
} as const satisfies Record<string, InfoId>

export function cycleInfoId(id: string): InfoId {
  const key = CYCLE_INFO[id as keyof typeof CYCLE_INFO]
  if (!key) throw new Error(`No refrigerant-stage info for ${id}`)
  return key
}

const STARTUP_INFO = {
  mop: 'mop-mop',
  redundancy: 'mop-redundancy',
  power: 'mop-power',
  water: 'mop-water',
  setpoints: 'mop-setpoints',
  start: 'mop-start',
  stabilize: 'mop-stabilize',
} as const satisfies Record<string, InfoId>

const SHUTDOWN_INFO = {
  noc: 'stop-noc',
  redundant: 'stop-redundant',
  soft: 'stop-soft',
  isolate: 'stop-isolate',
  secure: 'stop-secure',
} as const satisfies Record<string, InfoId>

export function stepInfoId(mode: 'start' | 'stop', id: string): InfoId {
  const table = mode === 'start' ? STARTUP_INFO : SHUTDOWN_INFO
  const key = table[id as keyof typeof table]
  if (!key) throw new Error(`No MOP info for ${mode}:${id}`)
  return key
}

const MISSION_INFO = {
  plant: 'mission-plant',
  explorer: 'mission-explorer',
  cycle: 'mission-cycle',
  operation: 'mission-operation',
  optiview: 'mission-optiview',
  match: 'mission-match',
  quiz: 'mission-quiz',
  trouble: 'mission-trouble',
  maintenance: 'mission-maintenance',
} as const satisfies Record<string, InfoId>

export function missionInfoId(id: string): InfoId {
  const key = MISSION_INFO[id as keyof typeof MISSION_INFO]
  if (!key) throw new Error(`No drill info for ${id}`)
  return key
}

export function maintInfoId(id: string): InfoId {
  const key = `maint-${id}`
  if (!(key in INFO)) throw new Error(`No shift-deck info for ${id}`)
  return key as InfoId
}

export function quizInfoId(id: string): InfoId {
  const key = `quiz-${id}`
  if (!(key in INFO)) throw new Error(`No quiz info for ${id}`)
  return key as InfoId
}

export function troubleInfoId(id: string): InfoId {
  const key = `trouble-${id}`
  if (!(key in INFO)) throw new Error(`No incident info for ${id}`)
  return key as InfoId
}
