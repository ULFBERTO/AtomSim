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
  isMoleculeMember?: boolean; // New property
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
  visual: THREE.Group; // Changed to THREE.Group
  physicalBody: CANNON.Body; // New property
  bondsVisuals: THREE.Mesh[]; // New property
}

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule, PeriodicTableComponent, MolecularCatalogComponent],
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

  // Interaction
  private raycaster!: THREE.Raycaster;
  private mouse!: THREE.Vector2;
  private isDragging = false;
  private draggedAtom: Atom | null = null;
  private draggedMolecule: Molecule | null = null;
  private dragPlane!: THREE.Plane;
  private dragIntersectionPoint!: THREE.Vector3;

  // Cached event handler bindings for proper add/removeEventListener symmetry
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
  public showPeriodicTable = false;
  public showMolecularCatalog = false;
  public currentRecipe: MolecularRecipe | null = null;
  public energyMode = false;
  public currentEnergyType: 'electrolysis' | 'heat' | 'collision' = 'electrolysis';

  // Global energy and reaction controls
  public globalHeatEnabled = false;
  public heatIntensity = 5;
  public activationEnergyWater = 12; // Activation energy threshold for H2O formation
  public stoichiometryStrict = true; // Enforce 2H2 + O2 -> 2H2O
  // Transient energy from heat pulses (decays over time)
  private transientHeatEnergy = 0;
  // Multiplier that maps a pulse's UI intensity to transient activation energy contribution
  public pulseEnergyBoost = 3;

  // Flag to prevent auto-bonding/identification during orchestrated reactions
  private reactionInProgress = false;

  // Temporary blocklist to avoid immediate re-bonding of recently split atoms
  private blockedPairs: Map<string, number> = new Map();

  // For UI binding
  public protons = 0;
  public neutrons = 0;
  public electronsCount = 0;

  private elementNames: { [key: number]: string } = {
    1: 'Hydrogen', 2: 'Helium', 3: 'Lithium', 4: 'Beryllium', 5: 'Boron',
    6: 'Carbon', 7: 'Nitrogen', 8: 'Oxygen', 9: 'Fluorine', 10: 'Neon',
  };

  // Valence electron configuration for proper bonding
  private valenceElectrons: { [key: number]: number } = {
    1: 1, // Hydrogen
    6: 4, // Carbon
    7: 5, // Nitrogen
    8: 6, // Oxygen
    9: 7, // Fluorine
  };

  // Maximum bonds each element can form
  private maxBonds: { [key: number]: number } = {
    1: 1, // Hydrogen
    6: 4, // Carbon
    7: 3, // Nitrogen
    8: 2, // Oxygen
    9: 1, // Fluorine
  };

  // Electronegativity values for bonding preferences
  private electronegativity: { [key: number]: number } = {
    1: 2.20, // Hydrogen
    6: 2.55, // Carbon
    7: 3.04, // Nitrogen
    8: 3.44, // Oxygen
    9: 3.98, // Fluorine
  };

  // Atomic radii for bond length calculation
  private atomicRadii: { [key: number]: number } = {
    1: 0.37, // Hydrogen
    6: 0.77, // Carbon
    7: 0.75, // Nitrogen
    8: 0.73, // Oxygen
    9: 0.71, // Fluorine
  };

  // Autonomous chemistry engine
  private chemistryEngine: AutonomousChemistryEngine;
  
  // Molecular dynamics
  private lastUpdateTime = 0;
  private baseTemperature = 300; // Kelvin
  private heatDecayRate = 0.98;
  private bondingCooldowns = new Map<string, number>(); // Track bonding attempts
  private lastBondCheck = 0;
  private bondCheckInterval = 100; // ms between bond checks
  public discoveredMolecules: string[] = [];
  private bondingTransitions = new Map<string, any>(); // Use Map instead of array

  constructor() {
    this.chemistryEngine = new AutonomousChemistryEngine();
  }

  ngAfterViewInit(): void {
    this.initScene();
    this.initPhysics();
    this.loadFontAndStart();
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

  private get canvas(): HTMLCanvasElement { return this.canvasRef.nativeElement; }

  private initScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
    this.camera.position.z = 30;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(15, 15, 15);
    this.scene.add(ambientLight, pointLight);
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
  }

  private loadFontAndStart(): void {
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
      this.font = font;
      this.createAtom({protons: 1, neutrons: 0, electrons: 1, position: new THREE.Vector3(1, 0, 0)}); // Hydrogen
      this.createAtom({protons: 1, neutrons: 0, electrons: 1, position: new THREE.Vector3(-1, 0, 0)}); // Hydrogen
      this.selectAtom(this.atoms[0]);
      this.animate();
    });
  }

  private createAtom(config: {protons: number, neutrons: number, electrons: number, position?: THREE.Vector3}): void {
    const atom = this.buildAtom(config.protons, config.neutrons, config.electrons, config.position);
    this.atoms.push(atom);
    this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
    this.world.addBody(atom.physicalBody);
  }

  private buildAtom(protons: number, neutrons: number, electronsCount: number, position = new THREE.Vector3()): Atom {
    const massNumber = protons + neutrons;
    const nucleusRadius = Math.cbrt(massNumber) * 0.7;
    const physicalBody = new CANNON.Body({ mass: massNumber > 0 ? massNumber : 1, shape: new CANNON.Sphere(nucleusRadius || 0.5), position: new CANNON.Vec3(position.x, position.y, position.z) });
    physicalBody.linearDamping = 0.4;
    physicalBody.angularDamping = 0.4;
    // Set zero initial velocity to prevent atoms from flying away
    physicalBody.velocity.set(0, 0, 0);
    const newAtom: Atom = {
      id: this.nextId++, protons, neutrons, electronsCount, elementName: '',
      visuals: { nucleus: new THREE.Group(), electrons: new THREE.Group(), elementName: new THREE.Mesh() },
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
      // Remove molecule from simulation
      this.molecules = this.molecules.filter(m => m.id !== moleculeContainingAtom.id);
      this.scene.remove(moleculeContainingAtom.visual);
      this.world.removeBody(moleculeContainingAtom.physicalBody);

      // Re-add constituent atoms (except the one to be deleted) to scene/world as individual atoms
      moleculeContainingAtom.atoms.forEach(a => {
        a.isMoleculeMember = false; // Unmark
        if (a.id !== atomToDelete.id) {
          this.scene.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
          this.world.addBody(a.physicalBody);
        }
      });

      // Remove bonds associated with this molecule
      const bondsToRemove = this.bonds.filter(b => 
        moleculeContainingAtom.atoms.includes(b.atomA) && moleculeContainingAtom.atoms.includes(b.atomB)
      );
      bondsToRemove.forEach(b => this.deleteBond(b));
    }

    // Now delete the individual atom
    this.atoms = this.atoms.filter(a => a.id !== atomToDelete.id);
    this.world.removeBody(atomToDelete.physicalBody);
    this.scene.remove(atomToDelete.visuals.nucleus, atomToDelete.visuals.electrons, atomToDelete.visuals.elementName);

    // Remove any remaining bonds connected to this atom (if it wasn't part of a molecule)
    const remainingBondsToRemove = this.bonds.filter(b => b.atomA.id === atomToDelete.id || b.atomB.id === atomToDelete.id);
    remainingBondsToRemove.forEach(b => this.deleteBond(b));

    // Update selection
    if (this.selectedAtom && this.selectedAtom.id === atomToDelete.id) {
      this.selectedAtom = this.atoms.length > 0 ? this.atoms[0] : null;
      if (this.selectedAtom) this.selectAtom(this.selectedAtom);
      else this.updateUIBindings();
    }
    this.identifyMolecules(); // Re-identify molecules after deletion
  }

  private deleteBond(bondToDelete: Bond, suppressIdentify: boolean = false): void {
    this.bonds = this.bonds.filter(b => b.id !== bondToDelete.id);
    this.world.removeConstraint(bondToDelete.constraint);
    this.scene.remove(bondToDelete.visual);
    if (!suppressIdentify) {
      this.identifyMolecules();
    }
  }

  private updateNucleusVisuals(atom: Atom): void {
    atom.visuals.nucleus.clear();
    const { protons, neutrons } = atom;
    const nucleusRadius = (atom.physicalBody.shapes[0] as CANNON.Sphere).radius;
    const protonGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const protonMat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5 });
    for (let i = 0; i < protons; i++) {
      const p = new THREE.Mesh(protonGeo, protonMat);
      p.position.setFromSphericalCoords(Math.random() * nucleusRadius, Math.acos(2 * Math.random() - 1), 2 * Math.PI * Math.random());
      atom.visuals.nucleus.add(p);
    }
    const neutronGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const neutronMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });
    for (let i = 0; i < neutrons; i++) {
      const n = new THREE.Mesh(neutronGeo, neutronMat);
      n.position.setFromSphericalCoords(Math.random() * nucleusRadius, Math.acos(2 * Math.random() - 1), 2 * Math.PI * Math.random());
      atom.visuals.nucleus.add(n);
    }
  }

  private updateElectronsVisuals(atom: Atom): void {
    atom.visuals.electrons.clear();
    const electronGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const electronMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 1 });
    const shells = [2, 8, 18, 32];
    let electronsToPlace = atom.electronsCount;
    let shellIndex = 0;
    while (electronsToPlace > 0 && shellIndex < shells.length) {
      const shellCapacity = shells[shellIndex];
      const electronsInShell = Math.min(electronsToPlace, shellCapacity);
      const shellRadius = (shellIndex + 1) * 2.5 + (atom.physicalBody.shapes[0] as CANNON.Sphere).radius;
      for (let i = 0; i < electronsInShell; i++) {
        const e = new THREE.Mesh(electronGeo, electronMat);
        e.position.setFromSphericalCoords(shellRadius, Math.acos(2 * Math.random() - 1), 2 * Math.PI * Math.random());
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
    const geom = new TextGeometry(atom.elementName, { font: this.font, size: 0.8, depth: 0.1 });
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    atom.visuals.elementName = new THREE.Mesh(geom, mat);
    geom.computeBoundingBox();
    this.scene.add(atom.visuals.elementName);
    if (this.selectedAtom && this.selectedAtom.id === atom.id) {
      (atom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffff00);
    }
  }

  private checkAndCreateBonds(): void {
    if (this.reactionInProgress) return;
    
    // Throttle bond checking to prevent infinite loops
    const now = Date.now();
    if (now - this.lastBondCheck < this.bondCheckInterval) return;
    this.lastBondCheck = now;
    
    // Calculate current system energy
    const systemEnergy = this.calculateSystemEnergy();
    
    const bondThreshold = 3.5;
    const attractionThreshold = 10.0;

    for (let i = 0; i < this.atoms.length; i++) {
      for (let j = i + 1; j < this.atoms.length; j++) {
        const atomA = this.atoms[i];
        const atomB = this.atoms[j];

        // Don't bond atoms already part of a molecule
        if (atomA.isMoleculeMember || atomB.isMoleculeMember) continue;

        // Check if bond already exists
        const bondId1 = `${atomA.id}-${atomB.id}`;
        const bondId2 = `${atomB.id}-${atomA.id}`;
        const bondExists = this.bonds.some(bond => bond.id === bondId1 || bond.id === bondId2);
        
        if (bondExists) continue;

        // Check cooldown to prevent rapid bonding attempts
        const cooldownKey = `${Math.min(atomA.id, atomB.id)}-${Math.max(atomA.id, atomB.id)}`;
        const lastAttempt = this.bondingCooldowns.get(cooldownKey) || 0;
        if (now - lastAttempt < 1000) continue; // 1 second cooldown

        const distance = atomA.physicalBody.position.distanceTo(atomB.physicalBody.position);

        if (distance < bondThreshold) {
          // Use improved bonding logic that considers chemical rules
          if (this.shouldFormBond(atomA, atomB, systemEnergy)) {
            this.bondingCooldowns.set(cooldownKey, now);
            console.log(`Initiating gradual bond formation between ${atomA.elementName} and ${atomB.elementName}`);
            this.initiateGradualBonding(atomA, atomB);
          }
        } else if (distance < attractionThreshold) {
          // Apply attractive force using improved logic
          if (this.shouldFormBond(atomA, atomB, systemEnergy)) {
            const forceMagnitude = (attractionThreshold - distance) * 0.05; // Reduced force
            const forceVector = new CANNON.Vec3().copy(atomB.physicalBody.position as any).vsub(atomA.physicalBody.position as any);
            forceVector.normalize();
            forceVector.scale(forceMagnitude, forceVector);

            atomA.physicalBody.applyForce(forceVector, new CANNON.Vec3(0, 0, 0));
            atomB.physicalBody.applyForce(forceVector.scale(-1, new CANNON.Vec3()), new CANNON.Vec3(0, 0, 0));
          }
        }
      }
    }
  }

  private shouldFormBond(atomA: Atom, atomB: Atom, systemEnergy: number): boolean {
    // First check if chemistry engine allows the bond
    if (!this.chemistryEngine.canFormBond(atomA, atomB, systemEnergy)) {
      return false;
    }

    // Additional chemical logic to prevent incorrect bonds
    const elementA = atomA.protons;
    const elementB = atomB.protons;

    // For water formation: prefer H-O bonds over H-H bonds
    if (elementA === 1 && elementB === 1) { // Both hydrogen
      // Only allow H-H if no oxygen atoms are available nearby
      const nearbyOxygen = this.atoms.find(atom => 
        atom.protons === 8 && 
        !atom.isMoleculeMember &&
        (atom.physicalBody.position.distanceTo(atomA.physicalBody.position) < 5 ||
         atom.physicalBody.position.distanceTo(atomB.physicalBody.position) < 5)
      );
      
      if (nearbyOxygen) {
        console.log('Preventing H-H bond - oxygen available for H2O formation');
        return false;
      }
    }

    // Prevent O-O bonds when forming molecules (oxygen should bond to other elements)
    if (elementA === 8 && elementB === 8) { // Both oxygen
      // Only allow O-O if no other elements are available nearby
      const nearbyOtherElement = this.atoms.find(atom => 
        atom.protons !== 8 && 
        !atom.isMoleculeMember &&
        (atom.physicalBody.position.distanceTo(atomA.physicalBody.position) < 5 ||
         atom.physicalBody.position.distanceTo(atomB.physicalBody.position) < 5)
      );
      
      if (nearbyOtherElement) {
        console.log('Preventing O-O bond - other elements available for bonding');
        return false;
      }
    }

    // Prefer H-O and C-O bonds
    if ((elementA === 1 && elementB === 8) || (elementA === 8 && elementB === 1) ||
        (elementA === 6 && elementB === 8) || (elementA === 8 && elementB === 6)) {
      return true;
    }

    return true;
  }

  private createBond(atomA: Atom, atomB: Atom, suppressIdentify: boolean = false): void {
    // Check if bond already exists
    const bondId1 = `${atomA.id}-${atomB.id}`;
    const bondId2 = `${atomB.id}-${atomA.id}`;
    const bondExists = this.bonds.some(bond => bond.id === bondId1 || bond.id === bondId2);
    
    if (bondExists) {
      console.log(`Bond already exists between ${atomA.elementName} and ${atomB.elementName}`);
      return;
    }
    
    // Skip energy check if explicitly requested (for direct bond creation)
    if (!suppressIdentify) {
      const systemEnergy = this.calculateSystemEnergy();
      if (!this.canFormBondWithEnergy(atomA, atomB, systemEnergy)) {
        return;
      }
    }
    
    const bondId = `${atomA.id}-${atomB.id}`;
    
    // Calculate ideal bond length based on atomic radii
    const elementA = atomA.protons;
    const elementB = atomB.protons;
    const radiusA = this.atomicRadii[elementA] || 1.0;
    const radiusB = this.atomicRadii[elementB] || 1.0;
    const idealBondLength = (radiusA + radiusB) * 1.2; // Ideal bond length
    
    // Create constraint with ideal bond length instead of current distance
    const constraint = new CANNON.DistanceConstraint(atomA.physicalBody, atomB.physicalBody, idealBondLength);
    
    // Make the constraint more flexible to allow some stretching but not infinite
    constraint.collideConnected = false;
    this.world.addConstraint(constraint);
    
    const bondMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00, 
      emissive: 0x00ff00, 
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.8
    });
    const bondGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1, 8);
    const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial);
    this.scene.add(bondVisual);
    this.bonds.push({ id: bondId, atomA, atomB, constraint, visual: bondVisual });
    
    console.log(`Created bond between ${atomA.elementName} and ${atomB.elementName} with ideal length: ${idealBondLength.toFixed(2)}`);
    
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
      
      // Calculate maximum allowed bond length based on atomic radii
      const elementA = bond.atomA.protons;
      const elementB = bond.atomB.protons;
      const radiusA = this.atomicRadii[elementA] || 1.0;
      const radiusB = this.atomicRadii[elementB] || 1.0;
      const maxBondLength = (radiusA + radiusB) * 3.0; // 3x normal bond length before breaking
      
      if (distance > maxBondLength) {
        // Bond is too stretched - mark for removal
        console.log(`Breaking bond between ${bond.atomA.elementName} and ${bond.atomB.elementName} - distance: ${distance.toFixed(2)}, max: ${maxBondLength.toFixed(2)}`);
        bondsToRemove.push(bond);
      } else {
        // Update bond visual
        bond.visual.scale.y = distance;
        bond.visual.position.copy(posA).lerp(posB, 0.5);
        bond.visual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), posB.clone().sub(posA).normalize());
        
        // Visual feedback for bond stress
        const stressRatio = distance / maxBondLength;
        if (stressRatio > 0.7) {
          // Bond is under stress - change color to indicate weakness
          const stressMaterial = bond.visual.material as THREE.MeshStandardMaterial;
          const redIntensity = Math.min(1, (stressRatio - 0.7) / 0.3);
          stressMaterial.color.setRGB(1, 1 - redIntensity, 1 - redIntensity);
          stressMaterial.emissive.setRGB(redIntensity * 0.5, 0, 0);
        } else {
          // Normal bond - green color
          const normalMaterial = bond.visual.material as THREE.MeshStandardMaterial;
          normalMaterial.color.setRGB(0, 1, 0);
          normalMaterial.emissive.setRGB(0, 0.5, 0);
        }
      }
    }
    
    // Remove overstretched bonds
    bondsToRemove.forEach(bond => {
      this.deleteBond(bond, true);
    });
    
    // Re-identify molecules if bonds were broken
    if (bondsToRemove.length > 0) {
      setTimeout(() => {
        this.identifyMolecules();
      }, 100);
    }
  }

  private identifyMolecules(): void {
    console.log('Starting autonomous molecule identification...');
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
        console.log(`Analyzing molecular structure with ${connectedComponent.length} atoms`);
        
        // Use autonomous chemistry engine for comprehensive analysis
        const bondingStructure = this.chemistryEngine.calculateOptimalBondingStructure(connectedComponent);
        const systematicName = this.chemistryEngine.generateSystematicName(connectedComponent);
        const geometry = this.chemistryEngine.determineGeometry(connectedComponent, bondingStructure.bonds, bondingStructure.centralAtom);
        
        const moleculeStructure: MolecularStructure = {
          atoms: connectedComponent,
          bonds: bondingStructure.bonds,
          geometry: geometry,
          dipole: new THREE.Vector3(), // Would be calculated
          stability: bondingStructure.stability,
          name: systematicName,
          formula: this.generateMolecularFormula(connectedComponent)
        };
        
        // Add to discovered molecules if not already known
        if (!this.discoveredMolecules.some(m => m === systematicName)) {
          this.discoveredMolecules.push(systematicName);
          console.log(`Discovered new molecule: ${systematicName}`);
        }
        
        const moleculeId = connectedComponent.map(a => a.id).sort().join('-');
        const existingMolecule = this.molecules.find(m => m.id === moleculeId);
        
        if (!existingMolecule) {
          const molecule = this.createAdvancedMolecule(moleculeId, moleculeStructure, connectedComponent);
          if (molecule) {
            this.molecules.push(molecule);
            console.log(`Created advanced molecule: ${systematicName}`);
          }
        }
      } else {
        connectedComponent.forEach(a => { a.isMoleculeMember = false; });
      }
    }

    this.moleculeNames = this.molecules.map(m => m.name);
    console.log('Discovered molecules:', this.discoveredMolecules);
  }

  private identifyMoleculeType(atoms: Atom[]): { name: string, geometry: string, bondLength: number } | null {
    const counts = new Map<number, number>();
    atoms.forEach(a => {
      const count = counts.get(a.protons) || 0;
      counts.set(a.protons, count + 1);
    });

    const hCount = counts.get(1) || 0; // Hydrogen
    const cCount = counts.get(6) || 0; // Carbon
    const nCount = counts.get(7) || 0; // Nitrogen
    const oCount = counts.get(8) || 0; // Oxygen
    const fCount = counts.get(9) || 0; // Fluorine

    // Known molecules
    if (oCount === 1 && hCount === 2 && atoms.length === 3) {
      return { name: 'Water (H₂O)', geometry: 'bent', bondLength: 2.0 };
    }
    
    if (cCount === 1 && oCount === 2 && atoms.length === 3) {
      return { name: 'Carbon Dioxide (CO₂)', geometry: 'linear', bondLength: 2.2 };
    }
    
    if (nCount === 2 && oCount === 1 && atoms.length === 3) {
      return { name: 'Nitrous Oxide (N₂O)', geometry: 'linear', bondLength: 1.8 };
    }
    
    if (nCount === 2 && atoms.length === 2) {
      return { name: 'Nitrogen Gas (N₂)', geometry: 'linear', bondLength: 1.6 };
    }
    
    if (oCount === 2 && atoms.length === 2) {
      return { name: 'Oxygen Gas (O₂)', geometry: 'linear', bondLength: 1.5 };
    }

    if (hCount === 2 && atoms.length === 2) {
      return { name: 'Hydrogen Gas (H₂)', geometry: 'linear', bondLength: 1.2 };
    }

    // Generate automatic name for unknown molecules
    const name = this.generateMolecularName(counts, atoms.length);
    const geometry = this.inferGeometry(atoms);
    const bondLength = this.calculateAverageBondLength(atoms);
    
    return { name, geometry, bondLength };
  }

  private generateMolecularName(counts: Map<number, number>, totalAtoms: number): string {
    const elementSymbols: { [key: number]: string } = {
      1: 'H', 6: 'C', 7: 'N', 8: 'O', 9: 'F'
    };
    
    const parts: string[] = [];
    
    // Sort by atomic number
    const sortedElements = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
    
    for (const [protons, count] of sortedElements) {
      const symbol = elementSymbols[protons] || `E${protons}`;
      if (count === 1) {
        parts.push(symbol);
      } else {
        const subscript = count.toString().split('').map(d => 
          '₀₁₂₃₄₅₆₇₈₉'[parseInt(d)]
        ).join('');
        parts.push(symbol + subscript);
      }
    }
    
    return `Unknown Compound (${parts.join('')})`;
  }

  private inferGeometry(atoms: Atom[]): string {
    if (atoms.length === 2) return 'linear';
    if (atoms.length === 3) {
      // Check if it's likely linear or bent
      const centralAtom = this.findBestCentralAtom(atoms);
      const centralProtons = centralAtom.protons;
      
      // Linear molecules: CO2, N2O, etc.
      if (centralProtons === 6 || centralProtons === 7) return 'linear';
      // Bent molecules: H2O, etc.
      if (centralProtons === 8) return 'bent';
    }
    if (atoms.length === 4) return 'tetrahedral';
    if (atoms.length === 5) return 'trigonal_bipyramidal';
    if (atoms.length === 6) return 'octahedral';
    
    return 'complex';
  }

  private calculateAverageBondLength(atoms: Atom[]): number {
    if (atoms.length < 2) return 2.0;
    
    let totalLength = 0;
    let bondCount = 0;
    
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const radiusA = this.atomicRadii[atoms[i].protons] || 1.0;
        const radiusB = this.atomicRadii[atoms[j].protons] || 1.0;
        totalLength += (radiusA + radiusB) * 1.2; // 1.2 factor for bond length
        bondCount++;
      }
    }
    
    return bondCount > 0 ? totalLength / bondCount : 2.0;
  }

  private createMolecule(moleculeId: string, moleculeInfo: { name: string, geometry: string, bondLength: number }, atoms: Atom[]): Molecule | null {
    const moleculeMass = atoms.reduce((sum, a) => sum + a.physicalBody.mass, 0);
    const moleculeCenter = new THREE.Vector3();
    atoms.forEach(a => moleculeCenter.add(a.physicalBody.position as any));
    moleculeCenter.divideScalar(atoms.length);

    // Create a lighter compound body that allows more freedom of movement
    const compoundBody = new CANNON.Body({
      mass: moleculeMass * 0.8, // Reduced mass for easier movement
      position: new CANNON.Vec3(moleculeCenter.x, moleculeCenter.y, moleculeCenter.z),
      linearDamping: 0.2, // Reduced damping for more fluid movement
      angularDamping: 0.2,
    });

    const moleculeVisual = new THREE.Group();
    const bondMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
    const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const bondsVisuals: THREE.Mesh[] = [];

    const relativePositions = this.calculateMolecularGeometry(atoms, moleculeInfo);
    if (!relativePositions) return null;

    // Position atoms and create visuals
    atoms.forEach(a => {
      this.world.removeBody(a.physicalBody);
      this.scene.remove(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);

      const relativePos = relativePositions.get(a.id)!;
      compoundBody.addShape(a.physicalBody.shapes[0], new CANNON.Vec3(relativePos.x, relativePos.y, relativePos.z));

      a.visuals.nucleus.position.copy(relativePos);
      a.visuals.electrons.position.copy(relativePos);
      a.visuals.elementName.position.copy(relativePos).add(new THREE.Vector3(-a.visuals.elementName.geometry.boundingBox!.max.x / 2, 0.8, 0));

      moleculeVisual.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
      a.isMoleculeMember = true;
    });

    // Create bond visuals based on actual bonds
    const moleculeBonds = this.bonds.filter(b => atoms.includes(b.atomA) && atoms.includes(b.atomB));
    moleculeBonds.forEach(bond => {
      const posA = relativePositions.get(bond.atomA.id)!;
      const posB = relativePositions.get(bond.atomB.id)!;
      const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial);
      const distance = posA.distanceTo(posB);
      bondVisual.scale.y = distance;
      bondVisual.position.copy(posA).lerp(posB, 0.5);
      bondVisual.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), posB.clone().sub(posA).normalize());
      moleculeVisual.add(bondVisual);
      bondsVisuals.push(bondVisual);
    });

    // Remove internal bonds from main simulation without triggering re-identification mid-construction
    moleculeBonds.forEach(b => this.deleteBond(b, true));

    this.world.addBody(compoundBody);
    this.scene.add(moleculeVisual);

    return { id: moleculeId, name: moleculeInfo.name, atoms, visual: moleculeVisual, physicalBody: compoundBody, bondsVisuals };
  }

  private calculateMolecularGeometry(atoms: Atom[], moleculeInfo: { name: string, geometry: string, bondLength: number }): Map<number, THREE.Vector3> | null {
    const relativePositions = new Map<number, THREE.Vector3>();
    const bondStructure = this.calculateOptimalBondingStructure(atoms);

    if (moleculeInfo.geometry === 'linear') {
      if (atoms.length === 2) {
        // Diatomic molecule
        relativePositions.set(atoms[0].id, new THREE.Vector3(-moleculeInfo.bondLength / 2, 0, 0));
        relativePositions.set(atoms[1].id, new THREE.Vector3(moleculeInfo.bondLength / 2, 0, 0));
      } else if (atoms.length === 3) {
        // Linear triatomic molecule
        const centralAtom = bondStructure.centralAtom || this.findBestCentralAtom(atoms);
        const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
        
        relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
        relativePositions.set(otherAtoms[0].id, new THREE.Vector3(-moleculeInfo.bondLength, 0, 0));
        relativePositions.set(otherAtoms[1].id, new THREE.Vector3(moleculeInfo.bondLength, 0, 0));
      }
    } else if (moleculeInfo.geometry === 'bent') {
      // Bent geometry (like H2O)
      const centralAtom = this.findBestCentralAtom(atoms);
      const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
      const angle = moleculeInfo.name.includes('H₂O') ? 104.5 * (Math.PI / 180) : 120 * (Math.PI / 180);
      
      relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
      relativePositions.set(otherAtoms[0].id, new THREE.Vector3(
        moleculeInfo.bondLength * Math.sin(angle / 2),
        moleculeInfo.bondLength * Math.cos(angle / 2),
        0
      ));
      relativePositions.set(otherAtoms[1].id, new THREE.Vector3(
        -moleculeInfo.bondLength * Math.sin(angle / 2),
        moleculeInfo.bondLength * Math.cos(angle / 2),
        0
      ));
    } else if (moleculeInfo.geometry === 'tetrahedral') {
      // Tetrahedral geometry
      const centralAtom = this.findBestCentralAtom(atoms);
      const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
      
      relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
      
      // Tetrahedral positions
      const tetrahedralPositions = [
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(-1, -1, 1),
        new THREE.Vector3(-1, 1, -1),
        new THREE.Vector3(1, -1, -1)
      ];
      
      otherAtoms.forEach((atom, index) => {
        if (index < tetrahedralPositions.length) {
          const pos = tetrahedralPositions[index].normalize().multiplyScalar(moleculeInfo.bondLength);
          relativePositions.set(atom.id, pos);
        }
      });
    } else {
      // Default: try to arrange atoms in a reasonable way
      if (atoms.length === 2) {
        relativePositions.set(atoms[0].id, new THREE.Vector3(-moleculeInfo.bondLength / 2, 0, 0));
        relativePositions.set(atoms[1].id, new THREE.Vector3(moleculeInfo.bondLength / 2, 0, 0));
      } else {
        // Arrange in a circle around the central atom
        const centralAtom = this.findBestCentralAtom(atoms);
        const otherAtoms = atoms.filter(a => a.id !== centralAtom.id);
        
        relativePositions.set(centralAtom.id, new THREE.Vector3(0, 0, 0));
        
        otherAtoms.forEach((atom, index) => {
          const angle = (2 * Math.PI * index) / otherAtoms.length;
          const pos = new THREE.Vector3(
            moleculeInfo.bondLength * Math.cos(angle),
            moleculeInfo.bondLength * Math.sin(angle),
            0
          );
          relativePositions.set(atom.id, pos);
        });
      }
    }

    return relativePositions.size > 0 ? relativePositions : null;
  }

  private updateMoleculeVisuals(): void {
    for (const molecule of this.molecules) {
      // Update molecule visual position from its compound body
      const { position, quaternion } = molecule.physicalBody;
      molecule.visual.position.copy(position as any);
      molecule.visual.quaternion.copy(quaternion as any);
    }
  }

  selectAtom(atom: Atom): void {
    // Clear molecule selection
    if (this.selectedMolecule) {
      this.selectedMolecule.visual.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = 0;
        }
      });
      this.selectedMolecule = null;
    }
    
    if (this.selectedAtom) {
      (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffffff);
    }
    this.selectedAtom = atom;
    (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffff00);
    this.updateUIBindings();
  }

  addAtom(): void {
    const position = new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    this.createAtom({protons: 1, neutrons: 0, electrons: 1, position});
  }

  deleteAtomClicked(event: MouseEvent, atom: Atom): void {
    event.stopPropagation();
    this.deleteAtom(atom);
  }

  addProton(): void { if(this.selectedAtom) { this.selectedAtom.protons++; this.updateAtom(this.selectedAtom); } }
  removeProton(): void { if(this.selectedAtom && this.selectedAtom.protons > 1) { this.selectedAtom.protons--; this.updateAtom(this.selectedAtom); } }
  addNeutron(): void { if(this.selectedAtom) { this.selectedAtom.neutrons++; this.updateAtom(this.selectedAtom); } }
  removeNeutron(): void { if(this.selectedAtom && this.selectedAtom.neutrons > 0) { this.selectedAtom.neutrons--; this.updateAtom(this.selectedAtom); } }
  addElectron(): void { if(this.selectedAtom) { this.selectedAtom.electronsCount++; this.updateElectronsVisuals(this.selectedAtom); this.updateUIBindings(); } }
  removeElectron(): void { if(this.selectedAtom && this.selectedAtom.electronsCount > 0) { this.selectedAtom.electronsCount--; this.updateElectronsVisuals(this.selectedAtom); this.updateUIBindings(); } }

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

  togglePeriodicTable(): void { this.showPeriodicTable = !this.showPeriodicTable; }

  toggleMolecularCatalog(): void { this.showMolecularCatalog = !this.showMolecularCatalog; }

  onRecipeSelected(recipe: MolecularRecipe): void {
    this.currentRecipe = recipe;
    this.heatIntensity = recipe.conditions.heatIntensity;
    this.activationEnergyWater = recipe.conditions.activationEnergy;
    this.currentEnergyType = recipe.conditions.energyType;
    this.showMolecularCatalog = false;
    console.log('Recipe applied:', recipe.name);
  }

  onCreateReactants(recipe: MolecularRecipe): void {
    console.log('Creating reactants for:', recipe.name);
    
    // Create reactants based on recipe
    const positions = this.generateReactantPositions(recipe.reactants.length);
    
    recipe.reactants.forEach((reactant, index) => {
      for (let i = 0; i < reactant.count; i++) {
        if (reactant.element.includes('₂')) {
          // Create diatomic molecule (like H₂, O₂)
          const atomicNumber = reactant.atomicNumber;
          const pos1 = positions[index].clone().add(new THREE.Vector3(i * 5, 0, 0));
          const pos2 = pos1.clone().add(new THREE.Vector3(1.5, 0, 0));
          
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos1});
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos2});
        } else {
          // Create single atom
          const atomicNumber = reactant.atomicNumber;
          const pos = positions[index].clone().add(new THREE.Vector3(i * 3, 0, 0));
          this.createAtom({protons: atomicNumber, neutrons: atomicNumber, electrons: atomicNumber, position: pos});
        }
      }
    });
    
    this.showMolecularCatalog = false;
  }

  private generateReactantPositions(count: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const radius = 3; // Reduced radius to keep atoms closer
    
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      positions.push(new THREE.Vector3(
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        0
      ));
    }
    
    return positions;
  }

  onElementSelect(element: PeriodicElement): void {
    if (this.selectedAtom) {
      this.selectedAtom.protons = element.atomicNumber;
      this.selectedAtom.neutrons = element.neutrons;
      this.updateAtom(this.selectedAtom);
    } else {
      this.createAtom({protons: element.atomicNumber, neutrons: element.neutrons, electrons: element.atomicNumber});
      this.selectAtom(this.atoms[this.atoms.length - 1]);
    }
    this.showPeriodicTable = false;
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

  private findIntersectedAtom(): Atom | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const intersect of intersects) {
      const atom = this.atoms.find(a =>
        a.visuals.nucleus === intersect.object.parent ||
        a.visuals.electrons === intersect.object.parent ||
        a.visuals.elementName === intersect.object
      );
      if (atom && !atom.isMoleculeMember) {
        return atom;
      }
    }
    return null;
  }

  private findIntersectedObject(): { atom?: Atom, molecule?: Molecule } {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const intersect of intersects) {
      // Check for molecules first
      const molecule = this.molecules.find(m => {
        return this.isObjectInGroup(intersect.object, m.visual);
      });
      if (molecule) {
        return { molecule };
      }

      // Then check for individual atoms
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

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only left mouse button
    
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
      
      // Find intersection with drag plane
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersectionPoint)) {
        if (this.draggedAtom) {
          // Update atom position
          this.draggedAtom.physicalBody.position.set(
            this.dragIntersectionPoint.x,
            this.dragIntersectionPoint.y,
            this.dragIntersectionPoint.z
          );
          
          // Keep velocity at zero while dragging
          this.draggedAtom.physicalBody.velocity.set(0, 0, 0);
          this.draggedAtom.physicalBody.angularVelocity.set(0, 0, 0);
        } else if (this.draggedMolecule) {
          // Update molecule position
          this.draggedMolecule.physicalBody.position.set(
            this.dragIntersectionPoint.x,
            this.dragIntersectionPoint.y,
            this.dragIntersectionPoint.z
          );
          
          // Keep velocity at zero while dragging
          this.draggedMolecule.physicalBody.velocity.set(0, 0, 0);
          this.draggedMolecule.physicalBody.angularVelocity.set(0, 0, 0);
        }
      }
      
      event.preventDefault();
    } else {
      // Update cursor based on hover
      const intersected = this.findIntersectedObject();
      this.canvas.style.cursor = (intersected.atom || intersected.molecule) ? 'grab' : 'default';
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedAtom = null;
      this.draggedMolecule = null;
      this.controls.enabled = true; // Re-enable orbit controls
      this.canvas.style.cursor = 'default';
    }
  }

  private onRightClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.updateMousePosition(event);
    
    const intersected = this.findIntersectedObject();
    
    if (intersected.atom) {
      this.selectAtom(intersected.atom);
    } else if (intersected.molecule) {
      this.selectMolecule(intersected.molecule);
    }
  }

  private onCanvasClick(event: MouseEvent): void {
    // Only handle clicks if we weren't dragging
    if (this.isDragging) return;
    
    this.updateMousePosition(event);
    const intersected = this.findIntersectedObject();
    
    if (intersected.atom) {
      this.selectAtom(intersected.atom);
    } else if (intersected.molecule) {
      this.selectMolecule(intersected.molecule);
    }
  }

  private findIntersectedMolecule(): Molecule | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const intersect of intersects) {
      // Check if intersected object belongs to any molecule
      const molecule = this.molecules.find(m => {
        // Check if the intersected object is part of this molecule's visual group
        return this.isObjectInGroup(intersect.object, m.visual);
      });
      if (molecule) {
        console.log('Found molecule:', molecule.name);
        return molecule;
      }
    }
    return null;
  }

  private isObjectInGroup(object: THREE.Object3D, group: THREE.Group): boolean {
    // Robustly check whether `object` is a descendant of `group` by walking up the parent chain
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === group) return true;
      current = current.parent;
    }
    return false;
  }

  private selectMolecule(molecule: Molecule): void {
    // Clear previous selections
    if (this.selectedAtom) {
      (this.selectedAtom.visuals.elementName.material as THREE.MeshStandardMaterial).color.set(0xffffff);
      this.selectedAtom = null;
    }
    
    if (this.selectedMolecule) {
      this.selectedMolecule.visual.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissiveIntensity = 0;
        }
      });
    }
    
    this.selectedMolecule = molecule;
    
    // Highlight selected molecule
    molecule.visual.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissiveIntensity = 0.3;
        child.material.emissive.setHex(0x00ffff);
      }
    });
  }

  // Removed individual molecule energy application - only global energy now

  private performElectrolysis(molecule: Molecule): void {
    console.log('Performing electrolysis on:', molecule.name);
    
    // Create visual effect
    this.createElectrolysisEffect(molecule);
    
    // Break molecule bonds after short delay
    setTimeout(() => {
      console.log('Breaking molecule:', molecule.name);
      this.breakMolecule(molecule);
    }, 1000);
  }

  private createElectrolysisEffect(molecule: Molecule): void {
    // Create lightning/spark effect
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions = [];
    const center = molecule.visual.position;
    
    // Create random spark lines
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const radius = 3;
      sparkPositions.push(
        center.x, center.y, center.z,
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        center.z + (Math.random() - 0.5) * 2
      );
    }
    
    sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparkPositions, 3));
    const sparkMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00ffff, 
      transparent: true, 
      opacity: 0.8 
    });
    const sparkLines = new THREE.LineSegments(sparkGeometry, sparkMaterial);
    
    this.scene.add(sparkLines);
    
    // Remove effect after animation
    setTimeout(() => {
      this.scene.remove(sparkLines);
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    }, 1000);
  }

  private breakMolecule(molecule: Molecule, suppressImmediateRebond: boolean = false): void {
    console.log('Breaking molecule with', molecule.atoms.length, 'atoms');
    // Temporarily block re-bonding of all atom pairs from this molecule
    this.addTemporaryBondBlock(molecule.atoms);
    
    // Store molecule center position for atom placement
    const moleculePosition = molecule.visual.position.clone();
    
    // Remove molecule from simulation
    this.molecules = this.molecules.filter(m => m.id !== molecule.id);
    this.scene.remove(molecule.visual);
    this.world.removeBody(molecule.physicalBody);
    
    // Re-add individual atoms with some separation energy
    molecule.atoms.forEach((atom, index) => {
      atom.isMoleculeMember = false;
      
      // Position atoms near the original molecule position with less separation
      atom.physicalBody.position.set(
        moleculePosition.x + (Math.random() - 0.5) * 1,
        moleculePosition.y + (Math.random() - 0.5) * 1,
        moleculePosition.z + (Math.random() - 0.5) * 1
      );
      
      // Add moderate kinetic energy to simulate bond breaking
      const separationVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      );
      
      atom.physicalBody.velocity.set(
        separationVelocity.x,
        separationVelocity.y,
        separationVelocity.z
      );
      
      // Re-add to scene and world
      this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
      this.world.addBody(atom.physicalBody);
      
      console.log('Re-added atom:', atom.elementName, 'at position:', atom.physicalBody.position);
    });
    
    // Clear selection if this molecule was selected
    if (this.selectedMolecule && this.selectedMolecule.id === molecule.id) {
      this.selectedMolecule = null;
    }
    
    // Update molecule names list
    this.moleculeNames = this.molecules.map(m => m.name);
    
    console.log('Molecule broken. Remaining molecules:', this.molecules.length);
    console.log('Total atoms now:', this.atoms.length);
    
    // Force immediate bonding check after a short delay
    if (!suppressImmediateRebond && !this.reactionInProgress) {
      setTimeout(() => {
        console.log('Forcing bonding check after electrolysis');
        this.checkAndCreateBonds();
        this.identifyMolecules();
      }, 100);
    }
  }

  private applyHeat(molecule: Molecule): void {
    // Increase molecular vibration
    const heatEnergy = Math.max(1, this.heatIntensity);
    molecule.physicalBody.velocity.set(
      (Math.random() - 0.5) * heatEnergy,
      (Math.random() - 0.5) * heatEnergy,
      (Math.random() - 0.5) * heatEnergy
    );
    
    // Visual heat effect
    molecule.visual.children.forEach(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.setHex(0xff4400);
        child.material.emissiveIntensity = 0.5;
        
        setTimeout(() => {
          child.material.emissive.setHex(0x000000);
          child.material.emissiveIntensity = 0;
        }, 2000);
      }
    });
  }

  private applyCollisionEnergy(molecule: Molecule): void {
    // Apply high-speed collision force
    const collisionForce = 15;
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();
    
    molecule.physicalBody.velocity.set(
      direction.x * collisionForce,
      direction.y * collisionForce,
      direction.z * collisionForce
    );
  }

  toggleEnergyMode(): void {
    this.energyMode = !this.energyMode;
  }

  setEnergyType(type: 'electrolysis' | 'heat' | 'collision'): void {
    this.currentEnergyType = type;
  }

  // --- Global energy application ---
  public heatIntensityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value);
    this.heatIntensity = isNaN(val) ? this.heatIntensity : val;
  }

  public activationEnergyChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = Number(target.value);
    this.activationEnergyWater = isNaN(val) ? this.activationEnergyWater : val;
  }

  public toggleStoichiometryStrict(event?: Event): void {
    this.stoichiometryStrict = !this.stoichiometryStrict;
  }

  public toggleGlobalHeating(): void {
    this.globalHeatEnabled = !this.globalHeatEnabled;
  }

  public applyGlobalHeatPulse(): void {
    const intensity = Math.max(0, this.heatIntensity);
    console.log(`Applying heat pulse with intensity: ${intensity}`);
    
    // Apply kinetic energy to molecules
    for (const m of this.molecules) {
      m.physicalBody.velocity.x += (Math.random() - 0.5) * intensity;
      m.physicalBody.velocity.y += (Math.random() - 0.5) * intensity;
      m.physicalBody.velocity.z += (Math.random() - 0.5) * intensity;
    }
    // Apply kinetic energy to free atoms
    for (const a of this.atoms) {
      if (a.isMoleculeMember) continue;
      a.physicalBody.velocity.x += (Math.random() - 0.5) * intensity;
      a.physicalBody.velocity.y += (Math.random() - 0.5) * intensity;
      a.physicalBody.velocity.z += (Math.random() - 0.5) * intensity;
    }
    
    // Add significant activation energy for reactions
    this.transientHeatEnergy = Math.max(this.transientHeatEnergy, intensity * this.pulseEnergyBoost);
    console.log(`System activation energy now: ${this.transientHeatEnergy.toFixed(2)}`);
  }

  public applyGlobalElectrolysis(): void {
    // Apply electrolysis to all molecules
    for (const m of [...this.molecules]) {
      this.performElectrolysis(m);
    }
  }

  private applyGlobalHeatContinuous(): void {
    const jitter = Math.max(0, this.heatIntensity) * 0.05;
    for (const m of this.molecules) {
      m.physicalBody.velocity.x += (Math.random() - 0.5) * jitter;
      m.physicalBody.velocity.y += (Math.random() - 0.5) * jitter;
      m.physicalBody.velocity.z += (Math.random() - 0.5) * jitter;
    }
    for (const a of this.atoms) {
      if (a.isMoleculeMember) continue;
      a.physicalBody.velocity.x += (Math.random() - 0.5) * jitter;
      a.physicalBody.velocity.y += (Math.random() - 0.5) * jitter;
      a.physicalBody.velocity.z += (Math.random() - 0.5) * jitter;
    }
  }

  // Universal chemistry system - no hardcoded reactions

  private calculateSystemEnergy(): number {
    // Calculate total system energy from all sources
    let totalEnergy = this.transientHeatEnergy;
    
    // Add kinetic energy from moving atoms and molecules
    this.atoms.forEach(atom => {
      if (!atom.isMoleculeMember) {
        const velocity = atom.physicalBody.velocity;
        const kineticEnergy = 0.5 * atom.physicalBody.mass * (velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
        totalEnergy += kineticEnergy * 10; // Scale kinetic energy contribution
      }
    });
    
    this.molecules.forEach(molecule => {
      const velocity = molecule.physicalBody.velocity;
      const kineticEnergy = 0.5 * molecule.physicalBody.mass * (velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
      totalEnergy += kineticEnergy * 10;
    });
    
    return totalEnergy;
  }

  private canFormBondWithEnergy(atomA: Atom, atomB: Atom, systemEnergy: number): boolean {
    const requiredEnergy = this.getMinimumActivationEnergy(atomA, atomB);
    return systemEnergy >= requiredEnergy;
  }

  private getMinimumActivationEnergy(atomA: Atom, atomB: Atom): number {
    // Base activation energy based on electronegativity difference
    const electronegativityA = this.electronegativity[atomA.protons] || 2.0;
    const electronegativityB = this.electronegativity[atomB.protons] || 2.0;
    const electronegativityDiff = Math.abs(electronegativityA - electronegativityB);
    
    // Higher electronegativity difference = lower activation energy (easier bonding)
    const baseEnergy = Math.max(2, 10 - electronegativityDiff * 2);
    
    // Adjust based on valence electrons
    const valenceA = this.valenceElectrons[atomA.protons] || 4;
    const valenceB = this.valenceElectrons[atomB.protons] || 4;
    
    // Atoms with unfilled valence shells bond more easily
    const valenceBonus = (8 - valenceA) + (8 - valenceB);
    
    return Math.max(1, baseEnergy - valenceBonus * 0.5);
  }

  private consumeActivationEnergy(atomA: Atom, atomB: Atom): void {
    const energyRequired = this.getMinimumActivationEnergy(atomA, atomB);
    this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyRequired);
  }

  private findBestCentralAtom(atoms: Atom[]): Atom {
    // Use chemistry engine's more sophisticated central atom selection
    return atoms.reduce((best, current) => {
      const bestValence = this.valenceElectrons[best.protons] || 0;
      const currentValence = this.valenceElectrons[current.protons] || 0;
      const bestElectronegativity = this.electronegativity[best.protons] || 0;
      const currentElectronegativity = this.electronegativity[current.protons] || 0;
      
      // Prefer atoms with higher valence and lower electronegativity for central position
      const bestScore = bestValence - bestElectronegativity;
      const currentScore = currentValence - currentElectronegativity;
      
      return currentScore > bestScore ? current : best;
    });
  }

  private calculateOptimalBondingStructure(atoms: Atom[]): { centralAtom?: Atom, bonds: Array<{atomA: Atom, atomB: Atom}> } {
    const bonds: Array<{atomA: Atom, atomB: Atom}> = [];
    
    if (atoms.length < 2) {
      return { bonds };
    }
    
    if (atoms.length === 2) {
      bonds.push({ atomA: atoms[0], atomB: atoms[1] });
      return { bonds };
    }
    
    // For 3+ atoms, find central atom and bond others to it
    const centralAtom = this.findBestCentralAtom(atoms);
    const otherAtoms = atoms.filter(a => a !== centralAtom);
    
    for (const atom of otherAtoms) {
      bonds.push({ atomA: centralAtom, atomB: atom });
    }
    
    return { centralAtom, bonds };
  }

  private addTemporaryBondBlock(atoms: Atom[]): void {
    // Temporarily prevent these atoms from forming new bonds
    // This is a placeholder - in practice we could use a Set to track blocked atoms
    console.log('Temporarily blocking bonds for', atoms.length, 'atoms');
    
    // Remove block after a short delay
    setTimeout(() => {
      console.log('Bond block removed for', atoms.length, 'atoms');
    }, 500);
  }

  private attemptMolecularReactions(): void {
    if (this.reactionInProgress) return;
    
    // Only attempt reactions if user has applied energy via Heat Pulse
    if (this.transientHeatEnergy > 20) {
      const systemEnergy = this.calculateSystemEnergy();
      console.log(`Attempting molecular reactions with energy: ${systemEnergy.toFixed(2)}`);
      this.attemptComplexMolecularFormation(systemEnergy);
    }
  }

  private attemptComplexMolecularFormation(systemEnergy: number): void {
    // First try molecule + molecule reactions (like 2H2 + O2 -> 2H2O)
    this.attemptMoleculeMoleculeReactions(systemEnergy);
    
    // If no molecule reactions occurred, try atom + molecule combinations
    if (!this.reactionInProgress) {
      this.attemptAtomMoleculeCombinations(systemEnergy);
    }
    
    // If no reactions occurred, try multi-atom combinations
    if (!this.reactionInProgress) {
      this.attemptMultiAtomCombinations(systemEnergy);
    }
  }

  private attemptAtomMoleculeCombinations(systemEnergy: number): void {
    const proximityThreshold = 8;
    
    // Generic approach: evaluate all atom-molecule combinations
    for (const atom of this.atoms) {
      if (atom.isMoleculeMember) continue;
      
      for (const molecule of this.molecules) {
        const distance = atom.physicalBody.position.distanceTo(molecule.physicalBody.position);
        if (distance < proximityThreshold) {
          if (this.canAtomJoinMolecule(atom, molecule, systemEnergy)) {
            this.performGenericAtomMoleculeReaction(atom, molecule, systemEnergy);
            return; // Only one reaction per frame
          }
        }
      }
    }
    
    // Also check for multi-atom combinations (like H + H + O -> H2O)
    this.attemptMultiAtomCombinations(systemEnergy);
  }

  private canAtomJoinMolecule(atom: Atom, molecule: Molecule, systemEnergy: number): boolean {
    // Check if atom can bond to molecule to form a stable compound
    const combinedAtoms = [atom, ...molecule.atoms];
    
    // Check if this would form a known stable molecule
    if (this.isChemicallyStable(combinedAtoms)) {
      const requiredEnergy = this.calculateAtomMoleculeActivationEnergy(atom, molecule);
      const canReact = systemEnergy >= requiredEnergy;
      
      if (canReact) {
        console.log(`Atom-molecule reaction possible: ${atom.elementName} + ${molecule.name}, energy: ${systemEnergy.toFixed(2)}/${requiredEnergy}`);
      }
      
      return canReact;
    }
    
    return false;
  }

  private calculateAtomMoleculeActivationEnergy(atom: Atom, molecule: Molecule): number {
    // Energy needed for atom to join molecule
    let baseEnergy = 10;
    
    // Special cases for common reactions
    if (atom.protons === 6 && molecule.name.includes('Oxygen Gas')) {
      return 15; // C + O2 -> CO2
    }
    if (atom.protons === 1 && molecule.name.includes('Oxygen')) {
      return 8; // H + O -> HO
    }
    
    return baseEnergy + molecule.atoms.length * 3;
  }

  private performCO2Formation(carbon: Atom, o2Molecule: Molecule, systemEnergy: number): void {
    console.log(`Forming CO2: ${carbon.elementName} + ${o2Molecule.name}`);
    this.reactionInProgress = true;
    
    const centerPosition = carbon.physicalBody.position;
    
    // Remove O2 molecule and get its atoms
    this.molecules = this.molecules.filter(m => m.id !== o2Molecule.id);
    this.scene.remove(o2Molecule.visual);
    this.world.removeBody(o2Molecule.physicalBody);
    
    const oxygenAtoms = o2Molecule.atoms;
    
    // Position all atoms for linear CO2 structure: O-C-O
    carbon.physicalBody.position.set(centerPosition.x, centerPosition.y, centerPosition.z);
    carbon.physicalBody.velocity.set(0, 0, 0);
    carbon.isMoleculeMember = false; // Reset carbon to be available for new molecule
    
    oxygenAtoms.forEach((oxygen, index) => {
      oxygen.isMoleculeMember = false;
      
      // Position oxygens very close to carbon for bonding
      const targetX = centerPosition.x + (index === 0 ? -1.5 : 1.5);
      oxygen.physicalBody.position.set(targetX, centerPosition.y, centerPosition.z);
      oxygen.physicalBody.velocity.set(0, 0, 0);
      oxygen.physicalBody.angularVelocity.set(0, 0, 0);
      
      // Disable physics temporarily to prevent movement
      oxygen.physicalBody.type = CANNON.Body.KINEMATIC;
      
      this.scene.add(oxygen.visuals.nucleus, oxygen.visuals.electrons, oxygen.visuals.elementName);
      this.world.addBody(oxygen.physicalBody);
    });
    
    // Consume significant energy for the reaction
    const energyConsumed = Math.max(15, this.transientHeatEnergy * 0.8);
    this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
    console.log(`CO2 formation energy consumed: ${energyConsumed}, remaining: ${this.transientHeatEnergy}`);
    
    // Force position atoms and create bonds immediately
    setTimeout(() => {
      console.log('Creating C-O bonds for CO2...');
      let bondsCreated = 0;
      
      // Force final positioning and create bonds
      oxygenAtoms.forEach((oxygen, index) => {
        // Force exact positioning
        const targetX = centerPosition.x + (index === 0 ? -1.5 : 1.5);
        oxygen.physicalBody.position.set(targetX, centerPosition.y, centerPosition.z);
        
        const distance = carbon.physicalBody.position.distanceTo(oxygen.physicalBody.position);
        console.log(`C-O${index + 1} distance: ${distance.toFixed(2)}`);
        
        // Create bond regardless of distance since we forced positioning
        this.createBond(carbon, oxygen, true); // Suppress identification until all bonds created
        bondsCreated++;
        console.log(`Created C-O bond ${bondsCreated}`);
        
        // Re-enable physics after bonding
        oxygen.physicalBody.type = CANNON.Body.DYNAMIC;
      });
      
      console.log(`Total C-O bonds created: ${bondsCreated}`);
      
      // Identify the new molecule
      setTimeout(() => {
        // Ensure all atoms are marked as free before identification
        carbon.isMoleculeMember = false;
        oxygenAtoms.forEach(oxygen => {
          oxygen.isMoleculeMember = false;
        });
        
        console.log('Identifying CO2 molecule...');
        this.identifyMolecules();
        
        // Mark atoms as molecule members after identification to prevent further reactions
        setTimeout(() => {
          const co2Molecule = this.molecules.find(m => m.name.includes('Carbon Dioxide'));
          if (co2Molecule) {
            co2Molecule.atoms.forEach(atom => {
              atom.isMoleculeMember = true;
            });
          }
          this.reactionInProgress = false;
          console.log(`CO2 formation complete - ${bondsCreated} bonds created`);
        }, 50);
      }, 200);
    }, 50);
  }

  private performGenericAtomMoleculeReaction(atom: Atom, molecule: Molecule, systemEnergy: number): void {
    console.log(`Generic atom-molecule reaction: ${atom.elementName} + ${molecule.name}`);
    this.reactionInProgress = true;
    
    // Generic case: add atom to existing molecule
    this.addAtomToMolecule(atom, molecule, systemEnergy);
  }

  private performGenericMoleculeReaction(molecules: Molecule[], systemEnergy: number): void {
    console.log(`Generic molecule-molecule reaction with ${molecules.length} molecules`);
    this.reactionInProgress = true;
    
    // Extract all atoms from the molecules
    const allAtoms: Atom[] = [];
    
    // Remove all reactant molecules and collect their atoms
    molecules.forEach(molecule => {
      this.molecules = this.molecules.filter(m => m.id !== molecule.id);
      this.scene.remove(molecule.visual);
      this.world.removeBody(molecule.physicalBody);
      allAtoms.push(...molecule.atoms);
    });
    
    // Mark all atoms as free and add them back to the scene
    allAtoms.forEach(atom => {
      atom.isMoleculeMember = false;
      if (!this.scene.children.includes(atom.visuals.nucleus)) {
        this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
        this.world.addBody(atom.physicalBody);
      }
    });
    
    // Consume energy for breaking bonds
    const energyConsumed = Math.max(10, systemEnergy * 0.7);
    this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
    console.log(`Molecule reaction energy consumed: ${energyConsumed}, remaining: ${this.transientHeatEnergy}`);
    
    // Use generic system to form new molecules from the free atoms
    this.formMoleculesFromAtoms(allAtoms);
  }

  private formMoleculesFromAtoms(atoms: Atom[]): void {
    console.log(`Forming molecules from ${atoms.length} atoms`);
    
    const processedAtoms = new Set<string>();
    
    // First, try to form the most stable molecules based on available atoms
    const elementCounts = this.getElementCounts(atoms);
    const h = elementCounts.get(1) || 0;
    const c = elementCounts.get(6) || 0;
    const n = elementCounts.get(7) || 0;
    const o = elementCounts.get(8) || 0;
    
    console.log(`Available atoms: ${h}H, ${c}C, ${n}N, ${o}O`);
    
    // Priority order: form most stable molecules first
    // 1. Water (H2O) - if we have H and O
    if (h >= 2 && o >= 1) {
      const waterMolecules = Math.min(Math.floor(h/2), o);
      console.log(`Attempting to form ${waterMolecules} water molecules`);
      for (let i = 0; i < waterMolecules; i++) {
        this.formSpecificMolecule(atoms, processedAtoms, 'H2O');
      }
    }
    
    // 2. Methane (CH4) - if we have C and H
    const remainingH = atoms.filter(a => a.protons === 1 && !processedAtoms.has(a.id.toString())).length;
    const remainingC = atoms.filter(a => a.protons === 6 && !processedAtoms.has(a.id.toString())).length;
    if (remainingH >= 4 && remainingC >= 1) {
      const methaneMolecules = Math.min(Math.floor(remainingH/4), remainingC);
      for (let i = 0; i < methaneMolecules; i++) {
        this.formSpecificMolecule(atoms, processedAtoms, 'CH4');
      }
    }
    
    // 3. Ammonia (NH3) - if we have N and H
    const stillRemainingH = atoms.filter(a => a.protons === 1 && !processedAtoms.has(a.id.toString())).length;
    const remainingN = atoms.filter(a => a.protons === 7 && !processedAtoms.has(a.id.toString())).length;
    if (stillRemainingH >= 3 && remainingN >= 1) {
      const ammoniaMolecules = Math.min(Math.floor(stillRemainingH/3), remainingN);
      for (let i = 0; i < ammoniaMolecules; i++) {
        this.formSpecificMolecule(atoms, processedAtoms, 'NH3');
      }
    }
    
    // 4. Form diatomic molecules from remaining atoms
    this.formDiatomicMolecules(atoms, processedAtoms);
    
    // Identify all molecules after bond creation with longer delay
    setTimeout(() => {
      this.identifyMolecules();
      this.reactionInProgress = false;
      console.log('Generic molecule formation complete');
    }, 200);
  }
  
  private formSpecificMolecule(atoms: Atom[], processedAtoms: Set<string>, moleculeType: string): void {
    const availableAtoms = atoms.filter(a => !processedAtoms.has(a.id.toString()));
    
    if (moleculeType === 'H2O') {
      const oxygens = availableAtoms.filter(a => a.protons === 8);
      const hydrogens = availableAtoms.filter(a => a.protons === 1);
      
      if (oxygens.length >= 1 && hydrogens.length >= 2) {
        const moleculeAtoms = [oxygens[0], hydrogens[0], hydrogens[1]];
        console.log('Forming H2O molecule with atoms:', moleculeAtoms.map(a => `${a.elementName}-${a.id}`));
        this.createMoleculeFromAtoms(moleculeAtoms, processedAtoms);
      }
    } else if (moleculeType === 'CH4') {
      const carbons = availableAtoms.filter(a => a.protons === 6);
      const hydrogens = availableAtoms.filter(a => a.protons === 1);
      
      if (carbons.length >= 1 && hydrogens.length >= 4) {
        const moleculeAtoms = [carbons[0], hydrogens[0], hydrogens[1], hydrogens[2], hydrogens[3]];
        console.log('Forming CH4 molecule with atoms:', moleculeAtoms.map(a => `${a.elementName}-${a.id}`));
        this.createMoleculeFromAtoms(moleculeAtoms, processedAtoms);
      }
    } else if (moleculeType === 'NH3') {
      const nitrogens = availableAtoms.filter(a => a.protons === 7);
      const hydrogens = availableAtoms.filter(a => a.protons === 1);
      
      if (nitrogens.length >= 1 && hydrogens.length >= 3) {
        const moleculeAtoms = [nitrogens[0], hydrogens[0], hydrogens[1], hydrogens[2]];
        console.log('Forming NH3 molecule with atoms:', moleculeAtoms.map(a => `${a.elementName}-${a.id}`));
        this.createMoleculeFromAtoms(moleculeAtoms, processedAtoms);
      }
    }
  }
  
  private formDiatomicMolecules(atoms: Atom[], processedAtoms: Set<string>): void {
    const availableAtoms = atoms.filter(a => !processedAtoms.has(a.id.toString()));
    
    // Group by element type
    const elementGroups = new Map<number, Atom[]>();
    availableAtoms.forEach(atom => {
      const protons = atom.protons;
      if (!elementGroups.has(protons)) {
        elementGroups.set(protons, []);
      }
      elementGroups.get(protons)!.push(atom);
    });
    
    // Form diatomic molecules (H2, O2, N2, etc.)
    elementGroups.forEach((atomsOfType, protons) => {
      while (atomsOfType.length >= 2) {
        const atom1 = atomsOfType.shift()!;
        const atom2 = atomsOfType.shift()!;
        
        if (!processedAtoms.has(atom1.id.toString()) && !processedAtoms.has(atom2.id.toString())) {
          console.log(`Forming diatomic molecule: ${atom1.elementName}2`);
          this.createMoleculeFromAtoms([atom1, atom2], processedAtoms);
        }
      }
    });
  }
  
  private createMoleculeFromAtoms(moleculeAtoms: Atom[], processedAtoms: Set<string>): void {
    console.log(`Creating molecule from atoms:`, moleculeAtoms.map(a => `${a.elementName}-${a.id}`));
    
    // Ensure all atoms are in the scene and not part of other molecules
    moleculeAtoms.forEach(atom => {
      atom.isMoleculeMember = false;
      if (!this.scene.children.includes(atom.visuals.nucleus)) {
        this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
        this.world.addBody(atom.physicalBody);
      }
    });
    
    // Position atoms optimally based on molecular geometry
    this.positionAtomsForMolecule(moleculeAtoms);
    
    // Create bonds between atoms with delay to ensure positioning
    setTimeout(() => {
      this.createMolecularBonds(moleculeAtoms);
      
      // Mark atoms as processed
      moleculeAtoms.forEach(atom => {
        processedAtoms.add(atom.id.toString());
        atom.isMoleculeMember = true;
      });
      
      console.log(`Molecule creation complete for ${moleculeAtoms.length} atoms`);
    }, 50);
  }

  private generateAtomCombinations(atoms: Atom[], size: number): Atom[][] {
    if (size === 1) return atoms.map(a => [a]);
    if (size > atoms.length) return [];
    
    const combinations: Atom[][] = [];
    
    for (let i = 0; i <= atoms.length - size; i++) {
      const smallerCombinations = this.generateAtomCombinations(atoms.slice(i + 1), size - 1);
      smallerCombinations.forEach(combo => {
        combinations.push([atoms[i], ...combo]);
      });
    }
    
    return combinations;
  }

  private areAtomsCloseEnough(atoms: Atom[], threshold: number): boolean {
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const distance = atoms[i].physicalBody.position.distanceTo(atoms[j].physicalBody.position);
        if (distance > threshold) return false;
      }
    }
    return true;
  }

  private positionAtomsForMolecule(atoms: Atom[]): void {
    // Get the center position
    const centerPos = atoms[0].physicalBody.position.clone();
    
    // Position atoms based on molecular geometry
    if (atoms.length === 2) {
      // Linear molecule (H2, O2, etc.)
      this.positionLinearMolecule(atoms, centerPos);
    } else if (atoms.length === 3) {
      // Could be linear (CO2) or bent (H2O)
      const elementCounts = this.getElementCounts(atoms);
      if (elementCounts.get(6) === 1 && elementCounts.get(8) === 2) {
        // CO2 - linear
        this.positionLinearTriatomic(atoms, centerPos);
      } else {
        // H2O or similar - bent
        this.positionBentMolecule(atoms, centerPos);
      }
    } else if (atoms.length === 4) {
      // Tetrahedral (CH4, NH3 + H)
      this.positionTetrahedralMolecule(atoms, centerPos);
    } else if (atoms.length === 5) {
      // CH4 or similar
      this.positionTetrahedralMolecule(atoms, centerPos);
    }
    
    // Set all atoms to kinematic temporarily
    atoms.forEach(atom => {
      atom.physicalBody.velocity.set(0, 0, 0);
      atom.physicalBody.type = CANNON.Body.KINEMATIC;
    });
  }

  private positionLinearMolecule(atoms: Atom[], center: CANNON.Vec3): void {
    const bondLength = 1.5;
    atoms[0].physicalBody.position.set(center.x - bondLength/2, center.y, center.z);
    atoms[1].physicalBody.position.set(center.x + bondLength/2, center.y, center.z);
  }

  private positionLinearTriatomic(atoms: Atom[], center: CANNON.Vec3): void {
    // Find carbon atom (central)
    const carbon = atoms.find(a => a.protons === 6);
    const oxygens = atoms.filter(a => a.protons === 8);
    
    if (carbon && oxygens.length === 2) {
      carbon.physicalBody.position.set(center.x, center.y, center.z);
      oxygens[0].physicalBody.position.set(center.x - 1.5, center.y, center.z);
      oxygens[1].physicalBody.position.set(center.x + 1.5, center.y, center.z);
    }
  }

  private positionBentMolecule(atoms: Atom[], center: CANNON.Vec3): void {
    // Find central atom (usually oxygen)
    const central = atoms.find(a => a.protons === 8) || atoms[0];
    const others = atoms.filter(a => a.id !== central.id);
    
    central.physicalBody.position.set(center.x, center.y, center.z);
    
    const bondLength = 1.5;
    const angle = Math.PI * 104.5 / 180 / 2; // Half the H-O-H angle
    
    if (others.length >= 1) {
      others[0].physicalBody.position.set(
        center.x + bondLength * Math.cos(angle),
        center.y + bondLength * Math.sin(angle),
        center.z
      );
    }
    if (others.length >= 2) {
      others[1].physicalBody.position.set(
        center.x + bondLength * Math.cos(-angle),
        center.y + bondLength * Math.sin(-angle),
        center.z
      );
    }
  }

  private positionTetrahedralMolecule(atoms: Atom[], center: CANNON.Vec3): void {
    // Find central atom (usually carbon or nitrogen)
    const central = atoms.find(a => a.protons === 6 || a.protons === 7) || atoms[0];
    const others = atoms.filter(a => a.id !== central.id);
    
    central.physicalBody.position.set(center.x, center.y, center.z);
    
    const bondLength = 1.5;
    const tetrahedralAngle = Math.acos(-1/3); // ~109.47 degrees
    
    // Position other atoms in tetrahedral geometry
    others.forEach((atom, index) => {
      const phi = (2 * Math.PI * index) / others.length;
      const x = center.x + bondLength * Math.sin(tetrahedralAngle) * Math.cos(phi);
      const y = center.y + bondLength * Math.sin(tetrahedralAngle) * Math.sin(phi);
      const z = center.z + bondLength * Math.cos(tetrahedralAngle);
      
      atom.physicalBody.position.set(x, y, z);
    });
  }

  private createMolecularBonds(atoms: Atom[]): void {
    // Create bonds based on molecular structure
    if (atoms.length === 2) {
      // Simple diatomic bond
      this.createBond(atoms[0], atoms[1], true);
    } else if (atoms.length === 3) {
      // Check if linear or bent
      const elementCounts = this.getElementCounts(atoms);
      if (elementCounts.get(6) === 1 && elementCounts.get(8) === 2) {
        // CO2 - carbon bonds to both oxygens
        const carbon = atoms.find(a => a.protons === 6)!;
        const oxygens = atoms.filter(a => a.protons === 8);
        this.createBond(carbon, oxygens[0], true);
        this.createBond(carbon, oxygens[1], true);
      } else {
        // H2O or similar - central atom bonds to others
        const central = atoms.find(a => a.protons === 8) || atoms[0];
        const others = atoms.filter(a => a.id !== central.id);
        others.forEach(atom => this.createBond(central, atom, true));
      }
    } else {
      // Multi-atom molecule - central atom bonds to all others
      const central = atoms.find(a => a.protons === 6 || a.protons === 7) || atoms[0];
      const others = atoms.filter(a => a.id !== central.id);
      others.forEach(atom => this.createBond(central, atom, true));
    }
    
    // Re-enable physics after a delay
    setTimeout(() => {
      atoms.forEach(atom => {
        atom.physicalBody.type = CANNON.Body.DYNAMIC;
      });
    }, 100);
  }

  private getElementCounts(atoms: Atom[]): Map<number, number> {
    const counts = new Map<number, number>();
    atoms.forEach(atom => {
      const count = counts.get(atom.protons) || 0;
      counts.set(atom.protons, count + 1);
    });
    return counts;
  }

  private addAtomToMolecule(atom: Atom, molecule: Molecule, systemEnergy: number): void {
    console.log(`Adding ${atom.elementName} to ${molecule.name}`);
    
    // Position atom close to molecule
    const targetPosition = molecule.visual.position.clone();
    atom.physicalBody.position.set(
      targetPosition.x + (Math.random() - 0.5) * 3,
      targetPosition.y + (Math.random() - 0.5) * 3,
      targetPosition.z + (Math.random() - 0.5) * 3
    );
    atom.physicalBody.velocity.set(0, 0, 0);
    atom.physicalBody.type = CANNON.Body.KINEMATIC;
    
    // Remove the original molecule
    this.molecules = this.molecules.filter(m => m.id !== molecule.id);
    this.scene.remove(molecule.visual);
    this.world.removeBody(molecule.physicalBody);
    
    // Make all atoms available for bonding
    const allAtoms = [atom, ...molecule.atoms];
    allAtoms.forEach(a => {
      a.isMoleculeMember = false;
      if (!this.scene.children.includes(a.visuals.nucleus)) {
        this.scene.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
        this.world.addBody(a.physicalBody);
      }
    });
    
    // Consume energy
    const energyConsumed = this.calculateAtomMoleculeActivationEnergy(atom, molecule);
    this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
    
    // Position atoms optimally and create bonds
    setTimeout(() => {
      this.createOptimalMolecularStructure(allAtoms, systemEnergy);
    }, 50);
  }

  private performAtomMoleculeReaction(atom: Atom, molecule: Molecule, systemEnergy: number): void {
    console.log(`Attempting ${atom.elementName} + ${molecule.name} reaction`);
    this.reactionInProgress = true;
    
    const targetPosition = molecule.visual.position.clone();
    
    // Position atom very close to molecule center
    atom.physicalBody.position.set(
      targetPosition.x + 1.5,
      targetPosition.y,
      targetPosition.z
    );
    atom.physicalBody.velocity.set(0, 0, 0);
    
    // Remove the old molecule from simulation but keep its atoms
    this.molecules = this.molecules.filter(m => m.id !== molecule.id);
    this.scene.remove(molecule.visual);
    this.world.removeBody(molecule.physicalBody);
    
    // Position molecule atoms close to the new atom for bonding
    molecule.atoms.forEach((a, index) => {
      a.isMoleculeMember = false;
      
      // Default positioning
      a.physicalBody.position.set(
        targetPosition.x + (index * 2 - 1),
        targetPosition.y,
        targetPosition.z
      );
      
      a.physicalBody.velocity.set(0, 0, 0);
      this.scene.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
      this.world.addBody(a.physicalBody);
    });
    
    // Keep some energy available for bonding and delay energy consumption
    const energyConsumed = this.calculateAtomMoleculeActivationEnergy(atom, molecule) * 0.5;
    setTimeout(() => {
      if (this.canFormBondWithEnergy(atom, molecule.atoms[0], this.calculateSystemEnergy())) {
        this.consumeActivationEnergy(atom, molecule.atoms[0]);
        console.log(`Energy consumed: ${energyConsumed}, remaining: ${this.transientHeatEnergy}`);
      }
    }, 50);
    
    setTimeout(() => {
      this.reactionInProgress = false;
      console.log('Atom-molecule reaction complete, allowing natural bonding');
      // Force bonding attempts
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          this.checkAndCreateBonds();
          if (i === 2) {
            setTimeout(() => this.identifyMolecules(), 50);
          }
        }, i * 50);
      }
    }, 150);
  }

  private attemptComplexMultiEntityReactions(systemEnergy: number): void {
    // Only for very high energy complex reactions involving multiple molecules
    const proximityThreshold = 6;
    const candidates: {atoms: Atom[], molecules: Molecule[]}[] = [];
    
    // Find groups of multiple entities that are very close together
    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      if (atom.isMoleculeMember) continue;
      
      const nearbyEntities = this.findNearbyEntities(atom, proximityThreshold);
      if (nearbyEntities.molecules.length >= 2) { // Only if multiple molecules involved
        candidates.push(nearbyEntities);
      }
    }
    
    // Evaluate each candidate group for potential reactions
    for (const candidate of candidates) {
      if (this.canFormComplexMolecule(candidate, systemEnergy)) {
        this.attemptComplexReaction(candidate, systemEnergy);
        break; // Only one reaction per frame
      }
    }
  }

  private findNearbyEntities(centerAtom: Atom, proximity: number): {atoms: Atom[], molecules: Molecule[]} {
    const nearbyAtoms = this.atoms.filter(a => 
      !a.isMoleculeMember && 
      a.id !== centerAtom.id &&
      a.physicalBody.position.distanceTo(centerAtom.physicalBody.position) < proximity
    );
    
    const nearbyMolecules = this.molecules.filter(m =>
      m.physicalBody.position.distanceTo(centerAtom.physicalBody.position) < proximity
    );
    
    return { atoms: [centerAtom, ...nearbyAtoms], molecules: nearbyMolecules };
  }

  private canFormComplexMolecule(entities: {atoms: Atom[], molecules: Molecule[]}, systemEnergy: number): boolean {
    // Check if this combination can form a stable molecule based on valence rules
    const totalAtoms = [...entities.atoms];
    
    // Add atoms from molecules to the total count
    entities.molecules.forEach(m => totalAtoms.push(...m.atoms));
    
    // Calculate if this combination would be chemically stable
    return this.isChemicallyStable(totalAtoms) && systemEnergy > (totalAtoms.length * 8);
  }

  private isChemicallyStable(atoms: Atom[]): boolean {
    // Check if the combination follows chemical rules
    const elementCounts = new Map<number, number>();
    atoms.forEach(a => {
      const count = elementCounts.get(a.protons) || 0;
      elementCounts.set(a.protons, count + 1);
    });
    
    // Basic stability rules based on common molecular formulas
    const h = elementCounts.get(1) || 0;
    const c = elementCounts.get(6) || 0;
    const n = elementCounts.get(7) || 0;
    const o = elementCounts.get(8) || 0;
    const f = elementCounts.get(9) || 0;
    
    // Check for known stable combinations
    if (c === 1 && o === 2 && atoms.length === 3) return true; // CO2
    if (c === 1 && h === 4 && atoms.length === 5) return true; // CH4
    if (o === 1 && h === 2 && atoms.length === 3) return true; // H2O
    if (n === 1 && h === 3 && atoms.length === 4) return true; // NH3
    if (h === 2 && atoms.length === 2) return true; // H2
    if (o === 2 && atoms.length === 2) return true; // O2
    if (n === 2 && atoms.length === 2) return true; // N2
    if (c === 1 && o === 1 && atoms.length === 2) return true; // CO
    if (n === 1 && o === 1 && atoms.length === 2) return true; // NO
    if (h === 1 && f === 1 && atoms.length === 2) return true; // HF
    
    // Allow unknown combinations if they follow basic valence rules
    if (atoms.length >= 2 && atoms.length <= 6) {
      return this.followsValenceRules(atoms);
    }
    
    return false;
  }

  private attemptMoleculeMoleculeReactions(systemEnergy: number): void {
    const proximityThreshold = 10;
    
    // Check for 2H2 + O2 -> 2H2O reaction
    const h2Molecules = this.molecules.filter(m => m.name.includes('Hydrogen Gas'));
    const o2Molecules = this.molecules.filter(m => m.name.includes('Oxygen Gas'));
    
    console.log(`Checking molecule-molecule reactions: ${h2Molecules.length} H2, ${o2Molecules.length} O2`);
    
    if (h2Molecules.length >= 2 && o2Molecules.length >= 1) {
      // Find closest H2 molecules to O2
      for (const o2 of o2Molecules) {
        const nearbyH2 = h2Molecules.filter(h2 => {
          const distance = h2.physicalBody.position.distanceTo(o2.physicalBody.position);
          return distance < proximityThreshold;
        });
        
        if (nearbyH2.length >= 2 && systemEnergy >= 12) {
          console.log(`Water formation possible: 2H2 + O2 -> 2H2O, energy: ${systemEnergy}`);
          this.performGenericMoleculeReaction([...nearbyH2.slice(0, 2), o2], systemEnergy);
          return;
        }
      }
    }
    
    // Check for other molecule + molecule reactions
    // N2 + 3H2 -> 2NH3, etc.
    this.checkOtherMoleculeMoleculeReactions(systemEnergy);
  }

  private attemptMultiAtomCombinations(systemEnergy: number): void {
    const proximityThreshold = 6;
    const freeAtoms = this.atoms.filter(a => !a.isMoleculeMember);
    
    console.log(`Checking multi-atom combinations: ${freeAtoms.length} free atoms available`);
    console.log('Free atoms:', freeAtoms.map(a => `${a.elementName}-${a.id}`));
    
    // Look for groups of 2-4 atoms that could form molecules
    for (let i = 0; i < freeAtoms.length; i++) {
      for (let j = i + 1; j < freeAtoms.length; j++) {
        const atomA = freeAtoms[i];
        const atomB = freeAtoms[j];
        const distance = atomA.physicalBody.position.distanceTo(atomB.physicalBody.position);
        
        if (distance < proximityThreshold) {
          console.log(`Close atoms found: ${atomA.elementName}-${atomA.id} + ${atomB.elementName}-${atomB.id}, distance: ${distance.toFixed(2)}`);
          
          // Check for 2-atom combinations
          if (this.isChemicallyStable([atomA, atomB])) {
            const requiredEnergy = this.getMinimumActivationEnergy(atomA, atomB);
            console.log(`2-atom stable combination possible: ${atomA.elementName} + ${atomB.elementName}, energy: ${systemEnergy}/${requiredEnergy}`);
            if (systemEnergy >= requiredEnergy) {
              console.log(`Multi-atom combination: ${atomA.elementName} + ${atomB.elementName}`);
              this.createBond(atomA, atomB, true);
              setTimeout(() => this.identifyMolecules(), 100);
              return;
            }
          }
          
          // Check for 3-atom combinations (like H2O)
          for (let k = j + 1; k < freeAtoms.length; k++) {
            const atomC = freeAtoms[k];
            const distanceAC = atomA.physicalBody.position.distanceTo(atomC.physicalBody.position);
            const distanceBC = atomB.physicalBody.position.distanceTo(atomC.physicalBody.position);
            
            if (distanceAC < proximityThreshold && distanceBC < proximityThreshold) {
              const threeAtoms = [atomA, atomB, atomC];
              console.log(`3-atom group found: ${atomA.elementName}-${atomA.id} + ${atomB.elementName}-${atomB.id} + ${atomC.elementName}-${atomC.id}`);
              console.log(`Distances: A-C=${distanceAC.toFixed(2)}, B-C=${distanceBC.toFixed(2)}`);
              
              if (this.isChemicallyStable(threeAtoms)) {
                const threeAtomEnergy = 20;
                console.log(`3-atom stable combination: ${atomA.elementName} + ${atomB.elementName} + ${atomC.elementName}, energy: ${systemEnergy}/${threeAtomEnergy}`);
                if (systemEnergy >= threeAtomEnergy) {
                  console.log(`Creating 3-atom combination: ${atomA.elementName} + ${atomB.elementName} + ${atomC.elementName}`);
                  this.createOptimalMolecularStructure(threeAtoms, systemEnergy);
                  return;
                } else {
                  console.log(`Insufficient energy for 3-atom combination: ${systemEnergy} < ${threeAtomEnergy}`);
                }
              } else {
                console.log(`3-atom combination not chemically stable`);
              }
            }
          }
        }
      }
    }
    console.log('No multi-atom combinations found or insufficient energy');
  }

  private createOptimalMolecularStructure(atoms: Atom[], systemEnergy: number): void {
    console.log(`Creating optimal structure for ${atoms.length} atoms`);
    this.reactionInProgress = true;
    
    // Position atoms close together
    const centerPos = atoms[0].physicalBody.position;
    atoms.forEach((atom, index) => {
      atom.isMoleculeMember = false;
      atom.physicalBody.type = CANNON.Body.KINEMATIC;
      
      if (index > 0) {
        // Position other atoms around the first one
        const angle = (index - 1) * (2 * Math.PI / (atoms.length - 1));
        const radius = 1.5;
        atom.physicalBody.position.set(
          centerPos.x + Math.cos(angle) * radius,
          centerPos.y + Math.sin(angle) * radius,
          centerPos.z
        );
      }
      atom.physicalBody.velocity.set(0, 0, 0);
    });
    
    // Create bonds between atoms
    setTimeout(() => {
      let bondsCreated = 0;
      for (let i = 0; i < atoms.length; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const distance = atoms[i].physicalBody.position.distanceTo(atoms[j].physicalBody.position);
          if (distance < 3.0) {
            this.createBond(atoms[i], atoms[j], true);
            bondsCreated++;
          }
        }
      }
      
      // Re-enable physics
      atoms.forEach(atom => {
        atom.physicalBody.type = CANNON.Body.DYNAMIC;
      });
      
      // Consume energy
      const energyConsumed = bondsCreated * 8;
      this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
      
      setTimeout(() => {
        this.identifyMolecules();
        this.reactionInProgress = false;
      }, 200);
    }, 100);
  }

  private followsValenceRules(atoms: Atom[]): boolean {
    // Basic valence rule check - atoms should be able to satisfy their valence electrons
    const elementCounts = new Map<number, number>();
    atoms.forEach(a => {
      const count = elementCounts.get(a.protons) || 0;
      elementCounts.set(a.protons, count + 1);
    });
    
    // Simple heuristic: if total valence electrons can be shared reasonably
    let totalValenceElectrons = 0;
    atoms.forEach(atom => {
      const valence = this.valenceElectrons[atom.protons] || 4;
      totalValenceElectrons += valence;
    });
    
    // Rough rule: total valence should allow for reasonable bonding
    const expectedBonds = Math.floor(totalValenceElectrons / 2);
    const maxPossibleBonds = (atoms.length * (atoms.length - 1)) / 2;
    
    return expectedBonds <= maxPossibleBonds && atoms.length <= 6;
  }

  private performWaterFormation(h2Molecules: Molecule[], o2Molecule: Molecule, systemEnergy: number): void {
    console.log(`Performing water formation: 2H2 + O2 -> 2H2O`);
    this.reactionInProgress = true;
    
    // Remove reactant molecules and get their atoms
    const allAtoms: Atom[] = [];
    
    // Remove H2 molecules
    h2Molecules.forEach(h2 => {
      this.molecules = this.molecules.filter(m => m.id !== h2.id);
      this.scene.remove(h2.visual);
      this.world.removeBody(h2.physicalBody);
      allAtoms.push(...h2.atoms);
    });
    
    // Remove O2 molecule
    this.molecules = this.molecules.filter(m => m.id !== o2Molecule.id);
    this.scene.remove(o2Molecule.visual);
    this.world.removeBody(o2Molecule.physicalBody);
    allAtoms.push(...o2Molecule.atoms);
    
    // Mark all atoms as free
    allAtoms.forEach(atom => {
      atom.isMoleculeMember = false;
      if (!this.scene.children.includes(atom.visuals.nucleus)) {
        this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
        this.world.addBody(atom.physicalBody);
      }
    });
    
    // Separate hydrogen and oxygen atoms
    const hydrogenAtoms = allAtoms.filter(a => a.protons === 1);
    const oxygenAtoms = allAtoms.filter(a => a.protons === 8);
    
    console.log(`Creating 2 H2O molecules from ${hydrogenAtoms.length} H atoms and ${oxygenAtoms.length} O atoms`);
    
    // Create 2 H2O molecules
    this.createTwoWaterMolecules(hydrogenAtoms, oxygenAtoms, systemEnergy);
  }

  private createTwoWaterMolecules(hydrogenAtoms: Atom[], oxygenAtoms: Atom[], systemEnergy: number): void {
    if (hydrogenAtoms.length < 4 || oxygenAtoms.length < 2) {
      console.log('Insufficient atoms for 2 H2O molecules');
      this.reactionInProgress = false;
      return;
    }
    
    // Create first H2O molecule
    const h2o1Atoms = [oxygenAtoms[0], hydrogenAtoms[0], hydrogenAtoms[1]];
    this.positionWaterMolecule(h2o1Atoms, 0);
    
    // Create second H2O molecule
    const h2o2Atoms = [oxygenAtoms[1], hydrogenAtoms[2], hydrogenAtoms[3]];
    this.positionWaterMolecule(h2o2Atoms, 3);
    
    // Consume energy
    const energyConsumed = 12;
    this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
    
    // Create bonds after positioning
    setTimeout(() => {
      // Create O-H bonds for first molecule
      this.createBond(h2o1Atoms[0], h2o1Atoms[1], true); // O-H
      this.createBond(h2o1Atoms[0], h2o1Atoms[2], true); // O-H
      
      // Create O-H bonds for second molecule
      this.createBond(h2o2Atoms[0], h2o2Atoms[1], true); // O-H
      this.createBond(h2o2Atoms[0], h2o2Atoms[2], true); // O-H
      
      setTimeout(() => {
        this.identifyMolecules();
        this.reactionInProgress = false;
        console.log('Water formation complete - 2 H2O molecules created');
      }, 200);
    }, 100);
  }

  private positionWaterMolecule(atoms: Atom[], offset: number): void {
    const [oxygen, hydrogen1, hydrogen2] = atoms;
    const baseX = offset * 4;
    
    // Position oxygen at center
    oxygen.physicalBody.position.set(baseX, 0, 0);
    oxygen.physicalBody.velocity.set(0, 0, 0);
    oxygen.physicalBody.type = CANNON.Body.KINEMATIC;
    
    // Position hydrogens in bent geometry (104.5° angle)
    const bondLength = 1.8;
    const angle = 104.5 * Math.PI / 180 / 2; // Half angle from center
    
    hydrogen1.physicalBody.position.set(
      baseX + Math.cos(angle) * bondLength,
      Math.sin(angle) * bondLength,
      0
    );
    hydrogen1.physicalBody.velocity.set(0, 0, 0);
    hydrogen1.physicalBody.type = CANNON.Body.KINEMATIC;
    
    hydrogen2.physicalBody.position.set(
      baseX + Math.cos(-angle) * bondLength,
      Math.sin(-angle) * bondLength,
      0
    );
    hydrogen2.physicalBody.velocity.set(0, 0, 0);
    hydrogen2.physicalBody.type = CANNON.Body.KINEMATIC;
    
    // Re-enable physics after short delay
    setTimeout(() => {
      atoms.forEach(atom => {
        atom.physicalBody.type = CANNON.Body.DYNAMIC;
      });
    }, 150);
  }

  private checkOtherMoleculeMoleculeReactions(systemEnergy: number): void {
    console.log('Checking other molecule-molecule reactions...');
    
    const proximityThreshold = 10;
    const h2Molecules = this.molecules.filter(m => m.name.includes('Hydrogen Gas'));
    
    // Check for methane formation: C + 2H2 -> CH4
    const freeCarbon = this.atoms.filter(a => !a.isMoleculeMember && a.protons === 6);
    
    if (freeCarbon.length >= 1 && h2Molecules.length >= 2 && systemEnergy >= 15) {
      for (const carbon of freeCarbon) {
        const nearbyH2 = h2Molecules.filter(h2 => {
          const distance = h2.physicalBody.position.distanceTo(carbon.physicalBody.position);
          return distance < proximityThreshold;
        });
        
        if (nearbyH2.length >= 2) {
          console.log(`Methane formation possible: C + 2H2 -> CH4, energy: ${systemEnergy}`);
          // Include the carbon atom and 2 H2 molecules
          const reactantMolecules = nearbyH2.slice(0, 2);
          const allAtoms = [carbon, ...reactantMolecules.flatMap(m => m.atoms)];
          
          // Remove H2 molecules from scene
          reactantMolecules.forEach(h2 => {
            this.molecules = this.molecules.filter(m => m.id !== h2.id);
            this.scene.remove(h2.visual);
            this.world.removeBody(h2.physicalBody);
          });
          
          // Mark all atoms as free and add to scene
          allAtoms.forEach(atom => {
            atom.isMoleculeMember = false;
            if (!this.scene.children.includes(atom.visuals.nucleus)) {
              this.scene.add(atom.visuals.nucleus, atom.visuals.electrons, atom.visuals.elementName);
              this.world.addBody(atom.physicalBody);
            }
          });
          
          // Use the new formation system
          this.reactionInProgress = true;
          const energyConsumed = Math.max(15, systemEnergy * 0.6);
          this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
          console.log(`Methane formation energy consumed: ${energyConsumed}, remaining: ${this.transientHeatEnergy}`);
          
          this.formMoleculesFromAtoms(allAtoms);
          return;
        }
      }
    }
    
    // Check for ammonia formation: N + 3H2 -> 2NH3
    const freeNitrogen = this.atoms.filter(a => !a.isMoleculeMember && a.protons === 7);
    
    if (freeNitrogen.length >= 1 && h2Molecules.length >= 3 && systemEnergy >= 18) {
      for (const nitrogen of freeNitrogen) {
        const nearbyH2 = h2Molecules.filter(h2 => {
          const distance = h2.physicalBody.position.distanceTo(nitrogen.physicalBody.position);
          return distance < proximityThreshold;
        });
        
        if (nearbyH2.length >= 3) {
          console.log(`Ammonia formation possible: N + 3H2 -> 2NH3, energy: ${systemEnergy}`);
          const reactantMolecules = nearbyH2.slice(0, 3);
          const allAtoms = [nitrogen, ...reactantMolecules.flatMap(m => m.atoms)];
          
          // Remove H2 molecules from scene
          reactantMolecules.forEach(h2 => {
            this.molecules = this.molecules.filter(m => m.id !== h2.id);
            this.scene.remove(h2.visual);
            this.world.removeBody(h2.physicalBody);
          });
          
          // Mark nitrogen as free
          nitrogen.isMoleculeMember = false;
          
          // Use the new formation system
          this.reactionInProgress = true;
          const energyConsumed = Math.max(18, systemEnergy * 0.7);
          this.transientHeatEnergy = Math.max(0, this.transientHeatEnergy - energyConsumed);
          
          this.formMoleculesFromAtoms(allAtoms);
          return;
        }
      }
    }
  }

  private attemptComplexReaction(entities: {atoms: Atom[], molecules: Molecule[]}, systemEnergy: number): void {
    console.log('Attempting complex molecular reaction with energy:', systemEnergy);
    this.reactionInProgress = true;
    
    // Break down existing molecules to atoms
    const allAtoms = [...entities.atoms];
    entities.molecules.forEach(m => {
      this.breakMolecule(m, true);
      allAtoms.push(...m.atoms);
    });
    
    // Consume significant energy for the reaction
    this.transientHeatEnergy *= 0.7; // Consume 30% of transient energy
    
    setTimeout(() => {
      // Let the universal bonding system handle the new molecular formation
      this.reactionInProgress = false;
      console.log('Complex reaction energy consumed, allowing natural bonding');
    }, 200);
  }

  private animate(): void {
    this.frameId = requestAnimationFrame(() => this.animate());
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;
    
    this.world.step(1 / 60);
    
    // Decay transient heat from pulses
    if (this.transientHeatEnergy > 0) {
      this.transientHeatEnergy *= 0.96;
      if (this.transientHeatEnergy < 0.01) this.transientHeatEnergy = 0;
    }
    
    // Apply molecular dynamics to existing molecules
    this.molecules.forEach(molecule => {
      this.chemistryEngine.applyMolecularDynamics(molecule, deltaTime);
    });
    
    this.checkAndCreateBonds();
    if (this.globalHeatEnabled && this.heatIntensity > 0) {
      this.applyGlobalHeatContinuous();
    }
    // Attempt molecular reactions based on recipes
    this.attemptMolecularReactions();
    for (const atom of this.atoms) {
      // Only update individual atoms if they are not part of a molecule
      if (!atom.isMoleculeMember) {
        const { position, quaternion } = atom.physicalBody;
        const nameVisual = atom.visuals.elementName;
        const textWidth = nameVisual.geometry.boundingBox!.max.x - nameVisual.geometry.boundingBox!.min.x;
        atom.visuals.nucleus.position.copy(position as any);
        atom.visuals.nucleus.quaternion.copy(quaternion as any);
        atom.visuals.electrons.position.copy(position as any);
        nameVisual.position.copy(position as any).add(new THREE.Vector3(-textWidth / 2, 5, 0));
        atom.visuals.electrons.rotation.y += 0.002;
      }
    }
    this.updateBondVisuals();
    this.updateMoleculeVisuals();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // New methods for autonomous chemistry system
  private initiateGradualBonding(atomA: Atom, atomB: Atom): void {
    const bondId = `${atomA.id}-${atomB.id}`;
    
    // Prevent duplicate bonding attempts
    if (this.bondingTransitions.has(bondId)) return;
    
    console.log(`Starting gradual bonding between ${atomA.elementName} and ${atomB.elementName}`);
    
    this.bondingTransitions.set(bondId, {
      atomA,
      atomB,
      startTime: Date.now(),
      duration: 2000 // 2 seconds
    });
    
    this.chemistryEngine.createGradualBond(atomA, atomB, (bond: any) => {
      this.bondingTransitions.delete(bondId);
      this.createBond(atomA, atomB, true);
      console.log(`Gradual bonding completed for ${atomA.elementName}-${atomB.elementName}`);
    });
  }

  private generateMolecularFormula(atoms: Atom[]): string {
    const composition = new Map<number, number>();
    atoms.forEach(atom => {
      const count = composition.get(atom.protons) || 0;
      composition.set(atom.protons, count + 1);
    });

    const elementSymbols: { [key: number]: string } = {
      1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 10: 'Ne',
      11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 18: 'Ar'
    };

    const parts: string[] = [];
    const sortedElements = Array.from(composition.entries()).sort((a, b) => a[0] - b[0]);

    for (const [protons, count] of sortedElements) {
      const symbol = elementSymbols[protons] || `E${protons}`;
      if (count === 1) {
        parts.push(symbol);
      } else {
        const subscript = count.toString().split('').map(d => 
          '₀₁₂₃₄₅₆₇₈₉'[parseInt(d)]
        ).join('');
        parts.push(symbol + subscript);
      }
    }

    return parts.join('');
  }

  private createAdvancedMolecule(moleculeId: string, structure: MolecularStructure, atoms: Atom[]): Molecule | null {
    const moleculeMass = atoms.reduce((sum, a) => sum + a.physicalBody.mass, 0);
    const moleculeCenter = new THREE.Vector3();
    atoms.forEach(a => moleculeCenter.add(a.physicalBody.position as any));
    moleculeCenter.divideScalar(atoms.length);

    // Create compound body with enhanced properties
    const compoundBody = new CANNON.Body({
      mass: moleculeMass * 0.8,
      position: new CANNON.Vec3(moleculeCenter.x, moleculeCenter.y, moleculeCenter.z),
      linearDamping: 0.1,
      angularDamping: 0.1,
    });

    const moleculeVisual = new THREE.Group();
    const bondMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00, 
      emissive: 0x00ff00, 
      emissiveIntensity: 0.3 
    });
    const bondGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1, 8);
    const bondsVisuals: THREE.Mesh[] = [];

    // Calculate optimal molecular geometry using chemistry engine
    const avgBondLength = structure.bonds.length > 0 
      ? structure.bonds.reduce((sum, b) => sum + b.bondLength, 0) / structure.bonds.length 
      : 2.0;
    
    const relativePositions = this.chemistryEngine.calculateMolecularPositions(
      atoms, 
      structure.geometry, 
      avgBondLength
    );

    if (!relativePositions || relativePositions.size === 0) return null;

    // Position atoms with enhanced visuals
    atoms.forEach(a => {
      this.world.removeBody(a.physicalBody);
      this.scene.remove(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);

      const relativePos = relativePositions.get(a.id)!;
      compoundBody.addShape(a.physicalBody.shapes[0], new CANNON.Vec3(relativePos.x, relativePos.y, relativePos.z));

      // Store original positions for vibration animation
      a.visuals.nucleus.userData['originalPosition'] = relativePos.clone();
      a.visuals.electrons.userData['originalPosition'] = relativePos.clone();
      a.visuals.elementName.userData['originalPosition'] = relativePos.clone().add(new THREE.Vector3(0, 0.8, 0));

      a.visuals.nucleus.position.copy(relativePos);
      a.visuals.electrons.position.copy(relativePos);
      a.visuals.elementName.position.copy(relativePos).add(new THREE.Vector3(0, 0.8, 0));

      moleculeVisual.add(a.visuals.nucleus, a.visuals.electrons, a.visuals.elementName);
      a.isMoleculeMember = true;
    });

    // Create enhanced bond visuals based on bonding structure
    structure.bonds.forEach(bondPair => {
      const posA = relativePositions.get(bondPair.atomA.id)!;
      const posB = relativePositions.get(bondPair.atomB.id)!;
      
      // Create multiple bonds for higher bond orders
      for (let i = 0; i < bondPair.bondOrder; i++) {
        const bondVisual = new THREE.Mesh(bondGeometry, bondMaterial);
        const distance = posA.distanceTo(posB);
        bondVisual.scale.y = distance;
        
        // Offset multiple bonds slightly
        const offset = i * 0.2 - (bondPair.bondOrder - 1) * 0.1;
        const midPoint = posA.clone().lerp(posB, 0.5);
        const perpendicular = new THREE.Vector3(0, 0, offset);
        
        bondVisual.position.copy(midPoint).add(perpendicular);
        bondVisual.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), 
          posB.clone().sub(posA).normalize()
        );
        
        // Color code by bond type
        if (bondPair.bondType === 'ionic') {
          bondVisual.material = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 0.3 });
        } else if (bondPair.bondType === 'hydrogen') {
          bondVisual.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.2 });
        }
        
        moleculeVisual.add(bondVisual);
        bondsVisuals.push(bondVisual);
      }
    });

    // Remove internal bonds from main simulation
    const moleculeBonds = this.bonds.filter(b => atoms.includes(b.atomA) && atoms.includes(b.atomB));
    moleculeBonds.forEach(b => this.deleteBond(b, true));

    this.world.addBody(compoundBody);
    this.scene.add(moleculeVisual);

    return { 
      id: moleculeId, 
      name: structure.name, 
      atoms, 
      visual: moleculeVisual, 
      physicalBody: compoundBody, 
      bondsVisuals 
    };
  }
}