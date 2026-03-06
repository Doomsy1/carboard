(function () {
  const bootstrap = window.CARBOARD_BOOTSTRAP || {};
  const pinsGrid = document.getElementById("pins-grid");
  const refreshPinsButton = document.getElementById("refresh-pins");
  const refreshCameraButton = document.getElementById("refresh-camera");
  const toggleCameraButton = document.getElementById("toggle-camera");
  const restartButton = document.getElementById("restart-pi");
  const statusBanner = document.getElementById("status-banner");
  const cameraStream = document.getElementById("camera-stream");
  const cameraOverlay = document.getElementById("camera-overlay");
  const cameraHealth = document.getElementById("camera-health");
  const cameraStatusLabel = document.getElementById("camera-status-label");

  let pins = Array.isArray(bootstrap.pins) ? bootstrap.pins : [];
  let cameraEnabled = true;

  function showStatus(message, level) {
    if (!statusBanner) return;
    statusBanner.hidden = false;
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    if (level) {
      statusBanner.classList.add(level);
    }
  }

  function hideStatus() {
    if (!statusBanner) return;
    statusBanner.hidden = true;
    statusBanner.textContent = "";
    statusBanner.className = "status-banner";
  }

  function pinStateLabel(pin) {
    if (!pin.controllable) return "Reserved";
    return pin.state ? "Output High" : "Output Low";
  }

  function pinButtonLabel(pin) {
    if (!pin.controllable) return "Locked";
    return pin.state ? "Switch Low" : "Switch High";
  }

  function renderPins() {
    if (!pinsGrid) return;
    if (!pins.length) {
      pinsGrid.innerHTML =
        '<article class="pin-card is-reserved"><p class="pin-note">No pins reported yet. Refresh the board state.</p></article>';
      return;
    }

    pinsGrid.innerHTML = pins
      .map((pin) => {
        const classes = [
          "pin-card",
          pin.state ? "is-on" : "",
          !pin.controllable ? "is-reserved" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const chipClasses = ["pin-chip", pin.state ? "live" : "", !pin.controllable ? "locked" : ""]
          .filter(Boolean)
          .join(" ");
        const note = pin.note || pin.function_label || "General-purpose digital I/O";
        return `
          <article class="${classes}">
            <div class="pin-meta">
              <div>
                <p>BCM ${pin.bcm_pin}</p>
                <h3>Pin ${pin.physical_pin}</h3>
              </div>
              <span class="${chipClasses}">${pinStateLabel(pin)}</span>
            </div>
            <p class="pin-state">${pin.function_label || "GPIO"}</p>
            <p class="pin-note">${note}</p>
            <button
              type="button"
              class="pin-toggle"
              data-bcm-pin="${pin.bcm_pin}"
              ${pin.controllable ? "" : "disabled"}
            >
              ${pinButtonLabel(pin)}
            </button>
          </article>
        `;
      })
      .join("");
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  async function refreshPins() {
    try {
      const payload = await fetchJson("/api/pins");
      pins = payload.pins || [];
      renderPins();
      hideStatus();
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  async function updatePin(bcmPin, value) {
    try {
      const payload = await fetchJson(`/api/pins/${bcmPin}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      pins = pins.map((pin) =>
        pin.bcm_pin === bcmPin ? { ...pin, state: payload.state } : pin
      );
      renderPins();
      showStatus(`BCM ${bcmPin} set ${payload.state ? "HIGH" : "LOW"}.`, "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  async function refreshCamera() {
    try {
      const payload = await fetchJson("/api/camera");
      const available = Boolean(payload.available);
      cameraEnabled = payload.enabled !== false;
      if (!cameraEnabled) {
        cameraHealth.textContent = "Camera disabled";
        cameraStatusLabel.textContent = "Disabled";
        cameraOverlay.classList.remove("hidden");
        cameraOverlay.innerHTML = "<p>Camera feed is manually disabled.</p>";
        cameraStream.removeAttribute("src");
      } else if (available) {
        cameraHealth.textContent = "Camera online";
        cameraStatusLabel.textContent = "Online";
        cameraOverlay.classList.add("hidden");
        cameraStream.src = `/stream.mjpg?ts=${Date.now()}`;
      } else {
        cameraHealth.textContent = "Camera offline";
        cameraStatusLabel.textContent = "Offline";
        cameraOverlay.classList.remove("hidden");
        cameraOverlay.innerHTML = "<p>Camera detected as unavailable.</p>";
      }
      if (toggleCameraButton) {
        toggleCameraButton.textContent = cameraEnabled ? "Disable Camera" : "Enable Camera";
      }
    } catch (error) {
      cameraStatusLabel.textContent = "Error";
      cameraOverlay.classList.remove("hidden");
      cameraOverlay.innerHTML = `<p>${error.message}</p>`;
    }
  }

  async function toggleCamera() {
    if (!toggleCameraButton) return;
    toggleCameraButton.disabled = true;
    try {
      const payload = await fetchJson("/api/camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !cameraEnabled }),
      });
      cameraEnabled = payload.enabled !== false;
      showStatus(
        cameraEnabled ? "Camera feed enabled." : "Camera feed disabled.",
        "success"
      );
      await refreshCamera();
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      toggleCameraButton.disabled = false;
    }
  }

  async function restartPi() {
    const confirmed = window.confirm(
      "Restart the Raspberry Pi now? This will interrupt the dashboard briefly."
    );
    if (!confirmed) return;

    restartButton.disabled = true;
    try {
      const payload = await fetchJson("/api/system/restart", { method: "POST" });
      showStatus(payload.message || "Restart command sent to Raspberry Pi.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      window.setTimeout(() => {
        restartButton.disabled = false;
      }, 2500);
    }
  }

  if (refreshPinsButton) {
    refreshPinsButton.addEventListener("click", refreshPins);
  }

  if (refreshCameraButton) {
    refreshCameraButton.addEventListener("click", refreshCamera);
  }

  if (toggleCameraButton) {
    toggleCameraButton.addEventListener("click", toggleCamera);
  }

  if (restartButton) {
    restartButton.addEventListener("click", restartPi);
  }

  if (pinsGrid) {
    pinsGrid.addEventListener("click", (event) => {
      const button = event.target.closest(".pin-toggle");
      if (!button) return;
      const bcmPin = Number(button.dataset.bcmPin);
      const pin = pins.find((entry) => entry.bcm_pin === bcmPin);
      if (!pin || !pin.controllable) return;
      updatePin(bcmPin, !pin.state);
    });
  }

  if (cameraStream) {
    cameraStream.addEventListener("load", () => {
      cameraOverlay.classList.add("hidden");
      cameraHealth.textContent = "Camera online";
      cameraStatusLabel.textContent = "Online";
    });

    cameraStream.addEventListener("error", () => {
      cameraOverlay.classList.remove("hidden");
      cameraOverlay.innerHTML = "<p>Camera stream could not be loaded.</p>";
      cameraHealth.textContent = "Camera offline";
      cameraStatusLabel.textContent = "Offline";
    });
  }

  renderPins();
  refreshPins();
  refreshCamera();
})();
