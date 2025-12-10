import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { PeriodicTableComponent, PeriodicElement } from '../periodic-table/periodic-table.component';
import { MolecularCatalogComponent } from './molecular-catalog.component';
import { MolecularRecipe, MOLECULAR_RECIPES } from './molecular-recipes.interface';
import { AutonomousChemistryEngine, BondingPair, MolecularStructure } from './autonomous-chemistry.engine';
import { TutorialPanelComponent, ExperimentPreset } from './tutorial-panel.component';
import { EnergyDisplayComponent } from './energy-display.component';
import { ControlPanelComponent } from './control-panel.component';
import { SIMULATION_MODES, SimulationMode, EXPERIMENT_PRESETS } from './simulation-config';

// --- Interfaces ---
interface Atom {
  id: number;
  protons: number;
  neutrons: number;
  electronsCount: number;
  elementName: string;
  visuals: {
    nucleus: THREE.Group;
    electrons: THREE.Group;
    elementName: THREE.Mesh;
  };
  physicalBody: CANNON.Body;
  isMoleculeMember?: boolean;
}

interface Bond {
  id: string;
  atomA: Atom;
  atomB: Atom;
  constraint: CANNON.Constraint;
  visual: THREE.Mesh;
}

interface Molecule {
  id: string;
  name: string;
  atoms: Atom[];
  visual: THREE.Group;
  physicalBody: CANNON.Body;
  bondsVisuals: THREE.Mesh[];
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [
    CommonModule, 
    PeriodicTableComponent, 
    MolecularCatalogComponent,
    TutorialPanelComponent,
    EnergyDisplayComponent,
    ControlPanelComponent
  ],
  templateUrl: './simulation.component.html',
  styleUrl: './simulation.component.scss'
})
export class SimulationComponent implements AfterViewInit, OnDestroy {
  @ViewChild('simulationCanvas') private canvasRef!: ElementRef;

  // Scene & Physics
  private scene!: THREE.Scene;
  private world!: CANNON.World;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private font!: Font;
  private frameId: number | null = null;
  private gridHelper: THREE.GridHelper | null = null;

  // Interaction
  private raycaster!: THREE.Raycaster;
  private mouse!: THREE.Vector2;
  private isDragging = false;
  private draggedAtom: Atom | null = null;
  private draggedMolecule: Molecule | null = null;
  private dragPlane!: THREE.Plane;
  private dragIntersectionPoint!: THREE.Vector3;

  // Event handlers
  private handleResize = this.onWindowResize.bind(this);
  private handleCanvasClick = this.onCanvasClick.bind(this);
  private handleContextMenu = this.onRightClick.bind(this);
  private handleMouseDown = this.onMouseDown.bind(this);
  private handleMouseMove = this.onMouseMove.bind(this);
  private handleMouseUp = this.onMouseUp.bind(this);

  // Simulation state
  public atoms: Atom[] = [];
  public bonds: Bond[] = [];
  public molecules: Molecule[] = [];
  public moleculeNames: string[] = [];
  public selectedAtom: Atom | null = null;
  public selectedMolecule: Molecule | null = null;
  private nextId = 0;
  
  // UI State
  public showPeriodicTable = false;
  public showMolecularCatalog = false;
  public showTutorial = false;
  public showExperiments = false;
  public showHints = false;
  public activeExperiment: ExperimentPreset | null = null;
  public notification: Notification | null = null;
  
  // Simulation Mode
  public currentSimulationMode = 'educational';
  public isPaused = false;
  public simulationSpeed = 1;
  
  // Visual Options
  public showLabels = true;
  public showElectrons = true;
  public showBondsVisual = true;
  public showGrid = false;
  
  // Panel positions for dragging
  public panelPositions = {
    atomList: { x: 10, y: 10 },
    molecules: { x: 10, y: 320 },
    selectedInfo: { x: 10, y: 20 }
  };
  private draggingPanel: string | null = null;
  private panelDragStart = { x: 0, y: 0 };
  private panelStartPos = { x: 0, y: 0 };
  
  // Manual Bonding
  public manualBondingMode = false;
  public selectedAtomsForBonding: Atom[] = [];

  // Energy System
  public transientHeatEnergy = 0;
  public heatIntensity = 5;
  public activationEnergyWater = 12;
  public stoichiometryStrict = true;
  public globalHeatEnabled = false;
  public currentEnergyType: 'electrolysis' | 'heat' | 'collision' = 'heat';
  public currentRecipe: MolecularRecipe | null = null;

  // Physics timing
  private lastUpdateTime = 0;
  private bondingCooldowns = new Map<string, number>();
  private lastBondCheck = 0;
  private bondCheckInterval = 100;
  private reactionInProgress = false;
  private bondingTransitions = new Map<string, any>();

  // Discovered molecules
  public discoveredMolecules: string[] = [];

  // UI bindings
  public protons = 0;
  public neutrons = 0;
  public electronsCount = 0;

  // Chemistry data
  private elementNames: { [key: number]: string } = {
    1: 'Hydrogen', 2: 'Helium', 3: 'Lithium', 4: 'Beryllium', 5: 'Boron',
    6: 'Carbon', 7: 'Nitrogen', 8: 'Oxygen', 9: 'Fluorine', 10: 'Neon',
    11: 'Sodium', 12: 'Magnesium', 13: 'Aluminum', 14: 'Silicon', 15: 'Phosphorus',
    16: 'Sulfur', 17: 'Chlorine', 18: 'Argon'
  };

  private elementSymbols: { [key: number]: string } = {
    1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 10: 'Ne',
    11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 18: 'Ar'
  };

  private valenceElectrons: { [key: number]: number } = {
    1: 1, 6: 4, 7: 5, 8: 6, 9: 7
  };

  private maxBonds: { [key: number]: number } = {
    1: 1, 6: 4, 7: 3, 8: 2, 9: 1
  };

  private electronegativity: { [key: number]: number } = {
    1: 2.20, 6: 2.55, 7: 3.04, 8: 3.44, 9: 3.98
  };

  private atomicRadii: { [key: number]: number } = {
    1: 0.37, 6: 0.77, 7: 0.75, 8: 0.73, 9: 0.71
  };

  private chemistryEngine: AutonomousChemistryEngine;

  constructor() {
    this.chemistryEngine = new AutonomousChemistryEngine();
  }

  // Getters
  get currentModeConfig(): SimulationMode {
    return SIMULATION_MODES[this.currentSimulationMode] || SIMULATION_MODES['educational'];
  }

  ngAfterViewInit(): void {
    this.initScene();
    this.initPhysics();
    this.loadFontAndStart();
    
    // Show tutorial on first load
    const hasSeenTutorial = localStorage.getItem('atomsim_tutorial_seen');
    if (!hasSeenTutorial) {
      setTimeout(() => {
        this.showTutorial = true;
      }, 500);
    }
  }

  ngOnDestroy(): void {
    if (this.frameId != null) cancelAnimationFrame(this.frameId);
    if (this.renderer) this.renderer.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
  }

  private get canvas(): HTMLCanvasElement { 
    return this.canvasRef.nativeElement; 
  }

  // ==================== INITIALIZATION ====================

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    
    this.camera = new THREE.PerspectiveCamera(
      75, 
      this.canvas.clientWidth / this.canvas.clientHeight, 
      0.1, 
      1000
    );
    this.camera.position.z = 30;
    
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(15, 15, 15);
    const pointLight2 = new THREE.PointLight(0x4fc3f7, 0.5);
    pointLight2.position.set(-15, -15, 15);
    this.scene.add(ambientLight, pointLight, pointLight2);
    
    // Event listeners
    window.addEventListener('resize', this.handleResize);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.dragIntersectionPoint = new THREE.Vector3();
    
    this.canvas.addEventListener('click', this.handleCanvasClick);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
  }

  private initPhysics(): void {
    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    (this.world.solver as CANNON.GSSolver).iterations = 10;
    this.applyPhysicsConfig();
  }

  private applyPhysicsConfig(): void {
    const config = this.currentModeConfig.physics;
    
    // Update all existing bodies
    this.atoms.forEach(atom => {
      atom.physicalBody.linearDamping = config.linearDamping;
      atom.physicalBody.angularDamping = config.angularDamping;
    });
    
    this.molecules.forEach(mol => {
      mol.physicalBody.linearDamping = config.linearDamping;
      mol.physicalBody.angularDamping = config.angularDamping;
    });
  }

  private loadFontAndStart(): void {
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
      this.font = font;
      // Start with 2 hydrogen atoms for demo
      this.createAtom({protons: 1, neutrons: 0, electrons: 1, position: new THREE.Vector3(3, 0, 0)});
      this.createAtom({protons: 1, neutrons: 0, electrons: 1, position: new THREE.Vector3(-3, 0, 0)});
      this.selectAtom(this.atoms[0]);
      this.animate();
    });
  }


  // ==================== MODE & CONTROL HANDLERS ====================

  onModeChanged(mode: string): void {
    this.currentSimulationMode = mode;
    this.applyPhysicsConfig();
    this.showNotification(`Modo cambiado a: ${this.currentModeConfig.name}`, 'info');
  }

  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.showNotification('Simulación pausada', 'info');
    }
  }

  onSpeedChanged(speed: number): void {
    this.simulationSpeed = speed;
  }

  resetSimulation(): void {
    // Reset energy
    this.transientHeatEnergy = 0;
    
    // Reset velocities
    this.atoms.forEach(atom => {
      atom.physicalBody.velocity.set(0, 0, 0);
      atom.physicalBody.angularVelocity.set(0, 0, 0);
    });
    
    this.molecules.forEach(mol => {
      mol.physicalBody.velocity.set(0, 0, 0);
      mol.physicalBody.angularVelocity.set(0, 0, 0);
    });
    
    this.showNotification('Simulación reiniciada', 'success');
  }

  clearAllAtoms(): void {
    // Remove all molecules
    this.molecules.forEach(mol => {
      this.scene.remove(mol.visual);
      this.world.removeBody(mol.physicalBody);
    });
    this.molecules = [];
    
    // Remove all bonds
    this.bonds.forEach(bond => {
      this.world.removeConstraint(bond.constraint);
      this.scene.remove(bond.visual);
    });
    this.bonds = [];
    
    // Remove all atoms
    this.atoms.forEach(atom => {
      this.scene.remove(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
      this.world.removeBody(atom.physicalBody);
    });
    this.atoms = [];
    
    this.selectedAtom = null;
    this.selectedMolecule = null;
    this.moleculeNames = [];
    this.selectedAtomsForBonding = [];
    
    this.showNotification('Escena limpiada', 'success');
  }

  // ==================== VISUAL TOGGLES ====================

  toggleLabels(): void {
    this.showLabels = !this.showLabels;
    this.atoms.forEach(atom => {
      atom.visuals.elementName.visible = this.showLabels;
    });
  }

  toggleElectrons(): void {
    this.showElectrons = !this.showElectrons;
    this.atoms.forEach(atom => {
      atom.visuals.electrons.visible = this.showElectrons;
    });
  }

  toggleBondsVisual(): void {
    this.showBondsVisual = !this.showBondsVisual;
    this.bonds.forEach(bond => {
      bond.visual.visible = this.showBondsVisual;
    });
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
    if (this.showGrid && !this.gridHelper) {
      this.gridHelper = new THREE.GridHelper(100, 50, 0x4fc3f7, 0x1a1a2e);
      this.gridHelper.rotation.x = Math.PI / 2;
      this.scene.add(this.gridHelper);
    } else if (!this.showGrid && this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
    }
  }

  // ==================== TUTORIAL & EXPERIMENTS ====================

  openTutorial(): void {
    this.showTutorial = true;
  }

  closeTutorial(): void {
    this.showTutorial = false;
  }

  completeTutorial(): void {
    this.showTutorial = false;
    localStorage.setItem('atomsim_tutorial_seen', 'true');
    this.showNotification('¡Tutorial completado! Ahora puedes experimentar libremente.', 'success');
  }

  toggleExperiments(): void {
    this.showExperiments = !this.showExperiments;
    if (!this.showExperiments) {
      this.showHints = false;
    }
  }

  closeExperiments(): void {
    this.showExperiments = false;
    this.showHints = false;
  }

  toggleHints(): void {
    this.showHints = !this.showHints;
  }

  onExperimentSelected(experiment: ExperimentPreset): void {
    this.activeExperiment = experiment;
    this.showHints = true;
    this.showNotification(`Experimento seleccionado: ${experiment.name}`, 'info');
  }

  loadExperimentAtoms(experiment: ExperimentPreset): void {
    // Clear existing atoms
    this.clearAllAtoms();
    
    // Create atoms for the experiment
    let xOffset = -10;
    experiment.atoms.forEach(atomConfig => {
      for (let i = 0; i < atomConfig.count; i++) {
        const position = new THREE.Vector3(
          xOffset + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 2
        );
        this.createAtom({
          protons: atomConfig.element,
          neutrons: atomConfig.element,
          electrons: atomConfig.element,
          position
        });
        xOffset += 4;
      }
    });
    
    this.showNotification(`Átomos cargados para: ${experiment.name}`, 'success');
  }

  // ==================== MANUAL BONDING ====================

  toggleManualBondingMode(): void {
    this.manualBondingMode = !this.manualBondingMode;
    if (!this.manualBondingMode) {
      this.selectedAtomsForBonding = [];
    }
    this.showNotification(
      this.manualBondingMode ? 'Modo enlace activado - selecciona 2 átomos' : 'Modo enlace desactivado',
      'info'
    );
  }

  canCreateManualBond(): boolean {
    return this.selectedAtomsForBonding.length === 2;
  }

  isSelectedForBonding(atom: Atom): boolean {
    return this.selectedAtomsForBonding.some(a => a.id === atom.id);
  }

  private handleManualBondSelection(atom: Atom): void {
    if (atom.isMoleculeMember) {
      this.showNotification('Este átomo ya es parte de una molécula', 'warning');
      return;
    }

    const index = this.selectedAtomsForBonding.findIndex(a => a.id === atom.id);
    if (index >= 0) {
      this.selectedAtomsForBonding.splice(index, 1);
    } else if (this.selectedAtomsForBonding.length < 2) {
      this.selectedAtomsForBonding.push(atom);
    }

    if (this.selectedAtomsForBonding.length === 2) {
      this.createManualBond();
    }
  }

  private createManualBond(): void {
    const [atomA, atomB] = this.selectedAtomsForBonding;
    
    // Check if bond already exists
    const bondExists = this.bonds.some(b => 
      (b.atomA.id === atomA.id && b.atomB.id === atomB.id) ||
      (b.atomA.id === atomB.id && b.atomB.id === atomA.id)
    );

    if (bondExists) {
      this.showNotification('Estos átomos ya están enlazados', 'warning');
      this.selectedAtomsForBonding = [];
      return;
    }

    // Check valence rules
    const bondsA = this.countAtomBonds(atomA);
    const bondsB = this.countAtomBonds(atomB);
    const maxA = this.maxBonds[atomA.protons] || 4;
    const maxB = this.maxBonds[atomB.protons] || 4;

    if (bondsA >= maxA || bondsB >= maxB) {
      this.showNotification('Uno de los átomos ya tiene el máximo de enlaces', 'warning');
      this.selectedAtomsForBonding = [];
      return;
    }

    this.createBond(atomA, atomB, false);
    this.selectedAtomsForBonding = [];
    this.showNotification(`Enlace creado: ${atomA.elementName} - ${atomB.elementName}`, 'success');
    
    setTimeout(() => this.identifyMolecules(), 100);
  }

  private countAtomBonds(atom: Atom): number {
    return this.bonds.filter(b => b.atomA.id === atom.id || b.atomB.id === atom.id).length;
  }

  // ==================== ENERGY SYSTEM ====================

  addSystemEnergy(amount: number): void {
    this.transientHeatEnergy = Math.min(100, this.transientHeatEnergy + amount);
    
    // Apply kinetic energy to atoms
    const intensity = amount * 0.3;
    this.atoms.forEach(atom => {
      if (!atom.isMoleculeMember) {
        atom.physicalBody.velocity.x += (Math.random() - 0.5) * intensity;
        atom.physicalBody.velocity.y += (Math.random() - 0.5) * intensity;
        atom.physicalBody.velocity.z += (Math.random() - 0.5) * intensity;
      }
    });
    
    this.showNotification(`+${amount} energía añadida`, 'info');
  }

  resetSystemEnergy(): void {
    this.transientHeatEnergy = 0;
    this.showNotification('Energía reiniciada', 'info');
  }

  getRequiredEnergy(): number {
    if (this.activeExperiment) {
      return this.activeExperiment.energyRequired;
    }
    return 0;
  }

  calculateTemperature(): number {
    // Base temperature + energy contribution
    return 300 + this.transientHeatEnergy * 5;
  }

  calculateSystemEnergy(): number {
    let totalEnergy = this.transientHeatEnergy;
    
    this.atoms.forEach(atom => {
      if (!atom.isMoleculeMember) {
        const v = atom.physicalBody.velocity;
        const kineticEnergy = 0.5 * atom.physicalBody.mass * (v.x * v.x + v.y * v.y + v.z * v.z);
        totalEnergy += kineticEnergy * 5;
      }
    });
    
    return totalEnergy;
  }

  // ==================== NOTIFICATIONS ====================

  showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
    this.notification = { message, type };
    setTimeout(() => {
      this.notification = null;
    }, 3000);
  }

  getNotificationIcon(): string {
    if (!this.notification) return '';
    switch (this.notification.type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
      default: return '';
    }
  }

  // ==================== HELPER METHODS ====================

  getAtomSymbol(atom: Atom): string {
    return this.elementSymbols[atom.protons] || '?';
  }

  selectMoleculeById(id: string): void {
    const molecule = this.molecules.find(m => m.id === id);
    if (molecule) {
      this.selectMolecule(molecule);
    }
  }

  // ==================== PANEL DRAGGING ====================

  startDragPanel(event: MouseEvent, panelName: string): void {
    // Only start drag from the drag handle
    const target = event.target as HTMLElement;
    if (!target.classList.contains('drag-handle')) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    this.draggingPanel = panelName;
    this.panelDragStart = { x: event.clientX, y: event.clientY };
    this.panelStartPos = { ...this.panelPositions[panelName as keyof typeof this.panelPositions] };
    
    const onMouseMove = (e: MouseEvent) => {
      if (!this.draggingPanel) return;
      
      const deltaX = this.panelDragStart.x - e.clientX;
      const deltaY = e.clientY - this.panelDragStart.y;
      
      const panel = this.panelPositions[this.draggingPanel as keyof typeof this.panelPositions];
      panel.x = Math.max(0, this.panelStartPos.x + deltaX);
      panel.y = Math.max(0, this.panelStartPos.y + deltaY);
    };
    
    const onMouseUp = () => {
      this.draggingPanel = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }


  // ==================== ATOM MANAGEMENT ====================

  private createAtom(config: {protons: number, neutrons: number, electrons: number, position?: THREE.Vector3}): void {
    const atom = this.buildAtom(config.protons, config.neutrons, config.electrons, config.position);
    this.atoms.push(atom);
    this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
    this.world.addBody(atom.physicalBody);
    
    // Apply current visual settings
    atom.visuals.elementName.visible = this.showLabels;
    atom.visuals.electrons.visible = this.showElectrons;
  }

  private buildAtom(protons: number, neutrons: number, electronsCount: number, position = new THREE.Vector3()): Atom {
    const massNumber = protons + neutrons;
    const nucleusRadius = Math.cbrt(massNumber) * 0.7;
    const config = this.currentModeConfig.physics;
    
    const physicalBody = new CANNON.Body({ 
      mass: massNumber > 0 ? massNumber : 1, 
      shape: new CANNON.Sphere(nucleusRadius || 0.5), 
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: config.linearDamping,
      angularDamping: config.angularDamping
    });
    
    // Start with zero velocity for controlled behavior
    physicalBody.velocity.set(0, 0, 0);
    
    const newAtom: Atom = {
      id: this.nextId++, 
      protons, 
      neutrons, 
      electronsCount, 
      elementName: '',
      visuals: { 
        nucleus: new THREE.Group(), 
        electrons: new THREE.Group(), 
        elementName: new THREE.Mesh() 
      },
      physicalBody
    };
    
    this.updateNucleusVisuals(newAtom);
    this.updateElectronsVisuals(newAtom);
    this.updateElementNameVisuals(newAtom);
    return newAtom;
  }

  private deleteAtom(atomToDelete: Atom): void {
    // If atom is part of a molecule, break the molecule first
    const moleculeContainingAtom = this.molecules.find(m => m.atoms.some(a => a.id === atomToDelete.id));
    if (moleculeContainingAtom) {
      this.breakMolecule(moleculeContainingAtom, true);
    }

    // Remove atom
    this.atoms = this.atoms.filter(a => a.id !== atomToDelete.id);
    this.world.removeBody(atomToDelete.physicalBody);
    this.scene.remove(atomToDelete.visuals.nucleus, atomToDelete.visuals.electrons, atomToDelete.visuals.elementName);

    // Remove bonds connected to this atom
    const bondsToRemove = this.bonds.filter(b => b.atomA.id === atomToDelete.id || b.atomB.id === atomToDelete.id);
    bondsToRemove.forEach(b => this.deleteBond(b, true));

    // Update selection
    if (this.selectedAtom?.id === atomToDelete.id) {
      this.selectedAtom = this.atoms.length > 0 ? this.atoms[0] : null;
      if (this.selectedAtom) this.selectAtom(this.selectedAtom);
      else this.updateUIBindings();
    }
    
    // Remove from bonding selection
    this.selectedAtomsForBonding = this.selectedAtomsForBonding.filter(a => a.id !== atomToDelete.id);
    
    this.identifyMolecules();
  }

  deleteAtomClicked(event: MouseEvent, atom: Atom): void {
    event.stopPropagation();
    this.deleteAtom(atom);
  }

  selectAtom(atom: Atom): void {
    // Clear molecule selection
    if (this.selectedMolecule) {
      this.selectedMolecule = null;
    }
    
    // Clear previous atom selection highlight
    if (this.selectedAtom) {
      (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffffff);
    }
    
    this.selectedAtom = atom;
    (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffff00);
    this.updateUIBindings();
  }

  addAtom(): void {
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 15, 
      (Math.random() - 0.5) * 15, 
      (Math.random() - 0.5) * 5
    );
    this.createAtom({protons: 1, neutrons: 0, electrons: 1, position});
  }

  // Proton/Neutron/Electron controls
  addProton(): void { 
    if(this.selectedAtom) { 
      this.selectedAtom.protons++; 
      this.updateAtom(this.selectedAtom); 
    } 
  }
  
  removeProton(): void { 
    if(this.selectedAtom && this.selectedAtom.protons > 1) { 
      this.selectedAtom.protons--; 
      this.updateAtom(this.selectedAtom); 
    } 
  }
  
  addNeutron(): void { 
    if(this.selectedAtom) { 
      this.selectedAtom.neutrons++; 
      this.updateAtom(this.selectedAtom); 
    } 
  }
  
  removeNeutron(): void { 
    if(this.selectedAtom && this.selectedAtom.neutrons > 0) { 
      this.selectedAtom.neutrons--; 
      this.updateAtom(this.selectedAtom); 
    } 
  }
  
  addElectron(): void { 
    if(this.selectedAtom) { 
      this.selectedAtom.electronsCount++; 
      this.updateElectronsVisuals(this.selectedAtom); 
      this.updateUIBindings(); 
    } 
  }
  
  removeElectron(): void { 
    if(this.selectedAtom && this.selectedAtom.electronsCount > 0) { 
      this.selectedAtom.electronsCount--; 
      this.updateElectronsVisuals(this.selectedAtom); 
      this.updateUIBindings(); 
    } 
  }

  updateAtom(atom: Atom): void {
    const electronDifference = atom.protons - atom.electronsCount;
    atom.electronsCount += electronDifference;
    const massNumber = atom.protons + atom.neutrons;
    atom.physicalBody.mass = massNumber > 0 ? massNumber : 1;
    (atom.physicalBody.shapes[0] as CANNON.Sphere).radius = Math.cbrt(massNumber) * 0.7 || 0.5;
    atom.physicalBody.updateMassProperties();
    this.updateNucleusVisuals(atom);
    this.updateElectronsVisuals(atom);
    this.updateElementNameVisuals(atom);
    this.updateUIBindings();
    this.identifyMolecules();
  }

  private updateUIBindings(): void {
    if (this.selectedAtom) {
      this.protons = this.selectedAtom.protons;
      this.neutrons = this.selectedAtom.neutrons;
      this.electronsCount = this.selectedAtom.electronsCount;
    } else {
      this.protons = 0;
      this.neutrons = 0;
      this.electronsCount = 0;
    }
  }

  // ==================== VISUAL UPDATES ====================

  private updateNucleusVisuals(atom: Atom): void {
    atom.visuals.nucleus.clear();
    const { protons, neutrons } = atom;
    const nucleusRadius = (atom.physicalBody.shapes[0] as CANNON.Sphere).radius;
    
    const protonGeo = new THREE.SphereGeometry(0.4, 24, 24);
    const protonMat = new THREE.MeshStandardMaterial({ 
      color: 0xff4444, 
      roughness: 0.3,
      metalness: 0.2
    });
    
    for (let i = 0; i < protons; i++) {
      const p = new THREE.Mesh(protonGeo, protonMat);
      p.position.setFromSphericalCoords(
        Math.random() * nucleusRadius * 0.8, 
        Math.acos(2 * Math.random() - 1), 
        2 * Math.PI * Math.random()
      );
      atom.visuals.nucleus.add(p);
    }
    
    const neutronGeo = new THREE.SphereGeometry(0.4, 24, 24);
    const neutronMat = new THREE.MeshStandardMaterial({ 
      color: 0x888888, 
      roughness: 0.3,
      metalness: 0.2
    });
    
    for (let i = 0; i < neutrons; i++) {
      const n = new THREE.Mesh(neutronGeo, neutronMat);
      n.position.setFromSphericalCoords(
        Math.random() * nucleusRadius * 0.8, 
        Math.acos(2 * Math.random() - 1), 
        2 * Math.PI * Math.random()
      );
      atom.visuals.nucleus.add(n);
    }
  }

  private updateElectronsVisuals(atom: Atom): void {
    atom.visuals.electrons.clear();
    const electronGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const electronMat = new THREE.MeshStandardMaterial({ 
      color: 0x4fc3f7, 
      emissive: 0x4fc3f7, 
      emissiveIntensity: 0.8 
    });
    
    const shells = [2, 8, 18, 32];
    let electronsToPlace = atom.electronsCount;
    let shellIndex = 0;
    
    while (electronsToPlace > 0 && shellIndex < shells.length) {
      const shellCapacity = shells[shellIndex];
      const electronsInShell = Math.min(electronsToPlace, shellCapacity);
      const shellRadius = (shellIndex + 1) * 2 + (atom.physicalBody.shapes[0] as CANNON.Sphere).radius;
      
      for (let i = 0; i < electronsInShell; i++) {
        const e = new THREE.Mesh(electronGeo, electronMat);
        const theta = (2 * Math.PI * i) / electronsInShell;
        const phi = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        e.position.setFromSphericalCoords(shellRadius, phi, theta);
        atom.visuals.electrons.add(e);
      }
      
      electronsToPlace -= electronsInShell;
      shellIndex++;
    }
  }

  private updateElementNameVisuals(atom: Atom): void {
    if (!this.font) return;
    
    const massNumber = atom.protons + atom.neutrons;
    const name = this.elementNames[atom.protons] || 'Custom';
    atom.elementName = `${name}-${massNumber}`;
    
    if (atom.visuals.elementName.geometry) {
      this.scene.remove(atom.visuals.elementName);
      atom.visuals.elementName.geometry.dispose();
      (atom.visuals.elementName.material as THREE.Material).dispose();
    }
    
    const geom = new TextGeometry(atom.elementName, { font: this.font, size: 0.6, depth: 0.05 });
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    atom.visuals.elementName = new THREE.Mesh(geom, mat);
    geom.computeBoundingBox();
    atom.visuals.elementName.visible = this.showLabels;
    this.scene.add(atom.visuals.elementName);
    
    if (this.selectedAtom?.id === atom.id) {
      (atom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffff00);
    }
  }


  // ==================== BONDING SYSTEM ====================

  private createBond(atomA: Atom, atomB: Atom, suppressIdentify: boolean = false): void {
    const bondId1 = `${atomA.id}-${atomB.id}`;
    const bondId2 = `${atomB.id}-${atomA.id}`;
    const bondExists = this.bonds.some(bond => bond.id === bondId1 || bond.id === bondId2);
    
    if (bondExists) return;
    
    const bondId = bondId1;
    
    // Calculate ideal bond length
    const radiusA = this.atomicRadii[atomA.protons] || 1.0;
    const radiusB = this.atomicRadii[atomB.protons] || 1.0;
    const idealBondLength = (radiusA + radiusB) * 2.5;
    
    const constraint = new CANNON.DistanceConstraint(atomA.physicalBody, atomB.physicalBody, idealBondLength);
    constraint.collideConnected = false;
    this.world.addConstraint(constraint);
    
    const bondMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4caf50, 
      emissive: 0x4caf50, 
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9
    });
    const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial);
    bondVisual.visible = this.showBondsVisual;
    this.scene.add(bondVisual);
    
    this.bonds.push({ id: bondId, atomA, atomB, constraint, visual: bondVisual });
    
    if (!suppressIdentify) {
      this.identifyMolecules();
    }
  }

  private deleteBond(bondToDelete: Bond, suppressIdentify: boolean = false): void {
    this.bonds = this.bonds.filter(b => b.id !== bondToDelete.id);
    this.world.removeConstraint(bondToDelete.constraint);
    this.scene.remove(bondToDelete.visual);
    
    if (!suppressIdentify) {
      this.identifyMolecules();
    }
  }

  private updateBondVisuals(): void {
    const bondsToRemove: Bond[] = [];
    
    for (const bond of this.bonds) {
      const posA = new THREE.Vector3().copy(bond.atomA.physicalBody.position as any);
      const posB = new THREE.Vector3().copy(bond.atomB.physicalBody.position as any);
      const distance = posA.distanceTo(posB);
      
      const radiusA = this.atomicRadii[bond.atomA.protons] || 1.0;
      const radiusB = this.atomicRadii[bond.atomB.protons] || 1.0;
      const maxBondLength = (radiusA + radiusB) * 5.0;
      
      if (distance > maxBondLength) {
        bondsToRemove.push(bond);
      } else {
        bond.visual.scale.y = distance;
        bond.visual.position.copy(posA).lerp(posB, 0.5);
        bond.visual.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), 
          posB.clone().sub(posA).normalize()
        );
        
        // Visual stress indicator
        const stressRatio = distance / maxBondLength;
        const mat = bond.visual.material as THREE.MeshStandardMaterial;
        if (stressRatio > 0.6) {
          const redIntensity = Math.min(1, (stressRatio - 0.6) / 0.4);
          mat.color.setRGB(1, 1 - redIntensity * 0.7, 1 - redIntensity * 0.7);
        } else {
          mat.color.setRGB(0.3, 0.69, 0.31);
        }
      }
    }
    
    bondsToRemove.forEach(bond => this.deleteBond(bond, true));
    
    if (bondsToRemove.length > 0) {
      setTimeout(() => this.identifyMolecules(), 100);
    }
  }

  private checkAndCreateBonds(): void {
    if (this.reactionInProgress || this.isPaused) return;
    if (!this.currentModeConfig.reactions.autoReactions) return;
    
    const now = Date.now();
    if (now - this.lastBondCheck < this.bondCheckInterval) return;
    this.lastBondCheck = now;
    
    const systemEnergy = this.calculateSystemEnergy();
    const bondThreshold = 4.0;
    const attractionThreshold = 8.0;

    for (let i = 0; i < this.atoms.length; i++) {
      for (let j = i + 1; j < this.atoms.length; j++) {
        const atomA = this.atoms[i];
        const atomB = this.atoms[j];

        if (atomA.isMoleculeMember || atomB.isMoleculeMember) continue;

        const bondId1 = `${atomA.id}-${atomB.id}`;
        const bondId2 = `${atomB.id}-${atomA.id}`;
        const bondExists = this.bonds.some(bond => bond.id === bondId1 || bond.id === bondId2);
        
        if (bondExists) continue;

        const cooldownKey = `${Math.min(atomA.id, atomB.id)}-${Math.max(atomA.id, atomB.id)}`;
        const lastAttempt = this.bondingCooldowns.get(cooldownKey) || 0;
        if (now - lastAttempt < 2000) continue;

        const distance = atomA.physicalBody.position.distanceTo(atomB.physicalBody.position);

        if (distance < bondThreshold && this.shouldFormBond(atomA, atomB, systemEnergy)) {
          this.bondingCooldowns.set(cooldownKey, now);
          this.createBond(atomA, atomB, true);
          setTimeout(() => this.identifyMolecules(), 100);
        } else if (distance < attractionThreshold && this.shouldFormBond(atomA, atomB, systemEnergy)) {
          // Gentle attraction
          const forceMagnitude = (attractionThreshold - distance) * 0.02;
          const forceVector = new CANNON.Vec3()
            .copy(atomB.physicalBody.position as any)
            .vsub(atomA.physicalBody.position as any);
          forceVector.normalize();
          forceVector.scale(forceMagnitude, forceVector);

          atomA.physicalBody.applyForce(forceVector, new CANNON.Vec3(0, 0, 0));
          atomB.physicalBody.applyForce(forceVector.scale(-1, new CANNON.Vec3()), new CANNON.Vec3(0, 0, 0));
        }
      }
    }
  }

  private shouldFormBond(atomA: Atom, atomB: Atom, systemEnergy: number): boolean {
    if (!this.chemistryEngine.canFormBond(atomA, atomB, systemEnergy)) {
      return false;
    }

    // Check valence
    const bondsA = this.countAtomBonds(atomA);
    const bondsB = this.countAtomBonds(atomB);
    const maxA = this.maxBonds[atomA.protons] || 4;
    const maxB = this.maxBonds[atomB.protons] || 4;

    return bondsA < maxA && bondsB < maxB;
  }


  // ==================== MOLECULE MANAGEMENT ====================

  private identifyMolecules(): void {
    const checkedAtoms = new Set<number>();

    for (const atom of this.atoms) {
      if (checkedAtoms.has(atom.id) || atom.isMoleculeMember) continue;

      const connectedComponent: Atom[] = [];
      const toVisit = [atom];
      checkedAtoms.add(atom.id);

      while (toVisit.length > 0) {
        const current = toVisit.pop()!;
        connectedComponent.push(current);
        const connectedBonds = this.bonds.filter(b => b.atomA.id === current.id || b.atomB.id === current.id);
        for (const bond of connectedBonds) {
          const neighbor = bond.atomA.id === current.id ? bond.atomB : bond.atomA;
          if (!neighbor.isMoleculeMember && !checkedAtoms.has(neighbor.id)) {
            checkedAtoms.add(neighbor.id);
            toVisit.push(neighbor);
          }
        }
      }

      if (connectedComponent.length >= 2) {
        const moleculeId = connectedComponent.map(a => a.id).sort().join('-');
        const existingMolecule = this.molecules.find(m => m.id === moleculeId);
        
        if (!existingMolecule) {
          const moleculeInfo = this.identifyMoleculeType(connectedComponent);
          if (moleculeInfo) {
            const molecule = this.createMolecule(moleculeId, moleculeInfo, connectedComponent);
            if (molecule) {
              this.molecules.push(molecule);
              
              if (!this.discoveredMolecules.includes(moleculeInfo.name)) {
                this.discoveredMolecules.push(moleculeInfo.name);
                this.showNotification(`¡Nueva molécula descubierta: ${moleculeInfo.name}!`, 'success');
              }
            }
          }
        }
      }
    }

    this.moleculeNames = this.molecules.map(m => m.name);
  }

  private identifyMoleculeType(atoms: Atom[]): { name: string, geometry: string, bondLength: number } | null {
    const counts = new Map<number, number>();
    atoms.forEach(a => {
      const count = counts.get(a.protons) || 0;
      counts.set(a.protons, count + 1);
    });

    const hCount = counts.get(1) || 0;
    const cCount = counts.get(6) || 0;
    const nCount = counts.get(7) || 0;
    const oCount = counts.get(8) || 0;

    // Known molecules
    if (oCount === 1 && hCount === 2 && atoms.length === 3) {
      return { name: 'Water (H₂O)', geometry: 'bent', bondLength: 2.0 };
    }
    if (cCount === 1 && oCount === 2 && atoms.length === 3) {
      return { name: 'Carbon Dioxide (CO₂)', geometry: 'linear', bondLength: 2.2 };
    }
    if (cCount === 1 && hCount === 4 && atoms.length === 5) {
      return { name: 'Methane (CH₄)', geometry: 'tetrahedral', bondLength: 1.8 };
    }
    if (nCount === 1 && hCount === 3 && atoms.length === 4) {
      return { name: 'Ammonia (NH₃)', geometry: 'trigonal_pyramidal', bondLength: 1.6 };
    }
    if (hCount === 2 && atoms.length === 2) {
      return { name: 'Hydrogen Gas (H₂)', geometry: 'linear', bondLength: 1.2 };
    }
    if (oCount === 2 && atoms.length === 2) {
      return { name: 'Oxygen Gas (O₂)', geometry: 'linear', bondLength: 1.5 };
    }
    if (nCount === 2 && atoms.length === 2) {
      return { name: 'Nitrogen Gas (N₂)', geometry: 'linear', bondLength: 1.6 };
    }

    // Generate name for unknown molecules
    const formula = this.generateMolecularFormula(atoms);
    return { name: `Compound (${formula})`, geometry: 'complex', bondLength: 2.0 };
  }

  private generateMolecularFormula(atoms: Atom[]): string {
    const composition = new Map<number, number>();
    atoms.forEach(atom => {
      const count = composition.get(atom.protons) || 0;
      composition.set(atom.protons, count + 1);
    });

    const parts: string[] = [];
    const sortedElements = Array.from(composition.entries()).sort((a, b) => a[0] - b[0]);

    for (const [protons, count] of sortedElements) {
      const symbol = this.elementSymbols[protons] || `E${protons}`;
      if (count === 1) {
        parts.push(symbol);
      } else {
        const subscript = count.toString().split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[parseInt(d)]).join('');
        parts.push(symbol + subscript);
      }
    }

    return parts.join('');
  }

  private createMolecule(moleculeId: string, moleculeInfo: { name: string, geometry: string, bondLength: number }, atoms: Atom[]): Molecule | null {
    const moleculeMass = atoms.reduce((sum, a) => sum + a.physicalBody.mass, 0);
    const moleculeCenter = new THREE.Vector3();
    atoms.forEach(a => moleculeCenter.add(a.physicalBody.position as any));
    moleculeCenter.divideScalar(atoms.length);

    const config = this.currentModeConfig.physics;
    const compoundBody = new CANNON.Body({
      mass: moleculeMass * 0.8,
      position: new CANNON.Vec3(moleculeCenter.x, moleculeCenter.y, moleculeCenter.z),
      linearDamping: config.linearDamping,
      angularDamping: config.angularDamping,
    });

    const moleculeVisual = new THREE.Group();
    
    // Better bond visualization with thicker, brighter bonds
    const bondMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff88, 
      emissive: 0x00ff88, 
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    });
    const bondGeometry = new THREE.CylinderGeometry(0.15, 0.15, 1, 12);
    const bondsVisuals: THREE.Mesh[] = [];

    // Use larger bond length for clearer geometry visualization
    const scaledMoleculeInfo = {
      ...moleculeInfo,
      bondLength: moleculeInfo.bondLength * 1.5  // Scale up for visibility
    };
    
    const relativePositions = this.calculateMolecularGeometry(atoms, scaledMoleculeInfo);
    if (!relativePositions) return null;

    atoms.forEach(a => {
      this.world.removeBody(a.physicalBody);
      this.scene.remove(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);

      const relativePos = relativePositions.get(a.id)!;
      compoundBody.addShape(a.physicalBody.shapes[0], new CANNON.Vec3(relativePos.x, relativePos.y, relativePos.z));

      a.visuals.nucleus.position.copy(relativePos);
      a.visuals.electrons.position.copy(relativePos);
      a.visuals.elementName.position.copy(relativePos).add(new THREE.Vector3(0, 2, 0));

      moleculeVisual.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
      a.isMoleculeMember = true;
    });

    // Create bond visuals between connected atoms
    const moleculeBonds = this.bonds.filter(b => atoms.includes(b.atomA) && atoms.includes(b.atomB));
    moleculeBonds.forEach(bond => {
      const posA = relativePositions.get(bond.atomA.id)!;
      const posB = relativePositions.get(bond.atomB.id)!;
      const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial.clone());
      const distance = posA.distanceTo(posB);
      bondVisual.scale.y = distance;
      bondVisual.position.copy(posA).lerp(posB, 0.5);
      bondVisual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), posB.clone().sub(posA).normalize());
      moleculeVisual.add(bondVisual);
      bondsVisuals.push(bondVisual);
    });

    // If no explicit bonds, create bonds based on geometry
    if (moleculeBonds.length === 0 && atoms.length > 1) {
      const centralAtom = this.findBestCentralAtom(atoms);
      const centralPos = relativePositions.get(centralAtom.id)!;
      
      atoms.forEach(a => {
        if (a.id !== centralAtom.id) {
          const atomPos = relativePositions.get(a.id)!;
          const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial.clone());
          const distance = centralPos.distanceTo(atomPos);
          bondVisual.scale.y = distance;
          bondVisual.position.copy(centralPos).lerp(atomPos, 0.5);
          bondVisual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), atomPos.clone().sub(centralPos).normalize());
          moleculeVisual.add(bondVisual);
          bondsVisuals.push(bondVisual);
        }
      });
    }

    moleculeBonds.forEach(b => this.deleteBond(b, true));

    this.world.addBody(compoundBody);
    this.scene.add(moleculeVisual);

    return { id: moleculeId, name: moleculeInfo.name, atoms, visual: moleculeVisual, physicalBody: compoundBody, bondsVisuals };
  }


  private calculateMolecularGeometry(atoms: Atom[], moleculeInfo: { name: string, geometry: string, bondLength: number }): Map<number, THREE.Vector3> | null {
    const relativePositions = new Map<number, THREE.Vector3>();
    const bondLength = moleculeInfo.bondLength;

    if (moleculeInfo.geometry === 'linear') {
      if (atoms.length === 2) {
        relativePositions.set(atoms[0].id, new THREE.Vector3(-bondLength / 2, 0, 0));
        relativePositions.set(atoms[1].id, new THREE.Vector3(bondLength / 2, 0, 0));
      } else if (atoms.length === 3) {
        const centralAtom = this.findBestCentralAtom(atoms);
        const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
        relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
        relativePositions.set(otherAtoms[0].id, new THREE.Vector3(-bondLength, 0, 0));
        relativePositions.set(otherAtoms[1].id, new THREE.Vector3(bondLength, 0, 0));
      }
    } else if (moleculeInfo.geometry === 'bent') {
      const centralAtom = this.findBestCentralAtom(atoms);
      const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
      const angle = 104.5 * (Math.PI / 180);
      
      relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
      relativePositions.set(otherAtoms[0].id, new THREE.Vector3(
        bondLength * Math.sin(angle / 2),
        bondLength * Math.cos(angle / 2),
        0
      ));
      relativePositions.set(otherAtoms[1].id, new THREE.Vector3(
        -bondLength * Math.sin(angle / 2),
        bondLength * Math.cos(angle / 2),
        0
      ));
    } else if (moleculeInfo.geometry === 'tetrahedral') {
      const centralAtom = this.findBestCentralAtom(atoms);
      const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
      
      relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
      
      const tetrahedralPositions = [
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(-1, -1, 1),
        new THREE.Vector3(-1, 1, -1),
        new THREE.Vector3(1, -1, -1)
      ];
      
      otherAtoms.forEach((atom, index) => {
        if (index < tetrahedralPositions.length) {
          const pos = tetrahedralPositions[index].normalize().multiplyScalar(bondLength);
          relativePositions.set(atom.id, pos);
        }
      });
    } else if (moleculeInfo.geometry === 'trigonal_pyramidal') {
      const centralAtom = this.findBestCentralAtom(atoms);
      const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
      
      relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
      
      otherAtoms.forEach((atom, index) => {
        const angle = (2 * Math.PI * index) / 3;
        const pos = new THREE.Vector3(
          bondLength * Math.cos(angle) * 0.8,
          -bondLength * 0.5,
          bondLength * Math.sin(angle) * 0.8
        );
        relativePositions.set(atom.id, pos);
      });
    } else {
      // Default arrangement
      if (atoms.length === 2) {
        relativePositions.set(atoms[0].id, new THREE.Vector3(-bondLength / 2, 0, 0));
        relativePositions.set(atoms[1].id, new THREE.Vector3(bondLength / 2, 0, 0));
      } else {
        const centralAtom = this.findBestCentralAtom(atoms);
        const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
        
        relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
        
        otherAtoms.forEach((atom, index) => {
          const angle = (2 * Math.PI * index) / otherAtoms.length;
          const pos = new THREE.Vector3(
            bondLength * Math.cos(angle),
            bondLength * Math.sin(angle),
            0
          );
          relativePositions.set(atom.id, pos);
        });
      }
    }

    return relativePositions.size > 0 ? relativePositions : null;
  }

  private findBestCentralAtom(atoms: Atom[]): Atom {
    return atoms.reduce((best, current) => {
      const bestValence = this.valenceElectrons[best.protons] || 0;
      const currentValence = this.valenceElectrons[current.protons] || 0;
      const bestElectronegativity = this.electronegativity[best.protons] || 0;
      const currentElectronegativity = this.electronegativity[current.protons] || 0;
      
      const bestScore = bestValence - bestElectronegativity;
      const currentScore = currentValence - currentElectronegativity;
      
      return currentScore > bestScore ? current : best;
    });
  }

  private selectMolecule(molecule: Molecule): void {
    if (this.selectedAtom) {
      (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffffff);
      this.selectedAtom = null;
    }
    
    if (this.selectedMolecule) {
      // Remove highlight from previous
    }
    
    this.selectedMolecule = molecule;
  }

  private breakMolecule(molecule: Molecule, suppressRebond: boolean = false): void {
    const moleculePosition = molecule.visual.position.clone();
    
    this.molecules = this.molecules.filter(m => m.id !== molecule.id);
    this.scene.remove(molecule.visual);
    this.world.removeBody(molecule.physicalBody);
    
    molecule.atoms.forEach((atom, index) => {
      atom.isMoleculeMember = false;
      
      atom.physicalBody.position.set(
        moleculePosition.x + (Math.random() - 0.5) * 2,
        moleculePosition.y + (Math.random() - 0.5) * 2,
        moleculePosition.z + (Math.random() - 0.5) * 2
      );
      
      // Gentle separation velocity
      atom.physicalBody.velocity.set(
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * 1
      );
      
      this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
      this.world.addBody(atom.physicalBody);
    });
    
    if (this.selectedMolecule?.id === molecule.id) {
      this.selectedMolecule = null;
    }
    
    this.moleculeNames = this.molecules.map(m => m.name);
  }

  private updateMoleculeVisuals(): void {
    for (const molecule of this.molecules) {
      const { position, quaternion } = molecule.physicalBody;
      molecule.visual.position.copy(position as any);
      molecule.visual.quaternion.copy(quaternion as any);
    }
  }


  // ==================== UI HANDLERS ====================

  togglePeriodicTable(): void { 
    this.showPeriodicTable = !this.showPeriodicTable; 
  }

  toggleMolecularCatalog(): void { 
    this.showMolecularCatalog = !this.showMolecularCatalog; 
  }

  onElementSelect(element: PeriodicElement): void {
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 3
    );
    this.createAtom({
      protons: element.atomicNumber, 
      neutrons: element.neutrons, 
      electrons: element.atomicNumber,
      position
    });
    this.selectAtom(this.atoms[this.atoms.length - 1]);
    this.showPeriodicTable = false;
    this.showNotification(`${element.name} añadido`, 'success');
  }

  onRecipeSelected(recipe: MolecularRecipe): void {
    this.currentRecipe = recipe;
    this.heatIntensity = recipe.conditions.heatIntensity;
    this.activationEnergyWater = recipe.conditions.activationEnergy;
    this.currentEnergyType = recipe.conditions.energyType;
    this.showMolecularCatalog = false;
  }

  onCreateReactants(recipe: MolecularRecipe): void {
    this.clearAllAtoms();
    
    let xOffset = -8;
    recipe.reactants.forEach((reactant) => {
      for (let i = 0; i < reactant.count; i++) {
        if (reactant.element.includes('₂')) {
          const atomicNumber = reactant.atomicNumber;
          const pos1 = new THREE.Vector3(xOffset, (Math.random() - 0.5) * 4, 0);
          const pos2 = new THREE.Vector3(xOffset + 2, (Math.random() - 0.5) * 4, 0);
          
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos1});
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos2});
          xOffset += 5;
        } else {
          const atomicNumber = reactant.atomicNumber;
          const pos = new THREE.Vector3(xOffset, (Math.random() - 0.5) * 4, 0);
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos});
          xOffset += 4;
        }
      }
    });
    
    this.showMolecularCatalog = false;
    this.showNotification(`Reactivos cargados para: ${recipe.name}`, 'success');
  }

  // ==================== MOUSE INTERACTION ====================

  private onWindowResize(): void {
    this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private updateMousePosition(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private findIntersectedObject(): { atom?: Atom, molecule?: Molecule } {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const intersect of intersects) {
      const molecule = this.molecules.find(m => this.isObjectInGroup(intersect.object, m.visual));
      if (molecule) {
        return { molecule };
      }

      const atom = this.atoms.find(a =>
        a.visuals.nucleus === intersect.object.parent ||
        a.visuals.electrons === intersect.object.parent ||
        a.visuals.elementName === intersect.object
      );
      if (atom && !atom.isMoleculeMember) {
        return { atom };
      }
    }
    return {};
  }

  private isObjectInGroup(object: THREE.Object3D, group: THREE.Group): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === group) return true;
      current = current.parent;
    }
    return false;
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    
    this.updateMousePosition(event);
    const intersected = this.findIntersectedObject();
    
    if (intersected.atom) {
      this.isDragging = true;
      this.draggedAtom = intersected.atom;
      this.draggedMolecule = null;
      this.controls.enabled = false;
      
      const atomPosition = new THREE.Vector3().copy(intersected.atom.physicalBody.position as any);
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, atomPosition);
      
      intersected.atom.physicalBody.velocity.set(0, 0, 0);
      intersected.atom.physicalBody.angularVelocity.set(0, 0, 0);
      
      this.canvas.style.cursor = 'grabbing';
      event.preventDefault();
    } else if (intersected.molecule) {
      this.isDragging = true;
      this.draggedMolecule = intersected.molecule;
      this.draggedAtom = null;
      this.controls.enabled = false;
      
      const moleculePosition = intersected.molecule.visual.position.clone();
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, moleculePosition);
      
      intersected.molecule.physicalBody.velocity.set(0, 0, 0);
      intersected.molecule.physicalBody.angularVelocity.set(0, 0, 0);
      
      this.canvas.style.cursor = 'grabbing';
      event.preventDefault();
    }
  }

  private onMouseMove(event: MouseEvent): void {
    this.updateMousePosition(event);
    
    if (this.isDragging) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersectionPoint)) {
        if (this.draggedAtom) {
          this.draggedAtom.physicalBody.position.set(
            this.dragIntersectionPoint.x,
            this.dragIntersectionPoint.y,
            this.dragIntersectionPoint.z
          );
          this.draggedAtom.physicalBody.velocity.set(0, 0, 0);
        } else if (this.draggedMolecule) {
          this.draggedMolecule.physicalBody.position.set(
            this.dragIntersectionPoint.x,
            this.dragIntersectionPoint.y,
            this.dragIntersectionPoint.z
          );
          this.draggedMolecule.physicalBody.velocity.set(0, 0, 0);
        }
      }
      event.preventDefault();
    } else {
      const intersected = this.findIntersectedObject();
      this.canvas.style.cursor = (intersected.atom || intersected.molecule) ? 'grab' : 'default';
    }
  }

  private onMouseUp(): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedAtom = null;
      this.draggedMolecule = null;
      this.controls.enabled = true;
      this.canvas.style.cursor = 'default';
    }
  }

  private onRightClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.updateMousePosition(event);
    
    const intersected = this.findIntersectedObject();
    
    if (intersected.atom) {
      if (this.manualBondingMode) {
        this.handleManualBondSelection(intersected.atom);
      } else {
        this.selectAtom(intersected.atom);
      }
    } else if (intersected.molecule) {
      this.selectMolecule(intersected.molecule);
    }
  }

  private onCanvasClick(event: MouseEvent): void {
    if (this.isDragging) return;
    
    this.updateMousePosition(event);
    const intersected = this.findIntersectedObject();
    
    if (intersected.atom) {
      if (this.manualBondingMode) {
        this.handleManualBondSelection(intersected.atom);
      } else {
        this.selectAtom(intersected.atom);
      }
    } else if (intersected.molecule) {
      this.selectMolecule(intersected.molecule);
    }
  }


  // ==================== ANIMATION LOOP ====================

  private animate(): void {
    this.frameId = requestAnimationFrame(() => this.animate());
    
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    
    // Skip physics if paused
    if (!this.isPaused) {
      // Apply time scale from mode and speed
      const timeScale = this.currentModeConfig.physics.timeScale * this.simulationSpeed;
      this.world.step((1 / 60) * timeScale);
      
      // Decay transient heat energy
      const decayRate = this.currentModeConfig.reactions.energyDecayRate;
      if (this.transientHeatEnergy > 0) {
        this.transientHeatEnergy *= decayRate;
        if (this.transientHeatEnergy < 0.1) this.transientHeatEnergy = 0;
      }
      
      // Apply velocity limits
      this.enforceVelocityLimits();
      
      // Check for bonds (only in auto mode)
      this.checkAndCreateBonds();
      
      // Apply continuous heat if enabled
      if (this.globalHeatEnabled && this.heatIntensity > 0) {
        this.applyGlobalHeatContinuous();
      }
    }
    
    // Update visuals (always, even when paused)
    for (const atom of this.atoms) {
      if (!atom.isMoleculeMember) {
        const { position, quaternion } = atom.physicalBody;
        const nameVisual = atom.visuals.elementName;
        
        if (nameVisual.geometry.boundingBox) {
          const textWidth = nameVisual.geometry.boundingBox.max.x - nameVisual.geometry.boundingBox.min.x;
          atom.visuals.nucleus.position.copy(position as any);
          atom.visuals.nucleus.quaternion.copy(quaternion as any);
          atom.visuals.electrons.position.copy(position as any);
          nameVisual.position.copy(position as any).add(new THREE.Vector3(-textWidth / 2, 4, 0));
        }
        
        // Rotate electrons
        if (!this.isPaused) {
          atom.visuals.electrons.rotation.y += 0.01 * this.simulationSpeed;
        }
      }
    }
    
    this.updateBondVisuals();
    this.updateMoleculeVisuals();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private enforceVelocityLimits(): void {
    const maxVelocity = this.currentModeConfig.physics.maxVelocity;
    
    this.atoms.forEach(atom => {
      if (!atom.isMoleculeMember) {
        const v = atom.physicalBody.velocity;
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (speed > maxVelocity) {
          const scale = maxVelocity / speed;
          v.x *= scale;
          v.y *= scale;
          v.z *= scale;
        }
      }
    });
    
    this.molecules.forEach(mol => {
      const v = mol.physicalBody.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed > maxVelocity) {
        const scale = maxVelocity / speed;
        v.x *= scale;
        v.y *= scale;
        v.z *= scale;
      }
    });
  }

  private applyGlobalHeatContinuous(): void {
    const jitter = Math.max(0, this.heatIntensity) * 0.02;
    
    this.molecules.forEach(m => {
      m.physicalBody.velocity.x += (Math.random() - 0.5) * jitter;
      m.physicalBody.velocity.y += (Math.random() - 0.5) * jitter;
      m.physicalBody.velocity.z += (Math.random() - 0.5) * jitter;
    });
    
    this.atoms.forEach(a => {
      if (!a.isMoleculeMember) {
        a.physicalBody.velocity.x += (Math.random() - 0.5) * jitter;
        a.physicalBody.velocity.y += (Math.random() - 0.5) * jitter;
        a.physicalBody.velocity.z += (Math.random() - 0.5) * jitter;
      }
    });
  }
}
