from __future__ import annotations

from flask import Flask, Response, jsonify, render_template, request

from .camera import CameraStreamer
from .gpio import GPIOController
from .pinout import BCM_PINS, CAMERA_MODEL, HEADER_PIN_COUNT, PI_MODEL, PIN_LOOKUP, PWM_PINS
from .system import SystemRestarter


def create_app(controller=None, camera_streamer=None, restarter=None):
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static",
    )
    app.config["controller"] = controller or GPIOController()
    app.config["camera_streamer"] = camera_streamer or CameraStreamer()
    app.config["restarter"] = restarter or SystemRestarter()

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            pi_model=PI_MODEL,
            model_name=PI_MODEL,
            camera_model=CAMERA_MODEL,
            pins=[pin.to_dict() for pin in BCM_PINS],
            header_pin_count=HEADER_PIN_COUNT,
        )

    @app.get("/api/pins")
    def pins():
        controller = app.config["controller"]
        states = controller.snapshot()
        pwm_states = controller.pwm_snapshot()
        payload = []
        for pin in BCM_PINS:
            item = pin.to_dict()
            item["function_label"] = item["label"]
            item["state"] = bool(states.get(pin.bcm_pin, False))
            item["pwm_capable"] = pin.bcm_pin in PWM_PINS
            pwm = pwm_states.get(pin.bcm_pin)
            if pwm:
                item["pwm"] = pwm
            payload.append(item)
        return jsonify(
            {
                "model": PI_MODEL,
                "header_pin_count": HEADER_PIN_COUNT,
                "pins": payload,
            }
        )

    @app.post("/api/pins/<int:bcm_pin>")
    def set_pin(bcm_pin: int):
        spec = PIN_LOOKUP.get(bcm_pin)
        if spec is None:
            return jsonify({"error": f"Unknown BCM pin {bcm_pin}"}), 404
        if not spec.controllable:
            return jsonify({"error": f"BCM pin {bcm_pin} is reserved"}), 400

        body = request.get_json(silent=True) or {}
        if "value" not in body:
            return jsonify({"error": "Request body must include a boolean 'value' field"}), 400

        state = app.config["controller"].write(bcm_pin, bool(body["value"]))
        payload = spec.to_dict()
        payload["function_label"] = payload["label"]
        payload["state"] = state
        return jsonify(payload)

    @app.post("/api/pins/<int:bcm_pin>/pwm")
    def set_pin_pwm(bcm_pin: int):
        spec = PIN_LOOKUP.get(bcm_pin)
        if spec is None:
            return jsonify({"error": f"Unknown BCM pin {bcm_pin}"}), 404
        if not spec.controllable:
            return jsonify({"error": f"BCM pin {bcm_pin} is reserved"}), 400
        if bcm_pin not in PWM_PINS:
            return jsonify({"error": f"BCM pin {bcm_pin} does not support PWM"}), 400

        body = request.get_json(silent=True) or {}
        frequency = body.get("frequency")
        duty_cycle = body.get("duty_cycle")

        if frequency is None or duty_cycle is None:
            return jsonify({"error": "Request body must include 'frequency' and 'duty_cycle'"}), 400

        try:
            frequency = float(frequency)
            duty_cycle = float(duty_cycle)
        except (TypeError, ValueError):
            return jsonify({"error": "'frequency' and 'duty_cycle' must be numbers"}), 400

        if frequency <= 0:
            return jsonify({"error": "Frequency must be greater than 0"}), 400
        if not (0 <= duty_cycle <= 100):
            return jsonify({"error": "Duty cycle must be between 0 and 100"}), 400

        pwm_state = app.config["controller"].write_pwm(bcm_pin, frequency, duty_cycle)
        payload = spec.to_dict()
        payload["function_label"] = payload["label"]
        payload["pwm"] = pwm_state
        return jsonify(payload)

    @app.get("/api/camera")
    def camera_status():
        camera_streamer = app.config["camera_streamer"]
        return jsonify(
            {
                "camera": CAMERA_MODEL,
                "available": bool(camera_streamer.is_available()),
                "enabled": bool(camera_streamer.is_enabled()),
            }
        )

    @app.post("/api/camera")
    def set_camera():
        body = request.get_json(silent=True) or {}
        if "enabled" not in body:
            return jsonify({"error": "Request body must include a boolean 'enabled' field"}), 400
        camera_streamer = app.config["camera_streamer"]
        camera_streamer.set_enabled(bool(body["enabled"]))
        return jsonify(
            {
                "camera": CAMERA_MODEL,
                "available": bool(camera_streamer.is_available()),
                "enabled": bool(camera_streamer.is_enabled()),
            }
        )

    @app.get("/stream.mjpg")
    def stream():
        camera_streamer = app.config["camera_streamer"]
        if not camera_streamer.is_enabled():
            return jsonify({"error": "Camera stream is disabled"}), 503
        if not camera_streamer.is_available():
            return jsonify({"error": "Camera stream is unavailable"}), 503
        return Response(
            camera_streamer.frames(),
            mimetype="multipart/x-mixed-replace; boundary=frame",
        )

    @app.post("/api/system/restart")
    def restart():
        app.config["restarter"].restart()
        return jsonify({"status": "restarting", "message": "Restart command sent"}), 202

    return app
