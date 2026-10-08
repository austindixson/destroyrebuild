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
