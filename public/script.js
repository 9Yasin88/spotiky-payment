```javascript
const buyButtons = document.querySelectorAll("[data-buy]");

buyButtons.forEach((button) => {
  const originalHTML = button.innerHTML;

  button.addEventListener("click", async () => {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "PAYPAL WIRD GELADEN…";

    try {
      const response = await fetch("/api/create-paypal-order", {
        method: "POST",
        headers: {
          "Accept": "application/json"
        },
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("PayPal checkout unavailable");
      }

      const data = await response.json();

      if (!data.url || !data.url.startsWith("https://www.paypal.com/")) {
        throw new Error("Invalid PayPal approval URL");
      }

      window.location.href = data.url;

    } catch (error) {
      console.error(error);

      button.disabled = false;
      button.innerHTML = originalHTML;

      alert("Der PayPal-Checkout ist momentan nicht erreichbar. Bitte versuche es später erneut.");
    }
  });
});

/* Button beim Zurückkehren von PayPal wieder aktivieren */
window.addEventListener("pageshow", function () {
  buyButtons.forEach((button) => {
    button.disabled = false;
    button.removeAttribute("disabled");

    if (button.textContent === "PAYPAL WIRD GELADEN…") {
      button.innerHTML = button.dataset.originalText || "PACK FÜR 5,00 €";
    }
  });
});

document.querySelectorAll("[data-modal]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById(link.dataset.modal)?.classList.add("open");
  });
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });

  modal.querySelector(".close")?.addEventListener("click", () => {
    modal.classList.remove("open");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
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

    element.style.transform =
      `translate(${x * 0.08}px,${y * 0.08}px)`;
  });

  element.addEventListener("pointerleave", () => {
    element.style.transform = "";
  });
});
```
