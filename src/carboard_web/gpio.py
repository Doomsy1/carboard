from __future__ import annotations

from .pinout import PIN_LOOKUP, PWM_PINS

try:
    from gpiozero import OutputDevice, PWMOutputDevice
except Exception:  # pragma: no cover - hardware import guard
    OutputDevice = None
    PWMOutputDevice = None


class GPIOController:
    def __init__(self):
        self._devices = {}
        self._states = {}
        self._pwm_devices = {}
        self._pwm_states = {}

    def snapshot(self):
        return dict(self._states)

    def pwm_snapshot(self):
        return dict(self._pwm_states)

    def _stop_pwm(self, bcm_pin: int):
        if bcm_pin in self._pwm_devices and PWMOutputDevice is not None:
            self._pwm_devices[bcm_pin].off()
            self._pwm_devices[bcm_pin].close()
            del self._pwm_devices[bcm_pin]
        self._pwm_states.pop(bcm_pin, None)

    def write(self, bcm_pin: int, value: bool):
        spec = PIN_LOOKUP.get(bcm_pin)
        if spec is None:
            raise KeyError(f"Unknown BCM pin {bcm_pin}")
        if not spec.controllable:
            raise ValueError(f"BCM pin {bcm_pin} is reserved and cannot be controlled")

        self._stop_pwm(bcm_pin)

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

    def write_pwm(self, bcm_pin: int, frequency: float, duty_cycle: float):
        spec = PIN_LOOKUP.get(bcm_pin)
        if spec is None:
            raise KeyError(f"Unknown BCM pin {bcm_pin}")
        if not spec.controllable:
            raise ValueError(f"BCM pin {bcm_pin} is reserved and cannot be controlled")
        if bcm_pin not in PWM_PINS:
            raise ValueError(f"BCM pin {bcm_pin} does not support PWM")
        if frequency <= 0:
            raise ValueError("Frequency must be greater than 0")
        if not (0 <= duty_cycle <= 100):
            raise ValueError("Duty cycle must be between 0 and 100")

        # Stop any digital output on this pin
        if bcm_pin in self._devices and OutputDevice is not None:
            self._devices[bcm_pin].off()
            self._devices[bcm_pin].close()
            del self._devices[bcm_pin]
        self._states.pop(bcm_pin, None)

        value = duty_cycle / 100.0
        self._pwm_states[bcm_pin] = {
            "frequency": frequency,
            "duty_cycle": duty_cycle,
        }

        if PWMOutputDevice is None:
            return self._pwm_states[bcm_pin]

        device = self._pwm_devices.get(bcm_pin)
        if device is not None:
            device.off()
            device.close()
        device = PWMOutputDevice(bcm_pin, frequency=frequency, initial_value=value)
        self._pwm_devices[bcm_pin] = device

        return self._pwm_states[bcm_pin]
