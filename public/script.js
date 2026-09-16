const buyButtons = document.querySelectorAll("[data-buy]");

/* Luxury UI audio: soft glass, warm air and restrained interaction feedback. */
let audioContext = null;
let audioUnlocked = false;
let lastHoverAt = 0;
let lastMoveSoundAt = 0;
let lastClickAt = 0;

function getAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  return audioContext;
}

function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  audioUnlocked = true;
}

function luxuryBell(frequency, volume = 0.018, duration = 0.55, detune = 0) {
  if (!audioUnlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  master.gain.setValueAtTime(0.7, now);
  compressor.threshold.value = -34;
  compressor.knee.value = 22;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.28;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  [
    { ratio: 1, level: 1, type: "sine" },
    { ratio: 2.01, level: 0.22, type: "sine" },
    { ratio: 3.99, level: 0.055, type: "triangle" }
  ].forEach((partial, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const f = frequency * partial.ratio;

    osc.type = partial.type;
    osc.frequency.setValueAtTime(f, now);
    osc.detune.setValueAtTime(detune + (index === 1 ? -3 : index === 2 ? 5 : 0), now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(5200, f * 3.2), now);
    filter.Q.value = 0.25;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * partial.level, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(volume * partial.level * 0.28, now + duration * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  });
}

function velvetHover(position = 0.5) {
  if (!audioUnlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const start = 180 + position * 90;
  const end = 300 + position * 280;

  osc.type = "sine";
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + 0.19);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700 + position * 1100, now);
  filter.frequency.exponentialRampToValueAtTime(1500 + position * 1900, now + 0.19);
  filter.Q.value = 0.35;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.0065, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  master.gain.setValueAtTime(0.72, now);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  master.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

function clickSound() {
  const nowMs = performance.now();
  if (nowMs - lastClickAt < 100) return;
  lastClickAt = nowMs;

  /* A soft two-note glass interval instead of a generic beep. */
  luxuryBell(392, 0.020, 0.48, -2);
  window.setTimeout(() => luxuryBell(587.33, 0.008, 0.38, 3), 34);
}

function hoverSound(element, event) {
  const nowMs = performance.now();
  if (nowMs - lastHoverAt < 150) return;
  lastHoverAt = nowMs;

  const rect = element.getBoundingClientRect();
  const position = rect.width > 0
    ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    : 0.5;
  velvetHover(position);
}

document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockAudio, { once: true, passive: true });

const soundElements = document.querySelectorAll("button, a, article, .glass");
soundElements.forEach((element) => {
  element.addEventListener("pointerenter", (event) => {
    hoverSound(element, event);
  }, { passive: true });

  element.addEventListener("pointermove", (event) => {
    const nowMs = performance.now();
    if (nowMs - lastMoveSoundAt < 900) return;
    lastMoveSoundAt = nowMs;
    if (element.matches(":hover")) hoverSound(element, event);
  }, { passive: true });

  element.addEventListener("pointerdown", () => {
    unlockAudio();
    clickSound();
  }, { passive: true });
});

buyButtons.forEach((button) => {
  const original = button.innerHTML;

  button.addEventListener("click", async () => {
    unlockAudio();
    clickSound();
    button.disabled = true;
    button.textContent = "PAYPAL WIRD GELADEN…";

    try {
      const response = await fetch("/api/create-paypal-order", {
        method: "POST",
        headers: { "Accept": "application/json" },
        credentials: "same-origin"
      });

      if (!response.ok) throw new Error("PayPal checkout unavailable");

      const data = await response.json();

      if (!data.url || !data.url.startsWith("https://www.paypal.com/")) {
        throw new Error("Invalid PayPal approval URL");
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.innerHTML = original;
      alert("Der PayPal-Checkout ist momentan nicht erreichbar. Bitte versuche es später erneut.");
    }
  });
});

window.addEventListener("pageshow", () => {
  buyButtons.forEach((button) => {
    button.disabled = false;
  });
});

document.querySelectorAll("[data-modal]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    clickSound();
    document.getElementById(link.dataset.modal)?.classList.add("open");
  });
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      clickSound();
      modal.classList.remove("open");
    }
  });

  modal.querySelector(".close")?.addEventListener("click", () => {
    clickSound();
    modal.classList.remove("open");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clickSound();
    document.querySelectorAll(".modal.open").forEach((modal) => {
      modal.classList.remove("open");
    });
  }
});

document.querySelectorAll(".magnetic").forEach((element) => {
  element.addEventListener("pointermove", (event) => {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    element.style.transform = "translate(" + (x * 0.08) + "px," + (y * 0.08) + "px)";
  });

  element.addEventListener("pointerleave", () => {
    element.style.transform = "";
  });
});
