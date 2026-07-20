const GLYPHS = {
  idle: `<svg class="status-glyph" viewBox="0 0 144 144" aria-hidden="true"><circle class="idle" cx="72" cy="72" r="31"/></svg>`,
  unread: `<svg class="status-glyph" viewBox="0 0 144 144" aria-hidden="true"><circle class="unread" cx="72" cy="72" r="34"/></svg>`,
  working: `<svg class="status-glyph" viewBox="0 0 144 144" aria-hidden="true"><circle class="working" cx="72" cy="72" r="34"/></svg>`,
  needs: `<svg class="status-glyph" viewBox="0 0 144 144" aria-hidden="true"><path class="needs-user" d="M72 38 105.5 96h-67Z"/></svg>`,
  error: `<svg class="status-glyph" viewBox="0 0 144 144" aria-hidden="true"><circle class="error-fill" cx="72" cy="72" r="34"/><path class="error-x" d="m58 58 28 28m0-28L58 86"/></svg>`,
  mic: `<svg viewBox="0 0 144 144" aria-hidden="true"><g class="mic" fill="none"><rect x="58" y="37" width="28" height="49" rx="14"/><path d="M48 69v4a24 24 0 0 0 48 0v-4M72 97v9m-14 0h28"/></g></svg>`
};

const mark = `<span class="chrome-mark" aria-hidden="true"><svg viewBox="0 0 34 34"><circle cx="17" cy="17" r="11.5"/></svg></span>`;

function chrome() {
  return `<div class="chrome plugin-name">${mark}<span>Codex Status &amp; Actions</span></div>`;
}

function key(content, classes = "") {
  return `<div class="key ${classes}">${content}</div>`;
}

function statusItem(state, label) {
  return `<div class="status-item">${key(GLYPHS[state])}<span class="status-label">${label}</span></div>`;
}

function deckMockup() {
  const keys = [
    key(`<div class="mini-usage"><span>5H</span><strong>82%</strong></div>`),
    key(`<div class="mini-usage"><span>WK</span><strong>96%</strong></div>`),
    key(
      `<div class="mini-usage"><span>WK</span><strong style="color:var(--green)">17%</strong><em>Behind</em></div>`
    ),
    key("", "deck-empty"),
    key("", "deck-empty"),
    key(GLYPHS.working),
    key(GLYPHS.unread),
    key(GLYPHS.needs),
    key(GLYPHS.idle),
    key(GLYPHS.idle),
    key(GLYPHS.mic),
    key("", "deck-empty"),
    key("", "deck-empty"),
    key("", "deck-empty"),
    key("", "deck-empty")
  ];
  return `<div class="deck" aria-label="Stream Deck-style grid showing plugin actions"><div class="deck-grid">${keys.join("")}</div></div>`;
}

function thumbnail() {
  return `<section class="slide thumbnail-layout">
    ${chrome()}
    <div class="hero-copy">
      <p class="eyebrow">Codex on Stream Deck</p>
      <h1>Keep Codex within reach.</h1>
      <p class="lede">Live task status, usage, and dictation—right on your keys.</p>
    </div>
    ${deckMockup()}
  </section>`;
}

function readmeHero() {
  return `<section class="slide readme-hero-layout">
    <h1>Codex Status &amp; Actions</h1>
    ${deckMockup()}
  </section>`;
}

function status() {
  return `<section class="slide status-layout">
    ${chrome()}
    <div class="hero-copy">
      <p class="eyebrow">Codex Status</p>
      <h1>See when Codex needs you.</h1>
    </div>
    <div class="status-strip">
      ${statusItem("idle", "Idle")}
      ${statusItem("working", "Working")}
      ${statusItem("needs", "Needs you")}
      ${statusItem("unread", "Unread")}
      ${statusItem("error", "Error")}
    </div>
  </section>`;
}

function usage() {
  return `<section class="slide usage-layout">
    ${chrome()}
    <div class="hero-copy">
      <p class="eyebrow">Codex Usage</p>
      <h1>Know what you have left.</h1>
      <p class="lede">View remaining, used, or pace across the limits available to your account.</p>
      <div class="feature-tags"><span class="feature-tag">Single or double</span><span class="feature-tag">Automatic refresh</span></div>
    </div>
    <div class="usage-stage" aria-label="Three Codex Usage key variants">
      <div class="usage-key usage-key--na"><div class="usage-window">5H</div><div class="usage-value">N/A</div></div>
      <div class="usage-key usage-key--remaining"><div class="usage-window">WK</div><div class="usage-value">75%</div><div class="usage-support">5d 22h</div></div>
      <div class="usage-key usage-key--pace"><div class="usage-window">WK</div><div class="usage-value">15%</div><div class="usage-support">Behind</div></div>
    </div>
  </section>`;
}

function dictation() {
  return `<section class="slide dictation-layout">
    ${chrome()}
    <div class="hero-copy">
      <p class="eyebrow">Codex Dictation</p>
      <h1>Speak. Review. Send.</h1>
      <p class="lede">Hold or toggle a key to dictate into the selected task. Your draft stays editable.</p>
      <div class="feature-tags"><span class="feature-tag">Codex handles audio</span><span class="feature-tag">Never auto-submits</span></div>
    </div>
    <div class="dictation-stage">
      ${key(GLYPHS.mic, "key--large dictation-key")}
      <div class="signal-line" aria-hidden="true"></div>
      <div class="composer" aria-label="Editable dictated draft">
        <div class="composer-label">Selected task · Draft</div>
        <div class="composer-text">Turn the latest status findings into a concise release note.<span class="cursor"></span></div>
        <div class="composer-footer"><span>Editable before sending</span><span class="send-chip">↑</span></div>
      </div>
    </div>
  </section>`;
}

function icon() {
  document.documentElement.style.minWidth = "288px";
  document.documentElement.style.minHeight = "288px";
  document.body.style.minWidth = "288px";
  document.body.style.minHeight = "288px";
  return `<section class="slide icon-layout"><div class="icon-mark"><svg viewBox="0 0 212 212" aria-hidden="true"><circle class="icon-spinner" cx="106" cy="106" r="52"/></svg></div></section>`;
}

const slides = { thumbnail, readmeHero, status, usage, dictation, icon };
const name = new URLSearchParams(window.location.search).get("slide") || "thumbnail";
const renderer = Object.prototype.hasOwnProperty.call(slides, name) ? slides[name] : thumbnail;
document.getElementById("slide").outerHTML = renderer();
