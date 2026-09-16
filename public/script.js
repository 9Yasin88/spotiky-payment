const buyButtons = document.querySelectorAll("[data-buy]");

/* Premium ambient UI audio — deliberately subtle, layered and non-annoying. */
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

function createMasterChain(ctx, now) {
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const filter = ctx.createBiquadFilter();

  master.gain.setValueAtTime(0.42, now);
  compressor.threshold.value = -30;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4200, now);
  filter.Q.value = 0.35;

  master.connect(compressor);
  compressor.connect(filter);
  filter.connect(ctx.destination);
  return master;
}

function premiumChime(baseFrequency, brightness = 0.5, volume = 0.035, duration = 0.28) {
  if (!audioUnlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const master = createMasterChain(ctx, now);
  const frequencies = [baseFrequency, baseFrequency * 1.5, baseFrequency * 2.01];

  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const partialVolume = volume * (index === 0 ? 1 : index === 1 ? 0.42 : 0.14) * (0.8 + brightness * 0.2);

    osc.type = index === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(frequency, now);
    osc.detune.setValueAtTime(index === 1 ? -4 : index === 2 ? 7 : 0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(90, frequency * 0.985), now + duration);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100 + brightness * 3500, now);
    filter.Q.value = 0.45;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(partialVolume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(partialVolume * 0.18, now + duration * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  });
}

function premiumWhoosh(position = 0.5) {
  if (!audioUnlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const master = createMasterChain(ctx, now);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  const start = 220 + position * 180;
  const end = 520 + position * 900;
  osc.type = "sine";
  osc.frequency.setValueAtTime(start, now);
  osc.frequency.exponentialRampToValueAtTime(end, now + 0.14);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1000 + position * 2800, now);
  filter.frequency.exponentialRampToValueAtTime(2800 + position * 2600, now + 0.14);
  filter.Q.value = 0.5;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.012, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.19);
}

function hoverSound(element, event) {
  const nowMs = performance.now();
  if (nowMs - lastHoverAt < 110) return;
  lastHoverAt = nowMs;

  const rect = element.getBoundingClientRect();
  const position = rect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0.5;
  premiumWhoosh(position);
}

function clickSound() {
  const nowMs = performance.now();
  if (nowMs - lastClickAt < 70) return;
  lastClickAt = nowMs;

  premiumChime(196, 0.45, 0.028, 0.32);
  window.setTimeout(() => premiumChime(294, 0.72, 0.015, 0.24), 26);
}

document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockAudio, { once: true, passive: true });

const soundElements = document.querySelectorAll("button, a, article, .glass");
soundElements.forEach((element) => {
  element.addEventListener("pointerenter", (event) => {
    if (element.matches("button, a, article, .glass")) hoverSound(element, event);
  }, { passive: true });

  element.addEventListener("pointermove", (event) => {
    if (!element.matches("button, a, article, .glass")) return;
    const nowMs = performance.now();
    if (nowMs - lastMoveSoundAt < 520) return;
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
