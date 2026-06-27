/* Constantes ANPER SE — couleurs, options, navigation, palettes.
   Miroir de ui/theme.py et db/manager.py de la version desktop. */

const T = {
  PRIMARY:   '#157C3D',
  PRIMARY_D: '#0F5C2D',
  PRIMARY_L: '#D1FAE5',
  DANGER:    '#B91C1C',
  WARNING:   '#D97706',
  INFO:      '#1D4ED8',
  DARK1:     '#0F172A',
  DARK2:     '#1E293B',
  SIDEBAR:   '#1E3A5F',
  GRAY700:   '#374151',
  GRAY500:   '#6B7280',
  GRAY300:   '#D1D5DB',
  GRAY100:   '#F3F4F6',
  WHITE:     '#FFFFFF',
  BG_APP:    '#F0F4F8',
  BG_CARD:   '#FFFFFF',
  TEXT_MAIN: '#0F172A',
  TEXT_MUTED:'#64748B',
};

const REGIONS = ['Agadez','Diffa','Dosso','Maradi','Niamey','Tahoua','Tillabéri','Zinder'];

const STATUTS_PROJET   = ['En cours','Terminé','Suspendu','En attente'];
const SOURCES_FIN      = ['Don','Prêt','Prêt concessionnel','Fonds propres','PPP','Autre'];
const TECHNOS          = ['Solaire PV','Hybride','Éolien','Biomasse','Mini-hydraulique','Autre'];
const TYPES_CLIENT     = ['Ménage','PME','Institution','Autre'];
const GENRES           = ['Masculin','Féminin'];
const MILIEUX          = ['Rural','Urbain','Péri-urbain'];
const TYPES_COMPTEUR   = ['Prépayé','Postpayé','Autre'];
const STATUTS_PAIEMENT = ['À jour','Retard 1 mois','En défaut'];

const STATUT_COLORS = {
  'En cours':   { bg:'#065F46', fg:'#FFFFFF' },
  'Terminé':    { bg:'#DBEAFE', fg:'#1E40AF' },
  'Suspendu':   { bg:'#FEF3C7', fg:'#92400E' },
  'En attente': { bg:'#F3F4F6', fg:'#374151' },
};

const NAV_ITEMS = [
  ['🏠','Tableau de Bord','dashboard'],
  ['📋','Fiche Projet','fiche_projet'],
  ['👤','Fiche Client','fiche_client'],
  ['📊','Registre Projets','registre_projets'],
  ['👥','Registre Clients','registre_clients'],
  ['🔧','Composantes','registre_composantes'],
  ['📑','Rapports','rapports'],
  ['🗺️','Carte SIG','sig'],
];

// Palettes graphiques (miroir dashboard.py)
const PAL  = ['#157C3D','#1D4ED8','#D97706','#B91C1C','#0891B2','#7C3AED','#059669','#DB2777'];
const GEN  = { 'Masculin':'#1D4ED8','Féminin':'#DB2777','N.C.':'#9CA3AF' };
const TYPE = { 'Ménage':'#157C3D','PME':'#D97706','Institution':'#1D4ED8','Autre':'#9CA3AF' };
const MIL  = { 'Rural':'#059669','Urbain':'#1D4ED8','Péri-urbain':'#D97706','N.C.':'#9CA3AF' };
const PAY  = { 'À jour':'#157C3D','Retard 1 mois':'#D97706','En défaut':'#B91C1C','N.C.':'#9CA3AF' };
const STA  = { 'En cours':'#157C3D','Terminé':'#1D4ED8','Suspendu':'#D97706','En attente':'#9CA3AF' };
const TECH = { 'Solaire PV':'#D97706','Hybride':'#0891B2','Éolien':'#059669',
               'Biomasse':'#7C3AED','Mini-hydraulique':'#1D4ED8','Autre':'#9CA3AF' };

function clr(palette, key) {
  if (palette[key]) return palette[key];
  let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PAL[h % PAL.length];
}

// Coordonnées approximatives des chefs-lieux de région (pour la carte SIG)
const REGION_COORDS = {
  'Agadez':   [16.97, 7.99],
  'Diffa':    [13.31, 12.61],
  'Dosso':    [13.05, 3.19],
  'Maradi':   [13.50, 7.10],
  'Niamey':   [13.51, 2.11],
  'Tahoua':   [14.89, 5.27],
  'Tillabéri':[14.21, 1.45],
  'Tillaberi':[14.21, 1.45],
  'Zinder':   [13.80, 8.99],
};
