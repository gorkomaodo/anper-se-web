/* Domaine « Gestion administrative » intégré à la PWA ANPER.
   Moteur CRUD générique (modules RH/admin), rendu via les helpers SE (el/modal/toast),
   persistance dans IndexedDB via DB.adminGet/adminSet. Pages enregistrées sous adm_<clé>. */

const ADM = (() => {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const MAIL = 'anperniger.org';
  const slug = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const anperEmail = (p, n) => { const a = slug(p), b = slug(n); return ((a && b) ? a + '.' + b : (a || b || 'agent')) + '@' + MAIL; };
  // Lettres façon colonnes de tableur (1→A … 26→Z, 27→AA…), pour prolonger le
  // format de matricule déjà en usage (001/A, 002/B… 021/U) au-delà de Z.
  function numToLetters(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

  // Rang « Direction » (rattachées directement à la Direction Générale ou étant elle-même
  // le sommet) et rang « Service/Cellule » (rattachées à une direction, cf. SERVICE_PARENT
  // plus bas) — deux listes désormais distinctes (auparavant un seul tableau DIRECTIONS
  // mélangeant les deux rangs).
  const DIRECTIONS = ['Direction Générale', 'Direction des Affaires Administratives et Financières', 'Direction de l’Ingénierie', 'Direction des Investissements', 'Unité de Gestion de Projets (Banque Mondiale)'];
  const SERVICES = ['Service Ressources Humaines', 'Service Communication', 'Service Passation des Marchés', 'Service Comptabilité & Finances', 'Service Suivi-Évaluation', 'Cellule Sauvegardes Environnementales & Sociales'];
  // Sous-catégories dépendantes de la Catégorie (fournitures & patrimoine) — 'Autre' en repli
  // pour toute catégorie non listée ici.
  const SOUS_CATEGORIES = {
    'Matériel informatique': ['Imprimante', 'PC de bureau', 'PC portable', 'Scanner', 'Onduleur', 'Vidéoprojecteur', 'Réseau (routeur, switch…)', 'Autre'],
    'Mobilier': ['Bureau', 'Chaise', 'Armoire', 'Table', 'Étagère', 'Autre'],
    'Mobilier de bureau': ['Bureau', 'Chaise', 'Armoire', 'Table', 'Étagère', 'Autre'],
    'Fourniture de bureau': ['Papeterie', 'Cartouches / toners', 'Classeurs & archivage', 'Autre'],
    'Consommable': ['Carburant', 'Pièces détachées', 'Produits d’entretien', 'Autre'],
    'EPI': ['Gants', 'Casque', 'Chaussures de sécurité', 'Gilet', 'Autre'],
    'Matériel roulant': ['Véhicule léger', 'Camion', 'Motocyclette', 'Engin', 'Autre'],
  };

  const MODULES = {
    personnel: { icon: '👤', title: 'Personnel', crumb: 'Effectifs et fiches des agents', singular: 'agent',
      fields: [
        { k: 'matricule', l: 'Matricule', t: 'text', req: true },
        { k: 'nom', l: 'Nom', t: 'text', req: true }, { k: 'prenom', l: 'Prénom', t: 'text' },
        { k: 'sexe', l: 'Sexe', t: 'select', opt: ['Masculin', 'Féminin'] },
        { k: 'situationMatrimoniale', l: 'Situation matrimoniale', t: 'select', opt: ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'] },
        { k: 'nombreEnfants', l: 'Nombre d’enfants', t: 'number', dft: 0 },
        { k: 'direction', l: 'Direction', t: 'select', opt: DIRECTIONS },
        { k: 'service', l: 'Service', t: 'select', opt: SERVICES },
        { k: 'categorie', l: 'Catégorie', t: 'select', opt: ['Direction', 'Encadrement', 'Exécution', 'Consultant'] },
        { k: 'modeRecrutement', l: 'Mode de recrutement', t: 'select', opt: ['Recruté', 'Nommé', 'Détaché', 'Mise à disposition', 'Consultant'] },
        { k: 'qualification', l: 'Qualification / Diplôme', t: 'text' },
        { k: 'poste', l: 'Poste', t: 'text' }, { k: 'dateEmbauche', l: 'Date d’embauche', t: 'date' },
        { k: 'dateSortie', l: 'Date de fin de service', t: 'date' },
        { k: 'telephone', l: 'Téléphone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Actif', 'En congé', 'Suspendu', 'Sorti'], dft: 'Actif' },
        { k: 'pin', l: 'Code de pointage (4 chiffres)', t: 'text' },
      ],
      cols: ['matricule', '__name', 'direction', 'service', 'poste', 'statut'],
    },
    courrier: { icon: '✉️', title: 'Courrier', crumb: 'Registre arrivée et départ', singular: 'courrier',
      fields: [
        { k: 'reference', l: 'Référence', t: 'text', req: true },
        { k: 'sens', l: 'Sens', t: 'select', opt: ['Arrivée', 'Départ'], dft: 'Arrivée', req: true },
        { k: 'date', l: 'Date', t: 'date' }, { k: 'correspondant', l: 'Correspondant', t: 'text' },
        { k: 'objet', l: 'Objet', t: 'text', req: true }, { k: 'service', l: 'Direction / Service concerné', t: 'select', opt: DIRECTIONS.concat(SERVICES) },
        { k: 'fichier', l: 'Pièce jointe (scan du courrier)', t: 'file' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Reçu', 'En traitement', 'Traité', 'Archivé'], dft: 'Reçu' },
      ],
      cols: ['reference', 'sens', 'date', 'correspondant', 'objet', '__file', 'statut'],
    },
    conges: { icon: '🗓️', title: 'Congés & absences', crumb: 'Demandes et suivi', singular: 'demande',
      fields: [
        { k: 'agent', l: 'Agent', t: 'agentselect', req: true },
        { k: 'type', l: 'Type', t: 'select', opt: ['Congé annuel', 'Permission', 'Absence', 'Maladie', 'Mission'], dft: 'Congé annuel' },
        { k: 'dateDebut', l: 'Du', t: 'date' }, { k: 'dateFin', l: 'Au', t: 'date' },
        { k: 'motif', l: 'Motif / Destination', t: 'text' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['En attente', 'Approuvé', 'Refusé', 'Terminé'], dft: 'En attente' },
      ],
      cols: ['agent', 'type', 'dateDebut', 'dateFin', 'statut'],
    },
    actes: { icon: '📄', title: 'Actes & décisions', crumb: 'Décisions, arrêtés, notes — imprimables', singular: 'acte',
      fields: [
        { k: 'numero', l: 'N° de l’acte', t: 'text', req: true },
        { k: 'nature', l: 'Nature', t: 'select', opt: ['Décision', 'Arrêté', 'Note de service', 'Attestation', 'Certificat'], dft: 'Décision' },
        { k: 'type', l: 'Objet / Modèle', t: 'select', opt: ['Congé annuel', 'Congé de maladie', 'Permission d’absence', 'Stage / formation', 'Nomination', 'Affectation / mutation', 'Prise de service', 'Reprise de service', 'Mise en disponibilité', 'Cessation de service', 'Note de service', 'Attestation de travail', 'Autre'], dft: 'Congé annuel' },
        { k: 'date', l: 'Date de l’acte', t: 'date' },
        { k: 'portee', l: 'Portée', t: 'select', opt: ['Individuel', 'Collectif'], dft: 'Individuel' },
        { k: 'agent', l: 'Agent concerné', t: 'agentselect' }, { k: 'matricule', l: 'Matricule', t: 'text' },
        { k: 'poste', l: 'Poste / Fonction', t: 'text' }, { k: 'direction', l: 'Direction', t: 'select', opt: DIRECTIONS },
        { k: 'service', l: 'Service', t: 'select', opt: SERVICES },
        { k: 'beneficiaires', l: 'Bénéficiaires — si collectif', t: 'agentsmulti' },
        { k: 'objet', l: 'Précisions (motif, objet de la mission…)', t: 'text' },
        { k: 'lieu', l: 'Lieu / Destination (mission, stage…)', t: 'text' },
        { k: 'dateDebut', l: 'Date de début / d’effet', t: 'date' }, { k: 'dateFin', l: 'Date de fin', t: 'date' },
        { k: 'duree', l: 'Durée (ex. 30 jours)', t: 'text' },
        { k: 'signataire', l: 'Signataire', t: 'text', dft: 'Le Directeur Général' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Projet', 'En circuit', 'Visé', 'Validé', 'Signé', 'Notifié', 'Archivé'], dft: 'Projet' },
      ],
      cols: ['numero', 'type', 'portee', 'agent', 'date', 'statut'],
    },
    ordremission: { icon: '🚗', title: 'Ordres de mission', crumb: 'Feuille de déplacement — saisie directe & impression', singular: 'ordre de mission',
      fields: [
        { k: 'numero', l: 'N° de l’ordre de mission', t: 'text', req: true },
        { k: 'kind', l: 'Type', t: 'text' },
        { k: 'agent', l: 'Missionnaire', t: 'text' },
        { k: 'lieu', l: 'Destination', t: 'text' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Projet', 'Signé', 'En cours', 'Effectuée', 'Archivé'], dft: 'Projet' },
      ],
      cols: ['numero', 'kind', 'agent', 'lieu', 'statut'],
    },
    fournitures: { icon: '📦', title: 'Fournitures & matériel', crumb: 'Stock et logistique', singular: 'article',
      fields: [
        { k: 'article', l: 'Désignation', t: 'text', req: true },
        { k: 'categorie', l: 'Catégorie', t: 'select', opt: ['Fourniture de bureau', 'Matériel informatique', 'Mobilier', 'Consommable', 'EPI', 'Autre'] },
        { k: 'sousCategorie', l: 'Sous-catégorie', t: 'select', opt: [] },
        { k: 'quantite', l: 'Quantité en stock', t: 'number', dft: 0 }, { k: 'unite', l: 'Unité', t: 'text' },
        { k: 'seuil', l: 'Seuil d’alerte', t: 'number', dft: 0 }, { k: 'emplacement', l: 'Emplacement', t: 'text' },
      ],
      cols: ['article', 'categorie', 'sousCategorie', 'quantite', 'seuil', 'emplacement'],
    },
    patrimoine: { icon: '🏢', title: 'Patrimoine & matériel', crumb: 'Mobilier, matériel informatique et matériel roulant', singular: 'bien',
      fields: [
        { k: 'inventaire', l: 'N° d’inventaire', t: 'text', req: true },
        { k: 'categorie', l: 'Catégorie', t: 'select', opt: ['Mobilier de bureau', 'Matériel informatique', 'Matériel roulant'], req: true, dft: 'Mobilier de bureau' },
        { k: 'sousCategorie', l: 'Sous-catégorie', t: 'select', opt: [] },
        { k: 'designation', l: 'Désignation / Type (ex. Chaise visiteur, PC portable, Véhicule…)', t: 'text', req: true },
        { k: 'marque', l: 'Marque / Modèle', t: 'text' },
        { k: 'numeroSerie', l: 'N° de série / Châssis', t: 'text' },
        { k: 'immatriculation', l: 'Immatriculation (matériel roulant)', t: 'text' },
        { k: 'direction', l: 'Direction / Service d’affectation', t: 'select', opt: DIRECTIONS.concat(SERVICES), req: true },
        { k: 'detenteur', l: 'Agent détenteur / responsable', t: 'agentselect' },
        { k: 'dateAcquisition', l: 'Date d’acquisition', t: 'date' },
        { k: 'valeur', l: 'Valeur d’acquisition (FCFA)', t: 'number', dft: 0 },
        { k: 'etat', l: 'État', t: 'select', opt: ['Neuf', 'Bon état', 'Usagé', 'En panne', 'Réformé'], dft: 'Bon état' },
        { k: 'assurancePolice', l: 'N° de police d’assurance (matériel roulant)', t: 'text' },
        { k: 'assureur', l: 'Compagnie d’assurance', t: 'text' },
        { k: 'assuranceEcheance', l: 'Échéance de l’assurance', t: 'date' },
        { k: 'observation', l: 'Observations', t: 'textarea' },
      ],
      cols: ['inventaire', 'categorie', 'sousCategorie', 'designation', 'direction', 'etat'],
    },
    hse: { icon: '🛡️', title: 'Hygiène, Sécurité & Santé', crumb: 'Incidents, inspections, SST', singular: 'enregistrement',
      fields: [
        { k: 'reference', l: 'Référence', t: 'text', req: true },
        { k: 'type', l: 'Type', t: 'select', opt: ['Accident de travail', 'Presque-accident', 'Incident', 'Inspection sécurité', 'Inspection hygiène', 'Exercice / Formation'] },
        { k: 'date', l: 'Date', t: 'date' }, { k: 'lieu', l: 'Lieu', t: 'text' },
        { k: 'gravite', l: 'Gravité', t: 'select', opt: ['Faible', 'Modérée', 'Élevée', 'Critique'], dft: 'Faible' },
        { k: 'description', l: 'Description', t: 'textarea' }, { k: 'mesure', l: 'Mesures prises', t: 'textarea' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Ouvert', 'En cours', 'Clôturé'], dft: 'Ouvert' },
      ],
      cols: ['reference', 'type', 'date', 'lieu', 'gravite', 'statut'],
    },
    assurances: { icon: '☂️', title: 'Assurances', crumb: 'Polices, échéances et renouvellements', singular: 'police',
      fields: [
        { k: 'police', l: 'N° de police', t: 'text', req: true },
        { k: 'type', l: 'Type d’assurance', t: 'select', opt: ['Santé / Maladie', 'Vie / Décès', 'Accident du travail', 'Automobile / Flotte', 'Incendie / Biens', 'Responsabilité civile', 'Transport', 'Risques industriels', 'Autre'] },
        { k: 'assureur', l: 'Compagnie', t: 'text' }, { k: 'objet', l: 'Objet / Couverture', t: 'text' },
        { k: 'prime', l: 'Prime (FCFA)', t: 'number', dft: 0 }, { k: 'dateEcheance', l: 'Échéance', t: 'date' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Active', 'En renouvellement', 'Expirée', 'Suspendue', 'Résiliée'], dft: 'Active' },
      ],
      cols: ['police', 'type', 'assureur', 'dateEcheance', 'statut'],
    },
    sinistres: { icon: '⚠️', title: 'Sinistres', crumb: 'Déclarations et indemnisations', singular: 'sinistre',
      fields: [
        { k: 'reference', l: 'N° de déclaration', t: 'text' }, { k: 'police', l: 'Police concernée', t: 'text' },
        { k: 'assureur', l: 'Compagnie', t: 'text' },
        { k: 'type', l: 'Nature', t: 'select', opt: ['Accident du travail', 'Maladie', 'Automobile', 'Incendie / Biens', 'Responsabilité civile', 'Transport', 'Décès', 'Autre'] },
        { k: 'dateSinistre', l: 'Date du sinistre', t: 'date' }, { k: 'montantEstime', l: 'Montant estimé (FCFA)', t: 'number', dft: 0 },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Déclaré', 'En cours', 'Indemnisé', 'Rejeté', 'Clôturé'], dft: 'Déclaré' },
      ],
      cols: ['reference', 'police', 'type', 'dateSinistre', 'statut'],
    },
    archives: { icon: '🗄️', title: 'Archives & documents', crumb: 'Registre documentaire avec pièces jointes', singular: 'document',
      fields: [
        { k: 'cote', l: 'Cote / Référence', t: 'text', req: true },
        { k: 'titre', l: 'Titre du document', t: 'text', req: true },
        { k: 'type', l: 'Dossier / Type', t: 'select', opt: ['Dossier individuel agent', 'Arrêté', 'Décision', 'Note de service', 'Attestation', 'Ordre de mission', 'Correspondance', 'Rapport', 'Contrat', 'Procédure', 'Autre'] },
        { k: 'agent', l: 'Agent concerné (si dossier individuel)', t: 'agentselect' },
        { k: 'dateDoc', l: 'Date', t: 'date' }, { k: 'emplacement', l: 'Emplacement (armoire / boîte)', t: 'text' },
        { k: 'motsCles', l: 'Mots-clés', t: 'text' },
        { k: 'fichier', l: 'Fichier joint (tout format)', t: 'file' },
      ],
      cols: ['cote', 'titre', 'type', 'dateDoc', '__file'],
    },
    assures: { icon: '🪪', title: 'Assurés', crumb: 'Fiches des assurés (avec photo)', singular: 'assuré',
      fields: [
        { k: 'photo', l: 'Photo d’identité', t: 'photo' },
        { k: 'matricule', l: 'Matricule', t: 'text' }, { k: 'nom', l: 'Nom', t: 'text', req: true }, { k: 'prenom', l: 'Prénom', t: 'text' },
        { k: 'sexe', l: 'Sexe', t: 'select', opt: ['Masculin', 'Féminin'] }, { k: 'dateNaissance', l: 'Date de naissance', t: 'date' },
        { k: 'direction', l: 'Direction / Service', t: 'select', opt: DIRECTIONS.concat(SERVICES) }, { k: 'poste', l: 'Poste', t: 'text' },
        { k: 'numAssure', l: 'N° d’assuré / immatriculation', t: 'text' }, { k: 'assureur', l: 'Compagnie d’assurance', t: 'text' },
        { k: 'police', l: 'N° de police', t: 'text' }, { k: 'groupeSanguin', l: 'Groupe sanguin', t: 'select', opt: ['—', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], dft: '—' },
        { k: 'telephone', l: 'Téléphone', t: 'tel' },
        { k: 'statut', l: 'Statut', t: 'select', opt: ['Actif', 'Suspendu', 'Radié'], dft: 'Actif' },
        { k: 'ayants', l: 'Ayants droit (conjoint, enfants…)', t: 'ayants' },
      ],
      cols: ['__photo', 'matricule', '__name', 'assureur', '__ayants', 'statut'],
    },
  };
  const KEYS = Object.keys(MODULES);

  const ADM_SEED = /*__ANPER_SEED__*/[];

  const load = async key => (await DB.adminGet('data:' + key)) || [];
  const save = (key, arr) => DB.adminSet('data:' + key, arr);

  // ── Pièces jointes & photos (stockées localement en IndexedDB, hors synchro cloud) ──
  async function saveBlob(file) {
    const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
    const key = 'blob:' + uid(); await DB.adminSet(key, dataUrl);
    return { key, name: file.name, size: file.size, type: file.type };
  }
  const getBlob = (key) => DB.adminGet(key);
  function downloadBlob(meta) { getBlob(meta.key).then(d => { if (!d) { toast('Pièce jointe introuvable.', 'err'); return; } const a = el('a', { href: d, download: meta.name || 'fichier' }); document.body.append(a); a.click(); a.remove(); }); }

  // ── Journal d'audit ─────────────────────────────────────────────────────────
  async function logAudit(action, key, ref) {
    try {
      const a = (await DB.adminGet('audit')) || [];
      a.unshift({ id: uid(), at: new Date().toISOString(), user: (window.AUTH && AUTH.current() ? AUTH.current().name : '—'), action, module: key || '', ref: ref || '' });
      if (a.length > 500) a.length = 500;
      await DB.adminSet('audit', a);
    } catch (e) { /* journal best-effort */ }
  }
  function recLabel(key, rec) {
    if (!rec) return '';
    if (key === 'personnel') return ((rec.nom || '') + ' ' + (rec.prenom || '')).trim();
    const m = MODULES[key];
    return rec[m && m.cols ? m.cols[0] : 'id'] || rec.numero || rec.reference || rec.id || '';
  }

  // Enregistrements de démonstration (un par type d'acte) au nom de OUMAROU Adamou
  function demoActes() {
    const b = { agent: 'OUMAROU Adamou', matricule: 'SE-018', poste: 'Chargé du Suivi-Évaluation', direction: 'Service Suivi-Évaluation', signataire: 'Le Directeur Général', statut: 'Signé' };
    const m = o => Object.assign({}, b, o);
    return [
      m({ numero: '2026-01', nature: 'Décision', type: 'Congé annuel', date: '2026-07-06', objet: 'au titre de l’exercice 2026', dateDebut: '2026-07-13', dateFin: '2026-08-11', duree: '30 jours' }),
      m({ numero: '2026-02', nature: 'Décision', type: 'Congé de maladie', date: '2026-05-04', objet: 'sur présentation d’un certificat médical', dateDebut: '2026-05-05', dateFin: '2026-05-14', duree: '10 jours' }),
      m({ numero: '2026-03', nature: 'Décision', type: 'Permission d’absence', date: '2026-06-20', objet: 'pour raisons familiales', dateDebut: '2026-06-23', dateFin: '2026-06-27', duree: '5 jours' }),
      m({ numero: '2026-04', nature: 'Décision', type: 'Ordre de mission', date: '2026-09-01', objet: 'évaluation de l’offre et de la demande d’énergie', lieu: 'Casablanca (Maroc)', dateDebut: '2026-09-10', dateFin: '2026-09-25', duree: '16 jours' }),
      m({ numero: '2026-05', nature: 'Décision', type: 'Nomination', date: '2026-04-29', objet: 'Directeur du Suivi-Évaluation', lieu: 'Direction Générale' }),
      m({ numero: '2026-06', nature: 'Décision', type: 'Affectation / mutation', date: '2026-03-01', objet: 'à la Direction de l’Ingénierie', dateDebut: '2026-03-15' }),
      m({ numero: '2026-07', nature: 'Arrêté', type: 'Mise en disponibilité', date: '2026-02-10', objet: 'sur sa demande', dateDebut: '2026-03-01', dateFin: '2027-02-28', duree: '12 mois' }),
      m({ numero: '2026-08', nature: 'Décision', type: 'Cessation de service', date: '2026-12-15', objet: 'fin de fonctions', dateFin: '2026-12-31' }),
      m({ numero: '2026-09', nature: 'Note de service', type: 'Note de service', date: '2026-06-02', objet: 'organisation du service et horaires de travail' }),
      m({ numero: '2026-10', nature: 'Attestation', type: 'Attestation de travail', date: '2026-06-15', dateDebut: '2022-03-01' }),
      m({ numero: '2026-11', nature: 'Certificat', type: 'Prise de service', date: '2026-01-06', objet: 'd’un recrutement', dateDebut: '2026-01-06', signataire: 'Le Directeur des Affaires Administratives et Financières' }),
      m({ numero: '2026-12', nature: 'Certificat', type: 'Reprise de service', date: '2026-08-11', objet: 'd’un congé administratif de 30 jours', dateDebut: '2026-08-11', signataire: 'Le Directeur des Affaires Administratives et Financières' }),
      m({ numero: '2026-13', nature: 'Certificat', type: 'Cessation de service', date: '2026-07-13', objet: 'd’un congé annuel', dateDebut: '2026-07-13', signataire: 'Le Directeur des Affaires Administratives et Financières' }),
    ];
  }
  function demoCourrier() {
    return [
      { reference: 'ARR-2026-045', sens: 'Arrivée', date: '2026-06-30', correspondant: 'Ministère de l’Énergie', objet: 'Note relative aux nouveaux statuts du personnel', service: 'Direction Générale', statut: 'Reçu' },
      { reference: 'BE/DG-ANPER/2026-012', sens: 'Départ', date: '2026-07-01', correspondant: 'Ministère de l’Économie et des Finances', objet: 'Bulletins de note des agents détachés à l’ANPER', service: 'Direction Générale', statut: 'Traité' },
    ];
  }
  // Migration une fois : l'ancien champ combiné « direction » (personnel, actes) contenait
  // indifféremment un intitulé de Direction ou de Service. On scinde : si la valeur est une clé
  // de SERVICE_PARENT (donc un Service), elle part dans le nouveau champ `service` et `direction`
  // reprend sa direction de rattachement ; sinon `direction` reste inchangé. Le champ `service`
  // du module courrier n'est pas concerné (resté un unique sélecteur Direction/Service combiné).
  async function migrateDirService() {
    if (await DB.adminGet('schema:dirService')) return;
    for (const key of ['personnel', 'actes']) {
      const arr = await load(key);
      let changed = false;
      for (const r of arr) {
        const v = (r.direction || '').trim();
        // SERVICE_PARENT mélange sciemment 2 niveaux (les 3 directions non-DG remontent aussi
        // vers Direction Générale, pour le circuit courrier) — ne migrer que les vrais Services.
        if (v && SERVICES.includes(v)) { r.service = v; r.direction = SERVICE_PARENT[v] || 'Direction Générale'; changed = true; }
      }
      if (changed) await save(key, arr);
    }
    await DB.adminSet('schema:dirService', true);
  }

  async function seedIfNeeded() {
    if ((await DB.adminGet('seed_v')) !== '2') {
      if (!(await load('personnel')).length && ADM_SEED.length) {
        const arr = ADM_SEED.map(a => Object.assign({ id: uid(), email: a.email || anperEmail(a.prenom, a.nom) }, a));
        arr.forEach(a => { if (!a.email) a.email = anperEmail(a.prenom, a.nom); });
        await save('personnel', arr);
      }
      if (!(await load('actes')).length) await save('actes', demoActes().map(a => Object.assign({ id: uid(), createdAt: new Date().toISOString() }, a)));
      if (!(await load('courrier')).length) await save('courrier', demoCourrier().map(a => Object.assign({ id: uid(), createdAt: new Date().toISOString() }, a)));
      await DB.adminSet('seed_v', '2');
    }
    // Migration direction/service : après le seed initial, jamais avant (sinon le flag se
    // pose alors que la base est encore vide et la scission ne s'applique jamais).
    await migrateDirService();
  }

  function fdate(s) { if (!s) return '—'; const d = new Date(s + 'T00:00:00'); if (isNaN(d)) return s; return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function cellValue(rec, col) {
    if (col === '__name') return ((rec.nom || '') + ' ' + (rec.prenom || '')).trim() || '—';
    const f = MODULES[Object.keys(MODULES).find(k => MODULES[k].cols.includes(col))] && null;
    let v = rec[col];
    if (v == null || v === '') return '—';
    if (/^date/i.test(col) || col === 'date' || col === 'dateEcheance' || col === 'dateSinistre' || col === 'dateDebut' || col === 'dateFin' || col === 'dateEmbauche') return fdate(v);
    return v;
  }
  function colLabel(key, col) {
    if (col === '__name') return key === 'personnel' ? 'Agent' : 'Nom';
    if (col === '__file') return 'Pièce jointe';
    if (col === '__photo') return 'Photo';
    if (col === '__ayants') return 'Ayants droit';
    const f = MODULES[key].fields.find(f => f.k === col);
    return f ? f.l : col;
  }

  // ── Éditeur d'ayants droit (sous-fiches avec photo) ─────────────────────────
  function buildAyantsEditor(initial) {
    const list = (initial || []).map(a => ({ ...a }));
    const rowsBox = el('div');
    function renderRows() {
      rowsBox.innerHTML = '';
      if (!list.length) rowsBox.append(el('div.adm-hint', { text: 'Aucun ayant droit. Ajoutez le conjoint, les enfants…' }));
      list.forEach((a, i) => {
        const thumb = el('div.ay-photo');
        if (a.photo && a.photo.key) { const img = el('img'); getBlob(a.photo.key).then(d => { if (d) img.src = d; }); thumb.append(img); } else thumb.append(el('span.ay-noimg', { text: 'photo' }));
        const photoIn = el('input.ay-file', { type: 'file', accept: 'image/*' });
        photoIn.addEventListener('change', async () => { const f = photoIn.files && photoIn.files[0]; if (f) { a.photo = await saveBlob(f); renderRows(); } });
        const lien = el('select.field-in'); ['Conjoint(e)', 'Enfant', 'Ascendant', 'Autre'].forEach(o => lien.append(el('option', { value: o, text: o, selected: o === a.lien ? '' : null }))); lien.value = a.lien || 'Enfant'; lien.onchange = () => a.lien = lien.value;
        const nom = el('input.field-in', { placeholder: 'Nom' }); nom.value = a.nom || ''; nom.oninput = () => a.nom = nom.value;
        const prenom = el('input.field-in', { placeholder: 'Prénom' }); prenom.value = a.prenom || ''; prenom.oninput = () => a.prenom = prenom.value;
        const sexe = el('select.field-in'); ['Masculin', 'Féminin'].forEach(o => sexe.append(el('option', { value: o, text: o, selected: o === a.sexe ? '' : null }))); sexe.value = a.sexe || 'Masculin'; sexe.onchange = () => a.sexe = sexe.value;
        const dn = el('input.field-in', { type: 'date' }); dn.value = a.dateNaissance || ''; dn.oninput = () => a.dateNaissance = dn.value;
        const del = el('button.adm-ic.del', { text: '🗑', title: 'Retirer', type: 'button', onclick: () => { list.splice(i, 1); renderRows(); } });
        rowsBox.append(el('div.ay-row', {}, [thumb, el('div.ay-fields', {}, [lien, nom, prenom, sexe, dn, photoIn]), del]));
      });
    }
    renderRows();
    const addBtn = el('button.btn.btn-ghost.btn-sm', { text: '＋ Ajouter un ayant droit', type: 'button', onclick: () => { list.push({ id: uid(), lien: 'Enfant', sexe: 'Masculin' }); renderRows(); } });
    return { node: el('div.ay-wrap', {}, [rowsBox, addBtn]), get: () => list };
  }

  // ── Formulaire d'ajout / modification ───────────────────────────────────────
  function openForm(key, rec, after, defaults) {
    if (key === 'ordremission') { openOMForm(rec, after); return; }
    const m = MODULES[key];
    const inputs = {};
    const grid = el('div.adm-form');
    for (const f of m.fields) {
      if (f.t === 'ayants') { const ed = buildAyantsEditor(rec ? rec[f.k] : []); inputs[f.k] = { isAyants: true, get: ed.get }; grid.append(el('div.adm-field.full', {}, [el('label.field-lbl', { text: f.l }), ed.node])); continue; }
      if (f.t === 'agentsmulti') {
        const initial = new Set(rec && rec[f.k] ? String(rec[f.k]).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : []);
        const box = el('div.adm-agentsmulti', {}, [el('div.adm-hint', { text: 'Chargement des agents…' })]);
        let boxes = [];
        load('personnel').then(list => {
          box.innerHTML = '';
          if (!list.length) { box.append(el('div.adm-hint', { text: 'Aucun agent enregistré.' })); return; }
          boxes = list.map(p => ({ nm: ((p.nom || '') + ' ' + (p.prenom || '')).trim(), cb: el('input', { type: 'checkbox' }) }));
          boxes.forEach(b => { b.cb.checked = initial.has(b.nm); box.append(el('label.perm-item', {}, [b.cb, el('span', { text: b.nm || '(sans nom)' })])); });
        });
        const cellM = el('div.adm-field.full', {}, [el('label.field-lbl', { text: f.l }), box]);
        inputs[f.k] = { isAgentsMulti: true, get: () => boxes.filter(b => b.cb.checked).map(b => b.nm).join('\n'), cell: cellM };
        grid.append(cellM);
        continue;
      }
      if (f.t === 'agentselect') {
        const sel = el('select.field-in');
        sel.append(el('option', { value: '', text: '— Choisir un agent du personnel —' }));
        const txt = el('input.field-in', { value: rec ? (rec[f.k] ?? '') : '', placeholder: 'Nom de l’agent (ou saisie libre)', style: { marginTop: '6px' } });
        let plist = [];
        load('personnel').then(l => { plist = l || []; plist.forEach(p => { const nm = ((p.nom || '') + ' ' + (p.prenom || '')).trim(); sel.append(el('option', { value: p.id, text: (nm || '(sans nom)') + (p.matricule ? ' — ' + p.matricule : '') })); }); });
        const autoCells = ['matricule', 'poste', 'direction', 'service'];
        sel.onchange = () => {
          const p = plist.find(x => x.id === sel.value);
          if (!p) { autoCells.forEach(k => { if (inputs[k]) inputs[k].disabled = false; }); return; }
          txt.value = ((p.nom || '') + ' ' + (p.prenom || '')).trim();
          if (inputs.matricule) inputs.matricule.value = p.matricule || '';
          if (inputs.poste) inputs.poste.value = p.poste || '';
          if (inputs.direction) inputs.direction.value = p.direction || '';
          if (inputs.service) inputs.service.value = p.service || '';
          // Champs renseignés automatiquement depuis l'agent choisi : non modifiables tant
          // qu'un agent est sélectionné (réactivés si la sélection est vidée, ci-dessus).
          autoCells.forEach(k => { if (inputs[k]) inputs[k].disabled = true; });
        };
        inputs[f.k] = txt;
        grid.append(el('div.adm-field.full', {}, [el('label.field-lbl', { text: f.l }), sel, txt]));
        continue;
      }
      const val = rec ? (rec[f.k] ?? '') : ((defaults && defaults[f.k] != null) ? defaults[f.k] : (f.dft ?? ''));
      let input;
      if (f.t === 'select') {
        input = el('select.field-in');
        if (!f.req) input.append(el('option', { value: '', text: '—' }));
        for (const o of f.opt) input.append(el('option', { value: o, text: o, selected: String(val) === o ? '' : null }));
        input.value = val;
      } else if (f.t === 'textarea') {
        input = el('textarea.field-in', { rows: 2 }); input.value = val;
      } else if (f.t === 'file' || f.t === 'photo') {
        input = el('input.field-in', { type: 'file', accept: f.t === 'photo' ? 'image/*' : '*/*' });
      } else {
        input = el('input.field-in', { type: f.t === 'number' ? 'number' : (f.t === 'date' ? 'date' : (f.t === 'email' ? 'email' : (f.t === 'tel' ? 'tel' : 'text'))) });
        input.value = val;
      }
      inputs[f.k] = input;
      const cell = el('div.adm-field' + (f.t === 'textarea' || f.t === 'file' || f.t === 'photo' ? '.full' : ''), {}, [
        el('label.field-lbl', { html: f.l + (f.req ? ' <span class="req">*</span>' : '') }), input,
      ]);
      if ((f.t === 'file' || f.t === 'photo') && rec && rec[f.k] && rec[f.k].name) cell.append(el('div.adm-hint', { text: 'Actuel : ' + rec[f.k].name + ' — laissez vide pour le conserver.' }));
      grid.append(cell);
    }
    if (inputs.service && inputs.direction && inputs.service.tagName === 'SELECT') {
      // Choisir un Service déduit automatiquement sa Direction de rattachement (SERVICE_PARENT) ;
      // la Direction redevient éditable si le Service est vidé.
      const syncDir = () => {
        const svc = inputs.service.value;
        if (svc && SERVICE_PARENT[svc]) { inputs.direction.value = SERVICE_PARENT[svc]; inputs.direction.disabled = true; }
        else { inputs.direction.disabled = false; }
      };
      inputs.service.addEventListener('change', syncDir);
      syncDir();
    }
    if ((key === 'fournitures' || key === 'patrimoine') && inputs.categorie && inputs.sousCategorie) {
      // La liste de la sous-catégorie dépend de la catégorie choisie (SOUS_CATEGORIES) ;
      // premier cascading dropdown "options qui changent" du fichier.
      const savedSub = rec ? (rec.sousCategorie || '') : '';
      const syncSub = (keepSaved) => {
        const opts = SOUS_CATEGORIES[inputs.categorie.value] || [];
        const sel = inputs.sousCategorie;
        sel.innerHTML = '';
        sel.append(el('option', { value: '', text: '—' }));
        for (const o of opts) sel.append(el('option', { value: o, text: o }));
        sel.value = (keepSaved && opts.includes(savedSub)) ? savedSub : '';
      };
      inputs.categorie.addEventListener('change', () => syncSub(false));
      syncSub(true);
    }
    if (key === 'patrimoine' && inputs.categorie) {
      // Champs propres à une catégorie (N° de série pour informatique/roulant, assurance/
      // immatriculation pour matériel roulant seulement) — masqués sinon.
      const cellOf = k => inputs[k] ? (inputs[k].cell || (inputs[k].closest && inputs[k].closest('.adm-field'))) : null;
      const serieCell = cellOf('numeroSerie');
      const roulantCells = ['immatriculation', 'assurancePolice', 'assureur', 'assuranceEcheance'].map(cellOf);
      const syncCat = () => {
        const cat = inputs.categorie.value;
        if (serieCell) serieCell.style.display = (cat === 'Matériel informatique' || cat === 'Matériel roulant') ? '' : 'none';
        roulantCells.forEach(c => { if (c) c.style.display = (cat === 'Matériel roulant') ? '' : 'none'; });
      };
      inputs.categorie.addEventListener('change', syncCat);
      syncCat();
    }
    if (key === 'actes') {
      const psel = inputs.portee, tsel = inputs.type;
      const cellOf = k => inputs[k] ? (inputs[k].cell || (inputs[k].closest && inputs[k].closest('.adm-field'))) : null;
      const benefCell = cellOf('beneficiaires');
      const indivCells = ['agent', 'matricule', 'poste', 'direction', 'service'].map(cellOf);
      const sync = () => {
        const col = psel && psel.value === 'Collectif';
        if (benefCell) benefCell.style.display = col ? '' : 'none';
        indivCells.forEach(c => { if (c) c.style.display = col ? 'none' : ''; });
      };
      if (psel) { psel.addEventListener('change', sync); sync(); }
      // La nature « Note de service » s'adresse en général à l'ensemble du personnel :
      // valeur par défaut Collectif, modifiable ensuite librement.
      if (tsel && psel) tsel.addEventListener('change', () => { if (tsel.value === 'Note de service') { psel.value = 'Collectif'; sync(); } });
    }
    modal((rec ? 'Modifier' : 'Ajouter') + ' — ' + m.singular, grid, [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Enregistrer', kind: 'primary', onClick: async () => {
        for (const f of m.fields) if (f.req && !String(inputs[f.k].value).trim()) { toast('Champ requis : ' + f.l, 'err'); return false; }
        const arr = await load(key);
        let obj = rec ? arr.find(r => r.id === rec.id) : null;
        if (!obj) { obj = { id: uid(), createdAt: new Date().toISOString() }; arr.push(obj); }
        for (const f of m.fields) {
          if (f.t === 'ayants' || f.t === 'agentsmulti') { obj[f.k] = inputs[f.k].get(); continue; }
          if (f.t === 'file' || f.t === 'photo') { const file = inputs[f.k].files && inputs[f.k].files[0]; if (file) obj[f.k] = await saveBlob(file); continue; }
          obj[f.k] = f.t === 'number' ? (+inputs[f.k].value || 0) : inputs[f.k].value;
        }
        if (key === 'personnel' && !obj.email) obj.email = anperEmail(obj.prenom, obj.nom);
        if (key === 'courrier' && !rec) {
          // Automatisation : le circuit hiérarchique (agent/responsable du service -> direction
          // de rattachement -> Directeur Général) est généré dès l'enregistrement d'un nouveau
          // courrier, entrant ou sortant — comme le circuit de visa des Actes & décisions.
          const pers = await load('personnel');
          obj.transmission = defaultCourrierChain(obj.service, pers, obj.sens);
          updateCourrierStatut(obj);
        }
        await save(key, arr);
        logAudit(rec ? 'Modification' : 'Ajout', key, recLabel(key, obj));
        toast((rec ? 'Modifié' : 'Ajouté') + ' ✔', 'ok');
        if (after) after();
      } },
    ]);
  }

  async function del(key, rec, after) {
    if (!(await confirmDialog('Supprimer', 'Supprimer définitivement cet élément ?'))) return;
    let arr = await load(key); arr = arr.filter(r => r.id !== rec.id);
    await save(key, arr); logAudit('Suppression', key, recLabel(key, rec)); toast('Supprimé ✔', 'ok'); if (after) after();
  }

  // ── Page d'un module ────────────────────────────────────────────────────────
  function page(key) {
    const m = MODULES[key];
    const node = el('div.page');
    const head = el('div.page-head', {}, [
      el('div', {}, [el('h1', { text: m.icon + ' ' + m.title }), el('div.page-crumb', { text: m.crumb })]),
    ]);
    if (AUTH.canWrite()) head.append(el('button.btn.btn-primary', { text: '＋ Ajouter', onclick: () => openForm(key, null, fill) }));
    node.append(head);
    const wrap = el('div.adm-tablewrap'); node.append(wrap);

    async function fill() {
      const data = await load(key);
      wrap.innerHTML = '';
      if (!data.length) { wrap.append(el('div.adm-empty', { text: 'Aucun enregistrement.' })); return; }
      const table = el('table.adm-table');
      const thead = el('tr');
      m.cols.forEach(c => thead.append(el('th', { text: colLabel(key, c) })));
      const hasActions = AUTH.canWrite() || key === 'actes' || key === 'courrier' || key === 'ordremission' || key === 'patrimoine';
      if (hasActions) thead.append(el('th', { text: '', style: { width: '120px' } }));
      table.append(el('thead', {}, [thead]));
      const tb = el('tbody');
      for (const rec of data) {
        const tr = el('tr');
        if (rec.categorie) tr.dataset.cat = rec.categorie;
        if (key === 'actes') { tr.dataset.nature = rec.nature || ''; tr.dataset.type = rec.type || ''; }
        if (key === 'courrier') tr.dataset.sens = rec.sens || '';
        m.cols.forEach(c => {
          if (c === '__file') { const f = rec.fichier; const td = el('td'); td.append(f && f.key ? el('button.adm-filechip', { title: f.name, onclick: () => downloadBlob(f) }, [el('span', { text: '📎 ' + (f.name || 'fichier') })]) : el('span', { text: '—' })); tr.append(td); return; }
          if (c === '__photo') { const td = el('td'); const p = rec.photo; if (p && p.key) { const img = el('img.adm-thumb', { alt: '' }); getBlob(p.key).then(d => { if (d) img.src = d; }); td.append(img); } else td.append(el('span.adm-noimg', { text: '—' })); tr.append(td); return; }
          if (c === '__ayants') { const n = (rec.ayants || []).length; tr.append(el('td', { text: n ? n + ' ayant(s) droit' : '—' })); return; }
          const v = cellValue(rec, c);
          if (c === 'statut' || c === 'gravite' || c === 'sens' || c === 'etat' || c === 'categorie') tr.append(el('td', {}, [el('span.adm-chip', { text: v })]));
          else tr.append(el('td', { text: v }));
        });
        if (hasActions) {
          const acts = [];
          if (key === 'actes') acts.push(el('button.adm-ic', { title: 'Document imprimable', text: '📄', onclick: () => openActeDoc(rec) }));
          if (key === 'ordremission') acts.push(el('button.adm-ic', { title: 'Remplir / imprimer la feuille de déplacement', text: '📄', onclick: () => openOMForm(rec, fill) }));
          if (key === 'actes' && AUTH.canWrite()) acts.push(el('button.adm-ic', { title: 'Circuit de visa', text: '🔀', onclick: () => openCircuit(rec, fill) }));
          if (key === 'courrier') acts.push(el('button.adm-ic', { title: (rec.sens === 'Départ' ? 'Bordereau d’envoi' : 'Fiche de transmission'), text: '📄', onclick: () => openCourrierDoc(rec) }));
          if (key === 'courrier' && rec.sens !== 'Départ' && AUTH.canWrite()) acts.push(el('button.adm-ic', { title: 'Circuit de transmission', text: '🔀', onclick: () => openTransmission(rec, fill) }));
          if (key === 'courrier' && rec.sens === 'Départ' && AUTH.canWrite()) {
            const signed = !!courrierSignStatus(rec);
            acts.push(el('button.adm-ic', { title: signed ? 'Signé par le DG — cliquer pour annuler' : 'Marquer signé par le DG', text: signed ? '✅' : '✍️', onclick: () => toggleCourrierSignature(rec, fill) }));
          }
          if (key === 'patrimoine') acts.push(el('button.adm-ic', { title: 'Fiche du bien', text: '📄', onclick: () => openSimpleDoc(ficheMaterielDoc(rec), 'Fiche_' + (rec.immatriculation || rec.inventaire || 'bien')) }));
          if (AUTH.canWrite()) {
            acts.push(el('button.adm-ic', { title: 'Modifier', text: '✎', onclick: () => openForm(key, rec, fill) }));
            acts.push(el('button.adm-ic.del', { title: 'Supprimer', text: '🗑', onclick: () => del(key, rec, fill) }));
          }
          tr.append(el('td', {}, [el('div.adm-actions', {}, acts)]));
        }
        tb.append(tr);
      }
      table.append(tb); wrap.append(table);
    }
    node._onMount = fill;
    return node;
  }

  // ── Actes & décisions : document officiel imprimable ────────────────────────
  function escH(x) { return (x == null ? '' : String(x)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function longDate(s) { if (!s) return '……………………'; const d = new Date(s + 'T00:00:00'); if (isNaN(d)) return s; return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function ph(v, p) { return (v != null && String(v).trim() !== '') ? escH(v) : '[' + p + ']'; }
  function auLa(d) { d = (d || '').trim(); if (!d) return 'à la [DIRECTION]'; if (/^(service|bureau|d[ée]partement)/i.test(d)) return 'au ' + escH(d); if (/^(unit[ée]|agence)/i.test(d)) return 'à l’' + escH(d); return 'à la ' + escH(d); }
  function civiliteFor(rec, pers) {
    let sx = rec.sexe || '';
    if (!sx) {
      const m = (rec.matricule || '').trim().toLowerCase();
      let p = m && pers.find(x => (x.matricule || '').trim().toLowerCase() === m);
      if (!p) { const n = (rec.agent || '').trim().toLowerCase(); p = n && pers.find(x => (((x.nom || '') + ' ' + (x.prenom || '')).trim().toLowerCase()) === n); }
      if (p) sx = p.sexe || '';
    }
    if (/f[ée]m/i.test(sx) || /mme|mlle|madame/i.test(rec.agent || '')) return { civ: 'Madame', e: 'e' };
    return { civ: 'Monsieur', e: '' };
  }
  const OBJ_LABEL = { 'Congé annuel': 'mise en congé annuel', 'Congé de maladie': 'mise en congé de maladie', 'Stage / formation': 'mise en stage / formation', 'Ordre de mission': 'ordre de mission', 'Reprise de service': 'reprise de service', 'Affectation / mutation': 'affectation', 'Mise en disponibilité': 'mise en disponibilité', 'Cessation de service': 'cessation de service' };
  function acteHeader(service) {
    return '<div class="acte-lh">'
      + '<div class="acte-lh-l">'
      +   '<div class="acte-l1">RÉPUBLIQUE DU NIGER</div>'
      +   '<div class="acte-l2"><i>Fraternité – Travail – Progrès</i></div>'
      +   '<div class="acte-l1">MINISTÈRE DE L’ÉNERGIE</div>'
      +   '<img class="acte-logo" src="icons/logo.png" alt="ANPER" onerror="this.style.display=\'none\'"/>'
      + '</div>'
      + '<div class="acte-lh-r">'
      +   '<div class="acte-l1b">AGENCE NIGÉRIENNE DE PROMOTION DE L’ÉLECTRIFICATION EN MILIEU RURAL</div>'
      +   '<div class="acte-l2"><i>(Établissement Public à caractère Administratif)</i></div>'
      +   '<div class="acte-l2">BP : 11577 — Tél : +227 20 35 01 73</div>'
      +   '<div class="acte-l2">www.anperniger.org — anperniger@anperniger.org</div>'
      +   '<div class="acte-l1" style="margin-top:6px">DIRECTION GÉNÉRALE</div>'
      +   (service ? '<div class="acte-l2"><i>' + escH(service) + '</i></div>' : '')
      + '</div>'
      + '</div><hr class="acte-hr"/>';
  }
  function defaultCircuitSteps() {
    return [
      { id: uid(), role: 'Chef du Service Ressources Humaines', action: 'Visa', statut: 'En attente', date: '', by: '' },
      { id: uid(), role: 'Directeur des Affaires Administratives et Financières', action: 'Validation', statut: 'En attente', date: '', by: '' },
      { id: uid(), role: 'Directeur Général', action: 'Signature', statut: 'En attente', date: '', by: '' },
    ];
  }
  function acteCircuit(rec) {
    const steps = (rec.circuit && rec.circuit.length) ? rec.circuit : defaultCircuitSteps();
    const rows = steps.map(s => '<tr><td>' + escH(s.role || '') + '</td><td>' + escH(s.action || '') + '</td><td>' + (s.date ? escH(longDate(s.date)) : '') + '</td><td>' + escH(s.by || '') + '</td></tr>').join('');
    return '<div class="acte-circ-t">Circuit de visa, de validation et de signature</div>'
      + '<table class="acte-circ"><thead><tr><th>Responsable / Fonction</th><th>Pour</th><th>Date</th><th>Signature</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  const VERB = { Visa: 'Visé', Validation: 'Validé', Signature: 'Signé' };
  function updateActeStatut(rec) {
    const c = rec.circuit || [];
    if (!c.length) { if (rec.statut === 'En circuit') rec.statut = 'Projet'; return; }
    if (c.some(s => s.action === 'Signature' && s.statut === 'Signé')) rec.statut = 'Signé';
    else if (c.some(s => s.action === 'Validation' && s.statut === 'Validé')) rec.statut = 'Validé';
    else if (c.some(s => s.action === 'Visa' && s.statut === 'Visé')) rec.statut = 'Visé';
    else rec.statut = 'En circuit';
  }
  function openCircuit(rec, after) {
    const body = el('div.circ-body');
    async function persist() { const arr = await load('actes'); const o = arr.find(r => r.id === rec.id); if (o) { o.circuit = rec.circuit; o.statut = rec.statut; await save('actes', arr); } if (after) after(); }
    function render() {
      body.innerHTML = '';
      const steps = (rec.circuit && rec.circuit.length) ? rec.circuit : (rec.circuit = defaultCircuitSteps());
      if (!steps.length) body.append(el('div.adm-empty', { text: 'Aucune étape. Ajoutez le circuit standard.' }));
      steps.forEach((s, i) => {
        const done = /é$/.test(s.statut || '');
        body.append(el('div.circ-step' + (done ? '.done' : ''), {}, [
          el('div.circ-h', {}, [el('span.circ-n', { text: String(i + 1) }), el('b', { text: s.role || '(responsable)' }), el('span.circ-act', { text: s.action })]),
          AUTH.canWrite() ? el('div.circ-ctrl', {}, [
            el('input.field-in', { value: s.role || '', placeholder: 'Responsable / fonction', oninput: e => { s.role = e.target.value; } }),
            (() => { const sel = el('select.field-in'); ['Visa', 'Validation', 'Signature'].forEach(a => sel.append(el('option', { value: a, text: a, selected: a === s.action ? '' : null }))); sel.value = s.action; sel.onchange = () => { s.action = sel.value; }; return sel; })(),
          ]) : null,
          el('div.circ-meta', { text: done ? ((s.statut) + ' le ' + (s.date ? longDate(s.date) : '—') + (s.by ? ' par ' + s.by : '')) : 'En attente' }),
          AUTH.canWrite() ? el('div.circ-actions', {}, [
            el('button.btn.btn-ghost.btn-sm', { text: '✔ ' + (VERB[s.action] || 'Valider'), onclick: async () => { s.statut = VERB[s.action] || 'Validé'; s.date = new Date().toISOString().slice(0, 10); s.by = (AUTH.current() || {}).name || ''; updateActeStatut(rec); await persist(); logAudit('Acte ' + (VERB[s.action] || ''), 'actes', rec.numero || ''); render(); } }),
            el('button.btn.btn-ghost.btn-sm', { text: '↺', title: 'Réinitialiser', onclick: async () => { s.statut = 'En attente'; s.date = ''; s.by = ''; updateActeStatut(rec); await persist(); render(); } }),
            el('button.adm-ic.del', { text: '🗑', onclick: async () => { rec.circuit = steps.filter(x => x.id !== s.id); updateActeStatut(rec); await persist(); render(); } }),
          ]) : null,
        ]));
      });
      if (AUTH.canWrite()) body.append(el('div.circ-foot', {}, [
        el('button.btn.btn-ghost.btn-sm', { text: '+ Étape', onclick: async () => { steps.push({ id: uid(), role: '', action: 'Visa', statut: 'En attente', date: '', by: '' }); await persist(); render(); } }),
        el('button.btn.btn-ghost.btn-sm', { text: 'Circuit standard', onclick: async () => { rec.circuit = defaultCircuitSteps(); updateActeStatut(rec); await persist(); render(); } }),
      ]));
    }
    render();
    modal('Circuit — ' + (rec.numero || 'acte') + (rec.agent ? ' · ' + rec.agent : ''), body, [{ text: 'Fermer', kind: 'primary', onClick: () => { persist(); } }]);
  }
  // Corps de l'acte selon le type (Article 1 + visas spécifiques)
  function acteBody(rec, civ, e, ident, periode, plur) {
    const dEff = escH(longDate(rec.dateDebut || rec.date));
    const es = plur ? 'sont' : 'est';                                   // est / sont
    const pp = m => plur ? (m.slice(-1) === 's' ? m : m + 's')          // accord du participe
                         : (e ? m + 'e' : m);
    const inte = plur ? 'des intéressés' : 'de l’intéressé' + e;
    const M = {
      'Congé annuel': { extra: ['la demande de congé ' + inte], art: ident + ' ' + es + ' ' + pp('mis') + ' en congé annuel' + periode + '.' },
      'Congé de maladie': { extra: ['le certificat médical produit'], art: ident + ' ' + es + ' ' + pp('placé') + ' en congé de maladie' + periode + '.' },
      'Stage / formation': { extra: ['l’intérêt du service'], art: ident + ' ' + es + ' ' + pp('autorisé') + ' à suivre ' + (rec.objet ? escH(rec.objet) : 'un stage / une formation') + (rec.lieu ? ' à ' + escH(rec.lieu) : '') + periode + '.' },
      'Ordre de mission': { extra: ['les nécessités de service'], art: ident + ' ' + es + ' ' + pp('chargé') + ' d’une mission' + (rec.lieu ? ' à ' + escH(rec.lieu) : '') + (rec.objet ? ', ayant pour objet ' + escH(rec.objet) : '') + periode + '.' },
      'Nomination': { extra: ['les nécessités de service'], art: ident + ' ' + es + ' ' + pp('nommé') + ' ' + (rec.objet ? escH(rec.objet) : 'aux fonctions indiquées') + (rec.lieu ? ' ' + auLa(rec.lieu) : '') + ' à compter de la date de signature de la présente décision.' },
      'Permission d’absence': { extra: ['la demande ' + inte], art: ident + ' ' + es + ' ' + pp('autorisé') + ' à s’absenter au titre d’une permission d’absence' + periode + (rec.objet ? ' (' + escH(rec.objet) + ')' : '') + '.' },
      'Reprise de service': { extra: [], art: ident + ' ' + (plur ? 'reprennent' : 'reprend') + ' service à compter du ' + dEff + '.' },
      'Affectation / mutation': { extra: ['les nécessités de service'], art: ident + ' ' + es + ' ' + pp('affecté') + (rec.objet ? ' ' + escH(rec.objet) : '') + ' à compter du ' + dEff + '.' },
      'Mise en disponibilité': { extra: ['la demande ' + inte], art: ident + ' ' + es + ' ' + pp('placé') + ' en position de disponibilité' + periode + '.' },
      'Cessation de service': { extra: [], art: ident + ' ' + (plur ? 'cessent leurs fonctions' : 'cesse ses fonctions') + ' à compter du ' + escH(longDate(rec.dateFin || rec.dateDebut || rec.date)) + '.' },
    };
    return M[rec.type] || { extra: ['les nécessités de service'], art: ident + (rec.objet ? ' : ' + escH(rec.objet) : '') + '.' };
  }
  function acteSign(rec) {
    const step = (rec.circuit || []).find(s => s.action === 'Signature' && s.statut === 'Signé');
    const sigBlock = step
      ? '<div class="acte-signed">Signé le ' + escH(longDate(step.date)) + (step.by ? ' par ' + escH(step.by) : '') + '</div>'
      : '<div class="acte-line"></div><span>(Nom, signature et cachet)</span>';
    return '<div class="acte-sign"><div><i>Fait à Niamey, le ' + escH(longDate(rec.date || '')) + '</i></div>'
      + '<div class="acte-sig"><b>' + escH(rec.signataire || 'Le Directeur Général') + '</b>' + sigBlock + '</div></div>';
  }
  async function buildActe(rec) {
    const pers = await load('personnel');
    const { civ, e } = civiliteFor(rec, pers);
    const nom = rec.agent || '[NOM ET PRÉNOM]';
    const annee = rec.date ? new Date(rec.date).getFullYear() : new Date().getFullYear();
    let h = '<div class="acte">' + acteHeader();
    if (rec.nature === 'Note de service' || rec.type === 'Note de service') {
      h += '<div class="acte-ref">NOTE DE SERVICE N° ' + ph(rec.numero, '……') + ' /ANPER/DG/' + annee + '</div>';
      h += '<p class="acte-art"><b>Objet :</b> ' + ph(rec.objet, 'OBJET DE LA NOTE') + '</p>';
      h += '<p class="acte-art">Le Directeur Général porte à la connaissance de l’ensemble du personnel ce qui suit :</p>';
      h += '<p class="acte-art">' + ph(rec.objet, 'Exposer ici l’objet de la note.') + '</p>';
      h += '<p class="acte-art">La présente note prend effet à compter du ' + escH(longDate(rec.dateDebut || rec.date)) + '.</p>';
      h += acteSign(rec) + '</div>'; return h;
    }
    if (rec.nature === 'Attestation' || rec.type === 'Attestation de travail') {
      h += '<div class="acte-ref">ATTESTATION DE TRAVAIL</div>';
      h += '<p class="acte-art" style="margin-top:18px">Je soussigné(e), ' + ph(rec.signataire, 'NOM ET FONCTION') + ' de l’Agence Nigérienne de Promotion de l’Électrification en milieu Rural (ANPER), atteste que :</p>';
      h += '<p class="acte-art"><b>' + escH(civ + ' ' + nom) + '</b>, Matricule ' + ph(rec.matricule, 'MATRICULE') + ', est employé' + e + ' au sein de l’Agence en qualité de ' + ph(rec.poste, 'FONCTION') + ' ' + auLa(rec.service || rec.direction) + '.</p>';
      h += '<p class="acte-art">En foi de quoi la présente attestation est délivrée à l’intéressé' + e + ' pour servir et valoir ce que de droit.</p>';
      h += acteSign(rec) + '</div>'; return h;
    }
    if (rec.nature === 'Certificat') {
      const variant = /Cessation/i.test(rec.type || '') ? 'CESSATION' : (/Reprise/i.test(rec.type || '') ? 'REPRISE' : 'PRISE');
      const verbeC = variant === 'CESSATION' ? 'a cessé service' : (variant === 'REPRISE' ? 'a repris service' : 'a pris service');
      const sign = (rec.signataire && rec.signataire !== 'Le Directeur Général') ? rec.signataire : 'Le Directeur des Affaires Administratives et Financières';
      const dref = (rec.numero && String(rec.numero).trim()) ? ', suivant décision n° ' + escH(rec.numero) : '';
      h += '<div class="acte-ref">CERTIFICAT DE ' + variant + ' DE SERVICE</div>';
      h += '<p class="acte-art" style="margin-top:18px">Je soussigné(e), ' + escH(sign) + ' de l’Agence Nigérienne de Promotion de l’Électrification en milieu Rural (ANPER), certifie que <b>' + escH(civ + ' ' + nom) + '</b>, ' + ph(rec.poste, 'FONCTION') + ', ' + (rec.objet ? 'bénéficiaire ' + escH(rec.objet) : 'agent de l’Agence') + dref + ', ' + verbeC + ' le ' + escH(longDate(rec.dateDebut || rec.dateFin || rec.date)) + '.</p>';
      h += '<p class="acte-art">En foi de quoi, ce certificat lui est délivré' + e + ' pour servir et valoir ce que de droit.</p>';
      h += acteSign({ signataire: sign, date: rec.date }) + '</div>'; return h;
    }
    const isArrete = rec.nature === 'Arrêté';
    const nature = isArrete ? 'ARRÊTÉ' : 'DÉCISION', natLower = isArrete ? 'arrêté' : 'décision', verbe = isArrete ? 'ARRÊTE' : 'DÉCIDE';
    const objet = OBJ_LABEL[rec.type] || (rec.objet ? escH(rec.objet) : 'régularisation de la situation');
    const collectif = rec.portee === 'Collectif';
    let ident, benefList = '';
    if (collectif) {
      const raw = String(rec.beneficiaires || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (raw.length > 1) {
        ident = 'Les agents ci-après désignés';
        benefList = '<ul class="acte-benef">' + raw.map(x => '<li>' + escH(x) + '</li>').join('') + '</ul>';
      } else {
        ident = escH(raw[0] || 'L’ensemble du personnel');
      }
    } else {
      ident = civ + ' ' + escH(nom) + ', Matricule ' + ph(rec.matricule, 'MATRICULE') + ', ' + ph(rec.poste, 'FONCTION') + ' ' + auLa(rec.service || rec.direction);
    }
    const periode = (rec.dateDebut || rec.dateFin) ? (' pour une durée de ' + (rec.duree ? escH(rec.duree) : '……') + ', du ' + escH(longDate(rec.dateDebut)) + ' au ' + escH(longDate(rec.dateFin)) + ' inclus') : '';
    const baseVisas = [
      'la loi n° 2013-24 du 06 mai 2013, portant création d’un Établissement Public à caractère Administratif dénommé « Agence Nigérienne de Promotion de l’Électrification en milieu Rural (ANPER) »',
      'le décret n° 2013-347/PRN/MEP du 23 août 2013, portant approbation des Statuts de l’ANPER',
      'le décret n° 2024-517/P/CNSP/ME du 31 juillet 2024, portant nomination du Directeur Général de l’ANPER',
      'le Statut du Personnel et le Règlement Intérieur de l’ANPER',
    ];
    const tpl = acteBody(rec, civ, e, ident, periode, collectif);
    const visas = baseVisas.concat(tpl.extra || []);
    const objSujet = collectif ? (benefList ? 'des agents désignés' : 'de ' + ident) : ('de ' + escH(civ + ' ' + nom));
    h += '<div class="acte-ref">' + nature + ' N° ' + ph(rec.numero, '……') + ' /ANPER/DG/DAAF/' + annee + '</div>';
    h += '<div class="acte-obj">portant ' + escH(objet) + ' ' + objSujet + '</div>';
    h += '<div class="acte-auth">' + escH((rec.signataire || 'Le Directeur Général').toUpperCase()) + ',</div>';
    h += '<ul class="acte-visa">' + visas.map(v => '<li><i>Vu</i> ' + v + ' ;</li>').join('') + '</ul>';
    h += '<div class="acte-decide">' + verbe + ' :</div>';
    h += '<p class="acte-art"><b>Article 1<sup>er</sup> :</b> ' + tpl.art + '</p>';
    if (benefList) h += benefList;
    h += '<p class="acte-art"><b>Article 2 :</b> Le Directeur des Affaires Administratives et Financières est chargé de l’exécution de la présente ' + natLower + ', qui prend effet à compter du ' + escH(longDate(rec.dateDebut || rec.date)) + ', sera notifiée ' + (collectif ? 'aux intéressés et conservée à leurs dossiers individuels' : 'à l’intéressé' + e + ' et conservée au dossier individuel') + '.</p>';
    h += acteSign(rec);
    h += '<div class="acte-amp"><b>Ampliations :</b> ' + (collectif ? 'Intéressés — DAAF — Service Paie — Dossiers individuels' : 'Intéressé(e) — DAAF — Service Paie — Dossier individuel') + ' — Archives.</div></div>';
    return h;
  }
  // ── Export Word (.doc) d'un document (acte, courrier, ordre de mission) ──────
  function _allCSS() { let o = ''; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) o += r.cssText + '\n'; } catch (e) { } } return o; }
  function docWord(node, name, opts) {
    opts = opts || {};
    const clone = node.cloneNode(true);
    if (opts.flatten) { // remplace les champs de saisie par leur valeur (texte)
      clone.querySelectorAll('[data-fd]').forEach(c => {
        const k = c.dataset.fd, live = node.querySelector('[data-fd="' + k + '"]');
        const v = live ? ((live.tagName === 'INPUT' || live.tagName === 'SELECT') ? live.value : live.textContent) : '';
        const sp = document.createElement('span'); sp.textContent = v || ''; c.replaceWith(sp);
      });
    }
    clone.querySelectorAll('.no-print,[data-agentsel],.fd-agentsel').forEach(e => e.remove());
    const page = opts.landscape
      ? '@page WordSection1{size:841.9pt 595.3pt;margin:1cm;mso-page-orientation:landscape} div.WordSection1{page:WordSection1}'
      : '@page WordSection1{size:595.3pt 841.9pt;margin:1.6cm} div.WordSection1{page:WordSection1}';
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>' + _allCSS() + ' body{margin:0;background:#fff} ' + page + '</style></head><body><div class="WordSection1">' + clone.innerHTML + '</div></body></html>';
    const blob = new Blob(['﻿' + html], { type: 'application/msword' });
    const a = el('a', { href: URL.createObjectURL(blob), download: String(name || 'document').replace(/[^\w-]+/g, '_') + '.doc' });
    document.body.append(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 1200);
    toast('Document Word téléchargé ✔', 'ok');
  }

  function openActeDoc(rec) {
    buildActe(rec).then(html => {
      const ov = el('div.acte-overlay#acte-overlay');
      const area = el('div#acte-print', { html });
      const bar = el('div.acte-bar.no-print', {}, [
        el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
        el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF', onclick: () => window.print() }),
        el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(area, 'Acte_' + (rec.numero || rec.type || 'ANPER')) }),
      ]);
      ov.append(bar, el('div.acte-scroll', {}, [area]));
      document.body.append(ov);
    });
  }

  // ── Courrier : circuit de transmission hiérarchique (chaîne fixe ascendante) ─
  // Titres et responsables réels par direction/service, extraits de la liste du personnel
  // ANPER (2026) et du fichier de contacts agents. Sert de référence par défaut ; si un agent
  // du module Personnel porte un intitulé de responsable (Chef, Responsable, Directeur,
  // Coordonnateur, Principal…) pour ce même service, ses coordonnées à jour prennent le pas.
  const SERVICE_RESPONSABLES = {
    'Direction Générale': { nom: 'Responsable', titre: 'Directeur Général', email: '' },
    'Direction des Affaires Administratives et Financières': { nom: 'Responsable', titre: 'Directeur des Affaires Administratives et Financières (DAAF)', email: '' },
    'Direction de l’Ingénierie': { nom: 'Responsable', titre: 'Directeur de l’Ingénierie', email: '' },
    'Direction des Investissements': { nom: 'Responsable', titre: 'Directeur des Investissements', email: '' },
    'Unité de Gestion de Projets (Banque Mondiale)': { nom: 'Responsable', titre: 'Coordonnateur de l’Unité de Gestion de Projets', email: '' },
    'Service Ressources Humaines': { nom: 'Responsable', titre: 'Chef du Service Ressources Humaines', email: '' },
    'Service Communication': { nom: 'Responsable', titre: 'Responsable Communication', email: '' },
    'Service Passation des Marchés': { nom: 'Responsable', titre: 'Chargé de la Logistique et Passation des Marchés', email: '' },
    'Service Comptabilité & Finances': { nom: 'Responsable', titre: 'Comptable Principale', email: '' },
    'Service Suivi-Évaluation': { nom: 'Responsable', titre: 'Chargé du Suivi-Évaluation', email: '' },
    'Cellule Sauvegardes Environnementales & Sociales': { nom: 'Responsable', titre: 'Responsable Genre et Inclusion Sociale', email: '' },
  };
  // Organigramme réel (4 directions) : direction de rattachement de chaque service. Les 4
  // directions elles-mêmes remontent directement à la Direction Générale (sommet).
  const SERVICE_PARENT = {
    'Direction des Affaires Administratives et Financières': 'Direction Générale',
    'Direction de l’Ingénierie': 'Direction Générale',
    'Direction des Investissements': 'Direction Générale',
    'Service Ressources Humaines': 'Direction des Affaires Administratives et Financières',
    'Service Comptabilité & Finances': 'Direction des Affaires Administratives et Financières',
    'Service Passation des Marchés': 'Direction des Affaires Administratives et Financières',
    'Service Communication': 'Direction des Affaires Administratives et Financières',
    'Unité de Gestion de Projets (Banque Mondiale)': 'Direction des Investissements',
    'Service Suivi-Évaluation': 'Direction des Investissements',
    'Cellule Sauvegardes Environnementales & Sociales': 'Direction des Investissements',
  };
  function courrierChief(service, pers) {
    const kw = /chef|responsable|directeur|coordonnateur|principal/i;
    const p = (pers || []).find(x => ((x.service || '') === service || (x.direction || '') === service) && kw.test(x.poste || ''));
    if (p) { const nm = ((p.nom || '') + ' ' + (p.prenom || '')).trim(); return { role: (nm || '') + (p.poste ? ' — ' + p.poste : ''), email: p.email || '' }; }
    const seed = SERVICE_RESPONSABLES[service];
    if (seed) return { role: seed.nom + ' — ' + seed.titre, email: seed.email };
    return { role: 'Chef — ' + service, email: '' };
  }
  // Circuit réel : le Bureau d'ordre reçoit et scanne le courrier, le transmet au Directeur
  // Général qui instruit sur le(s) destinataire(s) (un ou plusieurs directeurs), le Bureau
  // d'ordre diffuse alors vers ces destinataires (étapes ajoutées via promptDestinataires
  // quand l'étape DG est marquée Traité), puis chaque direction transmet en interne au
  // service chargé de l'exécution. Le courrier « Départ » suit un circuit court : bordereau
  // rédigé par le Bureau d'ordre, soumis à la signature du DG.
  const DIFFUSION_PLACEHOLDER = 'Diffusion selon instruction du DG';
  function defaultCourrierChain(service, pers, sens) {
    const dg = SERVICE_RESPONSABLES['Direction Générale'];
    if (sens === 'Départ') {
      return [
        { id: uid(), service: '', role: 'Bureau d’ordre — Secrétariat (rédaction bordereau)', email: '', instruction: 'Rédaction du bordereau', statut: 'En attente', date: '', by: '' },
        { id: uid(), service: 'Direction Générale', role: dg.nom + ' — ' + dg.titre, email: dg.email, instruction: 'Signature', statut: 'En attente', date: '', by: '' },
      ];
    }
    return [
      { id: uid(), service: '', role: 'Bureau d’ordre — Réception & scan', email: '', instruction: 'Réception', statut: 'En attente', date: '', by: '' },
      { id: uid(), service: 'Direction Générale', role: dg.nom + ' — ' + dg.titre, email: dg.email, instruction: 'Pour instruction — destinataire(s) à désigner', statut: 'En attente', date: '', by: '' },
      { id: uid(), service: '', role: 'Bureau d’ordre — Diffusion', email: '', instruction: DIFFUSION_PLACEHOLDER, statut: 'En attente', date: '', by: '' },
    ];
  }
  // Case à cocher (directement sur l'étape DG, toujours visible/modifiable) pour désigner un ou
  // plusieurs directeurs destinataires ; ajoute ou retire, pour la direction cochée/décochée, la
  // paire d'étapes Bureau d'ordre → Direction puis Direction → Service exécutant.
  function toggleDestinataire(rec, pers, dname, checked) {
    const steps = (rec.transmission || (rec.transmission = [])).filter(x => x.instruction !== DIFFUSION_PLACEHOLDER);
    if (checked) {
      if (!steps.some(x => x.service === dname && /^Bureau d.ordre → /.test(x.role || ''))) {
        const info = courrierChief(dname, pers);
        steps.push({ id: uid(), service: dname, role: 'Bureau d’ordre → ' + dname, email: info.email, instruction: 'Diffusion vers ' + dname, statut: 'En attente', date: '', by: '' });
        steps.push({ id: uid(), service: dname, role: info.role, email: info.email, instruction: 'Transmission au service exécutant', statut: 'En attente', date: '', by: '' });
      }
      rec.transmission = steps;
    } else {
      rec.transmission = steps.filter(x => x.service !== dname);
    }
  }
  function updateCourrierStatut(rec) {
    const c = rec.transmission || [];
    if (!c.length) return;
    const last = c[c.length - 1];
    if (last && last.statut && last.statut !== 'En attente') { rec.statut = 'Traité'; return; }
    rec.statut = c.some(s => s.statut && s.statut !== 'En attente') ? 'En traitement' : rec.statut;
  }
  async function openTransmission(rec, after) {
    const pers = await load('personnel');
    const body = el('div.circ-body');
    async function persist() { const arr = await load('courrier'); const o = arr.find(r => r.id === rec.id); if (o) { o.transmission = rec.transmission; o.statut = rec.statut; await save('courrier', arr); } if (after) after(); }
    function render() {
      body.innerHTML = '';
      const steps = rec.transmission || (rec.transmission = []);
      if (!steps.length) body.append(el('div.adm-empty', { text: 'Aucune étape. Cliquez « Circuit standard » pour générer automatiquement le circuit (Bureau d’ordre → Directeur Général → diffusion aux destinataires désignés → service exécutant).' }));
      steps.forEach((s, i) => {
        const done = !!(s.statut && s.statut !== 'En attente');
        body.append(el('div.circ-step' + (done ? '.done' : ''), {}, [
          el('div.circ-h', {}, [el('span.circ-n', { text: String(i + 1) }), el('b', { text: s.role || '(responsable)' }), el('span.circ-act', { text: s.instruction })]),
          AUTH.canWrite() ? el('div.circ-ctrl', {}, [
            el('input.field-in', { value: s.role || '', placeholder: 'Responsable / fonction', oninput: e => { s.role = e.target.value; } }),
            el('input.field-in', { value: s.email || '', placeholder: 'Email', oninput: e => { s.email = e.target.value; } }),
            (() => { const sel = el('select.field-in'); ['Pour traitement', 'Pour avis', 'Pour information', 'Pour signature', 'Pour suite à donner', 'Pour archivage', 'Destinataire final'].forEach(a => sel.append(el('option', { value: a, text: a, selected: a === s.instruction ? '' : null }))); sel.value = s.instruction; sel.onchange = () => { s.instruction = sel.value; }; return sel; })(),
          ]) : null,
          (s.service === 'Direction Générale' && rec.sens !== 'Départ') ? el('div.circ-dest', {}, [
            el('div.circ-dest-t', { text: 'Direction(s) destinataire(s) désignée(s) par le DG :' }),
            ...DIRECTIONS.map(dname => {
              const cb = el('input', { type: 'checkbox' });
              cb.checked = steps.some(x => x.service === dname && /^Bureau d.ordre → /.test(x.role || ''));
              cb.disabled = !AUTH.canWrite();
              cb.addEventListener('change', async () => {
                toggleDestinataire(rec, pers, dname, cb.checked);
                updateCourrierStatut(rec); await persist(); logAudit('Courrier — destinataire(s) mis à jour', 'courrier', rec.reference || ''); render();
              });
              return el('label.perm-item', {}, [cb, el('span', { text: dname })]);
            }),
          ]) : null,
          el('div.circ-meta', { text: done ? (s.statut + ' le ' + (s.date ? longDate(s.date) : '—') + (s.by ? ' par ' + s.by : '')) : 'En attente' }),
          AUTH.canWrite() ? el('div.circ-actions', {}, [
            /^Bureau d.ordre → /.test(s.role || '') ? el('button.btn.btn-ghost.btn-sm', { text: '📄 Fiche de transmission', onclick: () => openFicheTransmissionDoc(rec, s, pers) }) : null,
            el('button.btn.btn-ghost.btn-sm', { text: '✔ Traité', onclick: async () => {
              s.statut = 'Traité'; s.date = new Date().toISOString().slice(0, 10); s.by = (AUTH.current() || {}).name || '';
              updateCourrierStatut(rec); await persist(); logAudit('Courrier transmis', 'courrier', rec.reference || ''); render();
            } }),
            el('button.btn.btn-ghost.btn-sm', { text: '↺', title: 'Réinitialiser', onclick: async () => { s.statut = 'En attente'; s.date = ''; s.by = ''; updateCourrierStatut(rec); await persist(); render(); } }),
            el('button.adm-ic.del', { text: '🗑', onclick: async () => { rec.transmission = steps.filter(x => x.id !== s.id); await persist(); render(); } }),
          ]) : null,
        ]));
      });
      if (AUTH.canWrite()) body.append(el('div.circ-foot', {}, [
        el('button.btn.btn-ghost.btn-sm', { text: '+ Étape', onclick: async () => { steps.push({ id: uid(), service: '', role: '', email: '', instruction: 'Pour traitement', statut: 'En attente', date: '', by: '' }); await persist(); render(); } }),
        el('button.btn.btn-ghost.btn-sm', { text: 'Circuit standard', onclick: async () => { rec.transmission = defaultCourrierChain(rec.service, pers, rec.sens); updateCourrierStatut(rec); await persist(); render(); } }),
      ]));
    }
    render();
    modal('Circuit de transmission — ' + (rec.reference || 'courrier'), body, [{ text: 'Fermer', kind: 'primary', onClick: () => { persist(); } }]);
  }

  // ── Courrier : bordereau d'envoi / fiche de transmission (imprimable) ────────
  // Étape « Signature » (Départ) ou « Destinataire final » (Arrivée) déjà traitée dans le
  // circuit de transmission → la signature imprimée reflète l'état réel, comme pour les actes.
  function courrierSignStatus(rec) {
    const step = (rec.transmission || []).find(s => s.service === 'Direction Générale');
    return (step && step.statut && step.statut !== 'En attente') ? step : null;
  }
  // Courrier Départ : pas de circuit à éditer (flux court, bureau d'ordre → DG), juste une
  // bascule directe de l'étape « Signature » du DG — alimente courrierSignStatus/acteSign.
  async function toggleCourrierSignature(rec, after) {
    const arr = await load('courrier');
    const o = arr.find(r => r.id === rec.id); if (!o) return;
    const steps = o.transmission || (o.transmission = []);
    let s = steps.find(x => x.service === 'Direction Générale');
    if (!s) { const dg = SERVICE_RESPONSABLES['Direction Générale']; s = { id: uid(), service: 'Direction Générale', role: dg.nom + ' — ' + dg.titre, email: dg.email, instruction: 'Signature', statut: 'En attente', date: '', by: '' }; steps.push(s); }
    if (s.statut && s.statut !== 'En attente') { s.statut = 'En attente'; s.date = ''; s.by = ''; }
    else { s.statut = 'Signé'; s.date = new Date().toISOString().slice(0, 10); s.by = (AUTH.current() || {}).name || ''; }
    updateCourrierStatut(o);
    await save('courrier', arr);
    logAudit(s.statut === 'Signé' ? 'Courrier signé' : 'Signature annulée', 'courrier', o.reference || '');
    if (after) after();
  }

  // Fiche de transmission personnalisée : préparée par le Bureau d'ordre pour LE directeur
  // précis désigné par le DG (étape « Bureau d'ordre → <Direction> » du circuit) — remplace
  // la case à cocher générique par un destinataire déjà connu et nommé.
  function ficheTransmissionDoc(rec, step, pers) {
    // step.role porte le libellé de suivi du circuit (« Bureau d'ordre → Direction X »),
    // pas un nom — le vrai destinataire imprimé est recherché via courrierChief comme pour
    // le reste du circuit (agent responsable du service, sinon SERVICE_RESPONSABLES).
    const dest = courrierChief(step.service, pers || []).role || step.service || '';
    const pour = ['En parler au DG', 'Dispositions à prendre', 'Études et Observations', 'Suite à donner', 'Y assister', 'Note de synthèse', 'Saisir le DG', 'Pour diffusion', 'Pour exploitation', 'Pour attribution', 'Pour information', 'Noter et retourner', 'Noter et classer', 'Pour projet de réponse', 'Pour classement', 'Pour vérification', 'Pour avis', 'Autre'];
    let h = '<div class="acte">' + acteHeader();
    h += '<div class="inv-title">FICHE DE TRANSMISSION</div>';
    h += '<p class="acte-art" style="margin:8px 0 2px"><b>Courrier Arrivée</b> — N° ' + ph(rec.reference, '……') + ' — Date : ' + escH(longDate(rec.date || '')) + '</p>';
    h += '<p class="acte-art" style="margin:2px 0"><b>Expéditeur :</b> ' + ph(rec.correspondant, '……') + ' &nbsp;&nbsp; <b>Objet :</b> ' + ph(rec.objet, '……') + '</p>';
    h += '<p class="acte-art" style="margin:10px 0 6px"><b>Destinataire (désigné par le Directeur Général) :</b><br>' + ph(dest, 'DESTINATAIRE') + (step.service ? ' — ' + escH(step.service) : '') + '</p>';
    h += '<table class="ft-tbl" style="max-width:340px"><thead><tr><th style="text-align:center">POUR</th><th class="ft-chk"></th></tr></thead><tbody>' + pour.map(p => '<tr><td>' + escH(p) + '</td><td class="ft-chk"></td></tr>').join('') + '</tbody></table>';
    h += '<div class="ft-urg">URGENT <span class="ft-box"></span> &nbsp;&nbsp;&nbsp; TRÈS URGENT <span class="ft-box"></span></div>';
    h += '<p class="acte-art" style="margin-bottom:2px"><b>OBSERVATIONS</b> &nbsp;·&nbsp; Date : ……/……/………</p><div style="height:64px;border:1px solid #999;border-radius:4px"></div>';
    h += '<div class="acte-sign" style="margin-top:18px"><div>Le Bureau d’ordre<br/><br/><br/>__________________________</div>'
      + '<div class="acte-sig"><b>' + ph(dest, 'DESTINATAIRE') + '</b><div class="acte-line"></div><span>(Reçu le / Signature)</span></div></div>';
    h += '</div>';
    return h;
  }
  function openFicheTransmissionDoc(rec, step, pers) {
    const ov = el('div.acte-overlay#acte-overlay');
    const area = el('div#acte-print', { html: ficheTransmissionDoc(rec, step, pers) });
    const bar = el('div.acte-bar.no-print', {}, [
      el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
      el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF', onclick: () => window.print() }),
      el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(area, 'Fiche_transmission_' + (rec.reference || 'ANPER') + '_' + (step.service || '')) }),
    ]);
    ov.append(bar, el('div.acte-scroll', {}, [area]));
    document.body.append(ov);
  }
  function courrierDoc(rec) {
    const isDepart = rec.sens === 'Départ';
    const dgStep = courrierSignStatus(rec);
    let h = '<div class="acte">' + acteHeader();
    if (isDepart) {
      h += '<div class="acte-ref">BORDEREAU D’ENVOI N° ' + ph(rec.reference, '……') + '</div>';
      h += '<p class="acte-art" style="margin-top:12px"><b>Destinataire :</b> ' + ph(rec.correspondant, 'DESTINATAIRE') + ' &nbsp;·&nbsp; <b>Date :</b> ' + escH(longDate(rec.date || '')) + '</p>';
      h += '<table class="acte-circ" style="margin-top:6px"><thead><tr><th style="width:8%">N°</th><th>DÉSIGNATION</th><th style="width:14%">NOMBRE(S)</th><th style="width:28%">OBSERVATIONS</th></tr></thead><tbody>';
      h += '<tr><td>1</td><td>Transmettant : ' + ph(rec.objet, 'OBJET / PIÈCES TRANSMISES') + '</td><td>1</td><td></td></tr>';
      for (let i = 0; i < 4; i++) h += '<tr><td>' + (i + 2) + '</td><td></td><td></td><td></td></tr>';
      h += '<tr><td colspan="2" style="text-align:right;font-weight:700">TOTAL</td><td style="text-align:center;font-weight:700">01</td><td></td></tr>';
      h += '</tbody></table>';
      h += acteSign({ signataire: 'Le Directeur Général', date: rec.date, circuit: dgStep ? [{ action: 'Signature', statut: 'Signé', date: dgStep.date, by: dgStep.by }] : [] });
    } else {
      h += '<div class="acte-ref">FICHE DE TRANSMISSION</div>';
      h += '<p class="acte-art" style="margin:8px 0 2px"><b>Courrier Arrivée</b> — N° ' + ph(rec.reference, '……') + ' — Date : ' + escH(longDate(rec.date || '')) + '</p>';
      h += '<p class="acte-art" style="margin:2px 0"><b>Expéditeur :</b> ' + ph(rec.correspondant, '……') + ' &nbsp;&nbsp; <b>Objet :</b> ' + ph(rec.objet, '……') + '</p>';
      if (rec.fichier && rec.fichier.name) h += '<p class="acte-art" style="margin:2px 0"><b>Pièce jointe :</b> 📎 ' + escH(rec.fichier.name) + '</p>';
      const dest = ['Directeur Général', 'Directeur de l’Ingénierie', 'Directeur des Investissements', 'Directeur des Affaires Administratives et Financières', 'Coordonnateur de Projets', 'Responsable Communication', 'Responsable Suivi-Évaluation', 'Coordonnateur du Projet UEMOA', 'Point Focal Projet BAD', 'Coordonnateur du Projet BOAD', 'Coordonnateur du Projet AMP/Niger'];
      const pour = ['En parler au DG', 'Dispositions à prendre', 'Études et Observations', 'Suite à donner', 'Y assister', 'Note de synthèse', 'Saisir le DG', 'Pour diffusion', 'Pour exploitation', 'Pour attribution', 'Pour information', 'Noter et retourner', 'Noter et classer', 'Pour projet de réponse', 'Pour classement', 'Pour vérification', 'Pour avis', 'Autre'];
      h += '<div class="ft-grid">';
      h += '<div class="ft-col"><table class="ft-tbl"><thead><tr><th style="text-align:left">Destinataire</th><th class="ft-chk">VENT.</th><th class="ft-chk">COPIE</th></tr></thead><tbody>' + dest.map(d => '<tr><td>' + escH(d) + '</td><td class="ft-chk"></td><td class="ft-chk"></td></tr>').join('') + '</tbody></table></div>';
      h += '<div class="ft-col"><table class="ft-tbl"><thead><tr><th style="text-align:center">POUR</th><th class="ft-chk"></th></tr></thead><tbody>' + pour.map(p => '<tr><td>' + escH(p) + '</td><td class="ft-chk"></td></tr>').join('') + '</tbody></table></div>';
      h += '</div>';
      h += '<div class="ft-urg">URGENT <span class="ft-box"></span> &nbsp;&nbsp;&nbsp; TRÈS URGENT <span class="ft-box"></span></div>';
      h += '<p class="acte-art" style="margin-bottom:2px"><b>OBSERVATIONS</b> &nbsp;·&nbsp; Date : ……/……/………</p><div style="height:64px;border:1px solid #999;border-radius:4px"></div>';
      const sigBlock = dgStep
        ? '<div class="acte-signed">Traité le ' + escH(longDate(dgStep.date)) + (dgStep.by ? ' par ' + escH(dgStep.by) : '') + '</div>'
        : '<div class="acte-line"></div><span>(Signature et cachet)</span>';
      h += '<div class="acte-sign" style="margin-top:18px"><div></div><div class="acte-sig"><b>LE DIRECTEUR GÉNÉRAL</b>' + sigBlock + '</div></div>';
    }
    h += '</div>';
    return h;
  }
  function openCourrierDoc(rec) {
    const ov = el('div.acte-overlay#acte-overlay');
    const area = el('div#acte-print', { html: courrierDoc(rec) });
    const bar = el('div.acte-bar.no-print', {}, [
      el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
      el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF', onclick: () => window.print() }),
      el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(area, (rec.sens === 'Départ' ? 'Bordereau_' : 'Fiche_transmission_') + (rec.reference || 'ANPER')) }),
    ]);
    ov.append(bar, el('div.acte-scroll', {}, [area]));
    document.body.append(ov);
  }

  // ── Ordre de mission = FEUILLE DE DÉPLACEMENT — saisie DIRECTE dans le formulaire ─
  // Chaque valeur est une cellule éditable (data-fd) ; « Enregistrer » persiste tout.
  function fdForm(rec, kind) {
    const etranger = (kind || rec.kind) !== 'Local';   // défaut : étranger
    const fd = rec.fd || {};
    const val = (key, fb) => (fd[key] != null && fd[key] !== '') ? fd[key] : (fb || '');
    const ce = (key, fb) => '<span class="fd-in" contenteditable="true" data-fd="' + key + '">' + escH(val(key, fb)) + '</span>';
    // Champs automatisés : dates (sélecteur), durée (calculée), combos (liste + saisie libre)
    const dateCell = (key) => '<input type="date" class="fd-date" data-fd="' + key + '" value="' + escH(val(key)) + '">';
    const comboCell = (key, listId, fb) => '<input class="fd-combo" list="' + listId + '" autocomplete="off" data-fd="' + key + '" value="' + escH(val(key, fb)) + '" placeholder="……">';
    const dureeCell = '<span class="fd-in fd-duree" data-fd="duree">' + escH(val('duree')) + '</span>';
    // Local (à l’intérieur) : localités du Niger uniquement
    const OPT_DEST_NE = [
      'Niamey', 'Agadez', 'Diffa', 'Dosso', 'Maradi', 'Tahoua', 'Tillabéri', 'Zinder',
      'Arlit', 'Bilma', 'Tchirozérine', 'Aderbissinat', 'Ingall',
      'Maïné-Soroa', 'N’Guigmi', 'Bosso', 'Goudoumaria', 'Nguelbeli',
      'Boboye (Birni N’Gaouré)', 'Dogondoutchi', 'Gaya', 'Loga', 'Dioundiou', 'Falmey', 'Tibiri (Dosso)',
      'Aguié', 'Dakoro', 'Guidan Roumdji', 'Madarounfa', 'Mayahi', 'Tessaoua', 'Bermo', 'Gazaoua',
      'Abalak', 'Birni N’Konni', 'Bouza', 'Illéla', 'Keïta', 'Madaoua', 'Malbaza', 'Tchintabaraden', 'Bagaroua', 'Tassara', 'Tillia',
      'Ayorou', 'Balleyara', 'Banibangou', 'Bankilaré', 'Filingué', 'Gothèye', 'Kollo', 'Ouallam', 'Say', 'Téra', 'Torodi',
      'Belbédji', 'Damagaram Takaya', 'Dungass', 'Gouré', 'Kantché (Matameye)', 'Magaria', 'Mirriah', 'Takeïta', 'Tanout', 'Tesker',
    ];
    // Étranger : villes internationales uniquement (capitales et grandes villes)
    const OPT_DEST_INTL = [
      // Afrique de l’Ouest
      'Cotonou (Bénin)', 'Porto-Novo (Bénin)', 'Ouagadougou (Burkina Faso)', 'Bobo-Dioulasso (Burkina Faso)',
      'Abidjan (Côte d’Ivoire)', 'Yamoussoukro (Côte d’Ivoire)', 'Accra (Ghana)', 'Conakry (Guinée)',
      'Bamako (Mali)', 'Nouakchott (Mauritanie)', 'Abuja (Nigéria)', 'Lagos (Nigéria)', 'Kano (Nigéria)',
      'Dakar (Sénégal)', 'Lomé (Togo)', 'Banjul (Gambie)', 'Bissau (Guinée-Bissau)', 'Monrovia (Liberia)', 'Freetown (Sierra Leone)', 'Praia (Cap-Vert)',
      // Afrique centrale
      'N’Djamena (Tchad)', 'Yaoundé (Cameroun)', 'Douala (Cameroun)', 'Libreville (Gabon)', 'Brazzaville (Congo)', 'Kinshasa (RD Congo)', 'Bangui (Centrafrique)', 'Malabo (Guinée équatoriale)',
      // Afrique du Nord
      'Casablanca (Maroc)', 'Rabat (Maroc)', 'Tunis (Tunisie)', 'Alger (Algérie)', 'Tripoli (Libye)', 'Le Caire (Égypte)', 'Khartoum (Soudan)',
      // Afrique de l’Est & australe
      'Addis-Abeba (Éthiopie)', 'Nairobi (Kenya)', 'Kigali (Rwanda)', 'Kampala (Ouganda)', 'Dar es-Salaam (Tanzanie)', 'Djibouti', 'Luanda (Angola)', 'Maputo (Mozambique)',
      'Johannesburg (Afrique du Sud)', 'Pretoria (Afrique du Sud)', 'Le Cap (Afrique du Sud)', 'Windhoek (Namibie)', 'Gaborone (Botswana)', 'Antananarivo (Madagascar)',
      // Europe
      'Paris (France)', 'Bruxelles (Belgique)', 'Genève (Suisse)', 'Londres (Royaume-Uni)', 'Berlin (Allemagne)', 'Madrid (Espagne)', 'Rome (Italie)', 'Lisbonne (Portugal)', 'Amsterdam (Pays-Bas)', 'Vienne (Autriche)', 'Stockholm (Suède)', 'Copenhague (Danemark)', 'Varsovie (Pologne)', 'Moscou (Russie)',
      // Moyen-Orient & Asie
      'Istanbul (Turquie)', 'Ankara (Turquie)', 'Dubaï (Émirats arabes unis)', 'Abou Dabi (Émirats arabes unis)', 'Riyad (Arabie saoudite)', 'Djeddah (Arabie saoudite)', 'Doha (Qatar)', 'Koweït', 'Amman (Jordanie)', 'Beyrouth (Liban)',
      'Pékin (Chine)', 'Shanghai (Chine)', 'New Delhi (Inde)', 'Tokyo (Japon)', 'Séoul (Corée du Sud)', 'Bangkok (Thaïlande)', 'Singapour', 'Kuala Lumpur (Malaisie)', 'Jakarta (Indonésie)', 'Islamabad (Pakistan)',
      // Amériques
      'Washington (États-Unis)', 'New York (États-Unis)', 'Ottawa (Canada)', 'Montréal (Canada)', 'Brasília (Brésil)', 'Mexico (Mexique)',
      // Institutions / bailleurs
      'Lomé (siège BOAD)', 'Abidjan (siège BAD)', 'Washington (Banque mondiale / FMI)', 'Vienne (ONUDI / AIEA)',
    ];
    const OPT_DEST = etranger ? OPT_DEST_INTL : OPT_DEST_NE;
    const OPT_MOYEN = ['Véhicule de service', 'Véhicule personnel', 'Par Avion', 'Par Route', 'Taxi-brousse', 'Bus', 'Train', 'Autre'];
    const OPT_BUDGET = ['Budget National (FP)', 'Fonds propres ANPER', 'PEPERN (BAD)', 'PEPERN (Banque Mondiale)', 'UEMOA', 'BOAD', 'AMP/Niger', 'PADEER', 'Autre'];
    const datalists = '<datalist id="fd-dest">' + OPT_DEST.map(x => '<option value="' + escH(x) + '">').join('') + '</datalist>'
      + '<datalist id="fd-moyen">' + OPT_MOYEN.map(x => '<option value="' + escH(x) + '">').join('') + '</datalist>'
      + '<datalist id="fd-budget">' + OPT_BUDGET.map(x => '<option value="' + escH(x) + '">').join('') + '</datalist>';
    const flag = '<img class="fd-flag" src="data:image/png;base64,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" alt="Niger"/>';
    const fdHead = (editable, pageNote) => {
      const omtitle = etranger ? 'ORDRE DE MISSION N° ' : 'ORDRE DE DÉPLACEMENT N° ';
      const numCell = editable ? ce('numero', rec.numero) : escH(val('numero', rec.numero)) || '……';
      const ftitle = etranger ? 'FEUILLE DE DÉPLACEMENT' : 'ORDRE DE DÉPLACEMENT';
      const inMark = etranger ? '☐' : '☑', etMark = etranger ? '☑' : '☐';
      return '<div class="fd-hd">'
        + '<div class="fd-hd-l"><b>RÉPUBLIQUE DU NIGER</b><br><i>Fraternité – Travail – Progrès</i><br><b>PRÉSIDENCE</b></div>'
        + '<div class="fd-hd-c">' + flag + '<div class="fd-omno">' + omtitle + numCell + '</div><div class="fd-ftitle">' + ftitle + '</div><div class="fd-inout">À l’intérieur ' + inMark + ' &nbsp;/&nbsp; À l’étranger ' + etMark + (pageNote ? ' &nbsp;·&nbsp; <span class="fd-pgn">' + pageNote + '</span>' : '') + '</div></div>'
        + '<div class="fd-hd-r"><b>RÉPUBLIQUE DU NIGER</b><br><b>MINISTÈRE DES FINANCES</b><br>BUREAU DES TRANSPORTS<br><span class="fd-sigtit">Signature du titulaire de l’ordre de mission</span></div>'
        + '</div>';
    };
    const omBloc = (titre, p) => '<div class="fd-blk"><div class="fd-blk-h">' + titre + '</div>'
      + '<div class="fd-line">De ' + ce(p + '_de') + ' le ' + ce(p + '_del') + ' &nbsp; à ' + ce(p + '_a') + ' le ' + ce(p + '_al') + '</div>'
      + '<table class="fd-itbl"><tr><th>Indemnité journalière</th><th>Nombre</th><th>Taux</th><th>Montant</th></tr>'
      + '<tr><td>normale</td><td>' + ce(p + '_nn') + '</td><td>' + ce(p + '_nt') + '</td><td>' + ce(p + '_nm') + '</td></tr>'
      + '<tr><td>réduite</td><td>' + ce(p + '_rn') + '</td><td>' + ce(p + '_rt') + '</td><td>' + ce(p + '_rm') + '</td></tr>'
      + '<tr><td>Total</td><td colspan="3">' + ce(p + '_tot') + '</td></tr></table>'
      + '<div class="fd-line">Arrêté la somme de ' + ce(p + '_arrete') + '</div></div>';
    const notes = '<div class="fd-notes">'
      + '<p><b>1)</b> Joindre les justifications.</p>'
      + '<p><b>2)</b> Si le point de destination est unique, le voyage devra être effectué par la voie la plus directe. Dans le cas contraire, indiquer les différentes destinations.</p>'
      + '<p><b>3)</b> La durée et la date de retour doivent être obligatoirement indiquées. Toute prolongation au-delà du délai indiqué devra faire l’objet d’une autorisation préalable de l’autorité signataire du présent ordre, après enregistrement préalable au centre comptable.</p>'
      + '<p><b>4)</b> Si le trajet doit être effectué en empruntant plusieurs modes de transport, préciser les fractions d’itinéraire pour chacun d’eux.</p>'
      + '<p><b>5)</b> Rayer les mentions inutiles. Si le logement ou la nourriture est fourni, préciser pour quelle période de mission ou de voyage.</p>'
      + '<div class="fd-copies">1. Titulaire (Original) &nbsp; 2. Titulaire (Duplicata) &nbsp; 3. MF-Transports &nbsp; 4. PRN &nbsp; 5. Ministère Employeur</div>'
      + '</div>';
    const mfield = (l, cell) => '<tr><td class="fd-l">' + l + '</td><td class="fd-v">' + cell + '</td></tr>';
    const mission = '<div class="fd-mission">'
      + '<div class="fd-mtitle">DÉSIGNATION DU TITULAIRE DE L’ORDRE DE MISSION</div>'
      + '<table class="fd-mtbl"><tbody>'
      + mfield('Nom – Prénom', '<select class="fd-agentsel no-print" data-agentsel><option value="">— Choisir un agent (Personnel) —</option></select>' + ce('nom', rec.agent))
      + mfield('Fonction ou Emploi', ce('fonction'))
      + mfield('Service Employeur', ce('service', 'ANPER'))
      + mfield('Lieu d’Emploi', ce('lieuemploi', 'Niamey'))
      + mfield('OBJET DE LA MISSION (1)', ce('objet'))
      + mfield('Destination (2)', comboCell('destination', 'fd-dest', rec.lieu))
      + mfield('Date de Départ', dateCell('datedepart'))
      + mfield('Durée de Mission (3)', dureeCell)
      + mfield('Date de retour (3)', dateCell('dateretour'))
      + mfield('Moyens de transport (4)', comboCell('moyens', 'fd-moyen'))
      + mfield('Logement – Nourriture (5)', ce('logement', 'Fourni / Non fourni'))
      + mfield('Catégorie de déplacement', ce('categorie'))
      + mfield('Budget – Imputation', comboCell('budget', 'fd-budget'))
      + '</tbody></table>'
      + '<div class="fd-present">PRÉSENTÉ PAR LE DIRECTEUR GÉNÉRAL<br>de l’Agence Nigérienne de Promotion de l’Électrification<br>en milieu Rural (ANPER)'
      + '<div class="fd-present-s">À Niamey, le ' + ce('presdate') + '</div>'
      + '<div class="fd-present-n"><b>' + ce('signataire', 'NOUHOU ZAKAOUANOU') + '</b></div><div class="fd-cachet">(Signature – Cachet)</div></div>'
      + '</div>';
    const visas = '<div class="fd-visas"><span>Visa au Départ<br>' + ce('visa_dep') + '</span><span>Visa d’Arrivée<br>' + ce('visa_arr') + '</span><span>Observation<br>' + ce('observation') + '</span></div>';
    const bDep = omBloc('AVANCE PERÇUE AU DÉPART', 'dep');
    const bRoute = omBloc('AVANCE PERÇUE EN ROUTE', 'route');
    const bDef = omBloc('RÈGLEMENT DÉFINITIF', 'def');
    const net = '<div class="fd-net">Taux d’indemnité journalière : ' + ce('taux_ij') + '<br>Montant des Avances : ' + ce('montant_av') + '<br><b>NET À PAYER : ' + ce('net') + '</b></div>';
    const fnote = '<div class="fd-fnote">L’indemnité n’est pas due si le titulaire est logé et nourri. Elle est réduite de moitié s’il bénéficie soit du logement, soit de la nourriture. Elle est réduite de 20 % après le 30ᵉ jour de mission.</div>';
    const cf = '<div class="fd-cf"><b>VISA du Contrôleur Financier</b><br>L’engagement de dépense ci-contre a été admis sous numéro ' + ce('cf_num') + ' &nbsp; Budget ' + ce('cf_budget') + ' &nbsp; Gestion ' + ce('cf_gestion') + '<br><br>à Niamey, le ' + ce('cf_date') + '<br><i>Le Chef du Bureau des Transports</i></div>';
    const tres = '<div class="fd-tres">' + visas + bDep + bRoute + bDef + net + fnote + cf + '</div>';
    // Verso : trésorerie sur 2 colonnes pleine largeur (occupe toute la page A4 paysage)
    const tresVerso = '<div class="fd-tres-2col"><div class="fd-tcol">' + visas + bDep + bRoute + '</div><div class="fd-tcol">' + bDef + net + fnote + cf + '</div></div>';
    if (etranger) {
      // Étranger : 2 pages A4 (recto = ordre de mission, verso = trésorerie) pour recto-verso
      return '<div class="fd">'
        + '<div class="fd-page">' + fdHead(true, 'Recto — page 1/2') + '<div class="fd-body fd-body-recto">' + notes + mission + '</div></div>'
        + '<div class="fd-page fd-break">' + fdHead(false, 'Verso — page 2/2') + '<div class="fd-body fd-body-verso">' + tresVerso + '</div></div>'
        + datalists + '</div>';
    }
    // Local (intérieur) : 1 page
    return '<div class="fd"><div class="fd-page">' + fdHead(true, '') + '<div class="fd-body">' + notes + mission + tres + '</div></div>' + datalists + '</div>';
  }
  async function openOMForm(rec, after, kind) {
    const arr = await load('ordremission');
    const pers = await load('personnel');
    let cur = (rec && rec.id) ? arr.find(r => r.id === rec.id) : null;
    const isNew = !cur;
    if (isNew) cur = (rec && rec.id) ? rec : { id: uid(), createdAt: new Date().toISOString(), statut: 'Projet' };
    const okind = kind || cur.kind || 'Étranger';
    cur.kind = okind;
    const ov = el('div.acte-overlay#acte-overlay');
    const printArea = el('div#acte-print.omfd' + (okind === 'Local' ? '' : '.omfd-2p'), { html: fdForm(cur, okind) });
    // Sélecteur d'agent INLINE (dans la case « Nom – Prénom ») : remplit auto depuis Personnel
    const agentSel = printArea.querySelector('[data-agentsel]');
    if (agentSel) {
      (pers || []).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')).forEach(p => {
        const nm = ((p.nom || '') + ' ' + (p.prenom || '')).trim();
        agentSel.append(el('option', { value: p.id, text: (nm || '(sans nom)') + (p.matricule ? ' — ' + p.matricule : '') }));
      });
      agentSel.onchange = () => {
        const p = (pers || []).find(x => x.id === agentSel.value); if (!p) return;
        const set = (k, v) => { const c = printArea.querySelector('[data-fd="' + k + '"]'); if (c) c.textContent = v || ''; };
        set('nom', ((p.nom || '') + ' ' + (p.prenom || '')).trim());
        set('fonction', p.poste || '');
        // Catégorie de déplacement (groupe) déduite de la catégorie de l'agent — modifiable
        const grp = { 'Direction': 'Groupe A', 'Encadrement': 'Groupe B', 'Exécution': 'Groupe C', 'Consultant': 'Groupe B' }[p.categorie];
        if (grp) set('categorie', grp);
      };
    }
    const statSel = el('select.field-in', { style: { maxWidth: '150px' } });
    ['Projet', 'Signé', 'En cours', 'Effectuée', 'Archivé'].forEach(s => statSel.append(el('option', { value: s, text: s, selected: (cur.statut || 'Projet') === s ? '' : null })));
    statSel.value = cur.statut || 'Projet';
    // Calcul automatique de la durée à partir des dates départ / retour
    const recomputeDuree = () => {
      const dep = printArea.querySelector('[data-fd="datedepart"]');
      const ret = printArea.querySelector('[data-fd="dateretour"]');
      const dur = printArea.querySelector('[data-fd="duree"]');
      if (!dep || !ret || !dur) return;
      if (dep.value && ret.value) {
        const n = Math.round((new Date(ret.value) - new Date(dep.value)) / 86400000) + 1;
        dur.textContent = n > 0 ? (n + (n > 1 ? ' jours' : ' jour')) : '—';
      }
    };
    printArea.querySelectorAll('.fd-date').forEach(inp => inp.addEventListener('change', recomputeDuree));
    recomputeDuree();
    const doSave = async () => {
      const fd = {};
      printArea.querySelectorAll('[data-fd]').forEach(n => { const v = ((n.tagName === 'INPUT' || n.tagName === 'SELECT') ? n.value : n.textContent).trim(); if (v) fd[n.dataset.fd] = v; });
      if (!fd.numero) { toast('Renseignez le N° de l’ordre de mission (en haut du formulaire).', 'warn'); return false; }
      cur.fd = fd; cur.numero = fd.numero; cur.agent = fd.nom || ''; cur.lieu = fd.destination || ''; cur.statut = statSel.value;
      if (isNew && !arr.find(r => r.id === cur.id)) arr.push(cur);
      await save('ordremission', arr);
      logAudit(isNew ? 'Ajout' : 'Modification', 'ordremission', cur.numero);
      toast('Ordre de mission enregistré ✔', 'ok');
      if (after) after();
      return true;
    };
    const bar = el('div.acte-bar.no-print', {}, [
      el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
      el('span', { text: 'Statut :', style: { color: '#cbd5e1', alignSelf: 'center', fontSize: '12px' } }), statSel,
      el('button.btn.btn-primary', { text: '💾 Enregistrer', onclick: doSave }),
      el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF (paysage)', onclick: async () => { if (await doSave() !== false) setTimeout(() => window.print(), 250); } }),
      el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(printArea, (okind === 'Local' ? 'Ordre_deplacement_' : 'Ordre_mission_') + (printArea.querySelector('[data-fd="numero"]') ? (printArea.querySelector('[data-fd="numero"]').value || printArea.querySelector('[data-fd="numero"]').textContent || 'ANPER') : 'ANPER'), { flatten: true, landscape: okind !== 'Local' }) }),
    ]);
    ov.append(bar, el('div.acte-scroll', {}, [printArea]));
    document.body.append(ov);
  }

  // ── Tableau de bord RH ──────────────────────────────────────────────────────
  function rhDashboard() {
    const node = el('div.page');
    node.append(el('div.page-head', {}, [el('div', {}, [el('h1', { text: '📊 Tableau de bord RH' }), el('div.page-crumb', { text: 'Effectifs et indicateurs du personnel' })])]));
    const body = el('div'); node.append(body);
    const kpi = (v, l, sub, color) => el('div.adm-kpi', {}, [el('div.adm-kpi-v', { text: String(v), style: { color: color || '#0F172A' } }), el('div.adm-kpi-l', { text: l }), el('div.adm-kpi-s', { text: sub || '' })]);
    const bars = (rows) => { const max = Math.max(1, ...rows.map(r => r[1])); const w = el('div'); rows.forEach(([nm, n]) => w.append(el('div.adm-bar', {}, [el('div.adm-bar-nm', { text: nm }), el('div.adm-bar-tk', {}, [el('div.adm-bar-fl', { style: { width: (n * 100 / max) + '%' } })]), el('div.adm-bar-v', { text: String(n) })]))); return rows.length ? w : el('div.adm-empty', { text: 'Aucune donnée' }); };

    async function fill() {
      const pers = await load('personnel'), cg = await load('conges');
      const total = pers.length, actifs = pers.filter(p => p.statut === 'Actif').length;
      const H = pers.filter(p => /^m/i.test(p.sexe || '')).length, F = pers.filter(p => /^f/i.test(p.sexe || '')).length;
      const att = cg.filter(c => c.statut === 'En attente').length;
      const pc = n => total ? Math.round(n * 100 / total) : 0;
      body.innerHTML = '';
      const kpis = el('div.adm-kpis', {}, [
        kpi(total, 'Effectif total', actifs + ' actif(s)', '#157C3D'),
        kpi(H, 'Hommes', pc(H) + '%'), kpi(F, 'Femmes', pc(F) + '%', '#DB2777'),
        kpi(att, 'Congés en attente', cg.length + ' demande(s)', att ? '#B91C1C' : '#157C3D'),
      ]);
      body.append(kpis);
      const catOrder = ['Direction', 'Encadrement', 'Exécution', 'Consultant'];
      const countBy = (fn) => { const m = {}; pers.forEach(p => { const v = fn(p); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
      const catRows = catOrder.map(c => [c, pers.filter(p => p.categorie === c).length]).filter(r => r[1] > 0);
      const dirRows = countBy(p => p.direction);
      const svcRows = countBy(p => p.service);
      const grid = el('div.adm-grid3', {}, [
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Effectif par direction' }), el('div.adm-card-b', {}, [bars(dirRows)])]),
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Effectif par service' }), el('div.adm-card-b', {}, [bars(svcRows)])]),
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Répartition par catégorie' }), el('div.adm-card-b', {}, [bars(catRows)])]),
      ]);
      body.append(grid);
      const recruRows = countBy(p => p.modeRecrutement);
      const statutOrder = ['Actif', 'En congé', 'Suspendu', 'Sorti'];
      const statutRows = statutOrder.map(s => [s, pers.filter(p => p.statut === s).length]).filter(r => r[1] > 0);
      const grid1b = el('div.adm-grid2', {}, [
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Répartition par mode de recrutement' }), el('div.adm-card-b', {}, [bars(recruRows)])]),
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Répartition par statut' }), el('div.adm-card-b', {}, [bars(statutRows)])]),
      ]);
      body.append(grid1b);
      const recents = pers.filter(p => p.dateEmbauche).sort((a, b) => (b.dateEmbauche || '').localeCompare(a.dateEmbauche || '')).slice(0, 6);
      const lst = (items, color, fmt) => { const w = el('div'); if (!items.length) return el('div.adm-empty', { text: 'Aucun élément.' }); items.forEach(it => { const [t, d] = fmt(it); w.append(el('div.adm-li', {}, [el('span.adm-dot', { style: { background: color } }), el('div', {}, [el('div.adm-li-t', { text: t }), el('div.adm-li-d', { text: d })])])); }); return w; };
      const grid2 = el('div.adm-grid2', {}, [
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Derniers recrutements' }), el('div.adm-card-b', {}, [lst(recents, '#157C3D', p => [((p.nom || '') + ' ' + (p.prenom || '')).trim(), (p.poste || p.categorie || '') + ' — ' + fdate(p.dateEmbauche)])])]),
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Congés / absences en attente' }), el('div.adm-card-b', {}, [lst(cg.filter(c => c.statut === 'En attente').slice(0, 6), '#D97706', c => [c.agent || '', (c.type || '') + ' — ' + fdate(c.dateDebut) + ' → ' + fdate(c.dateFin)])])]),
      ]);
      body.append(grid2);
    }
    node._onMount = fill;
    return node;
  }

  // ── Journal d'activité ──────────────────────────────────────────────────────
  function journalPage() {
    const node = el('div.page');
    node.append(el('div.page-head', {}, [el('div', {}, [el('h1', { text: '📑 Journal d’activité' }), el('div.page-crumb', { text: 'Traçabilité des opérations administratives' })])]));
    const wrap = el('div.adm-tablewrap'); node.append(wrap);
    async function fill() {
      const a = (await DB.adminGet('audit')) || [];
      wrap.innerHTML = '';
      if (!a.length) { wrap.append(el('div.adm-empty', { text: 'Aucune opération enregistrée pour le moment.' })); return; }
      const table = el('table.adm-table');
      const thr = el('tr'); ['Date', 'Utilisateur', 'Action', 'Module', 'Référence'].forEach(h => thr.append(el('th', { text: h })));
      table.append(el('thead', {}, [thr]));
      const tb = el('tbody');
      a.slice(0, 300).forEach(e => { const d = new Date(e.at); tb.append(el('tr', {}, [
        el('td', { text: isNaN(d) ? (e.at || '') : d.toLocaleString('fr-FR') }), el('td', { text: e.user || '—' }),
        el('td', { text: e.action || '' }), el('td', { text: (MODULES[e.module] ? MODULES[e.module].title : (e.module || '—')) }), el('td', { text: e.ref || '' }),
      ])); });
      table.append(tb); wrap.append(table);
    }
    node._onMount = fill; return node;
  }

  // ── Sauvegarde & restauration ───────────────────────────────────────────────
  async function backupExport() {
    const out = { app: 'ANPER Gestion administrative', version: 1, exportedAt: new Date().toISOString(), data: {}, users: (await DB.adminGet('users')) || [], audit: (await DB.adminGet('audit')) || [] };
    for (const k of KEYS) out.data[k] = await load(k);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = el('a', { href: url, download: 'ANPER-admin-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    logAudit('Sauvegarde', '—', 'export'); toast('Sauvegarde exportée ✔', 'ok');
  }
  async function backupImport(obj, after) {
    if (!obj || !obj.data) { toast('Fichier de sauvegarde invalide.', 'err'); return; }
    for (const k of Object.keys(obj.data)) await DB.adminSet('data:' + k, obj.data[k]);
    if (Array.isArray(obj.users)) await DB.adminSet('users', obj.users);
    if (Array.isArray(obj.audit)) await DB.adminSet('audit', obj.audit);
    logAudit('Restauration', '—', 'import complet'); toast('Données restaurées ✔', 'ok'); if (after) after();
  }
  function backupPage() {
    const node = el('div.page');
    node.append(el('div.page-head', {}, [el('div', {}, [el('h1', { text: '💾 Sauvegarde & restauration' }), el('div.page-crumb', { text: 'Exporter ou réimporter toutes les données administratives' })])]));
    const body = el('div'); node.append(body);
    async function fill() {
      body.innerHTML = '';
      const stats = el('div.adm-kpis');
      for (const k of KEYS) { const n = (await load(k)).length; stats.append(el('div.adm-kpi', {}, [el('div.adm-kpi-v', { text: String(n) }), el('div.adm-kpi-l', { text: MODULES[k].title })])); }
      body.append(stats);
      const inp = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
      inp.addEventListener('change', async () => { const f = inp.files[0]; if (!f) return; let obj; try { obj = JSON.parse(await f.text()); } catch (e) { toast('Fichier illisible.', 'err'); return; } if (!await confirmDialog('Restaurer', 'Remplacer les données administratives actuelles par celles du fichier ? Cette action écrase les données en place.')) return; await backupImport(obj, () => navigate('adm_sauvegarde')); });
      const grid = el('div.adm-grid2', {}, [
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Exporter une sauvegarde' }), el('div.adm-card-b', {}, [
          el('p.muted', { text: 'Télécharge un fichier JSON contenant tous les modules, les comptes utilisateurs et le journal d’activité.' }),
          el('button.btn.btn-primary', { text: '⤓ Exporter (.json)', onclick: backupExport }),
        ])]),
        el('div.adm-card', {}, [el('div.adm-card-h', { text: 'Restaurer depuis un fichier' }), el('div.adm-card-b', {}, [
          el('p.muted', { text: 'Importe un fichier de sauvegarde. Les données administratives actuelles seront remplacées.' }),
          el('button.btn.btn-ghost', { text: '⤒ Choisir un fichier…', onclick: () => inp.click() }), inp,
        ])]),
      ]);
      body.append(grid);
    }
    node._onMount = fill; return node;
  }

  // ── Gestion des utilisateurs (administrateur) ───────────────────────────────
  function pageOptions() {
    const out = [];
    if (typeof ADMIN_NAV !== 'undefined') ADMIN_NAV.forEach(([i, l, p]) => out.push([p, l]));
    if (typeof NAV_ITEMS !== 'undefined') NAV_ITEMS.forEach(([i, l, p]) => out.push([p, 'S&E — ' + l]));
    if (typeof COMM_NAV !== 'undefined') COMM_NAV.forEach(([i, l, p]) => out.push([p, l]));
    return out;
  }
  function openUserForm(u, after) {
    const isNew = !u;
    const fUser = el('input.field-in', { value: u ? u.username : '', placeholder: 'ex. chefrh' });
    const fName = el('input.field-in', { value: u ? u.name : '', placeholder: 'Nom affiché' });
    const fRole = el('select.field-in'); [['admin', 'Administrateur'], ['gestionnaire', 'Gestionnaire'], ['consultation', 'Consultation']].forEach(([v, l]) => fRole.append(el('option', { value: v, text: l, selected: u && u.role === v ? '' : null })));
    if (u) fRole.value = u.role;
    const fPass = el('input.field-in', { type: 'text', placeholder: isNew ? '(vide = identique à l’identifiant)' : '(laisser vide = inchangé)' });
    // périmètre (allow) — masqué si Administrateur
    const allowSet = new Set(u && Array.isArray(u.allow) ? u.allow : []);
    const permBox = el('div.perm-box');
    pageOptions().forEach(([key, label]) => {
      const cb = el('input', { type: 'checkbox', value: key });
      if (allowSet.has(key)) cb.checked = true;
      permBox.append(el('label.perm-item', {}, [cb, el('span', { text: label })]));
    });
    const permWrap = el('div', {}, [el('label.field-lbl', { text: 'Périmètre (pages visibles)' }), permBox]);
    const syncPerm = () => { permWrap.style.display = (fRole.value === 'admin' || fRole.value === 'consultation') ? 'none' : 'block'; };
    fRole.onchange = syncPerm; syncPerm();
    const body = el('div', {}, [
      el('label.field-lbl', { text: 'Identifiant' }), fUser,
      el('label.field-lbl', { text: 'Nom affiché', style: { marginTop: '8px' } }), fName,
      el('label.field-lbl', { text: 'Rôle', style: { marginTop: '8px' } }), fRole,
      el('label.field-lbl', { text: isNew ? 'Mot de passe initial' : 'Nouveau mot de passe', style: { marginTop: '8px' } }), fPass,
      el('div', { style: { marginTop: '10px' } }, [permWrap]),
    ]);
    modal(isNew ? 'Nouvel utilisateur' : 'Modifier — ' + u.username, body, [
      { text: 'Annuler', kind: 'ghost', value: false },
      { text: 'Enregistrer', kind: 'primary', onClick: async () => {
        try {
          const allow = fRole.value === 'gestionnaire' ? [...permBox.querySelectorAll('input:checked')].map(c => c.value) : null;
          await AUTH.saveUser({ id: u ? u.id : null, username: fUser.value, name: fName.value, role: fRole.value, allow, password: fPass.value || '' });
          toast('Compte enregistré ✔', 'ok'); if (after) after();
        } catch (e) { toast(e.message, 'err', 5000); return false; }
      } },
    ]);
  }
  function usersPage() {
    const node = el('div.page');
    const head = el('div.page-head', {}, [el('div', {}, [el('h1', { text: '👥 Utilisateurs' }), el('div.page-crumb', { text: 'Comptes, rôles et mots de passe' })])]);
    head.append(el('button.btn.btn-primary', { text: '＋ Ajouter', onclick: () => openUserForm(null, fill) }));
    head.append(el('button.btn.btn-ghost', { text: '👥 Créer un compte par agent (Personnel)', onclick: async () => {
      if (!await confirmDialog('Créer les comptes', 'Créer un compte de connexion pour chaque agent du module Personnel qui n’en a pas encore ? Accès par défaut : Messagerie uniquement (mot de passe initial = identifiant). Les agents ayant déjà un compte (ex. dg, rh…) sont ignorés.')) return;
      const pers = await load('personnel');
      const r = await AUTH.bulkCreateFromPersonnel(pers);
      logAudit('Ajout', 'users', r.created + ' compte(s) créé(s) depuis Personnel');
      toast(r.created + ' compte(s) créé(s), ' + r.skipped + ' déjà existant(s) ou ignoré(s) ✔', 'ok', 5500);
      fill();
    } }));
    head.append(el('button.btn.btn-ghost', { text: '🗂️ Attribuer les droits par direction', onclick: async () => {
      if (!await confirmDialog('Attribuer les droits', 'Donner à chaque compte agent (créé depuis Personnel) le périmètre de pages correspondant à sa direction/service ? Les postes d’exécution (chauffeurs, secrétaires, coursiers…) restent à Messagerie uniquement. Ceci écrase le périmètre actuel de ces comptes s’il a déjà été ajusté manuellement.')) return;
      const pers = await load('personnel');
      const r = await AUTH.bulkAssignByDirection(pers);
      logAudit('Modification', 'users', r.updated + ' périmètre(s) mis à jour par direction');
      toast(r.updated + ' compte(s) mis à jour, ' + r.skipped + ' inchangé(s) ✔', 'ok', 5500);
      fill();
    } }));
    node.append(head);
    const wrap = el('div.adm-tablewrap'); node.append(wrap);
    function fill() {
      const users = AUTH.listUsers();
      wrap.innerHTML = '';
      const table = el('table.adm-table');
      const thr = el('tr'); ['Identifiant', 'Nom', 'Rôle', 'Périmètre', ''].forEach(h => thr.append(el('th', { text: h }))); table.append(el('thead', {}, [thr]));
      const tb = el('tbody');
      const RL = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', consultation: 'Consultation' };
      users.forEach(u => {
        const perim = u.role === 'admin' ? 'Tout' : (u.role === 'consultation' ? 'Tout (lecture)' : (u.allow ? u.allow.length + ' page(s)' : 'Tout'));
        const tr = el('tr', {}, [
          el('td', {}, [el('b', { text: u.username }), u.isMe ? el('span', { text: ' (vous)', style: { color: '#64748B', fontSize: '11px' } }) : null]),
          el('td', { text: u.name }), el('td', { text: RL[u.role] || u.role }), el('td', { text: perim }),
          el('td', {}, [el('div.adm-actions', {}, [
            el('button.adm-ic', { title: 'Modifier', text: '✎', onclick: () => openUserForm(u, fill) }),
            el('button.adm-ic', { title: 'Réinitialiser le mot de passe', text: '🔑', onclick: () => resetPwd(u) }),
            el('button.adm-ic.del', { title: 'Supprimer', text: '🗑', onclick: async () => { if (await confirmDialog('Supprimer', 'Supprimer le compte « ' + u.username + ' » ?')) { try { await AUTH.deleteUser(u.id); toast('Compte supprimé ✔', 'ok'); fill(); } catch (e) { toast(e.message, 'err', 5000); } } } }),
          ])]),
        ]);
        tb.append(tr);
      });
      table.append(tb); wrap.append(table);
    }
    function resetPwd(u) {
      const inp = el('input.field-in', { type: 'text', placeholder: 'nouveau mot de passe' });
      modal('Réinitialiser — ' + u.username, el('div', {}, [el('label.field-lbl', { text: 'Nouveau mot de passe' }), inp]), [
        { text: 'Annuler', kind: 'ghost', value: false },
        { text: 'Réinitialiser', kind: 'primary', onClick: async () => { try { await AUTH.resetPassword(u.id, inp.value); toast('Mot de passe réinitialisé ✔', 'ok'); } catch (e) { toast(e.message, 'err', 5000); return false; } } },
      ]);
    }
    node._onMount = fill; return node;
  }

  // ── Congés : droits, soldes & acte collectif annuel ──────────────────────────
  const CADRE_CATS = ['Direction', 'Encadrement'];   // « cadres »
  const AUX_CATS = ['Exécution'];                     // « auxiliaires »
  const DROIT_BASE = 30;                              // 1 mois / an
  const REPORT_MAX = 30;                              // report plafonné → 2 mois max

  const cgNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cgYear = d => { const m = String(d || '').match(/(\d{4})/); return m ? +m[1] : 0; };
  const cgDays = (a, b) => { if (!a || !b) return 0; const d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1; return d > 0 ? d : 0; };
  const cgMatch = (agent, p) => { const n = cgNorm(agent); const nom = cgNorm(p.nom), pre = cgNorm(p.prenom); return !!n && !!nom && n.includes(nom) && (!pre || n.includes(pre)); };
  const cgPris = (conges, p, year) => conges.filter(c => c.type === 'Congé annuel' && c.statut !== 'Refusé' && cgYear(c.dateDebut) === year && cgMatch(c.agent, p)).reduce((s, c) => s + cgDays(c.dateDebut, c.dateFin), 0);
  // Actif au cours de l'année : embauché au plus tard cette année-là, et pas encore sorti
  // avant le début de cette année (dateSortie absente = toujours en poste).
  const activeInYear = (p, year) => {
    const eYear = cgYear(p.dateEmbauche), sYear = cgYear(p.dateSortie);
    return (!eYear || eYear <= year) && (!sYear || sYear >= year);
  };

  function congesPage() {
    const node = page('conges');
    const origMount = node._onMount;
    const head = node.querySelector('.page-head');
    const wrapTable = node.querySelector('.adm-tablewrap');

    const nowY = new Date().getFullYear();
    const yearSel = el('select.field-in', { style: { maxWidth: '120px' } });
    for (let y = nowY + 1; y >= nowY - 3; y--) yearSel.append(el('option', { value: y, text: y, selected: y === nowY ? '' : null }));
    yearSel.value = nowY;
    const btnCadres = el('button.btn.btn-ghost', { text: '🗓️ Acte collectif — Cadres' });
    const btnAux = el('button.btn.btn-ghost', { text: '🗓️ Acte collectif — Auxiliaires' });
    const bar = el('div.conges-bar', {}, [
      el('label.field-lbl', { text: 'Année de référence' }), yearSel,
      ...(AUTH.canWrite() ? [btnCadres, btnAux] : []),
    ]);

    let droitsGroup = 'cadres'; // 'cadres' | 'aux' — onglets Cadres / Auxiliaires du tableau des droits
    const droitsTabs = el('div.tabs');
    [['cadres', '👔 Cadres'], ['aux', '🧰 Auxiliaires']].forEach(([t, lbl]) => droitsTabs.append(el('button.tab' + (t === droitsGroup ? '.active' : ''), {
      'data-t': t, text: lbl, onclick: () => {
        droitsGroup = t;
        [...droitsTabs.querySelectorAll('.tab')].forEach(b => b.classList.toggle('active', b.dataset.t === droitsGroup));
        renderDroits();
      },
    })));
    const droitsWrap = el('div.adm-tablewrap');
    const droitsSec = el('div', {}, [
      el('div.sec-title', {}, [el('span.sec-bar'), el('span', { text: '📊 Droits & soldes de congé annuel' })]),
      el('p.muted', { text: 'Droit : 30 jours (1 mois) par an. Report : 30 j − jours pris l’année précédente (soit 30 j si aucun congé pris l’an dernier), plafonné à 2 mois. Solde = droit + report − jours pris. Un agent peut étaler son congé en plusieurs périodes (plusieurs lignes au registre).' }),
      droitsTabs, droitsWrap,
    ]);
    const regTitle = el('div.sec-title', {}, [el('span.sec-bar'), el('span', { text: '🗓️ Registre des congés & absences' })]);

    head.after(bar); bar.after(droitsSec); wrapTable.before(regTitle);

    async function renderDroits() {
      const year = +yearSel.value;
      const pers = await load('personnel'), conges = await load('conges');
      const cats = droitsGroup === 'cadres' ? CADRE_CATS : AUX_CATS;
      const rows = pers.filter(p => cats.includes(p.categorie) && activeInYear(p, year))
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
      droitsWrap.innerHTML = '';
      if (!rows.length) { droitsWrap.append(el('div.adm-empty', { text: droitsGroup === 'cadres' ? 'Aucun agent cadre enregistré.' : 'Aucun agent auxiliaire enregistré.' })); return; }
      const table = el('table.adm-table');
      const cols = ['Agent', 'Droit (j)', 'Report (j)', 'Total (j)', 'Pris (j)', 'Solde (j)'];
      table.append(el('thead', {}, [el('tr', {}, cols.map(c => el('th', { text: c })))]));
      const tb = el('tbody');
      for (const p of rows) {
        const report = Math.max(0, Math.min(REPORT_MAX, DROIT_BASE - cgPris(conges, p, year - 1)));
        const total = DROIT_BASE + report;
        const pris = cgPris(conges, p, year);
        const solde = total - pris;
        const nm = ((p.nom || '') + ' ' + (p.prenom || '')).trim();
        tb.append(el('tr', {}, [
          el('td', { text: nm || '(sans nom)' }),
          el('td', { text: String(DROIT_BASE) }),
          el('td', { text: String(report) }),
          el('td', { text: String(total) }),
          el('td', { text: String(pris) }),
          el('td', {}, [el('span', { text: String(solde), style: { fontWeight: '700', color: solde < 0 ? '#B91C1C' : (solde === 0 ? '#64748B' : '#157C3D') } })]),
        ]));
      }
      table.append(tb); droitsWrap.append(table);
    }

    async function genCollectif(groupLabel, code, catsList) {
      const year = +yearSel.value;
      const pers = await load('personnel'), conges = await load('conges'), actes = await load('actes');
      const grp = pers.filter(p => catsList.includes(p.categorie) && activeInYear(p, year))
        .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr'));
      if (!grp.length) { toast('Aucun agent dans ce groupe.', 'warn'); return; }
      const lines = grp.map(p => {
        const nm = ((p.nom || '') + ' ' + (p.prenom || '')).trim();
        const c = conges.find(x => x.type === 'Congé annuel' && x.statut !== 'Refusé' && cgYear(x.dateDebut) === year && cgMatch(x.agent, p));
        const per = c ? ' — du ' + longDate(c.dateDebut) + ' au ' + longDate(c.dateFin) : '';
        return nm + (p.poste ? ' (' + p.poste + ')' : '') + per;
      });
      const acte = {
        id: uid(), createdAt: new Date().toISOString(), numero: 'CG-' + code + '-' + year,
        nature: 'Décision', type: 'Congé annuel', date: year + '-01-02', portee: 'Collectif',
        beneficiaires: lines.join('\n'), objet: 'congés annuels ' + year + ' — ' + groupLabel,
        signataire: 'Le Directeur Général', statut: 'Projet',
      };
      actes.push(acte); await save('actes', actes);
      logAudit('Ajout', 'actes', acte.numero);
      toast('Acte collectif « ' + groupLabel + ' » créé ✔ (' + grp.length + ' agents) — visible dans Actes & décisions', 'ok', 4500);
      openActeDoc(acte);
    }

    btnCadres.onclick = () => genCollectif('Cadres', 'CADRES', CADRE_CATS);
    btnAux.onclick = () => genCollectif('Auxiliaires', 'AUX', AUX_CATS);
    yearSel.onchange = renderDroits;
    node._onMount = () => { if (origMount) origMount(); renderDroits(); };
    return node;
  }

  // ── Assurances & Assurés jumelés (onglets) ──────────────────────────────────
  function assurPage() {
    const node = el('div.page');
    node.append(el('div.page-head', {}, [el('div', {}, [el('h1', { text: '☂️ Assurances & Assurés' }), el('div.page-crumb', { text: 'Polices, échéances et fiches des assurés' })])]));
    const tabsBar = el('div.tabs'); const body = el('div');
    const tabs = [['assurances', '☂️ Polices d’assurance'], ['assures', '🪪 Assurés']];
    let active = 'assurances';
    const draw = () => {
      body.innerHTML = '';
      [...tabsBar.querySelectorAll('.tab')].forEach(b => b.classList.toggle('active', b.dataset.t === active));
      const sub = page(active);
      const sh = sub.querySelector('.page-head');
      if (sh) { const t = sh.querySelector('div'); if (t) t.remove(); }   // enlève le titre interne, garde « + Ajouter »
      body.append(sub);
      if (sub._onMount) sub._onMount();
    };
    for (const [t, lbl] of tabs) tabsBar.append(el('button.tab', { 'data-t': t, text: lbl, onclick: () => { active = t; draw(); } }));
    node.append(tabsBar, body);
    node._onMount = draw;
    return node;
  }
  function omPage() {
    const node = page('ordremission');
    const fill = node._onMount;
    const head = node.querySelector('.page-head');
    const oldAdd = head.querySelector('button.btn-primary');
    if (oldAdd) oldAdd.remove();
    if (AUTH.canWrite()) {
      head.append(el('button.btn.btn-primary', { text: '＋ Ordre de mission (étranger)', onclick: () => openOMForm(null, fill, 'Étranger') }));
      head.append(el('button.btn.btn-ghost', { text: '＋ Ordre de déplacement (local)', onclick: () => openOMForm(null, fill, 'Local') }));
    }
    return node;
  }

  // ── Patrimoine & matériel : registre avec filtre par catégorie ──────────────
  function patrimoinePage() {
    const node = page('patrimoine');
    const fill = node._onMount;
    const head = node.querySelector('.page-head');
    const tabsBar = el('div.tabs');
    const tabs = [['', 'Toutes les catégories'], ['Mobilier de bureau', '🪑 Mobilier de bureau'], ['Matériel informatique', '💻 Matériel informatique'], ['Matériel roulant', '🚗 Matériel roulant']];
    let active = '';
    const applyFilter = () => {
      [...tabsBar.querySelectorAll('.tab')].forEach(b => b.classList.toggle('active', b.dataset.t === active));
      node.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = (!active || (tr.dataset.cat || '') === active) ? '' : 'none'; });
    };
    for (const [v, l] of tabs) tabsBar.append(el('button.tab', { 'data-t': v, text: l, onclick: () => { active = v; applyFilter(); } }));
    const addBtn = head.querySelector('button.btn-primary');
    if (addBtn) addBtn.onclick = () => openForm('patrimoine', null, () => fill().then(applyFilter), active ? { categorie: active } : null);
    head.after(tabsBar);
    node._onMount = () => fill().then(applyFilter);
    return node;
  }

  // ── Actes & décisions : onglets Arrêtés / Décisions / Notes & attestations ───
  // (les décisions de congé restent dans l'onglet Décisions — leur suivi détaillé
  // se fait dans « Congés & absences », pas ici)
  function actesPage() {
    const node = page('actes');
    const fill = node._onMount;
    const head = node.querySelector('.page-head');
    const tabsBar = el('div.tabs');
    const tabs = [['arretes', '⚖️ Arrêtés'], ['decisions', '📋 Décisions'], ['notes', '📄 Notes & attestations']];
    let active = 'arretes';
    const matches = (tr, t) => {
      const nat = tr.dataset.nature || '';
      if (t === 'arretes') return nat === 'Arrêté';
      if (t === 'decisions') return nat === 'Décision'; // inclut les décisions de congé — déjà suivies dans « Congés & absences »
      return nat !== 'Arrêté' && nat !== 'Décision'; // Note de service / Attestation / Certificat
    };
    const applyFilter = () => {
      [...tabsBar.querySelectorAll('.tab')].forEach(b => b.classList.toggle('active', b.dataset.t === active));
      node.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = matches(tr, active) ? '' : 'none'; });
    };
    for (const [t, lbl] of tabs) tabsBar.append(el('button.tab', { 'data-t': t, text: lbl, onclick: () => { active = t; applyFilter(); } }));
    head.after(tabsBar);
    node._onMount = () => fill().then(applyFilter);
    return node;
  }

  // ── Courrier : onglets Arrivée / Départ ──────────────────────────────────────
  function courrierPage() {
    const node = page('courrier');
    const fill = node._onMount;
    const head = node.querySelector('.page-head');
    const tabsBar = el('div.tabs');
    const tabs = [['arrivee', '📥 Arrivée'], ['depart', '📤 Départ']];
    let active = 'arrivee';
    const applyFilter = () => {
      [...tabsBar.querySelectorAll('.tab')].forEach(b => b.classList.toggle('active', b.dataset.t === active));
      const want = active === 'arrivee' ? 'Arrivée' : 'Départ';
      node.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = (tr.dataset.sens === want) ? '' : 'none'; });
    };
    for (const [t, lbl] of tabs) tabsBar.append(el('button.tab', { 'data-t': t, text: lbl, onclick: () => { active = t; applyFilter(); } }));
    head.after(tabsBar);
    node._onMount = () => fill().then(applyFilter);
    return node;
  }

  // Fiches Personnel sans matricule (import PAD, anciennes fiches) : bouton pour
  // continuer la numérotation déjà en usage (001/A, 002/B… 021/U → 022/V…),
  // nécessaire pour que ces agents puissent s'identifier à la Badgeuse (Pointage).
  function personnelPage() {
    const node = page('personnel');
    const fill = node._onMount;
    const head = node.querySelector('.page-head');
    const addBtn = head.querySelector('button.btn-primary');
    if (AUTH.canWrite()) {
      const genBtn = el('button.btn.btn-ghost.btn-sm', { text: '🔢 Générer les matricules manquants', onclick: async () => {
        const list = await load('personnel');
        const missing = list.filter(p => !(p.matricule || '').trim());
        if (!missing.length) { toast('Tous les agents ont déjà un matricule.', 'info'); return; }
        let maxNum = 0;
        for (const p of list) { const mm = /^(\d{3})\/[A-Z]+$/.exec((p.matricule || '').trim()); if (mm) maxNum = Math.max(maxNum, parseInt(mm[1], 10)); }
        let n = maxNum;
        for (const p of missing) { n++; p.matricule = String(n).padStart(3, '0') + '/' + numToLetters(n); }
        await save('personnel', list);
        logAudit('Génération matricules', 'personnel', missing.length + ' agent(s)');
        toast(missing.length + ' matricule(s) généré(s) ✔', 'ok');
        fill();
      } });
      head.insertBefore(genBtn, addBtn || null);
    }
    return node;
  }

  // ── Fiche d'inventaire par Direction / Service (imprimable + Word) ──────────
  function invMoney(v) { const n = Number(v) || 0; return n ? n.toLocaleString('fr-FR') : '—'; }
  function invCatTable(cat, rows) {
    if (!rows.length) return '';
    const roulant = cat === 'Matériel roulant', info = cat === 'Matériel informatique';
    let head = '<th>N° inv.</th><th>Désignation</th><th>Marque / Modèle</th>';
    if (info) head += '<th>N° de série</th>';
    if (roulant) head += '<th>Immatric.</th><th>Assurance (police – cie – échéance)</th>';
    head += '<th>Détenteur</th><th>État</th><th style="text-align:right">Valeur (FCFA)</th>';
    let total = 0;
    const body = rows.map(r => {
      total += Number(r.valeur) || 0;
      let tds = '<td>' + escH(r.inventaire || '—') + '</td><td>' + escH(r.designation || '—') + '</td><td>' + escH(r.marque || '—') + '</td>';
      if (info) tds += '<td>' + escH(r.numeroSerie || '—') + '</td>';
      if (roulant) {
        const asr = [r.assurancePolice, r.assureur, r.assuranceEcheance ? fdate(r.assuranceEcheance) : ''].filter(Boolean).join(' – ');
        tds += '<td>' + escH(r.immatriculation || '—') + '</td><td>' + escH(asr || '—') + '</td>';
      }
      tds += '<td>' + escH(r.detenteur || '—') + '</td><td>' + escH(r.etat || '—') + '</td><td style="text-align:right">' + invMoney(r.valeur) + '</td>';
      return '<tr>' + tds + '</tr>';
    }).join('');
    const span = 5 + (info ? 1 : 0) + (roulant ? 2 : 0);
    const foot = '<tr class="inv-tot"><td colspan="' + span + '" style="text-align:right"><b>Sous-total ' + escH(cat) + ' (' + rows.length + ')</b></td><td style="text-align:right"><b>' + invMoney(total) + '</b></td></tr>';
    const icon = roulant ? '🚗' : (info ? '💻' : '🪑');
    return '<h3 class="inv-h3">' + icon + ' ' + escH(cat) + '</h3>'
      + '<table class="inv-tbl"><thead><tr>' + head + '</tr></thead><tbody>' + body + foot + '</tbody></table>';
  }
  function inventaireDoc(direction, rows) {
    const CATS = ['Mobilier de bureau', 'Matériel informatique', 'Matériel roulant'];
    const total = rows.reduce((s, r) => s + (Number(r.valeur) || 0), 0);
    let body = '';
    for (const c of CATS) body += invCatTable(c, rows.filter(r => r.categorie === c));
    if (!rows.length) body = '<p class="inv-empty">Aucun bien enregistré pour cette Direction / ce Service.</p>';
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    return '<div class="acte">' + acteHeader(direction)
      + '<div class="inv-title">FICHE D’INVENTAIRE DU MATÉRIEL</div>'
      + '<div class="inv-sub">' + escH(direction) + '</div>'
      + '<div class="inv-meta">Arrêtée à la date du ' + today + ' — ' + rows.length + ' bien(s) recensé(s)'
      + ' — Valeur totale : <b>' + invMoney(total) + ' FCFA</b></div>'
      + body
      + '<div class="inv-sign"><div>Le Gestionnaire du matériel<br/><br/><br/>__________________________</div>'
      + '<div>' + escH(direction.startsWith('Direction') ? 'Le Directeur' : 'Le Chef de Service') + '<br/><br/><br/>__________________________</div></div>'
      + '</div>';
  }
  // ── Formulaire de saisie (vierge) : recensement du matériel ─────────────────
  function saisieFormDoc() {
    const cols = ['N° inv.', 'Catégorie', 'Désignation / Type', 'Marque / Modèle', 'N° série / Châssis', 'Immatric.', 'Détenteur', 'Date acq.', 'Valeur (FCFA)', 'État', 'Assurance (roulant)', 'Obs.'];
    const head = cols.map(c => '<th>' + escH(c) + '</th>').join('');
    let rows = '';
    for (let i = 0; i < 14; i++) rows += '<tr>' + cols.map(() => '<td>&nbsp;</td>').join('') + '</tr>';
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    return '<div class="acte">' + acteHeader()
      + '<div class="inv-title">FORMULAIRE DE SAISIE DU MATÉRIEL</div>'
      + '<div class="inv-meta" style="text-align:left">Direction / Service : ________________________________________________  &nbsp;&nbsp; Date : ' + today
      + '<br/>Recensé par : __________________________________  Fonction : __________________________________</div>'
      + '<table class="inv-tbl saisie-tbl"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div class="inv-legend"><b>Catégories :</b> Mobilier de bureau · Matériel informatique · Matériel roulant &nbsp;—&nbsp; <b>État :</b> Neuf · Bon état · Usagé · En panne · Réformé.'
      + ' La colonne « Assurance » (n° police – compagnie – échéance) ne concerne que le matériel roulant.</div>'
      + '<div class="inv-sign"><div>L’agent recenseur<br/><br/><br/>__________________________</div>'
      + '<div>Le Gestionnaire du matériel<br/><br/><br/>__________________________</div></div>'
      + '</div>';
  }

  // ── Fiches individuelles de matériel — une par catégorie, champs adaptés ────
  const frBlank = '<span class="frl-blank"></span>';
  const frV = x => (x == null || x === '') ? frBlank : escH(x);
  const frDv = x => x ? escH(fdate(x)) : frBlank;
  const frRow = (l, val) => '<tr><td class="frl-l">' + escH(l) + '</td><td class="frl-v">' + val + '</td></tr>';
  const frSect = t => '<tr><td colspan="2" class="frl-sect">' + escH(t) + '</td></tr>';
  const frSign = (l1, l2) => '<div class="inv-sign"><div>' + escH(l1) + '<br/><br/><br/>__________________________</div>'
    + '<div>' + escH(l2) + '<br/><br/><br/>__________________________</div></div>';

  function ficheRoulantDoc(rec) {
    rec = rec || {};
    const body =
        frSect('Identification')
      + frRow('Type (véhicule / moto)', frV(rec.designation))
      + frRow('Marque / Modèle', frV(rec.marque))
      + frRow('Immatriculation', frV(rec.immatriculation))
      + frRow('N° de châssis / série', frV(rec.numeroSerie))
      + frRow('N° d’inventaire', frV(rec.inventaire))
      + frRow('Date de mise en circulation / acquisition', frDv(rec.dateAcquisition))
      + frRow('Énergie (essence / gasoil)', frBlank)
      + frRow('Puissance / cylindrée', frBlank)
      + frSect('Affectation')
      + frRow('Direction / Service', frV(rec.direction))
      + frRow('Détenteur / Conducteur', frV(rec.detenteur))
      + frRow('État', frV(rec.etat))
      + frSect('Valeur')
      + frRow('Valeur d’acquisition (FCFA)', rec.valeur ? invMoney(rec.valeur) : frBlank)
      + frSect('Assurance')
      + frRow('Compagnie d’assurance', frV(rec.assureur))
      + frRow('N° de police', frV(rec.assurancePolice))
      + frRow('Échéance de l’assurance', frDv(rec.assuranceEcheance))
      + frSect('Suivi & entretien')
      + frRow('Kilométrage actuel', frBlank)
      + frRow('Dernier entretien (date / nature)', frBlank)
      + frRow('Prochaine visite technique', frBlank)
      + frSect('Observations')
      + '<tr><td colspan="2" class="frl-obs">' + (rec.observation ? escH(rec.observation) : '&nbsp;') + '</td></tr>';
    const titre = /moto/i.test(rec.designation || '') ? 'MOTO' : 'VÉHICULE';
    return '<div class="acte">' + acteHeader()
      + '<div class="inv-title">FICHE DU MATÉRIEL ROULANT</div>'
      + '<div class="inv-sub">' + titre + (rec.immatriculation ? ' — ' + escH(rec.immatriculation) : '') + '</div>'
      + '<table class="frl-tbl">' + body + '</table>'
      + frSign('Le Détenteur / Conducteur', 'Le Gestionnaire du matériel')
      + '</div>';
  }

  function ficheInformatiqueDoc(rec) {
    rec = rec || {};
    const body =
        frSect('Identification')
      + frRow('Désignation / Type', frV(rec.designation))
      + frRow('Marque / Modèle', frV(rec.marque))
      + frRow('Sous-catégorie', frV(rec.sousCategorie))
      + frRow('N° de série', frV(rec.numeroSerie))
      + frRow('N° d’inventaire', frV(rec.inventaire))
      + frRow('Date d’acquisition', frDv(rec.dateAcquisition))
      + frSect('Affectation')
      + frRow('Direction / Service', frV(rec.direction))
      + frRow('Détenteur / Utilisateur', frV(rec.detenteur))
      + frRow('État', frV(rec.etat))
      + frSect('Valeur')
      + frRow('Valeur d’acquisition (FCFA)', rec.valeur ? invMoney(rec.valeur) : frBlank)
      + frSect('Observations')
      + '<tr><td colspan="2" class="frl-obs">' + (rec.observation ? escH(rec.observation) : '&nbsp;') + '</td></tr>';
    return '<div class="acte">' + acteHeader()
      + '<div class="inv-title">FICHE DE MATÉRIEL INFORMATIQUE</div>'
      + '<div class="inv-sub">' + (rec.designation ? escH(rec.designation) : '') + (rec.numeroSerie ? ' — S/N ' + escH(rec.numeroSerie) : '') + '</div>'
      + '<table class="frl-tbl">' + body + '</table>'
      + frSign('Le Détenteur / Utilisateur', 'Le Gestionnaire du matériel')
      + '</div>';
  }

  function ficheMobilierDoc(rec) {
    rec = rec || {};
    const body =
        frSect('Identification')
      + frRow('Désignation / Type', frV(rec.designation))
      + frRow('Marque / Modèle', frV(rec.marque))
      + frRow('Sous-catégorie', frV(rec.sousCategorie))
      + frRow('N° d’inventaire', frV(rec.inventaire))
      + frRow('Date d’acquisition', frDv(rec.dateAcquisition))
      + frSect('Affectation')
      + frRow('Direction / Service', frV(rec.direction))
      + frRow('Détenteur / Responsable', frV(rec.detenteur))
      + frRow('État', frV(rec.etat))
      + frSect('Valeur')
      + frRow('Valeur d’acquisition (FCFA)', rec.valeur ? invMoney(rec.valeur) : frBlank)
      + frSect('Observations')
      + '<tr><td colspan="2" class="frl-obs">' + (rec.observation ? escH(rec.observation) : '&nbsp;') + '</td></tr>';
    return '<div class="acte">' + acteHeader()
      + '<div class="inv-title">FICHE DE MOBILIER DE BUREAU</div>'
      + '<div class="inv-sub">' + (rec.designation ? escH(rec.designation) : '') + (rec.inventaire ? ' — ' + escH(rec.inventaire) : '') + '</div>'
      + '<table class="frl-tbl">' + body + '</table>'
      + frSign('Le Détenteur / Responsable', 'Le Gestionnaire du matériel')
      + '</div>';
  }

  // Sélectionne la fiche adaptée à la catégorie (bien réel, ou fiche vierge si categorie fournie sans rec).
  function ficheMaterielDoc(rec, categorie) {
    const cat = categorie || (rec && rec.categorie) || '';
    if (cat === 'Matériel roulant') return ficheRoulantDoc(rec);
    if (cat === 'Matériel informatique') return ficheInformatiqueDoc(rec);
    return ficheMobilierDoc(rec);
  }

  // Aperçu générique (impression PDF + export Word) pour les formulaires/fiches
  function openSimpleDoc(html, name, opts) {
    opts = opts || {};
    const ov = el('div.acte-overlay#acte-overlay');
    const area = el('div#acte-print' + (opts.wide ? '.inv-doc' : ''), { html });
    const bar = el('div.acte-bar.no-print', {}, [
      el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
      el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF' + (opts.landscape ? ' (paysage)' : ''), onclick: () => window.print() }),
      el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(area, name, { landscape: !!opts.landscape }) }),
    ]);
    ov.append(bar, el('div.acte-scroll', {}, [area]));
    document.body.append(ov);
  }

  function openInventaireDoc(direction, rows) {
    const ov = el('div.acte-overlay#acte-overlay');
    const area = el('div#acte-print.inv-doc', { html: inventaireDoc(direction, rows) });
    const bar = el('div.acte-bar.no-print', {}, [
      el('button.btn.btn-ghost', { text: '✕ Fermer', onclick: () => ov.remove() }),
      el('button.btn.btn-primary', { text: '🖨 Imprimer / PDF (paysage)', onclick: () => window.print() }),
      el('button.btn.btn-primary', { text: '📝 Word', onclick: () => docWord(area, 'Inventaire_' + direction, { landscape: true }) }),
    ]);
    ov.append(bar, el('div.acte-scroll', {}, [area]));
    document.body.append(ov);
  }
  function inventairePage() {
    const node = el('div.page');
    node.append(el('div.page-head', {}, [el('div', {}, [
      el('h1', { text: '🗂️ Fiches d’inventaire par Direction' }),
      el('div.page-crumb', { text: 'Mobilier, matériel informatique et matériel roulant affectés à chaque Direction / Service' }),
    ])]));
    const dirSel = el('select.field-in', { style: { maxWidth: '520px' } });
    dirSel.append(el('option', { value: '', text: '— Choisir une Direction / un Service —' }));
    DIRECTIONS.concat(SERVICES).forEach(d => dirSel.append(el('option', { value: d, text: d })));
    const summary = el('div.inv-summary');
    const genBtn = el('button.btn.btn-primary', { text: '📄 Générer la fiche', onclick: async () => {
      const d = dirSel.value; if (!d) { toast('Choisissez d’abord une Direction / un Service.', 'warn'); return; }
      const all = await load('patrimoine');
      openInventaireDoc(d, all.filter(r => r.direction === d));
    } });
    const saisieBtn = el('button.btn.btn-ghost', { text: '🖨 Formulaire de saisie', title: 'Feuille de recensement vierge (tous les éléments)', onclick: () => openSimpleDoc(saisieFormDoc(), 'Formulaire_saisie_materiel', { landscape: true, wide: true }) });
    const mobilierBtn = el('button.btn.btn-ghost', { text: '🪑 Fiche mobilier (vierge)', onclick: () => openSimpleDoc(ficheMobilierDoc(null), 'Fiche_mobilier') });
    const infoBtn = el('button.btn.btn-ghost', { text: '💻 Fiche informatique (vierge)', onclick: () => openSimpleDoc(ficheInformatiqueDoc(null), 'Fiche_materiel_informatique') });
    const roulantBtn = el('button.btn.btn-ghost', { text: '🚗 Fiche matériel roulant (vierge)', onclick: () => openSimpleDoc(ficheRoulantDoc(null), 'Fiche_materiel_roulant') });
    node.append(el('div.adm-toolbar', {}, [el('label.field-lbl', { text: 'Direction / Service :' }), dirSel, genBtn, saisieBtn, mobilierBtn, infoBtn, roulantBtn]), summary);
    node._onMount = async () => {
      const all = await load('patrimoine');
      summary.innerHTML = '';
      if (!all.length) { summary.append(el('div.adm-empty', { text: 'Aucun bien enregistré. Ajoutez-en dans « Patrimoine & matériel ».' })); return; }
      const byDir = {}; all.forEach(r => { const k = r.direction || '(non affecté)'; (byDir[k] = byDir[k] || []).push(r); });
      const table = el('table.adm-table');
      table.append(el('thead', {}, [el('tr', {}, ['Direction / Service', 'Mobilier', 'Informatique', 'Roulant', 'Total biens', 'Fiche'].map(c => el('th', { text: c })))]));
      const tb = el('tbody');
      Object.keys(byDir).sort((a, b) => a.localeCompare(b, 'fr')).forEach(dir => {
        const rs = byDir[dir];
        const cnt = c => rs.filter(r => r.categorie === c).length;
        tb.append(el('tr', {}, [
          el('td', { text: dir }),
          el('td', { text: String(cnt('Mobilier de bureau')) }),
          el('td', { text: String(cnt('Matériel informatique')) }),
          el('td', { text: String(cnt('Matériel roulant')) }),
          el('td', {}, [el('span.adm-chip', { text: String(rs.length) })]),
          el('td', {}, [el('button.adm-ic', { title: 'Générer la fiche d’inventaire', text: '📄', onclick: () => openInventaireDoc(dir, rs) })]),
        ]));
      });
      table.append(tb); summary.append(table);
    };
    return node;
  }

  function register() { for (const k of KEYS) Pages['adm_' + k] = () => page(k); Pages['adm_personnel'] = () => personnelPage(); Pages['adm_patrimoine'] = () => patrimoinePage(); Pages['adm_actes'] = () => actesPage(); Pages['adm_courrier'] = () => courrierPage(); Pages['adm_inventaire'] = () => inventairePage(); Pages['adm_conges'] = () => congesPage(); Pages['adm_ordremission'] = () => omPage(); Pages['adm_assurances'] = () => assurPage(); Pages['adm_rhboard'] = () => rhDashboard(); Pages['adm_journal'] = () => journalPage(); Pages['adm_sauvegarde'] = () => backupPage(); Pages['adm_users'] = () => usersPage(); }

  return { init: seedIfNeeded, register, MODULES, KEYS };
})();
window.ADM = ADM;
