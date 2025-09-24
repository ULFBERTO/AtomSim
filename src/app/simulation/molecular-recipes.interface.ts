export interface MolecularRecipe {
  id: string;
  name: string;
  formula: string;
  description: string;
  reactants: {
    element: string;
    count: number;
    atomicNumber: number;
  }[];
  products: {
    moleculeName: string;
    count: number;
  }[];
  conditions: {
    heatIntensity: number;
    activationEnergy: number;
    energyType: 'heat' | 'electrolysis' | 'collision';
    proximity: number; // Distance atoms need to be within
  };
  geometry: 'linear' | 'bent' | 'tetrahedral' | 'trigonal_planar' | 'octahedral';
  bondLength: number;
  naturalFormation: boolean; // Whether this can form naturally through attraction
}

export const MOLECULAR_RECIPES: MolecularRecipe[] = [
  {
    id: 'water',
    name: 'Water Formation',
    formula: '2H₂ + O₂ → 2H₂O',
    description: 'Hydrogen and oxygen combine to form water molecules',
    reactants: [
      { element: 'H₂', count: 2, atomicNumber: 1 },
      { element: 'O₂', count: 1, atomicNumber: 8 }
    ],
    products: [
      { moleculeName: 'Water (H₂O)', count: 2 }
    ],
    conditions: {
      heatIntensity: 8,
      activationEnergy: 12,
      energyType: 'heat',
      proximity: 10
    },
    geometry: 'bent',
    bondLength: 2.0,
    naturalFormation: true
  },
  {
    id: 'carbon_dioxide',
    name: 'Carbon Dioxide Formation',
    formula: 'C + O₂ → CO₂',
    description: 'Carbon combines with oxygen to form carbon dioxide',
    reactants: [
      { element: 'C', count: 1, atomicNumber: 6 },
      { element: 'O₂', count: 1, atomicNumber: 8 }
    ],
    products: [
      { moleculeName: 'Carbon Dioxide (CO₂)', count: 1 }
    ],
    conditions: {
      heatIntensity: 15,
      activationEnergy: 18,
      energyType: 'heat',
      proximity: 8
    },
    geometry: 'linear',
    bondLength: 2.2,
    naturalFormation: true
  },
  {
    id: 'methane',
    name: 'Methane Formation',
    formula: 'C + 2H₂ → CH₄',
    description: 'Carbon combines with hydrogen to form methane',
    reactants: [
      { element: 'C', count: 1, atomicNumber: 6 },
      { element: 'H₂', count: 2, atomicNumber: 1 }
    ],
    products: [
      { moleculeName: 'Methane (CH₄)', count: 1 }
    ],
    conditions: {
      heatIntensity: 12,
      activationEnergy: 15,
      energyType: 'heat',
      proximity: 6
    },
    geometry: 'tetrahedral',
    bondLength: 1.8,
    naturalFormation: true
  },
  {
    id: 'ammonia',
    name: 'Ammonia Formation',
    formula: 'N₂ + 3H₂ → 2NH₃',
    description: 'Nitrogen and hydrogen combine to form ammonia',
    reactants: [
      { element: 'N₂', count: 1, atomicNumber: 7 },
      { element: 'H₂', count: 3, atomicNumber: 1 }
    ],
    products: [
      { moleculeName: 'Ammonia (NH₃)', count: 2 }
    ],
    conditions: {
      heatIntensity: 20,
      activationEnergy: 25,
      energyType: 'heat',
      proximity: 8
    },
    geometry: 'trigonal_planar',
    bondLength: 1.6,
    naturalFormation: false
  },
  {
    id: 'hydrogen_gas',
    name: 'Hydrogen Gas Formation',
    formula: '2H → H₂',
    description: 'Two hydrogen atoms combine to form hydrogen gas',
    reactants: [
      { element: 'H', count: 2, atomicNumber: 1 }
    ],
    products: [
      { moleculeName: 'Hydrogen Gas (H₂)', count: 1 }
    ],
    conditions: {
      heatIntensity: 3,
      activationEnergy: 5,
      energyType: 'heat',
      proximity: 4
    },
    geometry: 'linear',
    bondLength: 1.2,
    naturalFormation: true
  },
  {
    id: 'oxygen_gas',
    name: 'Oxygen Gas Formation',
    formula: '2O → O₂',
    description: 'Two oxygen atoms combine to form oxygen gas',
    reactants: [
      { element: 'O', count: 2, atomicNumber: 8 }
    ],
    products: [
      { moleculeName: 'Oxygen Gas (O₂)', count: 1 }
    ],
    conditions: {
      heatIntensity: 5,
      activationEnergy: 8,
      energyType: 'heat',
      proximity: 4
    },
    geometry: 'linear',
    bondLength: 1.5,
    naturalFormation: true
  }
];
