(function () {
  const bootstrap = window.CARBOARD_BOOTSTRAP || {};
  const headerGrid = document.getElementById("header-grid");
  const refreshPinsButton = document.getElementById("refresh-pins");
  const refreshCameraButton = document.getElementById("refresh-camera");
  const toggleCameraButton = document.getElementById("toggle-camera");
  const restartButton = document.getElementById("restart-pi");
  const statusToast = document.getElementById("status-toast");
  const cameraStream = document.getElementById("camera-stream");
  const cameraOverlay = document.getElementById("camera-overlay");
  const cameraHealth = document.getElementById("camera-health");
  const cameraStatusLabel = document.getElementById("camera-status-label");
  const cameraModeLabel = document.getElementById("camera-mode-label");
  const cameraStreamUrl = cameraStream ? (cameraStream.dataset.streamUrl || "/stream.mjpg") : "/stream.mjpg";
  const pinDetail = document.getElementById("pin-detail");
  const detailPlaceholder = document.getElementById("detail-placeholder");
  const detailName = document.getElementById("detail-name");
  const detailBcm = document.getElementById("detail-bcm");
  const detailPhys = document.getElementById("detail-phys");
  const detailBadge = document.getElementById("detail-badge");
  const detailNote = document.getElementById("detail-note");
  const detailState = document.getElementById("detail-state");
  const detailToggle = document.getElementById("detail-toggle");
  const pwmControls = document.getElementById("pwm-controls");
  const pwmDuty = document.getElementById("pwm-duty");
  const pwmDutyVal = document.getElementById("pwm-duty-val");
  const pwmFreq = document.getElementById("pwm-freq");
  const pwmApply = document.getElementById("pwm-apply");

  const fullscreenButton = document.getElementById("fullscreen-camera");
  const cameraPanel = document.getElementById("camera-panel");

  let pins = Array.isArray(bootstrap.pins) ? bootstrap.pins : [];
  let selectedBcm = null;
  let cameraEnabled = true;
  let toastTimer = null;

  function setDetailVisibility(hasSelection) {
    if (detailPlaceholder) {
      detailPlaceholder.hidden = hasSelection;
      detailPlaceholder.style.display = hasSelection ? "none" : "flex";
    }
    if (pinDetail) {
      pinDetail.hidden = !hasSelection;
      pinDetail.style.display = hasSelection ? "flex" : "none";
    }
  }

  function setPwmVisibility(isVisible) {
    if (!pwmControls) return;
    pwmControls.hidden = !isVisible;
    pwmControls.style.display = isVisible ? "flex" : "none";
  }

  // Accent color map
  const ACCENT_COLORS = {
    digital: "var(--accent-digital)",
    i2c: "var(--accent-i2c)",
    uart: "var(--accent-uart)",
    spi: "var(--accent-spi)",
    pwm: "var(--accent-pwm)",
    pcm: "var(--accent-pcm)",
    clock: "var(--accent-clock)",
    reserved: "var(--accent-reserved)",
    power: "var(--accent-power)",
    gnd: "var(--accent-gnd)",
  };

  // Full 40-pin physical header map
  const PHYSICAL_PIN_MAP = {
    1:  { label: "3V3 Power",  type: "power" },
    2:  { label: "5V Power",   type: "power" },
    3:  { bcm: 2 },
    4:  { label: "5V Power",   type: "power" },
    5:  { bcm: 3 },
    6:  { label: "Ground",     type: "gnd" },
    7:  { bcm: 4 },
    8:  { bcm: 14 },
    9:  { label: "Ground",     type: "gnd" },
    10: { bcm: 15 },
    11: { bcm: 17 },
    12: { bcm: 18 },
    13: { bcm: 27 },
    14: { label: "Ground",     type: "gnd" },
    15: { bcm: 22 },
    16: { bcm: 23 },
    17: { label: "3V3 Power",  type: "power" },
    18: { bcm: 24 },
    19: { bcm: 10 },
    20: { label: "Ground",     type: "gnd" },
    21: { bcm: 9 },
    22: { bcm: 25 },
    23: { bcm: 11 },
    24: { bcm: 8 },
    25: { label: "Ground",     type: "gnd" },
    26: { bcm: 7 },
    27: { bcm: 0 },
    28: { bcm: 1 },
    29: { bcm: 5 },
    30: { label: "Ground",     type: "gnd" },
    31: { bcm: 6 },
    32: { bcm: 12 },
    33: { bcm: 13 },
    34: { label: "Ground",     type: "gnd" },
    35: { bcm: 19 },
    36: { bcm: 16 },
    37: { bcm: 26 },
    38: { bcm: 20 },
    39: { label: "Ground",     type: "gnd" },
    40: { bcm: 21 },
  };

  const PWM_PINS = new Set([12, 13, 18, 19]);

  function findPin(bcmPin) {
    return pins.find(function (p) { return p.bcm_pin === bcmPin; });
  }

  // ── Status toast ──
  function showStatus(message, level) {
    if (!statusToast) return;
    statusToast.textContent = message;
    statusToast.className = "status-toast visible";
    if (level) statusToast.classList.add(level);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      statusToast.classList.remove("visible");
    }, 3000);
  }

  // ── Pin header grid (horizontal: 20 cols x 2 rows) ──
  function renderHeaderGrid() {
    if (!headerGrid) return;
    var html = "";
    // Row 1: odd pins (1, 3, 5, ..., 39) -- top row
    for (var col = 0; col < 20; col++) {
      html += renderPinDot(col * 2 + 1);
    }
    // Row 2: even pins (2, 4, 6, ..., 40) -- bottom row
    for (var col = 0; col < 20; col++) {
      html += renderPinDot(col * 2 + 2);
    }
    headerGrid.innerHTML = html;
  }

  function renderPinDot(physPin) {
    var spec = PHYSICAL_PIN_MAP[physPin];
    if (!spec) return "";

    var isStatic = !spec.bcm && spec.bcm !== 0;
    var label = spec.label || "";
    var color = "";
    var classes = ["pin-dot"];
    var bcmPin = null;

    if (isStatic) {
      color = ACCENT_COLORS[spec.type] || ACCENT_COLORS.digital;
      label = spec.label;
    } else {
      bcmPin = spec.bcm;
      var pin = findPin(bcmPin);
      if (pin) {
        color = ACCENT_COLORS[pin.accent] || ACCENT_COLORS.digital;
        label = "BCM " + bcmPin + " - " + (pin.label || "GPIO" + bcmPin);
        if (pin.state) classes.push("is-on");
        if (pin.pwm) classes.push("is-pwm-active");
        if (bcmPin === selectedBcm) classes.push("is-selected");
      } else {
        color = ACCENT_COLORS.digital;
        label = "BCM " + bcmPin;
      }
    }

    var tag = isStatic ? "div" : "button";
    var dataAttr = isStatic ? "" : ' data-bcm-pin="' + bcmPin + '"';
    var title = "Pin " + physPin + ": " + label;

    return "<" + tag + ' class="' + classes.join(" ") + '"' +
      ' style="background:' + color + ';color:' + color + '"' +
      dataAttr +
      ' title="' + title.replace(/"/g, "&quot;") + '"' +
      "></" + tag + ">";
  }

  // ── Pin detail panel ──
  function showPinDetail(bcmPin) {
    var pin = findPin(bcmPin);
    if (!pin) return;

    selectedBcm = bcmPin;
    setDetailVisibility(true);

    var accentColor = ACCENT_COLORS[pin.accent] || ACCENT_COLORS.digital;
    detailName.textContent = pin.label || "GPIO" + pin.bcm_pin;
    detailName.style.color = accentColor;
    detailBcm.textContent = pin.bcm_pin;
    detailPhys.textContent = pin.physical_pin;
    detailBadge.textContent = pin.accent || "digital";
    detailBadge.style.color = accentColor;
    detailBadge.style.borderColor = accentColor;
    detailNote.textContent = pin.note || pin.function_label || "General-purpose digital I/O";

    updateDetailState(pin);

    // PWM controls
    var isPwm = PWM_PINS.has(bcmPin);
    setPwmVisibility(isPwm);
    if (isPwm && pin.pwm) {
      pwmDuty.value = pin.pwm.duty_cycle;
      pwmDutyVal.textContent = pin.pwm.duty_cycle + "%";
      pwmFreq.value = pin.pwm.frequency;
    } else if (isPwm) {
      pwmDutyVal.textContent = pwmDuty.value + "%";
    }

    renderHeaderGrid();
  }

  function updateDetailState(pin) {
    if (!pin) return;
    if (pin.pwm) {
      detailState.textContent = "PWM " + pin.pwm.duty_cycle + "% @ " + pin.pwm.frequency + " Hz";
      detailState.className = "pin-detail-state is-on";
    } else if (!pin.controllable) {
      detailState.textContent = "Reserved";
      detailState.className = "pin-detail-state is-off";
    } else {
      detailState.textContent = pin.state ? "Output High" : "Output Low";
      detailState.className = "pin-detail-state " + (pin.state ? "is-on" : "is-off");
    }

    if (pin.controllable) {
      detailToggle.disabled = false;
      detailToggle.textContent = pin.state ? "Switch Low" : "Switch High";
      detailToggle.className = "pin-toggle" + (pin.state ? " is-on" : "");
    } else {
      detailToggle.disabled = true;
      detailToggle.textContent = "Locked";
      detailToggle.className = "pin-toggle";
    }
  }

  // ── API helpers ──
  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload.error || "Request failed (" + response.status + ")");
    }
    return payload;
  }

  async function refreshPins() {
    try {
      var payload = await fetchJson("/api/pins");
      pins = payload.pins || [];
      renderHeaderGrid();
      if (selectedBcm !== null) {
        showPinDetail(selectedBcm);
      }
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  async function updatePin(bcmPin, value) {
    try {
      var payload = await fetchJson("/api/pins/" + bcmPin, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value }),
      });
      pins = pins.map(function (pin) {
        if (pin.bcm_pin === bcmPin) {
          return Object.assign({}, pin, { state: payload.state, pwm: null });
        }
        return pin;
      });
      renderHeaderGrid();
      if (selectedBcm === bcmPin) {
        showPinDetail(bcmPin);
      }
      showStatus("BCM " + bcmPin + " set " + (payload.state ? "HIGH" : "LOW") + ".", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  async function applyPwm(bcmPin, frequency, dutyCycle) {
    try {
      var payload = await fetchJson("/api/pins/" + bcmPin + "/pwm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: frequency, duty_cycle: dutyCycle }),
      });
      pins = pins.map(function (pin) {
        if (pin.bcm_pin === bcmPin) {
          return Object.assign({}, pin, { state: false, pwm: payload.pwm });
        }
        return pin;
      });
      renderHeaderGrid();
      if (selectedBcm === bcmPin) {
        showPinDetail(bcmPin);
      }
      showStatus("BCM " + bcmPin + " PWM: " + dutyCycle + "% @ " + frequency + " Hz", "success");
    } catch (error) {
      showStatus(error.message, "error");
    }
  }

  async function refreshCamera() {
    try {
      var payload = await fetchJson("/api/camera");
      var available = Boolean(payload.available);
      cameraEnabled = payload.enabled !== false;

      if (!cameraEnabled) {
        cameraHealth.textContent = "Camera disabled";
        cameraStatusLabel.textContent = "Disabled";
        if (cameraModeLabel) cameraModeLabel.textContent = "Feed halted";
        if (toggleCameraButton) toggleCameraButton.textContent = "Enable Camera";
        cameraOverlay.classList.remove("hidden");
        cameraOverlay.innerHTML = "<p>Camera feed is manually disabled.</p>";
        cameraStream.removeAttribute("src");
      } else if (available) {
        cameraHealth.textContent = "Camera online";
        cameraStatusLabel.textContent = "Online";
        if (cameraModeLabel) cameraModeLabel.textContent = "Live feed armed";
        if (toggleCameraButton) toggleCameraButton.textContent = "Disable Camera";
        cameraOverlay.classList.add("hidden");
        cameraStream.src = cameraStreamUrl + "?ts=" + Date.now();
      } else {
        cameraHealth.textContent = "Camera offline";
        cameraStatusLabel.textContent = "Offline";
        if (cameraModeLabel) cameraModeLabel.textContent = "No sensor detected";
        if (toggleCameraButton) toggleCameraButton.textContent = "Enable Camera";
        cameraOverlay.classList.remove("hidden");
        cameraOverlay.innerHTML = "<p>Camera detected as unavailable.</p>";
        cameraStream.removeAttribute("src");
      }
    } catch (error) {
      cameraStatusLabel.textContent = "Error";
      if (cameraModeLabel) cameraModeLabel.textContent = "Camera check failed";
      cameraOverlay.classList.remove("hidden");
      cameraOverlay.innerHTML = "<p>" + error.message + "</p>";
      cameraStream.removeAttribute("src");
    }
  }

  async function toggleCamera() {
    if (!toggleCameraButton) return;
    toggleCameraButton.disabled = true;
    try {
      var payload = await fetchJson("/api/camera", {
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
    var confirmed = window.confirm(
      "Restart the Raspberry Pi now? This will interrupt the dashboard briefly."
    );
    if (!confirmed) return;

    restartButton.disabled = true;
    try {
      var payload = await fetchJson("/api/system/restart", { method: "POST" });
      showStatus(payload.message || "Restart command sent.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      window.setTimeout(function () {
        restartButton.disabled = false;
      }, 2500);
    }
  }

  // ── Event listeners ──
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

  // Pin dot clicks on the header grid
  if (headerGrid) {
    headerGrid.addEventListener("click", function (event) {
      var dot = event.target.closest("button.pin-dot");
      if (!dot) return;
      var bcmPin = Number(dot.dataset.bcmPin);
      if (isNaN(bcmPin)) return;
      showPinDetail(bcmPin);
    });
  }

  // Detail toggle button
  if (detailToggle) {
    detailToggle.addEventListener("click", function () {
      if (selectedBcm === null) return;
      var pin = findPin(selectedBcm);
      if (!pin || !pin.controllable) return;
      updatePin(selectedBcm, !pin.state);
    });
  }

  // PWM duty cycle slider
  if (pwmDuty) {
    pwmDuty.addEventListener("input", function () {
      pwmDutyVal.textContent = pwmDuty.value + "%";
    });
  }

  // PWM apply button
  if (pwmApply) {
    pwmApply.addEventListener("click", function () {
      if (selectedBcm === null) return;
      var frequency = parseFloat(pwmFreq.value);
      var dutyCycle = parseFloat(pwmDuty.value);
      if (isNaN(frequency) || isNaN(dutyCycle)) return;
      applyPwm(selectedBcm, frequency, dutyCycle);
    });
  }

  // Fullscreen camera
  if (fullscreenButton && cameraPanel) {
    fullscreenButton.addEventListener("click", function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        cameraPanel.requestFullscreen().catch(function () {});
      }
    });
  }

  // Camera stream events
  if (cameraStream) {
    cameraStream.addEventListener("load", function () {
      cameraOverlay.classList.add("hidden");
      cameraHealth.textContent = "Camera online";
      cameraStatusLabel.textContent = "Online";
    });

    cameraStream.addEventListener("error", function () {
      cameraOverlay.classList.remove("hidden");
      cameraOverlay.innerHTML = "<p>Camera stream could not be loaded.</p>";
      cameraHealth.textContent = "Camera offline";
      cameraStatusLabel.textContent = "Offline";
    });
  }

  // ── Init ──
  renderHeaderGrid();
  setDetailVisibility(false);
  setPwmVisibility(false);
  refreshPins();
  refreshCamera();
})();
