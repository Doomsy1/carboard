from __future__ import annotations

from dataclasses import asdict, dataclass


PI_MODEL = "Raspberry Pi 4 Model B"
CAMERA_MODEL = "Raspberry Pi Camera Module 3 Wide"
HEADER_PIN_COUNT = 40


@dataclass(frozen=True)
class PinSpec:
    bcm_pin: int
    physical_pin: int
    label: str
    accent: str
    controllable: bool = True
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


BCM_PINS = [
    PinSpec(2, 3, "I2C SDA1", "i2c", note="Default I2C data pin."),
    PinSpec(3, 5, "I2C SCL1", "i2c", note="Default I2C clock pin."),
    PinSpec(4, 7, "GPIO4 / GPCLK0", "clock"),
    PinSpec(14, 8, "UART TXD0", "uart", note="Serial TX."),
    PinSpec(15, 10, "UART RXD0", "uart", note="Serial RX."),
    PinSpec(17, 11, "GPIO17", "digital"),
    PinSpec(18, 12, "GPIO18 / PWM0", "pwm"),
    PinSpec(27, 13, "GPIO27", "digital"),
    PinSpec(22, 15, "GPIO22", "digital"),
    PinSpec(23, 16, "GPIO23", "digital"),
    PinSpec(24, 18, "GPIO24", "digital"),
    PinSpec(10, 19, "SPI MOSI", "spi"),
    PinSpec(9, 21, "SPI MISO", "spi"),
    PinSpec(25, 22, "GPIO25", "digital"),
    PinSpec(11, 23, "SPI SCLK", "spi"),
    PinSpec(8, 24, "SPI CE0", "spi"),
    PinSpec(7, 26, "SPI CE1", "spi"),
    PinSpec(
        0,
        27,
        "ID_SD",
        "reserved",
        controllable=False,
        note="Reserved for HAT EEPROM identification.",
    ),
    PinSpec(
        1,
        28,
        "ID_SC",
        "reserved",
        controllable=False,
        note="Reserved for HAT EEPROM identification.",
    ),
    PinSpec(5, 29, "GPIO5", "digital"),
    PinSpec(6, 31, "GPIO6", "digital"),
    PinSpec(12, 32, "GPIO12 / PWM0", "pwm"),
    PinSpec(13, 33, "GPIO13 / PWM1", "pwm"),
    PinSpec(19, 35, "GPIO19 / PCM FS", "pcm"),
    PinSpec(16, 36, "GPIO16", "digital"),
    PinSpec(26, 37, "GPIO26", "digital"),
    PinSpec(20, 38, "GPIO20 / PCM DIN", "pcm"),
    PinSpec(21, 40, "GPIO21 / PCM DOUT", "pcm"),
]

PIN_LOOKUP = {pin.bcm_pin: pin for pin in BCM_PINS}

PWM_PINS = {12, 13, 18, 19}
