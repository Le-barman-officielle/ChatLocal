#!/usr/bin/env python3
"""
Serveur HTTP statique, prêt pour un déploiement sur Render.com.

- Écoute sur 0.0.0.0 (accessible depuis l'extérieur, pas juste en local)
- Utilise le port fourni par Render via la variable d'environnement PORT
- Sert les fichiers du dossier "src" (contenant index.html)

Structure attendue du dépôt déployé sur Render (app.py au même niveau qu'index.html) :

    mon-projet/ (ou src/)
    ├── app.py
    ├── index.html
    └── ... (css, js, images, etc.)
"""

import http.server
import socketserver
import os

# Dossier contenant index.html : le même dossier que ce script
DOSSIER = os.path.dirname(os.path.abspath(__file__))

# Render fournit le port à utiliser via la variable d'environnement PORT
PORT = int(os.environ.get("PORT", 10000))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DOSSIER, **kwargs)

    def log_message(self, format, *args):
        # Logs visibles dans le dashboard Render
        print("%s - %s" % (self.address_string(), format % args))


def main():
    if not os.path.isdir(DOSSIER):
        print(f"Attention : le dossier n'existe pas : {DOSSIER}")

    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serveur démarré sur le port {PORT}, dossier servi : {DOSSIER}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
