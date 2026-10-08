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
    name: 'Evaporator (CHW cooler)',
    short: 'Evap',
    color: '#3ECFCF',
    icon: 'evaporator',
    summary:
      'The evaporator makes CHW for the CRAH coils, the CRAC coils, and the CDU loops. These units remove IT heat from the hall.',
    details: [
      'LCHLT is the primary control target for the plant.',
      'In a data center, a setpoint change is under change control. The change affects the hall supply air and the power density you can support.',
      'A high evaporator approach can mean deposits, low CHW flow, or air in the loop. Examine the cause before the hall gets hot.',
    ],
    operatorTip:
      'Compare LCHLT with the hall return air and the CRAH valve position. Drift here is an early risk to the IT load.',
  },
  {
    id: 'condenser',
    name: 'Condenser (heat rejection)',
    short: 'Cond',
    color: '#F0A202',
    icon: 'condenser',
    summary:
      'The condenser sends compressor heat to the cooling tower as CW. A separate glycol loop to the dry cooler removes heat only when outdoor air is colder than the CHWR.',
    details: [
      'High condenser pressure during a peak outdoor wet-bulb is a common capacity limit.',
      'Coordinate the tower water treatment and the strainer maintenance. Deposits appear as a higher approach under the IT load.',
      'Do not defeat the safeties. Use the site SOP to remove noncritical load or to start a redundant chiller.',
    ],
    operatorTip:
      'On a severe weather day, watch the wet-bulb and the cooling tower fans. Also watch the condenser approach before the IT load peaks.',
  },
  {
    id: 'compressor',
    name: 'Magnetic bearing compressor',
    short: 'Comp',
    color: '#7DD3FC',
    icon: 'compressor',
    summary:
      'The compressor is an oil-free centrifugal machine with active magnetic bearings. Plants that run all day use this type for efficiency and for less maintenance.',
    details: [
      'Part-load efficiency is important. A data center rarely stays at the design load all day.',
      'An ATS transfer can cause a landing if the bearing hold-up power does not carry the bearings. That landing needs a ticket.',
      'Use a soft stop only for planned work. For an unplanned stop, tell the NOC and the facilities lead.',
    ],
    operatorTip:
      'In an N+1 plant, do not stop the last online chiller. First make sure that the redundant capacity is online and has the load.',
  },
  {
    id: 'vsd',
    name: 'OptiSpeed VSD',
    short: 'VSD',
    color: '#A78BFA',
    icon: 'vsd',
    summary:
      'The OptiSpeed VSD changes speed to follow the IT load. Harmonics and power quality can be important on a shared campus bus.',
    details: [
      'Keep the VSD coolant service and the heat-exchanger service on schedule. A thermal trip stops the chiller.',
      'Coordinate electrical work with the EPMS and the UPS maintenance windows.',
      'Voltage imbalance on a generator feed or a UPS feed can look like a compressor fault.',
    ],
    operatorTip:
      'After a generator test or UPS maintenance, make sure that the VSD is healthy. Make sure of the phase balance before you call the plant normal.',
  },
  {
    id: 'optiview',
    name: 'OptiView™ control center',
    short: 'Panel',
    color: '#34D399',
    icon: 'optiview',
    summary: 'OptiView is the local operator panel. In a data center, OptiView usually also reports to the BMS and the EPMS.',
    details: [
      'Know which setpoints are local and which setpoints the BMS writes. If the panel opposes the BMS, the values can move up and down.',
      'Read the message class. A warning, a cycle stop, and a safety stop each have a different path to the NOC.',
      'Record the stable plant values after you complete the MOP. Keep the record in the site baseline library.',
    ],
    operatorTip: 'If the BMS and OptiView do not agree, trust the instruments. Then reconcile the points.',
  },
  {
    id: 'mbc',
    name: 'Magnetic bearing controller',
    short: 'MBC',
    color: '#FB7185',
    icon: 'mbc',
    summary:
      'The MBC levitates the rotor and sends vibration data and landing data. This data is critical when utility events and UPS events are common.',
    details: [
      'An ATS transfer or a short outage can add a landing even if the hall stays normal.',
      'UPS battery health for the chiller controls protects the driveline.',
      'An increase in the 1× vibration trend needs a work order before a weekend peak.',
    ],
    operatorTip: 'Open a ticket in the same shift for each new power-fail landing during a generator exercise.',
  },
  {
    id: 'power',
    name: 'Power and battery panel',
    short: 'Power',
    color: '#FBBF24',
    icon: 'power',
    summary:
      'This panel feeds the controls and the bearing hold-up power. In a data center, the panel sits inside a larger critical-power system.',
    details: [
      'Know which UPS and which panel feed this chiller before you remove a breaker.',
      'Schedule LOTO with the same rigor as IT change control.',
      'A monthly inspection of connections prevents trips that become hall alarms.',
    ],
    operatorTip: 'Do not assume that chiller power is noncritical. If the chiller stops, that stop is an IT incident.',
  },
  {
    id: 'waterboxes',
    name: 'Waterboxes and CHW / CW headers',
    short: 'Water',
    color: '#60A5FA',
    icon: 'water',
    summary:
      'The waterboxes connect the machine to the primary CHW headers, the secondary CHW headers, and the CW headers.',
    details: [
      'Isolation valves and strainers are critical in the MOP before tube work or waterbox work.',
      'Wrong flow or a closed balance valve can starve the CRAHs even if the chiller display looks normal.',
      'Differential pressure and flow meters help you during a capacity shortfall.',
    ],
    operatorTip:
      'If the hall temperature rises and the chiller % FLA is low, examine the pumps, the valves, and the distribution. Do not examine only the YMC².',
  },
]

export const PLANT_NODES = [
  {
    id: 'it',
    label: 'IT load',
    detail:
      'Servers reject heat into air or into liquid. The heat demand follows the compute load and can increase fast during batch jobs or AI jobs.',
  },
  {
    id: 'crah',
    label: 'CRAH / CDU',
    detail: 'Hall units move heat into the CHW loop. The valve position and the ΔT show if the plant can remove the heat.',
  },
  {
    id: 'chw',
    label: 'CHW loop',
    detail:
      'Pumps and headers move CHW between the chillers and the hall. The redundant capacity is in this loop, as N+1 or as 2N.',
  },
  {
    id: 'ymc2',
    label: 'YMC² chiller',
    detail:
      'The magnetic-bearing centrifugal machine makes the LCHLT. It is one machine of several. Always know which machine is lead, lag, or standby.',
  },
  {
    id: 'tower',
    label: 'Cooling tower / CW',
    detail: 'Heat leaves the building here. On a peak wet-bulb day, heat rejection is the first limit.',
  },
  {
    id: 'bms',
    label: 'BMS / NOC',
    detail: 'The BMS monitors the plant and sends the sequence. Operators operate the plant. The NOC owns the incident clock.',
  },
]

export const STARTUP_STEPS = [
  {
    id: 'mop',
    title: 'MOP and change ticket',
    body: 'Make sure that someone approved the MOP, that the window is open, and that the NOC knows. Do this before you touch a production chiller.',
  },
  {
    id: 'redundancy',
    title: 'Redundant capacity',
    body: 'Do not start work that removes N+1 without a plan. Make sure that the other chillers and the pumps can carry the IT load.',
  },
  {
    id: 'power',
    title: 'Power path',
    body: 'Examine the VSD power, the control power, and the UPS feed. Make sure that no other electrical work uses the same window.',
  },
  {
    id: 'water',
    title: 'CHW and CW proof',
    body: 'Start the pumps in the correct sequence. Prove the flows and the flow switches. Make sure that the cooling tower is ready and that the header valves are open.',
  },
  {
    id: 'setpoints',
    title: 'OptiView and the BMS',
    body: 'Make sure that the LCHLT, the enables, and the cutouts match the live plant SOP. Do not use a lab default.',
  },
  {
    id: 'start',
    title: 'Start and levitation',
    body: 'Command the start. Make sure that the MBC has levitated the rotor and that the VSD increases speed. Make sure that the LCHLT moves toward the setpoint with no inhibit.',
  },
  {
    id: 'stabilize',
    title: 'Stable load share and log',
    body: 'Make sure of the lead unit and the lag unit. Record the plant values. Close the ticket with the as-left conditions.',
  },
]

export const SHUTDOWN_STEPS = [
  {
    id: 'noc',
    title: 'NOC and facilities approval',
    body: 'Do not stop the chiller for planned work until the NOC and facilities know. An unplanned stop is an incident. Tell the NOC immediately.',
  },
  {
    id: 'redundant',
    title: 'Redundant unit online',
    body: 'Start the standby chiller. Give the standby chiller the load. Make sure that the hall and the CHW are stable before you stop this machine.',
  },
  {
    id: 'soft',
    title: 'Soft stop',
    body: 'Use the OptiView soft stop so the driveline decreases speed under control.',
  },
  {
    id: 'isolate',
    title: 'Isolate per the MOP',
    body: 'Do not close a valve or apply LOTO until the MOP says to do it. Apply tags only as the approved procedure directs.',
  },
  {
    id: 'secure',
    title: 'Secure the machine',
    body: 'Record the as-left state, the messages, and the owner of the next action. Update the BMS notes and the ticket.',
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
    prompt: 'In a data-center plant, what must you make sure of before you stop an online YMC² for maintenance?',
    choices: [
      'That the OptiView language is English',
      'That redundant heat-removal capacity is online and has the load',
      'That all CRAHs are in manual',
      'That the cooling tower basin is empty',
    ],
    answer: 1,
    explain: 'N+1 and 2N work only if the standby capacity is online before you remove a machine.',
    topic: 'datacenter',
  },
  {
    id: 'q2',
    prompt: 'What is the primary temperature target on a YMC²?',
    choices: [
      'The temperature of the CW that enters the condenser',
      'Leaving chilled liquid temperature (LCHLT)',
      'The hot-aisle temperature',
      'The oil-sump temperature',
    ],
    answer: 1,
    explain: 'OptiView holds the LCHLT. Hall air temperature is downstream of the CRAHs and the CDUs on that CHW.',
    topic: 'operation',
  },
  {
    id: 'q3',
    prompt: 'Magnetic bearings keep the rotor levitated. When do the touchdown bearings engage?',
    choices: [
      'They engage all the time at full IT load',
      'They engage only during an oil flush',
      'They engage on a stop landing or when the machine loses magnetic-bearing power',
      'They engage when a CRAH valve opens',
    ],
    answer: 2,
    explain: 'Touchdown bearings engage when rotation stops or when the machine loses magnetic support. A power event is one example.',
    topic: 'components',
  },
  {
    id: 'q4',
    prompt: 'The hall temperature rises and the lead chiller shows a low % FLA. What is the most likely cause?',
    choices: [
      'The compressor needs more refrigerant oil',
      'The cause is distribution, a pump, a valve, or a CRAH, not necessarily chiller capacity',
      'You must restart OptiView every hour',
      'You must open the relief valve',
    ],
    answer: 1,
    explain: 'If the machine load is low and the hall is hot, examine the CHW distribution and the hall units.',
    topic: 'troubleshoot',
  },
  {
    id: 'q5',
    prompt: 'The power-fail landing count increases by 1 after a generator test. What do you do?',
    choices: [
      'Ignore it, because a generator test always does that',
      'Reset the counter so the trend looks clean',
      'Record it and have service examine the power and the UPS health',
      'Raise the LCHLT by 5°F permanently',
    ],
    answer: 2,
    explain: 'The manual requires an investigation when the landing count increases. This rule is important after a known electrical event.',
    topic: 'maintenance',
  },
  {
    id: 'q6',
    prompt: 'Who usually owns the incident clock when heat removal puts the IT load at risk?',
    choices: [
      'Only the refrigerant vendor',
      'The NOC and the facilities incident process. Operators operate the plant',
      'The first person near the chiller',
      'An automatic OptiView email alone',
    ],
    answer: 1,
    explain: 'Data-center operations escalate through the NOC and incident command. Operators stabilize the plant.',
    topic: 'datacenter',
  },
  {
    id: 'q7',
    prompt: 'What is the normal planned stop from the operator station?',
    choices: [
      'You open the main disconnect under load',
      'You use the safety stop every time',
      'You use the OptiView soft stop after you make sure of the redundant capacity',
      'You stop the CHW pumps first to protect the servers',
    ],
    answer: 2,
    explain: 'Use the soft stop after the redundant capacity is online. If you stop the pumps first, you can cause a thermal event.',
    topic: 'operation',
  },
  {
    id: 'q8',
    prompt: 'A peak outdoor wet-bulb day is a threat to a data-center plant. What is the main reason?',
    choices: [
      'The day changes the OptiView units to metric',
      'The cooling tower can reject less heat, so the head increases and the tower limits capacity',
      'The magnetic bearing gap increases automatically',
      'Server idle power decreases only',
    ],
    answer: 1,
    explain: 'Heat rejection is the usual limit in summer. Watch the cooling towers, the CW, and the condenser approach early.',
    topic: 'datacenter',
  },
  {
    id: 'q9',
    prompt: 'How is a cycle stop different from a safety stop?',
    choices: [
      'A data center ignores a cycle stop',
      'A cycle stop can clear and can allow a restart. A safety stop is a hard protective trip',
      'A safety stop affects only the CRAHs',
      'The two messages are the same',
    ],
    answer: 1,
    explain: 'The message class sets the restart rules and the escalation. Read the exact text.',
    topic: 'troubleshoot',
  },
  {
    id: 'q10',
    prompt: 'What must you do before you change the LCHLT on a live campus plant?',
    choices: [
      'Move the setpoint freely, because a magnetic chiller adjusts the hall by itself',
      'Follow change control and the SOP. Understand the effect on the CRAHs and the IT load',
      'Set the LCHLT to 32°F for extra margin',
      'Disable BMS supervision permanently',
    ],
    answer: 1,
    explain: 'A setpoint move is an operational change with hall consequences. Use the site process.',
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
      'Condenser pressure is high and the plant has little spare capacity',
      'The outdoor wet-bulb is near the design value',
      'The NOC reports warm-aisle alarms',
    ],
    options: [
      {
        text: 'Examine the cooling towers, the CW flow, the strainer ΔP, and the condenser approach. Start a redundant chiller per the SOP.',
        correct: true,
        feedback: 'That is correct. Use the cooling towers and the redundant chillers before the hall gets hot.',
      },
      {
        text: 'Raise the LCHLT by 10°F immediately with no ticket',
        correct: false,
        feedback: 'The SOP can allow this move later as an emergency action. It is not the first diagnosis, and the move needs change control.',
      },
      {
        text: 'Open the refrigerant relief to the atmosphere',
        correct: false,
        feedback: 'Do not vent refrigerant to reduce the pressure.',
      },
      {
        text: 'Disable the safeties so the machine continues',
        correct: false,
        feedback: 'Do not bypass the safeties. The safeties protect the machine, and a bypass can cause a worse outage.',
      },
    ],
    teach: 'High head from the weather is a plant problem. Use the cooling towers, the redundant chillers, and a clear report to the NOC.',
  },
  {
    id: 'landing',
    title: 'Landing after an ATS or generator exercise',
    symptoms: [
      'The MBC landing count increases by 1',
      'The generator test ended one hour ago',
      'The chiller is in operation again and the hall is stable',
    ],
    options: [
      {
        text: 'Record the event in the ticket log. Ask service to examine the power and the UPS health.',
        correct: true,
        feedback: 'That is correct. An electrical event plus a landing is a facilities task, not noise.',
      },
      {
        text: 'Clear the counter so the display stays green',
        correct: false,
        feedback: 'If you erase the trend, you hide the failure mode.',
      },
      {
        text: 'Take the chiller offline until the next quarter',
        correct: false,
        feedback: 'This response is too strong if you have no plan for the redundant capacity. Examine the event while the chiller operates, if that is safe.',
      },
      {
        text: 'Ignore the count, because a data center always lands the bearings',
        correct: false,
        feedback: 'A landing is an abnormal event. Record the trend.',
      },
    ],
    teach: 'Coordinate chiller power quality with the EPMS, the UPS, and the generator program.',
  },
  {
    id: 'hall-hot-chiller-idle',
    title: 'Hot hall and unloaded chiller',
    symptoms: ['Hot-aisle alarms are active', 'The lead YMC² is at a low % FLA and near the setpoint', 'Some CRAH valves are fully open'],
    options: [
      {
        text: 'Examine the CHW pumps, the header valves, the differential pressure, and the CRAH and CDU operation',
        correct: true,
        feedback: 'The distribution failed. The chiller did not receive the load.',
      },
      {
        text: 'Force the compressor to 100% speed with no regard for the LCHLT',
        correct: false,
        feedback: 'If the LCHLT already matches the setpoint, more speed does not repair a hall loop with low flow.',
      },
      {
        text: 'Stop all redundant chillers to focus the flow',
        correct: false,
        feedback: 'Do not remove redundancy during an event.',
      },
      {
        text: 'Restart every rack PDU',
        correct: false,
        feedback: 'A PDU restart does not repair the CHW distribution.',
      },
    ],
    teach: 'The plant must make cold water, and the plant must deliver that water. Both actions must succeed.',
  },
  {
    id: 'no-start',
    title: 'The standby chiller does not start during failover',
    symptoms: ['The lead unit tripped', 'OptiView shows a standby start inhibit', 'The NOC reports a higher risk to the IT load'],
    options: [
      {
        text: 'Read the inhibit. Clear the interlock that the text names, such as flow, remote enable, or a BMS stop. Tell the NOC if the inhibit stays.',
        correct: true,
        feedback: 'The inhibit text is the list. Do not use a shortcut.',
      },
      {
        text: 'Bypass the flow switch to force a start',
        correct: false,
        feedback: 'Do not defeat the flow proof. You can damage the equipment, and you can injure people.',
      },
      {
        text: 'Do not tell the NOC until the inhibit clears with no action',
        correct: false,
        feedback: 'Tell the NOC the status while you operate the plant.',
      },
      {
        text: 'Change the display units to Celsius to bypass the inhibits',
        correct: false,
        feedback: 'Display units do not clear an interlock.',
      },
    ],
    teach: 'Practice failover so you can find an inhibit quickly when the timer is short.',
  },
  {
    id: 'bms-fight',
    title: 'The BMS and OptiView disagree on the setpoint',
    symptoms: [
      'The LCHLT moves up and down',
      'The BMS writes a setpoint that is different from the panel',
      'The CRAH valves move too often',
    ],
    options: [
      {
        text: 'Make the plant stable in the control mode that the SOP names. Then decide whether the BMS or the panel owns the setpoint.',
        correct: true,
        feedback: 'Stop the disagreement first. Then repair the integration. Do not change both setpoints again and again.',
      },
      {
        text: 'Disable all safeties in OptiView',
        correct: false,
        feedback: 'This action is not related to the fault, and it is not safe.',
      },
      {
        text: 'Disconnect the network cable permanently',
        correct: false,
        feedback: 'The SOP can allow a temporary isolation. A permanent disconnect is not a repair.',
      },
      {
        text: 'Ignore the movement, because the AI load will average it',
        correct: false,
        feedback: 'The movement wastes capacity and can cause a trip.',
      },
    ],
    teach: 'Know the control hierarchy of the site. Know who is master for the enable and for the setpoint.',
  },
]

export const CYCLE_NODES = [
  {
    id: 'evap',
    label: 'Evaporator',
    phase: 'CHW heat enters and the refrigerant becomes vapor',
    detail: 'IT heat arrives as warm CHWR. The refrigerant absorbs that heat.',
  },
  {
    id: 'comp',
    label: 'Compressor',
    phase: 'The compressor compresses the vapor',
    detail: 'The magnetic-bearing motor increases the pressure. The speed follows the plant load.',
  },
  {
    id: 'cond',
    label: 'Condenser',
    phase: 'Heat goes out to the CW and the cooling tower',
    detail: 'Heat leaves toward the cooling tower. The cooling tower is the limit in summer.',
  },
  {
    id: 'feed',
    label: 'Level and feed',
    phase: 'Liquid returns to the evaporator',
    detail: 'Level control meters liquid refrigerant from the condenser to the evaporator. The VSD and the VGD hold the LCHLT.',
  },
]

export const MAINT_ITEMS = [
  { id: 'd1', when: 'Each shift', text: 'Examine the CHW LCHLT, the hall alarms, and the chiller status in the BMS and on OptiView' },
  { id: 'd2', when: 'Each shift', text: 'Find any new warning, new landing, or capacity limit' },
  { id: 'd3', when: 'Daily', text: 'Record the plant conditions on the plant log form' },
  { id: 'w1', when: 'Weekly', text: 'Make sure that the CHW flow, the CW flow, and the header ΔP are in the normal band' },
  { id: 'w2', when: 'Weekly', text: 'Examine the cooling towers and the strainers. Record the basin level and the fan status.' },
  { id: 'm1', when: 'Monthly', text: 'Examine the balance of the three-phase voltage and current' },
  { id: 'm2', when: 'Monthly', text: 'Only qualified electrical workers tighten these connections, with the circuit de-energized under LOTO.' },
  { id: 'm3', when: 'Monthly', text: 'Make sure that the setpoints and the cutouts match the live SOP' },
  { id: 'm4', when: 'Monthly', text: 'Record which unit is lead, which unit is lag, and which unit is standby' },
  { id: 'y1', when: 'Yearly', text: 'Clean the VSD heat exchanger and service the coolant' },
  { id: 'y2', when: 'Yearly', text: 'Examine the UPS battery health for the bearing hold-up' },
  { id: 'y3', when: 'Yearly', text: 'Complete the refrigerant analysis with a qualified technician' },
  { id: 'y4', when: 'Yearly', text: 'Review the MBC vibration trend and the landing trend with service' },
  { id: 'n1', when: '2–5 yr', text: 'Do eddy-current tube tests during the planned outage window' },
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

export interface GlossaryEntry {
  /** What the popover titles and what the button calls it. */
  term: string
  /** Whole-token, case-insensitive. Longer aliases are tried first. */
  aliases: readonly string[]
  /** One or two plain sentences. */
  definition: string
  /** One line on why this plant cares. Omit when the definition already says it. */
  why?: string
}

/**
 * The only copy for tap-to-define jargon. Info panels that teach the same
 * term reuse these strings instead of restating them.
 */
export const GLOSSARY = {
  'it-load': {
    term: 'IT load',
    aliases: ['IT loads', 'IT load'],
    definition:
      'IT load is the heat that the servers reject into the hall, into air or into liquid. The heat can increase fast during batch jobs or AI jobs.',
    why: 'The chiller and the cooling tower remove this heat, and a nameplate for a flat day is not enough.',
  },
  noc: {
    term: 'NOC',
    aliases: ['NOC'],
    definition:
      'The NOC is the network operations center. The NOC owns the incident clock when the IT load is at risk, and operators tell the NOC what they see.',
    why: 'Tell the NOC what changed and what you do.',
  },
  bms: {
    term: 'BMS',
    aliases: ['BMS'],
    definition:
      'The BMS is the building management system. The BMS reads the plant, sends the sequence, and can write a setpoint and an enable.',
    why: 'If the BMS and OptiView do not agree, read the local instruments, then reconcile the points, and do not guess.',
  },
  crah: {
    term: 'CRAH',
    aliases: ['CRAHs', 'CRAH'],
    definition: 'A CRAH is a computer-room air handler. A CRAH moves IT heat from hall air into the CHW.',
    why: 'Valve position, supply air, and return air show if the CHW is sufficient.',
  },
  cdu: {
    term: 'CDU',
    aliases: ['CDUs', 'CDU'],
    definition: 'A CDU is a coolant distribution unit. A CDU moves heat from a rack liquid loop into the CHW.',
    why: 'A hot hall can be a CDU fault when the chiller load is low.',
  },
  chw: {
    term: 'CHW',
    aliases: ['chilled-water', 'chilled water', 'CHW'],
    definition: 'CHW means chilled water. Pumps, headers, and valves move the CHW between the chillers and the hall.',
    why: 'This trainer flags differential pressure below 12 psi or above 24 psi.',
  },
  chws: {
    term: 'CHWS',
    aliases: ['CHWS'],
    definition: 'CHWS is the chilled-water supply. The chiller sends this water to the hall.',
    why: 'The plant-room tag shows this temperature and the CHW valve percent.',
  },
  chwr: {
    term: 'CHWR',
    aliases: ['CHWR'],
    definition: 'CHWR is the chilled-water return. This warmer water leaves the hall and enters the evaporator.',
    why: 'In this plant, the dry cooler gives free cooling only when outdoor air is well below the CHWR.',
  },
  cw: {
    term: 'CW',
    aliases: ['condenser-water', 'condenser water', 'CW'],
    definition: 'CW is condenser water. This loop takes compressor heat from the condenser to the cooling tower.',
    why: 'Low flow and a hot wet-bulb raise head, and this trainer flags ΔP below 8 psi or above 18 psi.',
  },
  cws: {
    term: 'CWS',
    aliases: ['CWS'],
    definition: 'CWS is the condenser-water supply. This water goes from the cooling tower into the condenser.',
    why: 'CWS is the cooler side of the pair, and low flow here increases head.',
  },
  cwr: {
    term: 'CWR',
    aliases: ['CWR'],
    definition: 'CWR is the condenser-water return. This warmer water leaves the condenser and goes to the cooling tower.',
    why: 'The cooling tower must remove the heat in this water.',
  },
  mop: {
    term: 'MOP',
    aliases: ['MOPs', 'MOP'],
    definition: 'A MOP is a method of procedure. The MOP gives the approved steps, the window, and the change ticket.',
    why: 'Make sure that someone approved the MOP and that the NOC knows before you touch the chiller.',
  },
  ats: {
    term: 'ATS',
    aliases: ['ATS'],
    definition: 'An ATS is an automatic transfer switch. An ATS moves a feeder from one source to another source.',
    why: 'An ATS transfer can cause a landing if the bearing hold-up power does not carry the bearings.',
  },
  'n-plus-1': {
    term: 'N+1',
    aliases: ['N+1'],
    definition: 'N+1 means one extra unit of capacity beyond the load.',
    why: 'The spare unit counts only when it is online before you remove a machine.',
  },
  optiview: {
    term: 'OptiView',
    aliases: ['OptiView™', 'OptiView'],
    definition: 'OptiView is the local operator panel on this chiller. OptiView holds the LCHLT setpoint and usually reports to the BMS.',
    why: 'Know which setpoints are local and which setpoints the BMS writes.',
  },
  vsd: {
    term: 'VSD',
    aliases: ['VSD'],
    definition: 'A VSD is a variable-speed drive. On this machine the trainer calls the VSD OptiSpeed, and the VSD changes speed with the IT load.',
    why: 'A generator feed or a UPS feed can make a VSD fault look like a compressor fault.',
  },
  mbc: {
    term: 'MBC',
    aliases: ['MBC'],
    definition: 'The MBC is the magnetic bearing controller. The MBC levitates the rotor and reports vibration and landings.',
    why: 'Touchdown bearings engage on a stop or when the machine loses magnetic support.',
  },
  'delta-t': {
    term: 'ΔT',
    aliases: ['delta-T', 'delta T', 'ΔT'],
    definition: 'ΔT is the difference between two temperatures. On the hall side, ΔT is the CHW temperature rise across the load.',
    why: 'Read ΔT with the valve position to see if the plant can remove the heat.',
  },
  setpoint: {
    term: 'Setpoint',
    aliases: ['setpoints', 'setpoint'],
    definition: 'A setpoint is the target value that an operator or the BMS commands the machine to hold. LCHLT is one setpoint on this chiller.',
    why: 'A setpoint change affects hall supply air and needs change control.',
  },
  glycol: {
    term: 'Glycol',
    aliases: ['glycol'],
    definition:
      'Glycol is an antifreeze mixed with water. In this plant it fills the loop to the dry cooler, and that loop is separate from cooling tower water.',
    why: 'In this plant, the dry cooler gives free cooling only when outdoor air is well below the CHWR.',
  },
  'dry-cooler': {
    term: 'Dry cooler',
    aliases: ['dry coolers', 'dry-cooler', 'dry cooler'],
    definition: 'A dry cooler rejects glycol heat to outdoor air. A dry cooler does not use cooling tower water.',
    why: 'In this plant, the dry cooler gives free cooling only when outdoor air is well below the CHWR.',
  },
  'cooling-tower': {
    term: 'Cooling tower',
    aliases: ['cooling towers', 'cooling tower', 'towers', 'tower'],
    definition:
      'A cooling tower rejects condenser-water heat to the outdoors. The limit of a cooling tower follows the wet-bulb temperature.',
    why: 'On a peak wet-bulb day, heat rejection is the first limit.',
  },
  lift: {
    term: 'Lift',
    aliases: ['lift'],
    definition:
      'Lift is the pressure difference the compressor works against. Lift is the rise from evaporator pressure to condenser pressure.',
    why: 'A lower LCHLT or hotter CW increases lift, and this trainer shows that increase as higher head.',
  },
  surge: {
    term: 'Surge',
    aliases: ['surge'],
    definition: 'Surge is unstable flow in a centrifugal compressor. Surge usually occurs when the load is low or the lift is high.',
    why: 'Do not defeat the protection that stops the compressor in surge.',
  },
  psig: {
    term: 'psig',
    aliases: ['psig'],
    definition: 'psig means pounds per square inch gauge. Evaporator pressure and condenser pressure on this board are in psig.',
    why: 'The head tile warns when condenser pressure is above 115 psig.',
  },
  mw: {
    term: 'MW',
    aliases: ['MW'],
    definition: 'MW means megawatts. Here MW is the IT heat, and MW is not the electrical input of the chiller.',
    why: 'Read the IT load tile before you judge the chiller percent.',
  },
  ups: {
    term: 'UPS',
    aliases: ['UPS'],
    definition: 'A UPS is an uninterruptible power supply. A UPS carries a critical load through a short outage.',
    why: 'A UPS event can look like a compressor fault and can add a bearing landing.',
  },
  'wet-bulb': {
    term: 'Wet-bulb',
    aliases: ['wet-bulb', 'wet bulb'],
    definition:
      'Wet-bulb is the temperature that air reaches when water evaporation cools the air to saturation. The heat rejection limit of a cooling tower follows the wet-bulb.',
    why: 'In this trainer the cooling tower follows the wet-bulb. The dry cooler follows the dry-bulb.',
  },
  lchlt: {
    term: 'LCHLT',
    aliases: ['LCHLT'],
    definition:
      'LCHLT means leaving chilled liquid temperature. The LCHLT setpoint is the primary control target of the chiller.',
    why: 'In this trainer the setpoint starts at 55°F, and OptiView holds that setpoint.',
  },
  fla: {
    term: '% FLA',
    aliases: ['% FLA', '%FLA', 'FLA'],
    definition:
      '% FLA means percent of full load amps. OptiView on this YMC² shows motor current and input current as % FLA.',
    why: 'In this trainer the gauge marked % FLA is the motor current of CH-01.',
  },
} as const satisfies Record<string, GlossaryEntry>

export type GlossaryId = keyof typeof GLOSSARY

function gloss(id: GlossaryId): { definition: string; why: string } {
  const entry = GLOSSARY[id]
  if (!entry.why) throw new Error(`Glossary entry ${id} is missing why`)
  return { definition: entry.definition, why: entry.why }
}

export interface InfoEntry {
  title: string
  /** Three to five short teaching points. Shared jargon uses GLOSSARY strings. */
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
      'Hall supply air is the air at the IT equipment after the CRAHs or the CDUs.',
      'The air is downstream of the CHWS temperature. A warm hall can be a plant fault or a distribution fault.',
      'This board marks the tile when the supply air is above 78°F.',
      'Compare the supply air with the return air and the CRAH valve position before you change a setpoint.',
    ],
    ['hallSupply', 'hallReturn'],
  ),
  'kpi-lchlt': point(
    'LCHLT',
    [
      'LCHLT is the primary control target of the chiller.',
      'The trainer starts the setpoint at 55°F. The actual temperature stays near that setpoint while the plant has load.',
      'A correct LCHLT with a hot hall means the cold water does not reach the coils.',
      'A setpoint change affects the hall supply air and the rack power-density margin. Use change control.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'kpi-it': point(
    'IT load',
    [gloss('it-load').definition, gloss('it-load').why, 'If the load increases and the head or the hall temperature follows, tell the NOC what the plant does.'],
    ['itLoad'],
  ),
  'kpi-head': point(
    'Condenser head',
    [
      'Head on this board is the condenser pressure of CH-01. High head means the machine cannot reject heat easily.',
      gloss('psig').definition,
      gloss('psig').why,
      'A peak wet-bulb, low CW flow, and deposits in the cooling tower are the usual causes.',
      'Do not defeat the safeties. Use the cooling towers, the flow, and a redundant chiller per the site SOP.',
    ],
    ['head'],
  ),
  'kpi-outdoor': point(
    'Outdoor temperature',
    [
      'The outdoor dry-bulb drives the dry cooler. The cooling tower follows the wet-bulb, and this sim keeps the wet-bulb below the dry-bulb.',
      'The 40°F, 75°F, and 100°F presets on the live board are the same outdoor setting as the field slider.',
      'Cold air lets the glycol loop remove part of the load. Hot air puts the cooling tower on the critical path.',
      'A change of the dry-bulb moves the trainer LCHLT target and the valve targets.',
      'Read the plant note under the mimic before you respond to one chiller alarm.',
    ],
    ['outdoor', 'wetBulb'],
  ),
  'kpi-ch01': point(
    'CH-01 load',
    [
      '% FLA is the motor current of CH-01. % FLA does not show the hall health.',
      'A low % FLA with a hot hall usually means a pump, a valve, or a CRAH fault. The fault is not a need for more speed.',
      'A high % FLA with high head means heat rejection or CW flow is the limit.',
      'In an N+1 plant, know if CH-01 is lead, lag, standby, or in alarm before you stop a machine.',
    ],
    ['rla', 'mode'],
  ),
  'mimic-it': point(
    'IT load',
    [gloss('it-load').definition, 'The number on this block is that heat, in MW, from the live sim.', 'Open the knowledge gate for the rules that apply to this number.'],
    ['itLoad'],
  ),
  'mimic-crah': point(
    'CRAH / CDU',
    [gloss('crah').definition, gloss('cdu').definition, gloss('delta-t').why, 'Do not restart racks to repair a distribution fault.'],
    ['hallSupply', 'hallReturn'],
  ),
  'mimic-chw': point(
    'CHW loop',
    [
      gloss('chw').definition,
      gloss('chw').why,
      'The redundant capacity is in this loop. A normal chiller display does not prove that the hall has CHW.',
    ],
    ['chwDp', 'chwValve'],
  ),
  'mimic-chiller': point(
    'CH-01 YMC²',
    [
      'This machine is one magnetic-bearing centrifugal chiller in a larger plant. Always know the lead unit, the lag unit, and the standby unit.',
      'The machine makes the LCHLT. The machine does not, by itself, deliver that water to every CRAH.',
      'In alarm mode, read the banner and the inhibit or the head limit before you change a setpoint.',
      'Open the 3D plant room to inspect the machine, or open OptiView to operate CH-01.',
    ],
    ['mode', 'rla', 'lchltAct'],
  ),
  'mimic-tower': point(
    'Cooling tower and dry cooler',
    [
      gloss('cooling-tower').definition,
      gloss('dry-cooler').definition,
      gloss('glycol').why,
      'The wet-bulb, the dry-bulb, and the free cooling percent are the three numbers on this block.',
    ],
    ['wetBulb', 'outdoor', 'freeCool', 'towerFan', 'dryFan'],
  ),
  'mimic-noc': point(
    'NOC / BMS',
    [
      gloss('noc').definition,
      gloss('bms').definition,
      'A normal watch desk means the sim has no active alarm. Escalated means you tell the NOC what you see and what you do.',
      gloss('bms').why,
    ],
    ['alarm'],
  ),
  'weather-preset': point(
    'Weather presets',
    [
      'These three buttons set the outdoor dry-bulb to 40°F, 75°F, or 100°F.',
      'At 40°F the dry cooler can remove part of the load. At 100°F the plant must reject heat at the cooling tower.',
      'The buttons write the same outdoor value as the field slider.',
      'Read the wet-bulb and the plant note after you change the weather. The cooling tower follows the wet-bulb, not the dry-bulb label alone.',
    ],
    ['outdoor', 'wetBulb', 'freeCool'],
  ),
  'drill-queue': point('Drill list', [
    'Each row is a trainer module. A row is not a command to the live plant.',
    'Complete the cooling chain, the walkdown, the refrigerant loop, and the MOP before you rely on memory at the panel.',
    'Done means you completed that module in this browser. Done is not a site qualification.',
    'The live board above the list stays active while you use the trainer.',
  ]),
  'mission-plant': point('Cooling chain drill', [
    'Follow the IT heat from the hall to the cooling tower. Know the upstream path and the downstream path.',
    'The YMC² is one link. Pumps, CRAHs, and heat rejection can fail while the chiller display looks normal.',
    'Complete the path once for credit in this trainer.',
  ]),
  'mission-explorer': point('3D walkdown', [
    'The plant room is a spatial inspection of CH-01, the three water loops, the cooling tower, and the dry cooler.',
    'Teal is CHW. Gold is CW. Violet is glycol.',
    'Complete all eight assemblies for walkdown credit. The buttons under the model work if WebGL is not available.',
  ]),
  'mission-cycle': point('Refrigerant loop drill', [
    'This path is the vapor-compression path in the machine. The stages are the evaporator, the compressor, the condenser, and the feed.',
    'IT heat arrives as warm CHWR and leaves toward the cooling tower.',
    'Name the stage before you open a work order.',
  ]),
  'mission-operation': point('MOP start and stop', [
    'A start needs a ticket, redundant capacity, power, water, and aligned setpoints. Then you start the machine.',
    'For a planned stop, wait until the standby machine is online and the hall is stable.',
    'An unplanned stop is an incident. Tell the NOC. Use a soft stop. Do not remove power under load.',
  ]),
  'mission-optiview': point('OptiView drill', [
    'The panel uses the same sim as the live board.',
    'Practice the setpoint, the soft stop, and the safety stop. Read the MBC status before you call the fault a chiller fault.',
    'Know which setpoints the BMS owns so you do not oppose the building system.',
  ]),
  'mission-match': point('Icon match', [
    'Match the mark to the system until the eight assemblies are immediate for you.',
    'The information button explains this drill. It does not name a pair.',
    'A complete board is trainer credit. The credit is not permission to skip the walkdown.',
  ]),
  'mission-quiz': point('Knowledge gate', [
    'Ten questions cover operation, components, maintenance, and data-center practice.',
    'Answer first. The information button appears after your choice. Then read the feedback.',
    'Eight of ten is the bar in this trainer. The site SOP is the bar on a live plant.',
  ]),
  'mission-trouble': point('Incident clock', [
    'You get a plant with a fault and a short NOC timer. Select the first safe action.',
    'The live board shows the same fault. Read the board before you select an action.',
    'Tell the NOC while you work. If the timer expires, a bad action is still incorrect.',
  ]),
  'mission-maintenance': point('Shift deck', [
    'These items are for a plant that runs all day. The intervals are each shift, each week, each month, and the outage.',
    'When you tap an item, the trainer records that you saw it.',
    'Live work still follows the site MOP, the LOTO, and the qualified-service list.',
  ]),
  'chaos-board': point(
    'Fault drills',
    [
      'These buttons apply a fault to the live sim. The buttons are drills. The buttons are not remedies.',
      'After a fault, read the alarm banner and the tiles before you change a valve or a setpoint.',
      'Clear the incident restores the plant to the state before the fault.',
      'Open the incident clock if you want the same fault as a timed decision.',
    ],
  ),
  'chaos-high-head': point(
    'Peak weather high head',
    [
      'This fault limits cooling tower rejection and increases condenser pressure.',
      'Expect the head tile and the alarm banner to change. % FLA often increases with the head.',
      'First, examine the cooling towers, the CW flow, the strainer difference, and the approach. Then start a redundant chiller per the SOP.',
      'Do not vent refrigerant. Do not bypass a safety to continue past the limit.',
    ],
    ['head', 'rla', 'alarm'],
  ),
  'chaos-hall-hot': point(
    'Hot hall, chiller idle',
    [
      'This fault warms the hall and unloads the chiller, and the CHW ΔP decreases.',
      'A low % FLA next to hot supply air is the signature.',
      'Examine the pumps, the header valves, the differential pressure, and the CRAH or CDU valves.',
      'Full compressor speed does not repair water that does not reach the hall.',
    ],
    ['hallSupply', 'rla', 'chwDp', 'alarm'],
  ),
  'chaos-landing': point(
    'ATS landing',
    [gloss('ats').definition, gloss('ats').why, 'The MBC screen on OptiView shows the landing count for this drill.'],
    ['mbc', 'landings'],
  ),
  'chaos-failover': point(
    'Lead trip failover',
    [
      'The fault takes CH-01 offline. If CH-02 is not already in operation, the sim shows a standby start inhibit.',
      'Read the inhibit. Flow, remote enable, and a BMS stop are typical reasons a standby machine does not start.',
      'Do not bypass a flow switch. Tell the NOC if the named interlock does not clear.',
      'Tell the NOC that the lead chiller is down and whether the standby chiller has the load.',
    ],
    ['mode', 'alarm', 'rla'],
  ),
  'chaos-clear': point(
    'Clear incident',
    [
      'Clear the incident restores the plant to the state before the fault.',
      'The clock, the setpoints, the valves, and the chiller run state return to that state.',
      'On a real plant, record the as-left state and update the ticket. A button does not erase the event.',
    ],
    ['alarm', 'mode'],
  ),
  'chaos-bms-fight': point(
    'BMS and panel disagree',
    [
      'The LCHLT actual moves up and down. The setpoint on the panel stays in place.',
      'The period is 12 seconds and the swing is 1.5°F. These are trainer values.',
      'Make the plant stable in one control mode. Then name the single writer for the setpoint.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'plant-controls': point(
    'Plant controls',
    [
      'These controls operate CH-01 and CH-02 on this board. The trainer can hold more units.',
      'Running capacity is the sum of the units that are in operation. Each unit uses a trainer value of 5 MW.',
      'A stop asks you to confirm. Clear the incident restores the plant to the state before the fault.',
      'Outdoor air sets a trainer LCHLT target. A setpoint that fights the target raises an alarm.',
      'A later trainer slice can show a bank of 18 units, then 36. This board does not show that bank yet.',
    ],
    ['itLoad', 'hallSupply'],
  ),
  'slider-it-load': point(
    'IT load target',
    [
      'Set the IT load target. The live load still moves a small amount around the target.',
      'The numbers are trainer values. They are not a chiller rating from a manual.',
      'If the load is above the running capacity, the hall supply temperature increases.',
      'Start another chiller or decrease the target to bring the hall supply down.',
    ],
    ['itLoad'],
  ),
  'opti-ch02': point(
    'CH-02 on this board',
    [
      'Start CH-02 when the IT load is above the capacity of CH-01.',
      'A soft stop and a safety stop ask you to confirm. The stop takes CH-02 offline.',
      'The live board uses the same commands. Capacity is the sum of the running units.',
    ],
  ),
  'chain-it': point(
    'IT load',
    [
      gloss('it-load').definition,
      gloss('it-load').why,
      'Name the IT load before you discuss the chiller percent. A small load does not need every machine at full head.',
    ],
    ['itLoad'],
  ),
  'chain-crah': point('CRAH / CDU', [gloss('crah').definition, gloss('cdu').definition, gloss('crah').why], ['hallSupply', 'hallReturn']),
  'chain-chw': point(
    'CHW loop',
    [
      gloss('chw').definition,
      gloss('n-plus-1').definition,
      'Wrong flow gives the CRAHs too little water even when the chiller display looks satisfied.',
    ],
    ['chwDp', 'chwValve'],
  ),
  'chain-ymc2': point(
    'YMC² chiller',
    [
      'The magnetic-bearing centrifugal machine makes the LCHLT.',
      'The machine is one of several. Know which machine is lead, lag, or standby before you isolate it.',
      'Part load is normal in a data center. Efficiency at part load is more important than one design-day number.',
    ],
    ['lchltAct', 'rla', 'mode'],
  ),
  'chain-tower': point(
    'Cooling towers and CW',
    [
      gloss('cooling-tower').definition,
      gloss('cw').definition,
      gloss('glycol').why,
      'Coordinate the cooling tower fans, the flow, and the water treatment. Deposits appear as a higher approach under the IT load.',
    ],
    ['wetBulb', 'towerFan', 'freeCool'],
  ),
  'chain-bms': point('BMS / NOC', [gloss('bms').definition, gloss('noc').definition, gloss('bms').why], ['alarm']),
  'detail-ready': point('Plant-room walkdown', [
    'Select a part of the model or a button on the rail. Each assembly has a short text here.',
    'Teal pipes are CHW to the hall. Gold pipes are CW to the cooling tower. Violet pipes are glycol to the dry cooler.',
    'Complete all eight assemblies for walkdown credit.',
    'The field cards under the model are the live loop readings.',
  ]),
  'comp-evaporator': point(
    'Evaporator',
    [
      'The evaporator makes CHW for the CRAH loops, the CRAC loops, and the CDU loops.',
      'LCHLT is the control target. In this trainer the setpoint starts at 55°F.',
      'A high approach often means deposits, low flow, air in the loop, or low refrigerant charge. Charge is a service item. Examine the cause before the hall gets hot.',
      'Compare the LCHLT with the hall return air and the CRAH valve position.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'comp-condenser': point(
    'Condenser',
    [
      gloss('cw').definition,
      gloss('dry-cooler').definition,
      gloss('glycol').why,
      'High condenser pressure on a peak wet-bulb day is a capacity limit.',
      'Do not defeat the safeties. Remove noncritical load or start a redundant chiller per the SOP.',
    ],
    ['head', 'cws', 'cwr'],
  ),
  'comp-compressor': point(
    'Compressor',
    [
      'This compressor is oil-free and has active magnetic bearings. Plants that run all day often use this type.',
      gloss('lift').definition,
      gloss('surge').definition,
      'An ATS transfer can cause a landing if the bearing hold-up power does not carry the bearings. That landing needs a ticket.',
    ],
    ['rla', 'mode'],
  ),
  'comp-vsd': point(
    'Variable-speed drive',
    [
      gloss('vsd').definition,
      gloss('vsd').why,
      'Keep the drive coolant service and the heat-exchanger service on the outage plan. A thermal trip stops the chiller.',
    ],
    ['rla'],
  ),
  'comp-optiview': point(
    'OptiView',
    [
      gloss('optiview').definition,
      gloss('optiview').why,
      'Read the message class. A warning, a cycle stop, and a safety stop escalate in different ways.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'comp-mbc': point(
    'Magnetic bearing controller',
    [
      gloss('mbc').definition,
      gloss('mbc').why,
      'A new power-fail landing during a generator exercise gets a ticket in the same shift.',
    ],
    ['mbc', 'landings', 'vibe'],
  ),
  'comp-power': point(
    'Power and battery panel',
    [
      gloss('ups').definition,
      gloss('ups').why,
      'Know which panel feeds this chiller before you remove a breaker.',
      'Do not treat chiller power as noncritical. If the chiller stops, that stop is an IT incident.',
    ],
  ),
  'comp-waterboxes': point(
    'Waterboxes and headers',
    [
      'The waterboxes connect the machine to the shared CHW headers and the shared CW headers.',
      'Isolation valves and strainers are part of the MOP before tube work or waterbox work.',
      'A closed balance valve gives the hall too little water even if the chiller looks normal.',
      'If the hall temperature rises and the % FLA is low, examine the pumps, the valves, and the distribution.',
    ],
    ['chwDp', 'cwDp', 'chwValve', 'cwValve'],
  ),
  'pipe-chw': point(
    'CHW loop',
    [
      gloss('chwr').definition,
      gloss('chws').definition,
      'The valve on this card is the balance valve for the whole CHW loop, so both rows move together.',
      gloss('chw').why,
      'If the differential pressure is low and the hall gets warmer, open the valve. If the differential pressure is high, decrease the valve opening.',
    ],
    ['chwr', 'chws', 'chwDp', 'chwValve'],
  ),
  'pipe-cw': point(
    'CW loop',
    [
      gloss('cws').definition,
      gloss('cwr').definition,
      gloss('cw').why,
      'If the CW flow falls, the head will increase. Prove the flow before you blame the compressor.',
    ],
    ['cws', 'cwr', 'cwDp', 'cwValve', 'towerFan'],
  ),
  'pipe-gly': point(
    'Glycol loop',
    [
      gloss('glycol').definition,
      gloss('dry-cooler').definition,
      'Free cooling is heat that the compressor does not have to lift.',
      'On a cold day with the glycol valve almost shut, the plant note says the dry cooler is idle.',
      'The dry cooler fan percent controls rejection on this loop. It is not the cooling tower fan.',
    ],
    ['glyS', 'glyR', 'glyDp', 'glyValve', 'dryFan', 'freeCool'],
  ),
  'slider-chw': point(
    'CHW balance valve',
    [
      'This slider is the CHW balance valve. In the trainer the valve moves from 15% open to 100% open.',
      'More stem increases flow and ΔP until the piping and the coils, not the valve, are the restriction.',
      'Below about 42% open, this sim gives the CRAHs too little flow and the hall gets warmer.',
      'Move the valve while you watch the ΔP and the hall supply. The gain line shows the psi change for a 10% move at this position.',
    ],
    ['chwValve', 'chwDp'],
  ),
  'slider-cw': point(
    'CW balance valve',
    [
      'This slider is the CW balance valve. The valve moves from 15% open to 100% open.',
      'The valve sets flow to the cooling tower circuit. Low flow appears as a low ΔP and then as a higher head.',
      'This sim warns when the valve is under 40% open.',
      'Use the valve with the cooling tower fan percent. The fans cannot reject heat that the pump does not deliver.',
    ],
    ['cwValve', 'cwDp', 'head'],
  ),
  'slider-gly': point(
    'Glycol balance valve',
    [
      gloss('glycol').definition,
      gloss('glycol').why,
      'If you shut the valve on a cold day, the chiller and the cooling tower do work that the dry cooler can share.',
      'Watch the glycol differential pressure and the free cooling percent together.',
    ],
    ['glyValve', 'glyDp', 'freeCool', 'outdoor'],
  ),
  'slider-oat': point(
    'Outdoor dry-bulb',
    [
      'This slider sets the outdoor dry-bulb from 20°F to 110°F. The live-board presets use the same setting at 40°F, 75°F, and 100°F.',
      'The dry-bulb drives the dry cooler. The wet-bulb drives the cooling tower. The plant note and the cooling tower card show the wet-bulb.',
      'The CHW ΔP target on the CHW card changes with this temperature. The target is higher in extreme heat and lower in cold weather.',
      'A new dry-bulb moves the trainer LCHLT target and the valve targets unless you already set them.',
      'Change the weather, then read the plant note before you adjust the valves.',
    ],
    ['outdoor', 'wetBulb'],
  ),
  'cycle-evap': point(
    'Evaporator stage',
    [
      'Warm CHWR from the hall gives heat to the refrigerant here.',
      'The refrigerant boils. This stage is the CHW heat inlet of the loop.',
      'If this stage is the subject, use CHWR, CHWS, and LCHLT. Do not use the cooling tower readings.',
    ],
    ['chwr', 'chws', 'lchltAct'],
  ),
  'cycle-comp': point(
    'Compressor stage',
    [
      gloss('lift').definition,
      gloss('surge').definition,
      'Speed follows the plant load through the VSD.',
      'Landings and vibration belong to this stage. A power event can land the rotor even when the hall stays in operation.',
    ],
    ['rla', 'mbc'],
  ),
  'cycle-cond': point(
    'Condenser stage',
    [
      gloss('cw').definition,
      gloss('cooling-tower').why,
      'CWS, CWR, cooling tower fans, and head are the readings for this stage.',
    ],
    ['cws', 'cwr', 'head', 'towerFan'],
  ),
  'cycle-feed': point(
    'Level and feed',
    [
      'Level control meters liquid refrigerant from the condenser to the evaporator.',
      'The VSD and the VGD hold the LCHLT.',
      'Do not invent a feed setpoint that the panel does not show. Use the LCHLT setpoint that the trainer has.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'mop-mop': point('MOP and ticket', [gloss('mop').definition, gloss('mop').why, 'If there is no ticket, the start is not a planned start.']),
  'mop-redundancy': point('Redundant capacity', [
    gloss('n-plus-1').definition,
    gloss('n-plus-1').why,
    'Make sure that another chiller and the pumps can carry the IT load before you remove a machine.',
  ]),
  'mop-power': point('Power path', [
    'Examine the drive power, the control power, and the UPS feed. Make sure that no other electrical job uses the same window.',
    'Bearing hold-up power is part of this task. A dead hold-up battery makes a short outage a landing.',
    'After generator work or UPS work, make sure of the drive before you call the start normal.',
  ]),
  'mop-water': point(
    'CHW and CW proof',
    [
      'Start the pumps in sequence. Prove the flow switches. Make sure of the cooling tower and the header valves.',
      'A chiller that starts without proven water flow can freeze and damage the evaporator tubes.',
      'The field cards are the proof. Use the ΔP and the valve position. Do not use a green light alone.',
    ],
    ['chwDp', 'cwDp'],
  ),
  'mop-setpoints': point(
    'Setpoints',
    [
      gloss('setpoint').definition,
      'In this trainer the LCHLT setpoint starts at 55°F. The OptiView slider runs from 42°F to 65°F.',
      'Know whether the BMS or the panel may write the number.',
    ],
    ['lchltSet'],
  ),
  'mop-start': point(
    'Start and levitation',
    [
      'Command the start. Watch the MBC levitate the rotor. Watch the VSD increase speed. Watch the LCHLT move toward the setpoint.',
      'An inhibit is a list. Read the inhibit. Do not bypass a flow switch.',
      'If the machine does not start, tell the NOC while the lead machine is still online.',
    ],
    ['mbc', 'lchltAct', 'rla'],
  ),
  'mop-stabilize': point(
    'Stable operation and log',
    [
      'Make sure of the lead unit and the lag unit. Let the temperatures become stable. Record the as-left readings.',
      'Close the ticket with the conditions you left. Include the setpoint, the lead machine, and any new message.',
      'A start is not complete while the hall supply is still changing.',
    ],
    ['hallSupply', 'lchltAct'],
  ),
  'stop-noc': point('NOC approval to stop', [
    gloss('noc').definition,
    'A planned stop needs awareness from facilities and from the NOC. An unplanned stop is an incident.',
    'Do not treat a local soft key as permission if the ticket is not open.',
  ]),
  'stop-redundant': point(
    'Standby online',
    [
      'Start the standby chiller and give it the load. Make sure of the hall temperature and the CHW temperature before you stop this chiller.',
      'If you stop the last machine that has the load, you can cause a thermal event.',
      'Redundant capacity that is offline does not count.',
    ],
    ['hallSupply', 'mode'],
  ),
  'stop-soft': point('Soft stop', [
    'Use the OptiView soft stop so the driveline decreases speed under control.',
    'A safety stop is for protection. A safety stop is not a tidy planned stop.',
    'Do not open the main disconnect under load. That action is not a stop procedure.',
  ]),
  'stop-isolate': point('Isolate', [
    'Close valves, apply electrical LOTO, and apply tags only when the approved procedure says to do it.',
    'Do not isolate the water before the machine stops and the standby unit has the load. That action leaves the hall without CHW.',
    'Know which breaker feeds the chiller before you remove any equipment.',
  ]),
  'stop-secure': point('Secure and hand-over', [
    'Record the as-left state, the messages, and the owner of the next action.',
    'Update the BMS note and the ticket. The next shift must not guess the state.',
    'The hand-over includes whether the standby unit is now the lead unit.',
  ]),
  'gauge-set': point(
    'LCHLT setpoint',
    [
      'This value is the CHWS temperature target that the panel tries to hold.',
      'The trainer starts at 55°F. The slider beside these gauges runs from 42°F to 65°F.',
      'A move of this value is an operational change. The move changes the hall supply air.',
      'If the BMS also writes a setpoint, stop. Reconcile the two values. Do not change both values.',
    ],
    ['lchltSet'],
  ),
  'gauge-act': point(
    'LCHLT actual',
    [
      'The actual CHWS temperature sits near the setpoint while CH-01 is in operation.',
      'When the trainer shows the machine stopped, this gauge holds 58.2°F so you can see a stopped panel.',
      'If the actual value is on the setpoint and the hall is hot, examine the distribution. Do not change only the compressor speed.',
    ],
    ['optiAct', 'lchltSet'],
  ),
  'gauge-rla': point(
    'Motor current % FLA',
    [
      '% FLA is motor current on this YMC². OptiView also shows input current as % FLA.',
      'The gauge shows 0% when you have stopped CH-01 in this trainer.',
      'Low load and a hot hall mean the chiller does not see the heat. High load and high head mean that heat rejection or CW flow is the limit.',
    ],
    ['optiRla'],
  ),
  'gauge-evap': point(
    'Evaporator pressure',
    [
      'This gauge is the evaporator refrigerant pressure on the trainer panel.',
      'While CH-01 is in operation, the panel shows 36 psig. When CH-01 is not in operation, the panel shows 48 psig.',
      'Use the pressure with the LCHLT. Do not use the pressure instead of the water temperatures. The hall depends on the water.',
    ],
    ['evapPsig'],
  ),
  'gauge-cond': point(
    'Condenser pressure',
    [
      'This value is the head, in psig, from the live sim.',
      'The live board warns when the value is above 115 psig.',
      'The cooling towers, the CW flow, and the outdoor wet-bulb change this value. Do not bypass the safeties to continue past the limit.',
    ],
    ['head'],
  ),
  'gauge-hall': point(
    'Hall supply air',
    [
      'Hall supply is the air temperature after the CRAHs, from the same sim as the live board.',
      'The live board marks the value when it is above 78°F.',
      'If this value rises while the LCHLT is on the setpoint, the fault is between the chiller and the racks.',
    ],
    ['hallSupply'],
  ),
  'gauge-mbc': point(
    'Bearing state',
    [
      'LEVITATED means the magnets hold the rotor. LANDED means the rotor is on the touchdown bearings.',
      'At a controlled stop, the rotor rests on the touchdown bearings after rotation stops. That set-down is normal. A counted landing is contact while the rotor turns.',
      'FAULT is not a state that you clear and then ignore. Read the message and tell the NOC.',
    ],
    ['mbc'],
  ),
  'gauge-landings': point(
    'Landing count',
    [
      'This trainer shows 1 after the ATS landing fault and shows 0 at other times.',
      'If the count increases during a generator exercise, open a ticket, even if the hall stayed up.',
      'Do not set the counter to zero to make the trend look clean.',
    ],
    ['landings'],
  ),
  'gauge-vibe': point(
    '1× vibration',
    [
      'The MBC screen shows a 1× vibration value so you remember to record the trend.',
      'In this trainer the value moves a small amount around 0.12. The trace teaches the idea. The trace is not a field calibration.',
      'On a real machine, an increase in the 1× trend needs a work order before a peak weekend. Do not only restart the panel.',
    ],
    ['vibe'],
  ),
  'slider-lchlt': point(
    'LCHLT setpoint slider',
    [
      'This slider sets the LCHLT from 42°F to 65°F. The sim starts at 55°F.',
      'The outdoor dry-bulb sets a trainer target. If this slider fights that target, the plant shows an alarm.',
      'The plant tries to make that water. The hall supply air follows the water temperature.',
      'On a live campus, this move is under change control. Do not move the slider to respond to one rack.',
      'If the BMS owns the setpoint, write the value in one place. If you write the value in two places, the valves move too often.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'opti-start': point(
    'Start',
    [
      'Start levitates the bearings and increases the drive speed if the interlocks pass.',
      'Prove the water flow and the redundant capacity before you start a machine that you just isolated.',
      'Watch the LCHLT move toward the setpoint. A start that never takes load is an inhibit, not a success.',
    ],
    ['mbc', 'rla'],
  ),
  'opti-soft': point('Soft stop', [
    'The soft stop decreases the driveline speed under control. The soft stop is the planned stop.',
    'Use the soft stop only after the standby machine has the hall load.',
    'The soft stop is not the button for a refrigerant emergency or an electrical emergency.',
  ]),
  'opti-safety': point('Safety stop', [
    'The safety stop is the protective trip. The safety stop takes CH-01 offline now.',
    'Use the safety stop when the machine or a person is at risk. Do not use the safety stop as a tidy end to a MOP.',
    'After the stop, read the message and tell the NOC. Do not restart the machine until you know the cause.',
  ]),
  'opti-warn': point('Hall warning', [
    'This button records a warning so you can practice the message class. A warning is not yet a safety trip.',
    'A warning still needs attention. Examine the approach, the flow, and the hall temperature.',
    'The message class controls the escalation. Do not treat every line as a full plant stop.',
  ]),
  'opti-noc': point('Page the NOC', [
    gloss('noc').definition,
    gloss('noc').why,
    'Tell the NOC the symptom, the machine, and the items you already examined.',
  ]),
  'opti-done': point('Mark OptiView complete', [
    'This button only records that you finished the trainer module.',
    'The button does not clear an alarm and does not change the sim.',
    'On a real panel, the end of the task is an as-left log. The trainer button is not that log.',
  ]),
  'quiz-q1': point('Stop of an online chiller', [
    'A spare machine on a drawing does not carry the hall until that machine is in service.',
    'Read the inhibits on the other chillers before you isolate the one that supplies the hall.',
    'Panel language and an empty cooling tower basin are not the gate.',
  ]),
  'quiz-q2': point(
    'Primary temperature target',
    [
      'This chiller holds one water temperature at the evaporator outlet.',
      'Condenser inlet water, aisle air, and an oil sump are different measurements.',
      'Hall air is downstream of the air handlers and the liquid distribution units.',
    ],
    ['lchltSet', 'lchltAct'],
  ),
  'quiz-q3': point('Touchdown bearings', [
    'Magnetic bearings hold the rotor clear of the housing while the shaft turns.',
    'Touchdown bearings are the backup surfaces for that shaft.',
    'They are not an oil system, and a CRAH valve does not command them.',
  ]),
  'quiz-q4': point(
    'Hot hall, low load',
    [
      'A hot hall with a light compressor load means the heat is not at the evaporator.',
      'Oil quantity and an open relief valve do not move water to the coils.',
      'Compare the hall air with the water that leaves the plant.',
    ],
    ['hallSupply', 'rla'],
  ),
  'quiz-q5': point(
    'Landing after a generator test',
    [
      'A higher landing count after an electrical test is a record, not a display nuisance.',
      'Do not erase the counter to make the trend look clean. Do not change the water setpoint to hide the count.',
      'You can leave the machine online if it operates safely and the spare capacity is intact. You must still investigate the event.',
    ],
    ['landings'],
  ),
  'quiz-q6': point('Who owns the incident clock', [
    'When the hall is at risk, the clock belongs to the operations center and the incident process.',
    'A vendor, a passer-by, and an automatic email do not own that clock.',
    'The people at the machine still run the plant and report what they see.',
  ]),
  'quiz-q7': point('Planned stop', [
    'The planned stop command lets the driveline decrease speed under control.',
    'An open disconnect under load, a protective trip from habit, or a pump stop first is the wrong sequence.',
    'Give the hall to the spare machine first. Then follow the site MOP.',
  ]),
  'quiz-q8': point(
    'Peak wet-bulb',
    [
      'Humid outdoor air reduces what the heat-rejection plant can do.',
      'The limit often appears as condenser pressure before the compressor itself has a fault.',
      'Display units and the bearing gap are not the summer problem.',
    ],
    ['wetBulb', 'head'],
  ),
  'quiz-q9': point('Cycle stop versus safety stop', [
    'One message can end by itself and can permit the machine to start again. The other message locks the machine for protection.',
    'That class decides the call list and the restart rule.',
    'Read the exact text on the panel. The two lines are not one alarm.',
  ]),
  'quiz-q10': point(
    'Change of LCHLT',
    [
      'A change to the water temperature target changes the hall.',
      'Use the site process. Do not add margin by a private move. Do not remove building supervision to end a dispute.',
      'In this trainer the slider is 42°F to 65°F and the start value is 55°F.',
    ],
    ['lchltSet'],
  ),
  'quiz-done': point('Gate complete', [
    'The score is the number of the ten questions that you answered correctly in this pass.',
    'Retry uses the same questions in a new order. Retry does not add a new plant state.',
    'A high score is not a replacement for the site SOP or for qualified service.',
  ]),
  'trouble-high-head': point(
    'High head on a hot day',
    [
      'High condenser pressure with a high wet-bulb is a heat-rejection problem.',
      'The first look is the outdoor sink and the water that feeds it, not the refrigerant charge.',
      'The site SOP can allow a higher LCHLT as an emergency action. That is not the first diagnosis, and it needs change control.',
      'Do not vent refrigerant. Do not defeat a safety because of the weather.',
    ],
    ['head', 'wetBulb', 'alarm'],
  ),
  'trouble-landing': point(
    'Landing after a generator exercise',
    [
      'The bearing controller counted a contact. The hall can still look stable.',
      'The useful record is the electrical path that fed the machine during the exercise.',
      'If you clear the counter, you hide the failure. If you take the chiller offline with no spare plan, that response is too strong.',
      'Each counted contact during rotation is an event. It is not normal background.',
    ],
    ['landings', 'mbc'],
  ),
  'trouble-hall-hot-chiller-idle': point(
    'Hot hall, unloaded chiller',
    [
      'A hot aisle with a light compressor load means the heat is not at the evaporator.',
      'Open air-handler valves do not prove that water is moving in the headers.',
      'Full speed against a satisfied water temperature does not feed a starved loop.',
      'Do not stop the spare machines. Do not restart rack power to repair the water path.',
    ],
    ['hallSupply', 'rla', 'chwDp'],
  ),
  'trouble-no-start': point(
    'Standby does not start',
    [
      'The lead machine is down and the spare machine refuses to start.',
      'The panel text is a list of proofs. Work that list. Do not invent a bypass.',
      'Do not defeat a flow proof. Tell the operations center if the refusal stays.',
      'Display units do not clear a proof.',
    ],
    ['mode', 'alarm'],
  ),
  'trouble-bms-fight': point(
    'BMS disagrees with the panel',
    [
      'If the water temperature moves up and down, two writers may own the same target.',
      'Settle the machine in one control mode. Then name the single writer for the enable and the target.',
      'Do not disable the safeties. Do not leave the network cable disconnected as a permanent repair.',
      'Valves that move too often waste capacity and can trip the plant.',
    ],
    ['lchltAct', 'lchltSet'],
  ),
  'maint-d1': point(
    'Shift review',
    [
      'Each shift, examine LCHLT, the hall alarms, and the chiller status in the BMS and on OptiView.',
      'The task is to find drift. The task is not to select a new setpoint.',
      'Record which machine is lead and which machine is in alarm before you leave the desk.',
    ],
    ['lchltAct', 'hallSupply'],
  ),
  'maint-d2': point(
    'Shift scan',
    [
      'Find any new warning, new landing, or capacity limit.',
      'A new landing or a new high-head warning is the item for the next shift.',
      'Do not clear a message that you have not read.',
    ],
    ['landings', 'alarm'],
  ),
  'maint-d3': point(
    'Daily plant log',
    [
      'Record the plant conditions on the plant log. Include temperatures, pressures, the lead machine, and outdoor conditions.',
      'The log lets you compare the approach next week with the approach today.',
      'A blank log hides a slow deposit problem.',
    ],
    ['lchltAct', 'head', 'outdoor'],
  ),
  'maint-w1': point(
    'Weekly flows',
    [
      'Once a week, compare CHW flow, CW flow, or header ΔP with the normal band.',
      'This trainer flags CHW ΔP outside 12 to 24 psi and CW ΔP outside 8 to 18 psi.',
      'A valve that someone left at a low opening appears here before the hall alarms.',
    ],
    ['chwDp', 'cwDp'],
  ),
  'maint-w2': point(
    'Weekly cooling tower inspection',
    [
      'Examine the cooling towers and the strainers. Record the basin level and whether the fans follow the plant request.',
      'Deposits and a low basin appear as approach and head under load.',
      'The dry cooler is a separate inspection. Examine the fans, the coil face, and the glycol valves.',
    ],
    ['towerFan', 'dryFan', 'head'],
  ),
  'maint-m1': point('Monthly power balance', [
    'Examine the three-phase voltage balance and the current balance on the chiller feed.',
    'Imbalance on a generator feed or a UPS feed can look like a compressor fault or a drive fault.',
    'This task is a measurement. It is not a setpoint change.',
  ]),
  'maint-m2': point('Monthly connections', [
    'Only qualified electrical workers do this task, with the circuit de-energized under LOTO.',
    'Loose power connections cause the trips that become hall alarms.',
    'Do not do this work on a live circuit only because the calendar says monthly.',
  ]),
  'maint-m3': point(
    'Monthly setpoints',
    [
      'Make sure that the setpoints and the cutouts still match the live SOP.',
      'In this trainer, LCHLT starts at 55°F. A campus plant can be different. The SOP wins.',
      'Find a BMS value and a panel value that differ.',
    ],
    ['lchltSet'],
  ),
  'maint-m4': point(
    'Monthly lead and standby',
    [
      'Know which unit is lead, which unit is lag, and which unit is standby. Know whether the standby unit will start.',
      'Failover practice finds an inhibit on a normal day instead of during an outage.',
      'A standby unit with an inhibit for a month is not redundancy.',
    ],
    ['mode'],
  ),
  'maint-y1': point('Drive heat exchanger', [
    'Each year, service the VSD heat exchanger and the coolant in a planned window.',
    'A drive that gets too hot takes the compressor offline.',
    'Use qualified electrical practice and the outage plan. This row is the reminder, not the procedure.',
  ]),
  'maint-y2': point('Bearing hold-up batteries', [
    'The UPS or the battery that holds the magnetic bearings through a short outage gets a yearly health test.',
    'A dead hold-up source makes a short transfer a landing.',
    'Coordinate the test with the electrical maintenance window.',
  ]),
  'maint-y3': point('Refrigerant analysis', [
    'A yearly refrigerant analysis belongs to a qualified technician.',
    'It is not a task where an operator vents refrigerant or adds refrigerant.',
    'Put the result in the service record, next to the leak tests and the charge history.',
  ]),
  'maint-y4': point(
    'Bearing trend review',
    [
      'Once a year, review the vibration trend and the landing trend with the service contractor.',
      'A slow increase in 1× vibration is the reason you keep the history.',
      'Bring the generator-test dates. Landings cluster around electrical events.',
    ],
    ['landings', 'vibe'],
  ),
  'maint-n1': point('Tube test', [
    'Eddy-current tests of the tubes belong to the planned outage, on a multi-year interval.',
    'Do the tests with the machine isolated under a MOP. Do not do the tests on a normal inspection.',
    'Deposits and approach that you logged all year are the reason this window exists.',
  ]),
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
