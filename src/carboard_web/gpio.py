from __future__ import annotations

from .pinout import PIN_LOOKUP

try:
    from gpiozero import OutputDevice
except Exception:  # pragma: no cover - hardware import guard
    OutputDevice = None


class GPIOController:
    def __init__(self):
        self._devices = {}
        self._states = {}

    def snapshot(self):
        return dict(self._states)

    def write(self, bcm_pin: int, value: bool):
        spec = PIN_LOOKUP.get(bcm_pin)
        if spec is None:
            raise KeyError(f"Unknown BCM pin {bcm_pin}")
        if not spec.controllable:
            raise ValueError(f"BCM pin {bcm_pin} is reserved and cannot be controlled")

        desired = bool(value)
        self._states[bcm_pin] = desired

        if OutputDevice is None:
            return desired

        device = self._devices.get(bcm_pin)
        if device is None:
            device = OutputDevice(bcm_pin, active_high=True, initial_value=False)
            self._devices[bcm_pin] = device

        if desired:
            device.on()
        else:
            device.off()
        return desired
