# ANPER SE — version Web & Android (PWA)

Portage **web + Android** de l'application desktop ANPER SE (CustomTkinter + SQLite).
Un seul code couvre les deux plateformes : c'est une **PWA** (Progressive Web App)
responsive, installable sur Android depuis le navigateur, qui fonctionne **hors-ligne**.

Les données sont stockées **localement sur l'appareil** (IndexedDB), comme la version
desktop. Import/export JSON pour transférer ou sauvegarder.

## Fonctionnalités (parité avec le desktop)

- **Tableau de bord** : 3 vues (globale, par projet, par période), KPI de base et
  calculés, jauges, donuts, barres et barres groupées — tout dessiné en canvas, sans
  dépendance.
- **Fiche Projet** / **Fiche Client** : formulaires complets, même champs que le desktop,
  sélection en cascade Région→Département→Commune→Localité (données RENALOC réelles).
- **Registres** : projets, clients, composantes — recherche, modification, suppression.
- **Composantes & Activités** : ajout/édition (C / A / SA) par projet.
- **Rapports** : export CSV (Excel) projets/clients/composantes, rapport de synthèse
  imprimable (→ PDF), sauvegarde/restauration JSON complète.
- **Carte SIG** : répartition régionale schématique (hors-ligne) + tableau récapitulatif.
- **Import RENALOC** : depuis un fichier CSV (région;département;commune;localité).

Au premier lancement, l'app est **pré-remplie avec vos données réelles** (16 projets,
15 clients, 197 composantes, 33 209 localités) extraites de `anper.db` (`data/seed.json`).

## Lancer en local (web)

Il faut un serveur HTTP (le `file://` ne permet pas `fetch`/service worker) :

```bash
cd webapp
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Déployer sur le web (gratuit)

N'importe quel hébergement de fichiers statiques convient :
- **GitHub Pages** : pousser le dossier `webapp/` dans un dépôt, activer Pages.
- **Netlify / Cloudflare Pages / Vercel** : glisser-déposer le dossier `webapp/`.

Une fois en ligne (https), Android propose « Ajouter à l'écran d'accueil » → l'app
s'installe comme une vraie application (icône, plein écran, hors-ligne).

## Générer un APK Android (optionnel, Play Store)

Via **Capacitor** (réutilise exactement ce même code) :

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "ANPER SE" "ne.anper.se" --web-dir=webapp
npx cap add android
npx cap sync
npx cap open android   # ouvre Android Studio → Build > Build APK
```

Alternative sans Android Studio : **PWABuilder** (https://www.pwabuilder.com) — coller
l'URL de la PWA déployée, il génère un paquet Android signé.

## Partage multi-utilisateur via OneDrive

Plusieurs personnes peuvent travailler sur les **mêmes données**, stockées dans un
fichier partagé `ANPER SE/anper_data.json` sur OneDrive. La synchro se fait
automatiquement après chaque modification (read → fusion par fiche → write) :
chaque enregistrement (projet, client, composante) a un identifiant unique et un
horodatage ; en cas de modification concurrente, **la version la plus récente de
chaque fiche gagne**, et les suppressions sont propagées. RENALOC n'est pas
synchronisé (donnée de référence statique, déjà embarquée).

> Prérequis : l'app doit être **hébergée en HTTPS** (voir « Déployer sur le web »).
> La connexion Microsoft ne fonctionne pas en `http://localhost` non sécurisé pour
> les comptes personnels.

### Étape A — Inscrire l'application dans Azure (une seule fois, gratuit)

1. Aller sur **https://entra.microsoft.com** (ou portal.azure.com) et se connecter
   avec le compte Microsoft propriétaire des données (ex : `adamoumarou@yahoo.fr`).
   *(Si ce mail n'est pas encore un compte Microsoft, le créer sur
   https://signup.live.com avec cette adresse.)*
2. **Identité → Applications → Inscriptions d'applications → Nouvelle inscription**.
3. Nom : `ANPER SE`. Types de comptes pris en charge :
   **« Comptes dans un annuaire organisationnel et comptes Microsoft personnels »**.
4. **URI de redirection** : type **SPA (Single-page application)**, valeur =
   l'URL exacte de l'app déployée (ex : `https://gorkomaodo.github.io/anper-se/`).
5. Créer → copier l'**ID d'application (client)** affiché.
6. **API autorisées → Ajouter → Microsoft Graph → Autorisations déléguées** :
   ajouter `User.Read` et `Files.ReadWrite.All`. (Le consentement se fait à la
   première connexion de chaque utilisateur.)

### Étape B — Configurer l'app (administrateur)

1. Ouvrir l'app déployée → bouton **☁️ Partage** (en haut).
2. Coller l'**ID d'application (client)** (étape 1).
3. **Se connecter à Microsoft** avec le compte propriétaire.
4. Cliquer **« 👑 Je suis l'administrateur : créer le lien à partager »** → l'app
   crée le fichier partagé et génère un **lien d'édition** (copié dans le
   presse-papiers). Le diffuser aux collègues.

### Étape C — Rejoindre (chaque collègue)

1. Ouvrir l'app déployée → **☁️ Partage** → coller le **même ID d'application**.
2. **Se connecter à Microsoft** avec SON propre compte.
3. Coller le **lien de partage reçu** dans « Lien de partage reçu » →
   **« Utiliser ce lien de partage »**.

C'est tout : les données apparaissent et toute modification se synchronise
automatiquement pour tout le monde.

> Astuce sécurité : le lien d'édition « anonyme » permet à quiconque le possède de
> modifier. Ne le diffusez qu'aux personnes de confiance. Pour révoquer, supprimez
> le partage du fichier depuis OneDrive et créez un nouveau lien.

## Structure

```
webapp/
├── index.html                # shell
├── manifest.webmanifest      # métadonnées PWA (installation)
├── sw.js                     # service worker (cache hors-ligne)
├── css/styles.css            # responsive (sidebar desktop / tiroir mobile)
├── js/
│   ├── data.js               # couleurs, options, navigation, palettes (≈ ui/theme.py)
│   ├── db.js                 # IndexedDB + CRUD + stats (≈ db/manager.py)
│   ├── charts.js             # graphiques canvas (≈ dashboard.py)
│   ├── ui.js                 # helpers, toasts, modale, multi-select cascade
│   ├── pages.js              # tableau de bord
│   ├── pages2.js             # fiches, registres, composantes, rapports, SIG
│   ├── sync.js               # synchro OneDrive (Microsoft Graph + MSAL)
│   └── app.js                # routeur, navigation, installation PWA, modale partage
├── data/seed.json            # données initiales (RENALOC + projets/clients/composantes)
└── icons/                    # logo + icônes 192/512
```

## Régénérer le seed depuis anper.db

Si la base desktop évolue, regénérer `data/seed.json` :

```bash
python - <<'PY'
import sqlite3, json
c=sqlite3.connect('../ANPER_SE_Installation/Donnees/anper.db'); c.row_factory=sqlite3.Row
rows=lambda t:[dict(r) for r in c.execute('SELECT * FROM %s'%t)]
ren={}
for r in c.execute('SELECT region,departement,commune,localite FROM renaloc'):
    reg,dep,com,loc=(r['region'] or '').strip(),(r['departement'] or '').strip(),(r['commune'] or '').strip(),(r['localite'] or '').strip()
    if not reg: continue
    ren.setdefault(reg,{}).setdefault(dep,{}).setdefault(com,[])
    if loc and loc not in ren[reg][dep][com]: ren[reg][dep][com].append(loc)
json.dump({'projets':rows('projets'),'clients':rows('clients'),'composantes':rows('composantes'),'renaloc':ren},
          open('data/seed.json','w',encoding='utf-8'),ensure_ascii=False)
PY
```

## Notes

- Hors partage OneDrive, les données restent locales à l'appareil (IndexedDB) et
  fonctionnent hors-ligne. Le partage multi-utilisateur via OneDrive (ci-dessus)
  ajoute la synchronisation entre appareils/utilisateurs.
- La synchro OneDrive est « quasi temps réel » (à l'ouverture et ~3 s après chaque
  modification), pas une base temps réel à la milliseconde. La fusion par fiche
  (dernière modification gagnante) évite les pertes lors d'éditions concurrentes.
- Sauvegarde recommandée en complément : Rapports → « Exporter la sauvegarde » (JSON).
```
