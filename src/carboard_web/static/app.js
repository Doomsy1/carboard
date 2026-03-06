(function () {
  const bootstrap = window.CARBOARD_BOOTSTRAP || {};
  const headerGrid = document.getElementById("header-grid");
  const refreshPinsButton = document.getElementById("refresh-pins");
  const refreshCameraButton = document.getElementById("refresh-camera");
  const restartButton = document.getElementById("restart-pi");
  const statusToast = document.getElementById("status-toast");
  const cameraStream = document.getElementById("camera-stream");
  const cameraOverlay = document.getElementById("camera-overlay");
  const cameraHealth = document.getElementById("camera-health");
  const cameraStatusLabel = document.getElementById("camera-status-label");
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

  let pins = Array.isArray(bootstrap.pins) ? bootstrap.pins : [];
  let selectedBcm = null;
  let toastTimer = null;

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

  // ── Pin header grid ──
  function renderHeaderGrid() {
    if (!headerGrid) return;
    var html = "";
    for (var row = 0; row < 20; row++) {
      var leftPhys = row * 2 + 1;
      var rightPhys = row * 2 + 2;
      html += renderPinDot(leftPhys, false);
      html += renderPinDot(rightPhys, true);
    }
    headerGrid.innerHTML = html;
  }

  function renderPinDot(physPin, isRight) {
    var spec = PHYSICAL_PIN_MAP[physPin];
    if (!spec) return "";

    var isStatic = !spec.bcm && spec.bcm !== 0;
    var label = spec.label || "";
    var type = spec.type || "";
    var color = "";
    var classes = ["pin-dot"];
    var bcmPin = null;

    if (isStatic) {
      color = ACCENT_COLORS[type] || ACCENT_COLORS.digital;
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

    var wrapClass = "pin-dot-wrap" + (isRight ? " right-col" : "");
    var tag = isStatic ? "div" : "button";
    var dataAttr = isStatic ? "" : ' data-bcm-pin="' + bcmPin + '"';

    return '<div class="' + wrapClass + '">' +
      "<" + tag + ' class="' + classes.join(" ") + '"' +
      ' style="background:' + color + ';color:' + color + '"' +
      dataAttr +
      ' title="Pin ' + physPin + ": " + label + '"' +
      "></" + tag + ">" +
      '<span class="pin-tooltip">Pin ' + physPin + ": " + label + "</span>" +
      "</div>";
  }

  // ── Pin detail panel ──
  function showPinDetail(bcmPin) {
    var pin = findPin(bcmPin);
    if (!pin) return;

    selectedBcm = bcmPin;

    if (detailPlaceholder) detailPlaceholder.hidden = true;
    if (pinDetail) pinDetail.hidden = false;

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
    if (pwmControls) {
      pwmControls.hidden = !isPwm;
      if (isPwm && pin.pwm) {
        pwmDuty.value = pin.pwm.duty_cycle;
        pwmDutyVal.textContent = pin.pwm.duty_cycle + "%";
        pwmFreq.value = pin.pwm.frequency;
      }
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
      cameraHealth.textContent = available ? "Camera online" : "Camera offline";
      cameraStatusLabel.textContent = available ? "Online" : "Offline";
      if (available) {
        cameraOverlay.classList.add("hidden");
        cameraStream.src = "/stream.mjpg?ts=" + Date.now();
      } else {
        cameraOverlay.classList.remove("hidden");
        cameraOverlay.innerHTML = "<p>Camera detected as unavailable.</p>";
      }
    } catch (error) {
      cameraStatusLabel.textContent = "Error";
      cameraOverlay.classList.remove("hidden");
      cameraOverlay.innerHTML = "<p>" + error.message + "</p>";
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
  refreshPins();
  refreshCamera();
})();
