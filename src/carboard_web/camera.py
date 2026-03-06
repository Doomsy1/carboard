from __future__ import annotations

import io
import threading

from .pinout import CAMERA_MODEL

try:
    from picamera2 import Picamera2
    from picamera2.encoders import MJPEGEncoder
    from picamera2.outputs import FileOutput
except Exception:  # pragma: no cover - hardware import guard
    Picamera2 = None
    MJPEGEncoder = None
    FileOutput = None


class StreamingOutput(io.BufferedIOBase):
    def __init__(self):
        self.frame = None
        self.condition = threading.Condition()

    def write(self, buf):
        with self.condition:
            self.frame = bytes(buf)
            self.condition.notify_all()
        return len(buf)


class CameraStreamer:
    def __init__(self):
        self.camera_name = CAMERA_MODEL
        self._camera = None
        self._encoder = None
        self._output = None
        self._started = False
        self._lock = threading.Lock()
        self._enabled = True

    def is_available(self) -> bool:
        if Picamera2 is None:
            return False
        try:
            return bool(Picamera2.global_camera_info())
        except Exception:
            return False

    def is_enabled(self) -> bool:
        return self._enabled

    def set_enabled(self, enabled: bool):
        enabled = bool(enabled)
        with self._lock:
            self._enabled = enabled
            if not enabled:
                self._stop_locked()

    def _stop_locked(self):
        if not self._started:
            return
        try:
            self._camera.stop_recording()
        except Exception:
            pass
        self._camera = None
        self._encoder = None
        self._output = None
        self._started = False

    def _ensure_started(self):
        if self._started:
            return
        if not self._enabled:
            raise RuntimeError("Camera stream is disabled")
        if not self.is_available():
            raise RuntimeError("Camera Module 3 Wide is unavailable")

        with self._lock:
            if self._started:
                return
            self._output = StreamingOutput()
            self._camera = Picamera2()
            config = self._camera.create_video_configuration(main={"size": (1280, 720)})
            self._camera.configure(config)
            self._encoder = MJPEGEncoder(bitrate=12_000_000)
            self._camera.start_recording(self._encoder, FileOutput(self._output))
            self._started = True

    def frames(self):
        self._ensure_started()
        while True:
            if not self._enabled:
                raise RuntimeError("Camera stream is disabled")
            with self._output.condition:
                self._output.condition.wait()
                frame = self._output.frame
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            )
