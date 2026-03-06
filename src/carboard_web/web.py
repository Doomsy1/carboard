from __future__ import annotations

from flask import Flask, Response, jsonify, render_template, request

from .camera import CameraStreamer
from .gpio import GPIOController
from .pinout import BCM_PINS, CAMERA_MODEL, HEADER_PIN_COUNT, PI_MODEL, PIN_LOOKUP
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
        payload = []
        for pin in BCM_PINS:
            item = pin.to_dict()
            item["function_label"] = item["label"]
            item["state"] = bool(states.get(pin.bcm_pin, False))
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

    @app.get("/api/camera")
    def camera_status():
        camera_streamer = app.config["camera_streamer"]
        return jsonify(
            {
                "camera": CAMERA_MODEL,
                "available": bool(camera_streamer.is_available()),
            }
        )

    @app.get("/stream.mjpg")
    def stream():
        camera_streamer = app.config["camera_streamer"]
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
