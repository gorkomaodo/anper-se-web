/* Aide contextuelle ANPER — affiche le didacticiel de la page courante + lecteur audio.
   L'audio (optionnel) est lu depuis audio/<clé>.mp3 (enregistrements de l'utilisateur). */
const HELP = {
  _default: { t: 'Aide', h: '<p>Sélectionnez un module dans le menu de gauche. Chaque page dispose de son aide via le bouton <b>❓ Aide</b> en haut.</p>' },

  // ── Suivi & Évaluation ──
  dashboard: { t: 'Tableau de Bord', h: '<p>Vue synthétique du portefeuille de projets. Trois onglets : <b>Vue globale</b> (indicateurs et graphiques consolidés), <b>Par projet</b> et <b>Par période</b>. Les chiffres se mettent à jour automatiquement à chaque saisie.</p>' },
  fiche_projet: { t: 'Fiche Projet', h: '<p>Créer ou modifier un projet d’électrification. Renseignez l’identification, la <b>localisation RENALOC</b> en cascade (Région → Département → Commune → Localité), les données financières et les indicateurs, puis <b>Enregistrer</b>. L’ID est généré automatiquement.</p>' },
  fiche_client: { t: 'Fiche Client', h: '<p>Enregistrer un ménage, commerce ou institution raccordé : identité, localisation, raccordement (compteur, puissance), données financières (paiement, consommation). Cliquez <b>Enregistrer</b>.</p>' },
  registre_projets: { t: 'Registre des Projets', h: '<p>Liste filtrable de tous les projets (nom, région, technologie, statut, budget, ménages). Chaque ligne se <b>modifie</b> (✏️) ou se <b>supprime</b> (🗑️).</p>' },
  registre_clients: { t: 'Registre des Clients', h: '<p>Liste filtrable de tous les clients raccordés, avec le statut de paiement. Modifiez ou supprimez chaque fiche.</p>' },
  registre_composantes: { t: 'Composantes & Activités', h: '<p>Décompose chaque projet en <b>Composantes (C)</b>, <b>Activités (A)</b> et <b>Sous-activités (SA)</b>, présentées en <b>arborescence</b> : chaque activité et sous-activité est rangée sous sa composante (C1 → A1.1 → SA1.1.1…), avec indentation et repères visuels. En mode « Tous les projets », un bandeau sépare chaque projet.</p><p>Filtrez par projet, recherchez par libellé/numéro, ajoutez une ligne avec « ＋ Nouvelle composante » (le numéro détermine le rattachement : « C1 », « A1.2 », « SA1.1.1 »).</p>' },
  rapports: { t: 'Rapports & Exports', h: '<p>Trois familles de sorties :</p><p>• <b>Exports CSV/Excel</b> (projets, clients, composantes) pour vos analyses.</p><p>• <b>Rapport de synthèse</b> structuré (page de garde, table des matières, figures, tableaux, cartographie, analyse genre, décaissements) — <b>modifiable</b> à l’écran avant impression, export <b>Word</b> ou PDF.</p><p>• <b>Rapport périodique</b> (mensuel / trimestriel / annuel) : activité de la période + situation cumulée. Choisissez le type, l’année et la sous-période, puis « Générer ».</p>' },
  sig: { t: 'Carte SIG', h: '<p>Affiche les <b>localités des projets</b> sur une carte réelle, colorées par statut. Utilisez les filtres (Projet, Statut, Région → Département → Commune) puis <b>Générer la carte</b>.</p><p>Chaque localité est positionnée à ses <b>vraies coordonnées</b> issues du RENALOC (répertoire national) ; le compteur indique combien ont été géolocalisées précisément. Seul le fond de carte nécessite internet — les points s’affichent même hors ligne.</p>' },

  // ── Gestion administrative ──
  adm_rhboard: { t: 'Tableau de bord RH', h: '<p>Synthèse des effectifs et de l’activité administrative (par direction, catégorie, recrutements récents).</p>' },
  adm_personnel: { t: 'Personnel', h: '<p>Fichier des agents : identité, situation matrimoniale, poste, direction, photo. Le module alimente les listes déroulantes d’agent des autres modules (actes, congés, archives).</p>' },
  adm_actes: { t: 'Actes & décisions', h: '<p>Produit les documents officiels (décisions, arrêtés, notes, attestations, certificats) avec l’en-tête ANPER et les visas réglementaires. Choisissez la <b>portée</b> (Individuel ou Collectif), l’agent, le type, puis ouvrez le document via 📄 : vous pouvez l’<b>imprimer / PDF</b> ou l’<b>exporter en Word</b> (📝) pour le retoucher. Le 🔀 ouvre le circuit de visa.</p>' },
  adm_conges: { t: 'Congés & absences', h: '<p>Enregistre les demandes et calcule les <b>droits &amp; soldes</b> (30 j/an, report si non pris l’an dernier — plafond 2 mois, étalement possible). Les boutons génèrent l’<b>acte collectif annuel</b> pour les cadres et pour les auxiliaires.</p>' },
  adm_ordremission: { t: 'Ordres de mission', h: '<p>Reproduit le formulaire officiel <b>Ordre de mission / Feuille de déplacement</b> — <b>saisie directe</b> dans le formulaire (chaque case cliquable). Le choix de l’agent remplit automatiquement Nom, Fonction et Catégorie ; les dates calculent la durée ; destination, transport et imputation sont des listes. Deux boutons : <b>Étranger</b> (2 pages recto-verso) et <b>Local</b> (1 page). Puis 💾 Enregistrer, <b>Imprimer / PDF</b> (paysage) ou <b>Word</b> (📝).</p>' },
  adm_courrier: { t: 'Courrier', h: '<p>Registre du courrier <b>Arrivée</b> / <b>Départ</b>. L’icône 📄 génère le <b>bordereau d’envoi</b> (départ) ou la <b>fiche de transmission</b> (arrivée), avec impression PDF et export <b>Word</b> (📝).</p>' },
  adm_archives: { t: 'Archives documentaires', h: '<p>Registre documentaire classé par catégorie (dossier agent, arrêté, décision, note, attestation, ordre de mission, correspondance…), avec pièces jointes téléchargeables (📎).</p>' },
  adm_fournitures: { t: 'Fournitures & matériel', h: '<p>Gestion du stock : désignation, catégorie, quantité, unité, <b>seuil d’alerte</b> et emplacement. Sous le seuil, l’article est signalé.</p>' },
  adm_patrimoine: { t: 'Patrimoine & matériel', h: '<p>Inventaire des immobilisations en trois catégories : <b>Mobilier de bureau</b> (fauteuils, chaises visiteurs…), <b>Matériel informatique</b> (PC de bureau, portables, imprimantes, scanneurs) et <b>Matériel roulant</b> (véhicules, motos).</p><p>Chaque bien porte un N° d’inventaire, la Direction / Service d’affectation et l’agent détenteur. Pour le matériel roulant, renseignez aussi l’immatriculation et <b>l’assurance</b> (police, compagnie, échéance). Utilisez le filtre en haut pour n’afficher qu’une catégorie.</p>' },
  adm_inventaire: { t: 'Fiches d’inventaire par Direction', h: '<p>Choisissez une Direction / un Service et cliquez sur <b>Générer la fiche</b> : vous obtenez la fiche d’inventaire officielle du matériel affecté, regroupé par catégorie, avec les valeurs et les sous-totaux. Le tableau récapitulatif en dessous donne un accès direct à la fiche de chaque Direction.</p><p>Deux formulaires sont aussi disponibles dans la barre du haut : <b>Formulaire de saisie</b> (feuille de recensement vierge reprenant tous les éléments, à remplir sur le terrain) et <b>Fiche matériel roulant</b> (fiche individuelle d’un véhicule ou d’une moto — identification, affectation, valeur, assurance, entretien). Depuis le registre « Patrimoine », l’icône 🚗 d’une ligne de matériel roulant génère sa fiche pré-remplie.</p><p>Tous ces documents s’impriment en PDF et s’exportent en <b>Word</b>.</p>' },
  adm_hse: { t: 'HSE', h: '<p>Hygiène, Sécurité &amp; Santé : enregistrement des incidents et inspections (type, date, lieu, gravité, mesures prises, statut de suivi).</p>' },
  adm_assurances: { t: 'Assurances & Assurés', h: '<p>Section jumelée à deux onglets : <b>Polices d’assurance</b> (numéro, compagnie, prime, échéance) et <b>Assurés</b> (fiches avec photo et ayants droit). Les échéances proches sont mises en évidence.</p>' },
  adm_assures: { t: 'Assurés', h: '<p>Fiches des assurés (avec photo) : identité, compagnie, police, groupe sanguin, ayants droit. Accessible depuis l’onglet « Assurés » de la section Assurances &amp; Assurés.</p>' },
  adm_sinistres: { t: 'Sinistres', h: '<p>Déclaration et suivi des sinistres : numéro, police concernée, compagnie, nature, date, montant estimé, statut (déclaré, en cours, indemnisé).</p>' },
  adm_users: { t: 'Utilisateurs', h: '<p>Réservé à l’administrateur : créer un compte (identifiant, nom, rôle, pages autorisées), modifier (✎), réinitialiser le mot de passe (🔑) ou supprimer (🗑). Attribuez à chaque agent le strict nécessaire (cloisonnement).</p>' },
  adm_journal: { t: 'Journal d’activité', h: '<p>Historique des actions (ajouts, modifications, suppressions) effectuées dans les modules administratifs.</p>' },
  adm_sauvegarde: { t: 'Sauvegarde', h: '<p>Exporter les données administratives dans un fichier, ou en restaurer depuis un fichier. Sauvegardez régulièrement : vider le cache du navigateur efface les données locales.</p>' },

  // ── Communication ──
  communication: { t: 'Messagerie interne', h: '<p>Discussion écrite et <b>appels audio/vidéo</b> entre agents connectés à l\'application. Choisissez un collègue dans la liste de gauche, écrivez un message ou lancez un appel (📞 audio, 📹 vidéo).</p><p>⚠️ Ceci est une messagerie <b>interne à l\'application</b> (comme un talkie-walkie via internet) — ce n\'est <b>ni un vrai SMS ni un appel téléphonique GSM</b> : les deux personnes doivent avoir l\'application ouverte et être connectées au <b>☁️ Partage</b> (voir PARTAGE_SUPABASE.md). Sans connexion au Partage, vos messages restent enregistrés localement et partiront dès la reconnexion.</p>' },

  // ── Pointage ──
  pointage_kiosk: { t: 'Badgeuse (accueil)', h: '<p>Écran destiné au <b>poste fixe de l\'entrée</b> (compte « pointage »). Chaque agent saisit son <b>matricule</b>, puis son <b>code personnel</b> (4 chiffres, défini dans sa fiche Personnel) si un code a été configuré. L\'écran détecte automatiquement s\'il s\'agit d\'une <b>Entrée</b> ou d\'une <b>Sortie</b> selon le dernier pointage du jour.</p><p>Horaire de référence : lundi–jeudi 08h00–17h30, vendredi 08h00–13h30. Un pointage après l\'heure d\'entrée est signalé comme <b>retard</b> ; une sortie avant l\'heure comme <b>départ anticipé</b>.</p><p>Fonctionne hors-ligne (les pointages sont envoyés dès la reconnexion au ☁️ Partage).</p>' },
  adm_pointage: { t: 'Suivi des pointages', h: '<p>Vue RH des pointages enregistrés depuis la Badgeuse : indicateurs du jour (présents, absents, retards), <b>résumé par agent</b> sur la période choisie (jours présents/attendus, absences, retards, départs anticipés) et <b>journal détaillé</b> des pointages. Choisissez une période (Aujourd\'hui / Ce mois / personnalisée) puis <b>Actualiser</b>. Chaque tableau s\'exporte en CSV.</p><p>Le code personnel de chaque agent se configure dans sa fiche du module <b>Personnel</b> (champ « Code de pointage »).</p>' },
};

const Help = (() => {
  function open(key) {
    const info = HELP[key] || HELP._default;
    const src = 'audio/' + key + '.mp3';
    const audio = el('audio', { controls: '', preload: 'none', src: src, style: { width: '100%', marginTop: '4px' } });
    const note = el('div.help-audio-note', { text: '🎧 Écoutez l’explication (votre enregistrement).' });
    const audioWrap = el('div.help-audio', {}, [audio, note]);
    const noAudio = () => { audio.style.display = 'none'; note.textContent = '🎙️ Aucun enregistrement audio pour cette section (à ajouter dans le dossier « audio »).'; };
    audio.addEventListener('error', noAudio);
    // Vérifie l'existence du fichier ; masque le lecteur s'il est absent.
    fetch(src, { method: 'HEAD' }).then(r => { if (!r.ok) noAudio(); }).catch(noAudio);
    const body = el('div.help-body', {}, [audioWrap, el('div.help-text', { html: info.h })]);
    modal('❓ Aide — ' + info.t, body, [{ text: 'Fermer', kind: 'primary', value: true }]);
  }
  return { open };
})();
window.Help = Help;
