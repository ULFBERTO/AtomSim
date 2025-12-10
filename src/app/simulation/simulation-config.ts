// Configuración centralizada para la simulación
export interface SimulationMode {
  name: string;
  description: string;
  physics: PhysicsConfig;
  controls: ControlsConfig;
  reactions: ReactionsConfig;
}

export interface PhysicsConfig {
  linearDamping: number;
  angularDamping: number;
  maxVelocity: number;
  timeScale: number;
  gravityEnabled: boolean;
}

export interface ControlsConfig {
  showAdvancedControls: boolean;
  allowManualBonding: boolean;
  allowAtomDragging: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

export interface ReactionsConfig {
  autoReactions: boolean;
  reactionSpeed: number;
  energyDecayRate: number;
  showEnergyRequirements: boolean;
}

export const SIMULATION_MODES: { [key: string]: SimulationMode } = {
  sandbox: {
    name: 'Sandbox',
    description: 'Modo libre para experimentar sin restricciones',
    physics: {
      linearDamping: 0.8,
      angularDamping: 0.8,
      maxVelocity: 5,
      timeScale: 1,
      gravityEnabled: false
    },
    controls: {
      showAdvancedControls: false,
      allowManualBonding: true,
      allowAtomDragging: true,
      snapToGrid: false,
      gridSize: 1
    },
    reactions: {
      autoReactions: false,
      reactionSpeed: 1,
      energyDecayRate: 0.99,
      showEnergyRequirements: true
    }
  },
  educational: {
    name: 'Educativo',
    description: 'Modo guiado - usa energía y acerca átomos para enlazarlos',
    physics: {
      linearDamping: 0.9,
      angularDamping: 0.9,
      maxVelocity: 3,
      timeScale: 0.7,
      gravityEnabled: false
    },
    controls: {
      showAdvancedControls: false,
      allowManualBonding: true,
      allowAtomDragging: true,
      snapToGrid: false,
      gridSize: 2
    },
    reactions: {
      autoReactions: true,  // Permitir reacciones automáticas con energía
      reactionSpeed: 0.5,
      energyDecayRate: 0.998,  // Energía decae más lento
      showEnergyRequirements: true
    }
  },
  realistic: {
    name: 'Realista',
    description: 'Simulación con física más realista',
    physics: {
      linearDamping: 0.4,
      angularDamping: 0.4,
      maxVelocity: 15,
      timeScale: 1,
      gravityEnabled: false
    },
    controls: {
      showAdvancedControls: true,
      allowManualBonding: false,
      allowAtomDragging: true,
      snapToGrid: false,
      gridSize: 1
    },
    reactions: {
      autoReactions: true,
      reactionSpeed: 1,
      energyDecayRate: 0.96,
      showEnergyRequirements: true
    }
  }
};

export const EXPERIMENT_PRESETS = [
  {
    id: 'water',
    name: 'Formación de Agua',
    description: 'Combina hidrógeno y oxígeno para formar H₂O',
    atoms: [
      { element: 1, count: 4, label: 'Hidrógeno' },
      { element: 8, count: 2, label: 'Oxígeno' }
    ],
    targetMolecule: 'Water (H₂O)',
    hints: [
      'Arrastra 2 átomos de hidrógeno cerca de 1 átomo de oxígeno',
      'El oxígeno es el átomo central en la molécula de agua',
      'La molécula de agua tiene forma de "V" (ángulo de 104.5°)'
    ],
    energyRequired: 8
  },
  {
    id: 'co2',
    name: 'Dióxido de Carbono',
    description: 'Combina carbono y oxígeno para formar CO₂',
    atoms: [
      { element: 6, count: 1, label: 'Carbono' },
      { element: 8, count: 2, label: 'Oxígeno' }
    ],
    targetMolecule: 'Carbon Dioxide (CO₂)',
    hints: [
      'El carbono va en el centro',
      'Los dos oxígenos se unen al carbono en línea recta',
      'CO₂ es una molécula lineal'
    ],
    energyRequired: 15
  },
  {
    id: 'methane',
    name: 'Metano',
    description: 'Combina carbono e hidrógeno para formar CH₄',
    atoms: [
      { element: 6, count: 1, label: 'Carbono' },
      { element: 1, count: 4, label: 'Hidrógeno' }
    ],
    targetMolecule: 'Methane (CH₄)',
    hints: [
      'El carbono va en el centro',
      'Los 4 hidrógenos rodean al carbono',
      'CH₄ tiene geometría tetraédrica'
    ],
    energyRequired: 12
  },
  {
    id: 'ammonia',
    name: 'Amoníaco',
    description: 'Combina nitrógeno e hidrógeno para formar NH₃',
    atoms: [
      { element: 7, count: 1, label: 'Nitrógeno' },
      { element: 1, count: 3, label: 'Hidrógeno' }
    ],
    targetMolecule: 'Ammonia (NH₃)',
    hints: [
      'El nitrógeno va en el centro',
      'Los 3 hidrógenos forman una pirámide',
      'NH₃ tiene geometría piramidal trigonal'
    ],
    energyRequired: 20
  },
  {
    id: 'h2',
    name: 'Hidrógeno Molecular',
    description: 'Une dos átomos de hidrógeno para formar H₂',
    atoms: [
      { element: 1, count: 2, label: 'Hidrógeno' }
    ],
    targetMolecule: 'Hydrogen Gas (H₂)',
    hints: [
      'Simplemente acerca los dos átomos de hidrógeno',
      'H₂ es la molécula más simple',
      'Es un enlace covalente simple'
    ],
    energyRequired: 3
  }
];

export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '¡Bienvenido al Simulador de Química!',
    content: 'Este simulador te permite crear y experimentar con átomos y moléculas. Aprenderás cómo se forman los enlaces químicos.',
    action: null
  },
  {
    id: 'add-atom',
    title: 'Agregar Átomos',
    content: 'Haz clic en "Tabla Periódica" para seleccionar un elemento y agregarlo a la escena.',
    action: 'openPeriodicTable',
    highlight: 'periodic-table-btn'
  },
  {
    id: 'drag-atom',
    title: 'Mover Átomos',
    content: 'Arrastra los átomos con el mouse para posicionarlos. En modo educativo, los átomos se mueven lentamente.',
    action: null
  },
  {
    id: 'create-bond',
    title: 'Crear Enlaces',
    content: 'Acerca dos átomos compatibles y haz clic en "Crear Enlace" o usa el botón derecho para enlazarlos manualmente.',
    action: null,
    highlight: 'bond-btn'
  },
  {
    id: 'energy',
    title: 'Sistema de Energía',
    content: 'Algunas reacciones necesitan energía. Usa el control de "Energía" para agregar calor al sistema.',
    action: null,
    highlight: 'energy-bar'
  },
  {
    id: 'experiment',
    title: 'Experimentos',
    content: 'Selecciona un experimento predefinido del menú para practicar la creación de moléculas específicas.',
    action: null,
    highlight: 'experiments-btn'
  }
];
