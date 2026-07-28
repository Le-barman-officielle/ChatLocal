# ChatLocal — mini Discord en local

## Installation

```bash
cd chatapp
pip install -r requirements.txt
```

## Lancement

```bash
python app.py
```

Puis ouvre **http://127.0.0.1:5000** dans ton navigateur (ouvre-le deux fois,
ou dans deux navigateurs/onglets privés différents, pour tester avec deux
comptes).

## Fonctionnalités

- Inscription / connexion (mots de passe hashés, jamais stockés en clair)
- Comptes sauvegardés dans `data/accounts.json`
- Messages sauvegardés dans `data/messages.json`
- Ajout d'amis par pseudo, avec système de demande / accepter / refuser
- Chat texte en quasi temps réel (rafraîchissement toutes les 2 secondes)
- Messages vocaux : clique sur 🎤 pour enregistrer, reclique pour arrêter et
  envoyer (utilise le micro du navigateur, nécessite son autorisation)
- Envoi de fichiers (photos, documents...) via 📎, **aucune limite de taille**
  configurée côté serveur
- Fichiers stockés dans `uploads/` avec un nom aléatoire (évite les
  collisions / écrasements)

## Notes importantes

- C'est un serveur de **développement** (`debug=True`), pensé pour tourner en
  local sur ta machine. Ne l'expose pas tel quel sur Internet.
- Le micro (MediaRecorder) ne fonctionne dans le navigateur que sur
  `localhost`/`127.0.0.1` ou en HTTPS — donc pas de souci ici.
- Comme il n'y a pas de vraie limite d'upload, un gros fichier peut prendre du
  temps ou remplir ton disque : à toi de voir si tu veux remettre un plafond
  plus tard (`app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024` par
  exemple pour 50 Mo).
- Aucun chiffrement des messages : ils sont en clair dans les fichiers JSON.
