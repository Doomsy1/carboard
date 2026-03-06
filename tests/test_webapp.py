import unittest

from src.carboard_web.pinout import BCM_PINS
from src.carboard_web.web import create_app


class FakeGPIOController:
    def __init__(self):
        self.states = {}

    def snapshot(self):
        return dict(self.states)

    def write(self, bcm_pin, value):
        self.states[bcm_pin] = bool(value)
        return self.states[bcm_pin]


class FakeCameraStreamer:
    def __init__(self, available=True):
        self.available = available

    def is_available(self):
        return self.available

    def frames(self):
        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\nfakejpeg\r\n"


class FakeRestarter:
    def __init__(self):
        self.called = False

    def restart(self):
        self.called = True


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

    def test_index_mentions_pi_model_and_gpio_console(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn("Raspberry Pi 4 Model B", text)
        self.assertIn("GPIO Control Console", text)

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
        self.assertEqual(payload["camera"], "Raspberry Pi Camera Module 3 Wide")

    def test_stream_endpoint_serves_mjpeg(self):
        response = self.client.get("/stream.mjpg")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["Content-Type"],
            "multipart/x-mixed-replace; boundary=frame",
        )

    def test_restart_endpoint_calls_system_restart(self):
        response = self.client.post("/api/system/restart")

        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertEqual(payload["status"], "restarting")
        self.assertTrue(self.restarter.called)


if __name__ == "__main__":
    unittest.main()
