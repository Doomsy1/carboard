import unittest
from unittest.mock import patch

from src.carboard_web import camera as camera_module
from src.carboard_web.pinout import BCM_PINS
from src.carboard_web.web import create_app


class FakeGPIOController:
    def __init__(self):
        self.states = {}
        self.pwm_states = {}

    def snapshot(self):
        return dict(self.states)

    def pwm_snapshot(self):
        return dict(self.pwm_states)

    def write(self, bcm_pin, value):
        self.pwm_states.pop(bcm_pin, None)
        self.states[bcm_pin] = bool(value)
        return self.states[bcm_pin]

    def write_pwm(self, bcm_pin, frequency, duty_cycle):
        self.states.pop(bcm_pin, None)
        self.pwm_states[bcm_pin] = {
            "frequency": frequency,
            "duty_cycle": duty_cycle,
        }
        return self.pwm_states[bcm_pin]


class FakeCameraStreamer:
    def __init__(self, available=True):
        self.available = available
        self.enabled = True

    def is_available(self):
        return self.available

    def is_enabled(self):
        return self.enabled

    def set_enabled(self, enabled):
        self.enabled = bool(enabled)

    def frames(self):
        if not self.enabled:
            raise RuntimeError("Camera stream is disabled")
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\nfakejpeg\r\n"


class FakeRestarter:
    def __init__(self):
        self.called = False

    def restart(self):
        self.called = True


class FakePicamera2:
    instances = []

    def __init__(self):
        self.configured = None
        self.recording = False
        self.stopped = False
        self.closed = False
        FakePicamera2.instances.append(self)

    @staticmethod
    def global_camera_info():
        return [{"id": "wide"}]

    def create_video_configuration(self, **kwargs):
        return kwargs

    def configure(self, config):
        self.configured = config

    def start_recording(self, encoder, output):
        self.recording = True

    def stop_recording(self):
        self.recording = False

    def stop(self):
        self.stopped = True

    def close(self):
        self.closed = True


class FakeEncoder:
    def __init__(self, bitrate):
        self.bitrate = bitrate


class FakeFileOutput:
    def __init__(self, output):
        self.output = output


class WebAppTests(unittest.TestCase):
    def setUp(self):
        self.controller = FakeGPIOController()
        self.camera = FakeCameraStreamer()
        self.restarter = FakeRestarter()
        app = create_app(
            controller=self.controller,
            camera_streamer=self.camera,
            restarter=self.restarter,
        )
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_index_mentions_pi_model_and_carboard(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("Raspberry Pi 4 Model B", text)
        self.assertIn("Carboard", text)

    def test_index_defers_camera_stream_until_status_probe(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('id="camera-stream"', text)
        self.assertIn('data-stream-url="/stream.mjpg"', text)
        self.assertNotIn('src="/stream.mjpg"', text)

    def test_index_includes_legend(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('class="legend"', text)

    def test_pin_api_returns_pi_4b_header_metadata(self):
        response = self.client.get("/api/pins")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["model"], "Raspberry Pi 4 Model B")
        self.assertEqual(payload["header_pin_count"], 40)
        pin_17 = next(pin for pin in payload["pins"] if pin["bcm_pin"] == 17)
        self.assertEqual(pin_17["physical_pin"], 11)
        self.assertTrue(pin_17["controllable"])

    def test_setting_a_controllable_pin_updates_state(self):
        response = self.client.post("/api/pins/17", json={"value": True})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["state"])
        self.assertTrue(self.controller.snapshot()[17])

    def test_reserved_pin_cannot_be_controlled(self):
        response = self.client.post("/api/pins/0", json={"value": True})

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("reserved", payload["error"].lower())

    def test_camera_status_reports_stream_availability(self):
        response = self.client.get("/api/camera")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["available"])
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["camera"], "Raspberry Pi Camera Module 3 Wide")

    def test_stream_endpoint_serves_mjpeg(self):
        response = self.client.get("/stream.mjpg")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Content-Type"],
            "multipart/x-mixed-replace; boundary=frame",
        )

    def test_camera_can_be_disabled(self):
        response = self.client.post("/api/camera", json={"enabled": False})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertFalse(payload["enabled"])
        self.assertFalse(self.camera.is_enabled())

        stream_response = self.client.get("/stream.mjpg")
        self.assertEqual(stream_response.status_code, 503)

    def test_pwm_endpoint_sets_duty_cycle_and_frequency(self):
        response = self.client.post(
            "/api/pins/18/pwm",
            json={"frequency": 1000, "duty_cycle": 50},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["pwm"]["frequency"], 1000)
        self.assertEqual(payload["pwm"]["duty_cycle"], 50)
        self.assertIn(18, self.controller.pwm_states)

    def test_pwm_endpoint_rejects_non_pwm_pin(self):
        response = self.client.post(
            "/api/pins/17/pwm",
            json={"frequency": 1000, "duty_cycle": 50},
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertIn("PWM", payload["error"])

    def test_pwm_endpoint_validates_duty_cycle_range(self):
        response = self.client.post(
            "/api/pins/18/pwm",
            json={"frequency": 1000, "duty_cycle": 150},
        )

        self.assertEqual(response.status_code, 400)

    def test_pwm_endpoint_validates_frequency(self):
        response = self.client.post(
            "/api/pins/18/pwm",
            json={"frequency": 0, "duty_cycle": 50},
        )

        self.assertEqual(response.status_code, 400)

    def test_pwm_endpoint_requires_both_fields(self):
        response = self.client.post(
            "/api/pins/18/pwm",
            json={"frequency": 1000},
        )

        self.assertEqual(response.status_code, 400)

    def test_pin_api_includes_pwm_capable_flag(self):
        response = self.client.get("/api/pins")

        payload = response.get_json()
        pin_18 = next(p for p in payload["pins"] if p["bcm_pin"] == 18)
        self.assertTrue(pin_18["pwm_capable"])
        pin_17 = next(p for p in payload["pins"] if p["bcm_pin"] == 17)
        self.assertFalse(pin_17["pwm_capable"])

    def test_pin_api_includes_active_pwm_state(self):
        self.controller.write_pwm(18, 500, 75)

        response = self.client.get("/api/pins")

        payload = response.get_json()
        pin_18 = next(p for p in payload["pins"] if p["bcm_pin"] == 18)
        self.assertEqual(pin_18["pwm"]["frequency"], 500)
        self.assertEqual(pin_18["pwm"]["duty_cycle"], 75)

    def test_restart_endpoint_calls_system_restart(self):
        response = self.client.post("/api/system/restart")

        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertEqual(payload["status"], "restarting")
        self.assertTrue(self.restarter.called)


class CameraStreamerLifecycleTests(unittest.TestCase):
    def test_disabling_active_camera_releases_it_for_reenable(self):
        FakePicamera2.instances = []
        streamer = camera_module.CameraStreamer()

        with (
            patch.object(camera_module, "Picamera2", FakePicamera2),
            patch.object(camera_module, "MJPEGEncoder", FakeEncoder),
            patch.object(camera_module, "FileOutput", FakeFileOutput),
        ):
            streamer._ensure_started()
            first_camera = FakePicamera2.instances[-1]

            streamer.set_enabled(False)

            self.assertFalse(streamer.is_enabled())
            self.assertTrue(first_camera.stopped)
            self.assertTrue(first_camera.closed)

            streamer.set_enabled(True)
            streamer._ensure_started()
            second_camera = FakePicamera2.instances[-1]

            self.assertTrue(streamer.is_enabled())
            self.assertIsNot(first_camera, second_camera)


if __name__ == "__main__":
    unittest.main()
