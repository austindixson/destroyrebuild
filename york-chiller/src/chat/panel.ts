import './chat.css'
import {
  CHAT_CANCEL,
  CHAT_CLEAR,
  CHAT_CLOSE,
  CHAT_EMPTY,
  CHAT_NOTE,
  CHAT_PLACEHOLDER,
  CHAT_SEND,
  CHAT_SOURCES,
  CHAT_SUGGESTIONS,
  CHAT_TITLE,
  CHAT_TOO_LONG,
  CHAT_UNDO,
  QUESTION_LIMIT,
} from './copy'
import { askTrainer, type ChatSource, type HistoryItem } from './loop'
import type { ConfirmCard } from './confirmCopy'
import { captureScreenSnapshot, type ScreenInput } from './snapshot'
import { linkGlossary } from '../ui/glossary'

export interface ChatMount {
  screen: () => ScreenInput
  callTool: (name: string, args: Record<string, unknown>) => { ok: boolean; message: string }
  undo: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  sources: ChatSource[]
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function safeHref(href: string): string {
  if (href.startsWith('/york-chiller/')) return href
  return '/york-chiller/'
}

export function mountYorkChat(parent: HTMLElement, mount: ChatMount): void {
  const launch = el('button', 'chat-launch')
  launch.type = 'button'
  launch.dataset.chatOpen = 'true'
  launch.textContent = CHAT_TITLE

  const panel = el('section', 'chat-panel')
  panel.dataset.chatPanel = 'true'
  panel.setAttribute('aria-label', CHAT_TITLE)

  const head = el('div', 'chat-head')
  const title = el('p', 'chat-title')
  title.textContent = CHAT_TITLE
  const clearBtn = el('button')
  clearBtn.type = 'button'
  clearBtn.dataset.chatClear = 'true'
  clearBtn.textContent = CHAT_CLEAR
  const closeBtn = el('button')
  closeBtn.type = 'button'
  closeBtn.dataset.chatClose = 'true'
  closeBtn.textContent = CHAT_CLOSE
  head.append(title, clearBtn, closeBtn)

  const note = el('p', 'chat-note')
  note.textContent = CHAT_NOTE
  const status = el('p', 'chat-status')
  status.dataset.chatStatus = 'true'
  const log = el('div', 'chat-log')
  log.dataset.chatLog = 'true'
  const suggests = el('div', 'chat-suggests')
  const undoBtn = el('button', 'chat-undo')
  undoBtn.type = 'button'
  undoBtn.dataset.chatUndo = 'true'
  undoBtn.hidden = true
  undoBtn.textContent = CHAT_UNDO

  const confirm = el('div', 'chat-confirm')
  confirm.dataset.chatConfirm = 'true'
  confirm.hidden = true
  confirm.setAttribute('role', 'dialog')
  confirm.setAttribute('aria-modal', 'true')
  const confirmCopyNode = el('p')
  confirmCopyNode.dataset.chatConfirmCopy = 'true'
  const confirmYes = el('button')
  confirmYes.type = 'button'
  confirmYes.dataset.chatConfirmYes = 'true'
  const confirmNo = el('button')
  confirmNo.type = 'button'
  confirmNo.dataset.chatConfirmNo = 'true'
  confirmNo.textContent = CHAT_CANCEL
  confirm.append(confirmCopyNode, confirmYes, confirmNo)

  const compose = el('form', 'chat-compose')
  const input = el('textarea')
  input.dataset.chatInput = 'true'
  input.maxLength = QUESTION_LIMIT
  input.placeholder = CHAT_PLACEHOLDER
  input.required = true
  const send = el('button', 'chat-send')
  send.type = 'submit'
  send.dataset.chatSend = 'true'
  send.textContent = CHAT_SEND
  compose.append(input, send)
  const count = el('p', 'chat-count')
  count.dataset.chatCount = 'true'

  panel.append(head, note, status, log, suggests, undoBtn, confirm, compose, count)
  parent.append(launch, panel)

  const messages: ChatMessage[] = []
  let pending: AbortController | null = null
  let confirmWait: ((yes: boolean) => void) | null = null

  const paintCount = () => {
    count.textContent = `${input.value.length}/${QUESTION_LIMIT}`
  }

  const paintSuggest = () => {
    suggests.replaceChildren()
    if (messages.length > 0) return
    for (const text of CHAT_SUGGESTIONS) {
      const button = el('button', 'chat-suggest')
      button.type = 'button'
      button.textContent = text
      button.addEventListener('click', () => {
        input.value = text
        paintCount()
        void submit(text)
      })
      suggests.append(button)
    }
  }

  const paintLog = () => {
    log.replaceChildren()
    if (messages.length === 0) {
      const empty = el('p', 'chat-bubble assistant')
      empty.textContent = CHAT_EMPTY
      log.append(empty)
    }
    for (const message of messages) {
      const bubble = el('p', `chat-bubble ${message.role}`)
      if (message.role === 'assistant') bubble.dataset.chatAnswer = 'true'
      bubble.textContent = message.text
      log.append(bubble)
      if (message.sources.length === 0) continue
      const list = el('ul', 'chat-sources')
      list.dataset.chatSources = 'true'
      for (const source of message.sources) {
        const item = el('li')
        const link = el('a')
        link.href = safeHref(source.href)
        link.textContent = source.title || CHAT_SOURCES
        item.append(link)
        list.append(item)
      }
      log.append(list)
    }
    linkGlossary(log)
    log.scrollTop = log.scrollHeight
    paintSuggest()
  }

  const setBusy = (busy: boolean) => {
    send.textContent = busy ? CHAT_CANCEL : CHAT_SEND
    input.disabled = busy
  }

  const askConfirm = (card: ConfirmCard) =>
    new Promise<boolean>((resolve) => {
      confirm.hidden = false
      confirmCopyNode.textContent = card.body
      confirmYes.textContent = card.yes
      confirm.setAttribute('aria-label', card.title)
      confirmWait = resolve
    })

  const closeConfirm = (yes: boolean) => {
    confirm.hidden = true
    const wait = confirmWait
    confirmWait = null
    wait?.(yes)
  }

  const submit = async (question: string) => {
    if (pending) {
      pending.abort()
      return
    }
    const text = question.trim()
    if (!text) return
    if (text.length > QUESTION_LIMIT) {
      status.textContent = CHAT_TOO_LONG
      return
    }
    const previousQuestions = messages.filter((message) => message.role === 'user').map((message) => message.text)
    const history: HistoryItem[] = messages.slice(-6).map((message) => ({ role: message.role, text: message.text }))
    messages.push({ role: 'user', text, sources: [] })
    input.value = ''
    paintCount()
    paintLog()
    status.textContent = ''
    undoBtn.hidden = true
    const controller = new AbortController()
    pending = controller
    setBusy(true)
    const result = await askTrainer({
      question: text,
      previousQuestions,
      history,
      snapshot: captureScreenSnapshot(mount.screen()),
      signal: controller.signal,
      host: { callTool: mount.callTool },
      onConfirm: askConfirm,
      onUndoOffer: () => {
        undoBtn.hidden = false
      },
      onStatus: (line) => {
        status.textContent = line
      },
    })
    pending = null
    setBusy(false)
    status.textContent = ''
    messages.push({ role: 'assistant', text: result.answer, sources: result.sources })
    paintLog()
  }

  launch.addEventListener('click', () => {
    panel.classList.toggle('open')
    if (panel.classList.contains('open')) input.focus()
  })
  closeBtn.addEventListener('click', () => panel.classList.remove('open'))
  clearBtn.addEventListener('click', () => {
    pending?.abort()
    pending = null
    messages.splice(0, messages.length)
    closeConfirm(false)
    undoBtn.hidden = true
    status.textContent = ''
    setBusy(false)
    paintLog()
  })
  undoBtn.addEventListener('click', () => {
    mount.undo()
    undoBtn.hidden = true
  })
  confirmYes.addEventListener('click', () => closeConfirm(true))
  confirmNo.addEventListener('click', () => closeConfirm(false))
  input.addEventListener('input', paintCount)
  compose.addEventListener('submit', (event) => {
    event.preventDefault()
    void submit(input.value)
  })
  paintCount()
  paintLog()
}
