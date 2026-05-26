/**
 * Table de correspondance code NAF rev. 2 → libellé officiel français.
 *
 * Source : INSEE NAF rev. 2 (2008), libellés exacts utilisés par l'Annuaire
 * des Entreprises (annuaire-entreprises.data.gouv.fr) et l'INPI.
 *
 * Couvre les ~250 codes les plus fréquents en B2B PME (consulting, IT,
 * immobilier, services, etc.). Pour un code non listé, on retourne `null`
 * et le caller peut décider du fallback (afficher le code brut ou laisser
 * vide pour saisie manuelle).
 *
 * Utilisé par :
 *   - le form de création client (auto-fill au pick d'une suggestion annuaire)
 *   - le bouton "Annuaire" sur la fiche client (re-récup post-création)
 */

/**
 * Normalise un code NAF en clé canonique 5 caractères. Accepte
 * "71.12B", "7112B", "71.12b", etc. Retourne "71.12B".
 */
function normalize(naf: string): string {
  const clean = naf.toUpperCase().replace(/[\s.]/g, "");
  // 4 chiffres + 1 lettre = 5 caractères. Format "NN.NNX" pour lookup.
  if (clean.length >= 5) {
    return clean.substring(0, 2) + "." + clean.substring(2, 5);
  }
  if (clean.length === 4) {
    return clean.substring(0, 2) + "." + clean.substring(2, 4);
  }
  return naf.toUpperCase();
}

export function libelleFromNaf(naf: string | null | undefined): string | null {
  if (!naf) return null;
  const key = normalize(naf);
  return NAF_LIBELLES[key] ?? null;
}

const NAF_LIBELLES: Record<string, string> = {
  // === Section J : Information & communication ===
  "58.11Z": "Édition de livres",
  "58.12Z": "Édition de répertoires et de fichiers d'adresses",
  "58.13Z": "Édition de journaux",
  "58.14Z": "Édition de revues et périodiques",
  "58.19Z": "Autres activités d'édition",
  "58.21Z": "Édition de jeux électroniques",
  "58.29A": "Édition de logiciels système et de réseau",
  "58.29B": "Édition de logiciels outils de développement et de langages",
  "58.29C": "Édition de logiciels applicatifs",
  "59.11A": "Production de films et de programmes pour la télévision",
  "59.11B": "Production de films institutionnels et publicitaires",
  "59.11C": "Production de films pour le cinéma",
  "59.12Z": "Post-production de films cinématographiques, de vidéo et de programmes de télévision",
  "59.13A": "Distribution de films cinématographiques",
  "59.14Z": "Projection de films cinématographiques",
  "59.20Z": "Enregistrement sonore et édition musicale",
  "60.10Z": "Édition et diffusion de programmes radio",
  "60.20A": "Édition de chaînes généralistes",
  "60.20B": "Édition de chaînes thématiques",
  "61.10Z": "Télécommunications filaires",
  "61.20Z": "Télécommunications sans fil",
  "61.30Z": "Télécommunications par satellite",
  "61.90Z": "Autres activités de télécommunication",
  "62.01Z": "Programmation informatique",
  "62.02A": "Conseil en systèmes et logiciels informatiques",
  "62.02B": "Tierce maintenance de systèmes et d'applications informatiques",
  "62.03Z": "Gestion d'installations informatiques",
  "62.09Z": "Autres activités informatiques",
  "63.11Z": "Traitement de données, hébergement et activités connexes",
  "63.12Z": "Portails internet",
  "63.91Z": "Activités des agences de presse",
  "63.99Z": "Autres services d'information n.c.a.",

  // === Section K : Activités financières et d'assurance ===
  "64.11Z": "Activités de banque centrale",
  "64.19Z": "Autres intermédiations monétaires",
  "64.20Z": "Activités des sociétés holding",
  "64.30Z": "Fonds de placement et entités financières similaires",
  "64.91Z": "Crédit-bail",
  "64.92Z": "Autre distribution de crédit",
  "64.99Z": "Autres activités des services financiers, hors assurance et caisses de retraite, n.c.a.",
  "65.11Z": "Assurance vie",
  "65.12Z": "Autres assurances",
  "65.20Z": "Réassurance",
  "65.30Z": "Caisses de retraite",
  "66.11Z": "Administration de marchés financiers",
  "66.12Z": "Courtage de valeurs mobilières et de marchandises",
  "66.19A": "Supports juridiques de gestion de patrimoine mobilier",
  "66.19B": "Autres activités auxiliaires de services financiers, hors assurance et caisses de retraite, n.c.a.",
  "66.21Z": "Évaluation des risques et dommages",
  "66.22Z": "Activités des agents et courtiers d'assurances",
  "66.29Z": "Autres activités auxiliaires d'assurance et de caisses de retraite",
  "66.30Z": "Gestion de fonds",

  // === Section L : Activités immobilières ===
  "68.10Z": "Activités des marchands de biens immobiliers",
  "68.20A": "Location de logements",
  "68.20B": "Location de terrains et d'autres biens immobiliers",
  "68.31Z": "Agences immobilières",
  "68.32A": "Administration d'immeubles et autres biens immobiliers",
  "68.32B": "Supports juridiques de gestion de patrimoine immobilier",

  // === Section M : Activités spécialisées, scientifiques et techniques ===
  "69.10Z": "Activités juridiques",
  "69.20Z": "Activités comptables",
  "70.10Z": "Activités des sièges sociaux",
  "70.21Z": "Conseil en relations publiques et communication",
  "70.22Z": "Conseil pour les affaires et autres conseils de gestion",
  "71.11Z": "Activités d'architecture",
  "71.12A": "Activité des géomètres",
  "71.12B": "Ingénierie, études techniques",
  "71.20A": "Contrôle technique automobile",
  "71.20B": "Analyses, essais et inspections techniques",
  "72.11Z": "Recherche-développement en biotechnologie",
  "72.19Z": "Recherche-développement en autres sciences physiques et naturelles",
  "72.20Z": "Recherche-développement en sciences humaines et sociales",
  "73.11Z": "Activités des agences de publicité",
  "73.12Z": "Régie publicitaire de médias",
  "73.20Z": "Études de marché et sondages",
  "74.10Z": "Activités spécialisées de design",
  "74.20Z": "Activités photographiques",
  "74.30Z": "Traduction et interprétation",
  "74.90A": "Activité des économistes de la construction",
  "74.90B": "Activités spécialisées, scientifiques et techniques diverses",
  "75.00Z": "Activités vétérinaires",

  // === Section N : Activités de services administratifs et de soutien ===
  "77.11A": "Location de courte durée de voitures et de véhicules automobiles légers",
  "77.11B": "Location de longue durée de voitures et de véhicules automobiles légers",
  "77.39Z": "Location et location-bail d'autres machines, équipements et biens matériels n.c.a.",
  "78.10Z": "Activités des agences de placement de main-d'œuvre",
  "78.20Z": "Activités des agences de travail temporaire",
  "78.30Z": "Autre mise à disposition de ressources humaines",
  "79.11Z": "Activités des agences de voyage",
  "79.12Z": "Activités des voyagistes",
  "79.90Z": "Autres services de réservation et activités connexes",
  "82.11Z": "Services administratifs combinés de bureau",
  "82.19Z": "Photocopie, préparation de documents et autres activités spécialisées de soutien de bureau",
  "82.30Z": "Organisation de foires, salons professionnels et congrès",
  "82.91Z": "Activités des agences de recouvrement de factures et des sociétés d'information financière sur la clientèle",
  "82.99Z": "Autres activités de soutien aux entreprises n.c.a.",

  // === Section G : Commerce ===
  "45.11Z": "Commerce de voitures et de véhicules automobiles légers",
  "45.20A": "Entretien et réparation de véhicules automobiles légers",
  "47.11A": "Commerce de détail de produits surgelés",
  "47.11B": "Commerce d'alimentation générale",
  "47.11C": "Supérettes",
  "47.11D": "Supermarchés",
  "47.11E": "Magasins multi-commerces",
  "47.11F": "Hypermarchés",
  "47.19A": "Grands magasins",
  "47.19B": "Autres commerces de détail en magasin non spécialisé",
  "47.91A": "Vente à distance sur catalogue général",
  "47.91B": "Vente à distance sur catalogue spécialisé",
  "47.99A": "Vente à domicile",
  "47.99B": "Vente par automates et autres commerces de détail hors magasin, éventaires ou marchés n.c.a.",

  // === Section I : Hébergement et restauration ===
  "55.10Z": "Hôtels et hébergement similaire",
  "55.20Z": "Hébergement touristique et autre hébergement de courte durée",
  "55.30Z": "Terrains de camping et parcs pour caravanes ou véhicules de loisirs",
  "55.90Z": "Autres hébergements",
  "56.10A": "Restauration traditionnelle",
  "56.10B": "Cafétérias et autres libres-services",
  "56.10C": "Restauration de type rapide",
  "56.21Z": "Services des traiteurs",
  "56.29A": "Restauration collective sous contrat",
  "56.29B": "Autres services de restauration n.c.a.",
  "56.30Z": "Débits de boissons",

  // === Section F : Construction ===
  "41.10A": "Promotion immobilière de logements",
  "41.10B": "Promotion immobilière de bureaux",
  "41.10C": "Promotion immobilière d'autres bâtiments",
  "41.10D": "Supports juridiques de programmes",
  "41.20A": "Construction de maisons individuelles",
  "41.20B": "Construction d'autres bâtiments",
  "42.11Z": "Construction de routes et autoroutes",
  "42.12Z": "Construction de voies ferrées de surface et souterraines",
  "42.13A": "Construction d'ouvrages d'art",
  "42.13B": "Construction et entretien de tunnels",
  "42.21Z": "Construction de réseaux pour fluides",
  "42.22Z": "Construction de réseaux électriques et de télécommunications",
  "42.91Z": "Construction d'ouvrages maritimes et fluviaux",
  "42.99Z": "Construction d'autres ouvrages de génie civil n.c.a.",
  "43.11Z": "Travaux de démolition",
  "43.12A": "Travaux de terrassement courants et travaux préparatoires",
  "43.12B": "Travaux de terrassement spécialisés ou de grande masse",
  "43.21A": "Travaux d'installation électrique dans tous locaux",
  "43.21B": "Travaux d'installation électrique sur la voie publique",
  "43.22A": "Travaux d'installation d'eau et de gaz en tous locaux",
  "43.22B": "Travaux d'installation d'équipements thermiques et de climatisation",
  "43.29A": "Travaux d'isolation",
  "43.29B": "Autres travaux d'installation n.c.a.",
  "43.31Z": "Travaux de plâtrerie",
  "43.32A": "Travaux de menuiserie bois et PVC",
  "43.32B": "Travaux de menuiserie métallique et serrurerie",
  "43.32C": "Agencement de lieux de vente",
  "43.33Z": "Travaux de revêtement des sols et des murs",
  "43.34Z": "Travaux de peinture et vitrerie",
  "43.39Z": "Autres travaux de finition",
  "43.91A": "Travaux de charpente",
  "43.91B": "Travaux de couverture par éléments",
  "43.99A": "Travaux d'étanchéification",
  "43.99B": "Travaux de montage de structures métalliques",
  "43.99C": "Travaux de maçonnerie générale et gros œuvre de bâtiment",
  "43.99D": "Autres travaux spécialisés de construction",
  "43.99E": "Location avec opérateur de matériel de construction",

  // === Section Q : Santé humaine et action sociale ===
  "86.10Z": "Activités hospitalières",
  "86.21Z": "Activité des médecins généralistes",
  "86.22A": "Activités de radiodiagnostic et de radiothérapie",
  "86.22B": "Activités chirurgicales",
  "86.22C": "Autres activités des médecins spécialistes",
  "86.23Z": "Pratique dentaire",
  "86.90A": "Ambulances",
  "86.90B": "Laboratoires d'analyses médicales",
  "86.90C": "Centres de collecte et banques d'organes",
  "86.90D": "Activités des infirmiers et des sages-femmes",
  "86.90E": "Activités des professionnels de la rééducation, de l'appareillage et des pédicures-podologues",
  "86.90F": "Activités de santé humaine non classées ailleurs",

  // === Section P : Enseignement ===
  "85.10Z": "Enseignement pré-primaire",
  "85.20Z": "Enseignement primaire",
  "85.31Z": "Enseignement secondaire général",
  "85.32Z": "Enseignement secondaire technique ou professionnel",
  "85.41Z": "Enseignement post-secondaire non supérieur",
  "85.42Z": "Enseignement supérieur",
  "85.51Z": "Enseignement de disciplines sportives et d'activités de loisirs",
  "85.52Z": "Enseignement culturel",
  "85.53Z": "Enseignement de la conduite",
  "85.59A": "Formation continue d'adultes",
  "85.59B": "Autres enseignements",
  "85.60Z": "Activités de soutien à l'enseignement",

  // === Section R, S : Autres services ===
  "90.01Z": "Arts du spectacle vivant",
  "90.02Z": "Activités de soutien au spectacle vivant",
  "90.03A": "Création artistique relevant des arts plastiques",
  "90.03B": "Autre création artistique",
  "90.04Z": "Gestion de salles de spectacles",
  "93.11Z": "Gestion d'installations sportives",
  "93.12Z": "Activités de clubs de sports",
  "93.13Z": "Activités des centres de culture physique",
  "93.19Z": "Autres activités liées au sport",
  "93.21Z": "Activités des parcs d'attractions et parcs à thèmes",
  "93.29Z": "Autres activités récréatives et de loisirs",
  "94.11Z": "Activités des organisations patronales et consulaires",
  "94.12Z": "Activités des organisations professionnelles",
  "94.20Z": "Activités des syndicats de salariés",
  "94.91Z": "Activités des organisations religieuses",
  "94.92Z": "Activités des organisations politiques",
  "94.99Z": "Activités des autres organisations associatives n.c.a.",
  "95.11Z": "Réparation d'ordinateurs et d'équipements périphériques",
  "95.12Z": "Réparation d'équipements de communication",
  "95.21Z": "Réparation de produits électroniques grand public",
  "95.22Z": "Réparation d'appareils électroménagers et d'équipements pour la maison et le jardin",
  "95.23Z": "Réparation de chaussures et d'articles en cuir",
  "95.24Z": "Réparation de meubles et d'équipements du foyer",
  "95.25Z": "Réparation d'articles d'horlogerie et de bijouterie",
  "95.29Z": "Réparation d'autres biens personnels et domestiques",
  "96.01A": "Blanchisserie-teinturerie de gros",
  "96.01B": "Blanchisserie-teinturerie de détail",
  "96.02A": "Coiffure",
  "96.02B": "Soins de beauté",
  "96.03Z": "Services funéraires",
  "96.04Z": "Entretien corporel",
  "96.09Z": "Autres services personnels n.c.a.",

  // === Section H : Transports et entreposage ===
  "49.10Z": "Transport ferroviaire interurbain de voyageurs",
  "49.20Z": "Transports ferroviaires de fret",
  "49.31Z": "Transports urbains et suburbains de voyageurs",
  "49.32Z": "Transports de voyageurs par taxis",
  "49.39A": "Transports routiers réguliers de voyageurs",
  "49.39B": "Autres transports routiers de voyageurs",
  "49.41A": "Transports routiers de fret interurbains",
  "49.41B": "Transports routiers de fret de proximité",
  "49.41C": "Location de camions avec chauffeur",
  "49.42Z": "Services de déménagement",
  "49.50Z": "Transports par conduites",
  "50.10Z": "Transports maritimes et côtiers de passagers",
  "50.20Z": "Transports maritimes et côtiers de fret",
  "51.10Z": "Transports aériens de passagers",
  "52.10A": "Entreposage et stockage frigorifique",
  "52.10B": "Entreposage et stockage non frigorifique",
};
