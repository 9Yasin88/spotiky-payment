const buyButtons = document.querySelectorAll("[data-buy]");

/* Sanfte, beruhigende UI-Sounds – werden erst nach der ersten Nutzerinteraktion aktiviert. */
let audioContext = null;
let audioUnlocked = false;

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
  if (ctx.state === "suspended") ctx.resume();
  audioUnlocked = true;
}

function softTone(frequency, duration = 0.11, volume = 0.025) {
  if (!audioUnlocked) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.96), now + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.value = 0.35;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function hoverSound() {
  softTone(520, 0.10, 0.018);
}

function clickSound() {
  softTone(260, 0.16, 0.028);
  window.setTimeout(() => softTone(390, 0.13, 0.018), 35);
}

document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockAudio, { once: true, passive: true });

/* Ruhiger Hover-/Swipe-Sound für Buttons und Links. Pro Element nur einmal pro Hover. */
const soundElements = document.querySelectorAll("button, a, article, .glass");
soundElements.forEach((element) => {
  element.addEventListener("pointerenter", () => {
    if (element.matches("button, a, article, .glass")) hoverSound();
  });

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

/* Wenn man von PayPal zurückkommt, Buttons wieder aktivieren */
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
