"""Local server for the web app. No dependencies beyond Python 3.9+.
Run:  python app.py      then open http://localhost:8000

The web app in webui/ runs the model in the browser (webui/eligibility.js, kept identical to src/eligibility.py by
tests/test_parity.py). This server just serves those files and also exposes the Python model at POST /api/evaluate.
"""
import json, mimetypes, os, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "webui")
sys.path.insert(0, os.path.join(ROOT, "src"))
import eligibility as E
DATA = E.load_all()


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, default=list).encode()
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_GET(self):
        rel = self.path.split("?")[0].lstrip("/") or "index.html"
        path = os.path.normpath(os.path.join(WEB, rel))
        if not path.startswith(WEB) or not os.path.isfile(path): return self._send(404, {"error": "not found"})
        with open(path, "rb") as f:
            self._send(200, f.read(), (mimetypes.guess_type(path)[0] or "application/octet-stream") + ("; charset=utf-8" if path.endswith((".html", ".js", ".css")) else ""))

    def do_POST(self):
        if self.path != "/api/evaluate": return self._send(404, {"error": "not found"})
        try:
            a = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            self._send(200, E.run(a, DATA))
        except (KeyError, ValueError, TypeError) as e:
            self._send(400, {"error": f"bad input: {e}"})

    def log_message(self, *a): pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"LoanLens running at http://localhost:{port}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
