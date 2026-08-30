# Archives

Copies gelées de l'outil, pour pouvoir revenir en arrière.

## 2026-08-28 — build `2026-08-25s`

État de l'outil **juste avant le build `2026-08-25t`**.

| Fichier | Ce que c'est |
|---|---|
| `2026-08-28-suivi_comptable_v6-build-25s.html` | La page, telle qu'elle était. Seul ajout : le bandeau orange d'archivage. |
| `2026-08-28-backend.gs` | L'Apps Script de ce jour-là (`BACKEND_VERSION = "2026-08-28a"`). |
| `2026-08-28-sw.js` | Le service worker de ce jour-là (`litup-outils-v22`). |

Ouvrir : <https://lit-up-fr.github.io/litup-outils/archives/2026-08-28-suivi_comptable_v6-build-25s.html>

Repère Git équivalent : `git checkout avant-remise-a-plat-2026-08-28`

### Ce que cette archive gèle, et ce qu'elle ne gèle pas

Elle gèle **le code** : le fonctionnement de l'outil à cette date.

Elle **ne gèle pas les données**. Les données ne sont pas dans le fichier :
elles vivent dans le navigateur (`localStorage`) et dans le Google Sheet.
L'archive lit donc les données **du jour où on l'ouvre**, pas celles du 28/08.

Pour geler les données, il faut deux gestes, tous deux à faire depuis l'outil courant :

1. **📤 Export → 💾 JSON** — écrit un fichier avec tout le contenu.
   On le recharge par **📥 Import → 📂 JSON**. C'est la sauvegarde qui compte.
2. **Google Sheet → Fichier → Historique des versions** — Google garde
   automatiquement chaque état du Sheet ; on peut y restaurer une date précise.

### Avertissement

L'archive et l'outil courant partagent le même stockage local et le même
Google Sheet. Un **☁️ Sauvegarder** lancé depuis l'archive écrit dans le Sheet
partagé avec le comportement de l'ancien code. Pour consulter, ne rien
enregistrer.
