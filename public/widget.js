/**
 * Erasmus Incoming Assistant — embeddable chat widget
 *
 * Usage:
 *   <script src="https://your-app.vercel.app/widget.js"
 *           data-api-url="https://your-app.vercel.app"></script>
 *
 * The widget reads data-api-url at runtime so the same file can be
 * redeployed to any host without rebuilding.
 */
;(function () {
  'use strict'

  // ── Resolve API base URL from script tag ────────────────────────────────
  const scriptTag = document.currentScript
  const API_URL = (scriptTag && scriptTag.dataset.apiUrl
    ? scriptTag.dataset.apiUrl
    : window.location.origin
  ).replace(/\/$/, '')

  // ── State ────────────────────────────────────────────────────────────────
  let sessionId = sessionStorage.getItem('era_session') || null
  let open = false
  const messages = []   // { id, role, content, sources, shouldEscalate, streaming }

  // ── Shadow host ──────────────────────────────────────────────────────────
  const host = document.createElement('div')
  host.id = 'erasmus-widget-host'
  host.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;font-family:system-ui,sans-serif;'
  document.body.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  // ── Styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style')
  style.textContent = `
    *{box-sizing:border-box;margin:0;padding:0}
    #btn{
      width:52px;height:52px;border-radius:50%;background:#1d4ed8;border:none;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 12px rgba(0,0,0,.25);transition:background .2s;
    }
    #btn:hover{background:#1e40af}
    #btn svg{width:24px;height:24px;fill:white}
    #popup{
      display:none;position:absolute;bottom:64px;right:0;
      width:360px;height:480px;background:#fff;border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;
      flex-direction:column;border:1px solid #e5e7eb;
    }
    #popup.open{display:flex}
    #header{
      background:#1d4ed8;color:#fff;padding:12px 16px;
      display:flex;align-items:center;justify-content:space-between;
      flex-shrink:0;
    }
    #header-title{font-size:14px;font-weight:600}
    #header-sub{font-size:11px;opacity:.8;margin-top:2px}
    #close{background:none;border:none;cursor:pointer;color:#fff;opacity:.8;
      font-size:18px;line-height:1;padding:2px 4px;}
    #close:hover{opacity:1}
    #msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
    .bubble{max-width:85%;border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.5}
    .user{align-self:flex-end;background:#1d4ed8;color:#fff}
    .assistant{align-self:flex-start;background:#f3f4f6;color:#111827;
      border:1px solid #e5e7eb}
    .sources{margin-top:6px;padding-top:6px;border-top:1px solid #d1d5db}
    .sources-label{font-size:10px;font-weight:600;text-transform:uppercase;
      letter-spacing:.05em;color:#9ca3af;margin-bottom:3px}
    .sources a{display:block;font-size:11px;color:#4b5563;text-decoration:underline}
    .sources a:hover{color:#1d4ed8}
    .escalation{margin-top:6px;padding:6px 8px;background:#fffbeb;
      border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e}
    .escalation a{color:#92400e;font-weight:600}
    .feedback{margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .feedback span{font-size:11px;color:#9ca3af}
    .fb-btn{border:1px solid #d1d5db;background:#fff;border-radius:4px;
      padding:2px 8px;font-size:11px;cursor:pointer;color:#374151;transition:all .15s}
    .fb-btn:hover{background:#f3f4f6}
    .fb-thanks{font-size:11px;color:#9ca3af}
    .thinking{align-self:flex-start;font-size:13px;color:#9ca3af;padding:8px 12px}
    #form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb;flex-shrink:0}
    #input{
      flex:1;border:1px solid #d1d5db;border-radius:8px;
      padding:8px 10px;font-size:13px;color:#111827;
      outline:none;font-family:inherit;resize:none;
    }
    #input:focus{border-color:#1d4ed8;box-shadow:0 0 0 2px rgba(29,78,216,.15)}
    #send{
      background:#1d4ed8;color:#fff;border:none;border-radius:8px;
      padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;
      transition:background .2s;white-space:nowrap;
    }
    #send:hover{background:#1e40af}
    #send:disabled{opacity:.5;cursor:default}
    @keyframes blink{0%,100%{opacity:.75}50%{opacity:0}}
    @media(max-width:420px){
      #popup{width:calc(100vw - 24px);right:0}
    }
  `
  shadow.appendChild(style)

  // ── Toggle button ─────────────────────────────────────────────────────────
  const btn = document.createElement('button')
  btn.id = 'btn'
  btn.setAttribute('aria-label', 'Open chat assistant')
  btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
  </svg>`
  shadow.appendChild(btn)

  // ── Popup ────────────────────────────────────────────────────────────────
  const popup = document.createElement('div')
  popup.id = 'popup'
  popup.setAttribute('role', 'dialog')
  popup.setAttribute('aria-label', 'Erasmus chat assistant')
  popup.innerHTML = `
    <div id="header">
      <div>
        <div id="header-title">Erasmus Assistant</div>
        <div id="header-sub">University of Maribor</div>
      </div>
      <button id="close" aria-label="Close chat">&times;</button>
    </div>
    <div id="msgs"></div>
    <form id="form">
      <input id="input" type="text" placeholder="Ask a question…" autocomplete="off" maxlength="2000"/>
      <button id="send" type="submit">Send</button>
    </form>
  `
  shadow.appendChild(popup)

  const msgsEl = shadow.getElementById('msgs')
  const inputEl = shadow.getElementById('input')
  const sendEl = shadow.getElementById('send')
  const formEl = shadow.getElementById('form')

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderMessages() {
    msgsEl.innerHTML = ''

    if (messages.length === 0) {
      const empty = document.createElement('div')
      empty.style.cssText = 'text-align:center;color:#9ca3af;font-size:13px;padding:32px 16px'
      empty.textContent = 'Ask anything about your Erasmus exchange at the University of Maribor.'
      msgsEl.appendChild(empty)
      return
    }

    messages.forEach((msg) => {
      const bubble = document.createElement('div')
      bubble.id = msg.id ? 'msg-' + msg.id : ''
      bubble.className = 'bubble ' + msg.role

      if (msg.role === 'assistant' && msg.streaming && !msg.content) {
        const text = document.createElement('p')
        text.style.cssText = 'color:#9ca3af'
        text.textContent = 'Thinking…'
        bubble.appendChild(text)
      } else {
        const text = document.createElement('p')
        text.style.cssText = 'white-space:pre-wrap'
        text.textContent = msg.content
        if (msg.streaming) {
          const cursor = document.createElement('span')
          cursor.style.cssText = 'display:inline-block;width:6px;height:14px;background:currentColor;margin-left:2px;opacity:.75;animation:blink .8s step-end infinite'
          text.appendChild(cursor)
        }
        bubble.appendChild(text)
      }

      if (msg.role === 'assistant' && !msg.streaming) {
        // Sources
        if (msg.sources && msg.sources.length > 0) {
          const srcDiv = document.createElement('div')
          srcDiv.className = 'sources'
          const lbl = document.createElement('div')
          lbl.className = 'sources-label'
          lbl.textContent = 'Sources'
          srcDiv.appendChild(lbl)
          const seenTitles = new Set()
          const uniqueSources = msg.sources.filter((s) => {
            if (seenTitles.has(s.title)) return false
            seenTitles.add(s.title)
            return true
          })
          uniqueSources.forEach((s) => {
            if (s.url) {
              const a = document.createElement('a')
              a.href = s.url
              a.target = '_blank'
              a.rel = 'noopener noreferrer'
              a.textContent = s.title
              srcDiv.appendChild(a)
            } else {
              const sp = document.createElement('span')
              sp.style.cssText = 'display:block;font-size:11px;color:#4b5563'
              sp.textContent = s.title
              srcDiv.appendChild(sp)
            }
          })
          bubble.appendChild(srcDiv)
        }

        // Escalation notice
        if (msg.shouldEscalate) {
          const esc = document.createElement('div')
          esc.className = 'escalation'
          esc.innerHTML = '<strong>Need more help?</strong> Contact the <a href="mailto:incoming.erasmus@um.si">International Relations Office</a> directly.'
          bubble.appendChild(esc)
        }

        // Feedback
        if (msg.id && !msg._feedbackDone) {
          const fb = document.createElement('div')
          fb.className = 'feedback'
          const lbl = document.createElement('span')
          lbl.textContent = 'Was this helpful?'
          fb.appendChild(lbl)

          ;['Yes', 'No'].forEach((label) => {
            const fbBtn = document.createElement('button')
            fbBtn.className = 'fb-btn'
            fbBtn.textContent = label
            fbBtn.addEventListener('click', () => {
              const rating = label === 'Yes' ? 'helpful' : 'not_helpful'
              fetch(API_URL + '/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: msg.id, rating }),
              }).catch(() => {})
              msg._feedbackDone = true
              const thanks = document.createElement('span')
              thanks.className = 'fb-thanks'
              thanks.textContent = label === 'Yes' ? 'Thank you.' : 'Thanks, we\'ll use this to improve.'
              fb.innerHTML = ''
              fb.appendChild(thanks)
            })
            fb.appendChild(fbBtn)
          })
          bubble.appendChild(fb)
        }
      }

      msgsEl.appendChild(bubble)
    })
  }

  // Scroll a new assistant message bubble into view from the top
  function scrollToLastAssistant() {
    const bubbles = msgsEl.querySelectorAll('.assistant')
    const last = bubbles[bubbles.length - 1]
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(question) {
    if (!question.trim()) return

    // Build history from settled messages (max 20 turns)
    const history = messages
      .filter((m) => !m.streaming)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }))

    const streamingId = 'stream-' + Date.now()
    messages.push({ id: 'user-' + Date.now(), role: 'user', content: question })
    messages.push({ id: streamingId, role: 'assistant', content: '', streaming: true })
    renderMessages()
    scrollToLastAssistant()
    inputEl.value = ''
    sendEl.disabled = true

    try {
      const res = await fetch(API_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          sessionId: sessionId || undefined,
          language: 'en',
          history,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error('Server error')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const placeholder = messages[messages.length - 1]

      while (true) {
        const result = await reader.read()
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          let event
          try { event = JSON.parse(line) } catch { continue }

          if (event.type === 'delta') {
            placeholder.content += event.content
            // Update just the text node of the streaming bubble for performance
            const bubbleEl = msgsEl.querySelector('#msg-' + streamingId)
            if (bubbleEl) {
              const p = bubbleEl.querySelector('p')
              if (p) {
                // Re-render only the streaming bubble
                p.textContent = placeholder.content
                const cursor = document.createElement('span')
                cursor.style.cssText = 'display:inline-block;width:6px;height:14px;background:currentColor;margin-left:2px;opacity:.75;animation:blink .8s step-end infinite'
                p.appendChild(cursor)
              }
            }
          } else if (event.type === 'done') {
            if (!sessionId) {
              sessionId = event.sessionId
              sessionStorage.setItem('era_session', sessionId)
            }
            placeholder.id = event.messageId
            placeholder.sources = event.sources || []
            placeholder.shouldEscalate = event.shouldEscalate || false
            placeholder.streaming = false
            renderMessages()
          } else if (event.type === 'error') {
            placeholder.content = 'Sorry, something went wrong. Please try again or contact the International Relations Office.'
            placeholder.shouldEscalate = true
            placeholder.streaming = false
            renderMessages()
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          if (event.type === 'done') {
            if (!sessionId) {
              sessionId = event.sessionId
              sessionStorage.setItem('era_session', sessionId)
            }
            placeholder.id = event.messageId
            placeholder.sources = event.sources || []
            placeholder.shouldEscalate = event.shouldEscalate || false
            placeholder.streaming = false
            renderMessages()
          }
        } catch {}
      }
    } catch {
      const placeholder = messages.find((m) => m.id === streamingId)
      if (placeholder) {
        placeholder.content = 'Could not reach the assistant. Please check your connection.'
        placeholder.shouldEscalate = true
        placeholder.streaming = false
      }
      renderMessages()
    }

    sendEl.disabled = false
    inputEl.focus()
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  btn.addEventListener('click', () => {
    open = !open
    popup.classList.toggle('open', open)
    btn.setAttribute('aria-expanded', String(open))
    if (open) {
      renderMessages()
      inputEl.focus()
    }
  })

  shadow.getElementById('close').addEventListener('click', () => {
    open = false
    popup.classList.remove('open')
    btn.setAttribute('aria-expanded', 'false')
  })

  formEl.addEventListener('submit', (e) => {
    e.preventDefault()
    sendMessage(inputEl.value)
  })

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputEl.value)
    }
  })
})()
