import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SIMULATION_MODES, SimulationMode } from './simulation-config';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="control-panel">
      <!-- Mode Selector -->
      <div class="panel-section">
        <div class="section-header">
          <span class="section-icon">🎮</span>
          <span>Modo de Simulación</span>
        </div>
        <div class="mode-buttons">
          <button 
            *ngFor="let mode of modes"
            class="mode-btn"
            [class.active]="currentMode === mode.key"
            (click)="selectMode(mode.key)">
            <span class="mode-name">{{ mode.value.name }}</span>
          </button>
        </div>
        <p class="mode-description">{{ getCurrentModeDescription() }}</p>
      </div>

      <!-- Simulation Controls -->
      <div class="panel-section">
        <div class="section-header">
          <span class="section-icon">⏯️</span>
          <span>Controles</span>
        </div>
        <div class="control-buttons">
          <button 
            class="ctrl-btn"
            [class.active]="isPaused"
            (click)="togglePause()">
            {{ isPaused ? '▶️ Reanudar' : '⏸️ Pausar' }}
          </button>
          <button 
            class="ctrl-btn"
            (click)="resetSimulation()">
            🔄 Reiniciar
          </button>
          <button 
            class="ctrl-btn"
            (click)="clearAll()">
            🗑️ Limpiar
          </button>
        </div>
      </div>

      <!-- Speed Control -->
      <div class="panel-section">
        <div class="section-header">
          <span class="section-icon">⚡</span>
          <span>Velocidad: {{ speedLabel }}</span>
        </div>
        <div class="speed-control">
          <input 
            type="range" 
            min="0.1" 
            max="2" 
            step="0.1"
            [value]="simulationSpeed"
            (input)="onSpeedChange($event)">
          <div class="speed-labels">
            <span>Lento</span>
            <span>Normal</span>
            <span>Rápido</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="panel-section">
        <div class="section-header">
          <span class="section-icon">⚗️</span>
          <span>Acciones Rápidas</span>
        </div>
        <div class="quick-actions">
          <button class="action-btn primary" (click)="openPeriodicTable()">
            📊 Tabla Periódica
          </button>
          <button class="action-btn secondary" (click)="openExperiments()">
            🧪 Experimentos
          </button>
          <button class="action-btn tertiary" (click)="openTutorial()">
            📖 Tutorial
          </button>
        </div>
      </div>

      <!-- Manual Bonding (when enabled) -->
      <div class="panel-section" *ngIf="allowManualBonding">
        <div class="section-header">
          <span class="section-icon">🔗</span>
          <span>Enlace Manual</span>
        </div>
        <div class="bonding-controls">
          <button 
            class="bond-btn"
            [class.active]="bondingMode"
            [disabled]="!canCreateBond"
            (click)="toggleBondingMode()">
            {{ bondingMode ? '✓ Modo Enlace Activo' : 'Crear Enlace' }}
          </button>
          <p class="bonding-hint" *ngIf="bondingMode">
            Selecciona dos átomos para enlazarlos
          </p>
          <p class="bonding-hint" *ngIf="!bondingMode && selectedAtomCount > 0">
            {{ selectedAtomCount }} átomo(s) seleccionado(s)
          </p>
        </div>
      </div>

      <!-- View Options -->
      <div class="panel-section">
        <div class="section-header">
          <span class="section-icon">👁️</span>
          <span>Visualización</span>
        </div>
        <div class="view-options">
          <label class="checkbox-option">
            <input 
              type="checkbox" 
              [checked]="showLabels"
              (change)="toggleLabels()">
            <span>Mostrar nombres</span>
          </label>
          <label class="checkbox-option">
            <input 
              type="checkbox" 
              [checked]="showElectrons"
              (change)="toggleElectrons()">
            <span>Mostrar electrones</span>
          </label>
          <label class="checkbox-option">
            <input 
              type="checkbox" 
              [checked]="showBonds"
              (change)="toggleBonds()">
            <span>Mostrar enlaces</span>
          </label>
          <label class="checkbox-option">
            <input 
              type="checkbox" 
              [checked]="showGrid"
              (change)="toggleGrid()">
            <span>Mostrar cuadrícula</span>
          </label>
        </div>
      </div>

      <!-- Stats -->
      <div class="panel-section stats">
        <div class="stat-item">
          <span class="stat-label">Átomos:</span>
          <span class="stat-value">{{ atomCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Moléculas:</span>
          <span class="stat-value">{{ moleculeCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Enlaces:</span>
          <span class="stat-value">{{ bondCount }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .control-panel {
      background: rgba(26, 26, 46, 0.95);
      border-radius: 12px;
      padding: 16px;
      width: 280px;
      max-height: calc(100vh - 40px);
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .panel-section {
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .panel-section:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      color: #4fc3f7;
      font-weight: 600;
      font-size: 0.95em;
    }

    .section-icon {
      font-size: 1.1em;
    }

    .mode-buttons {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }

    .mode-btn {
      flex: 1;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #aaa;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.85em;
    }

    .mode-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .mode-btn.active {
      background: rgba(79, 195, 247, 0.2);
      border-color: #4fc3f7;
      color: #4fc3f7;
    }

    .mode-description {
      color: #888;
      font-size: 0.8em;
      margin: 0;
      font-style: italic;
    }

    .control-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .ctrl-btn {
      flex: 1;
      min-width: calc(50% - 4px);
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #e0e0e0;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.85em;
    }

    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .ctrl-btn.active {
      background: rgba(255, 193, 7, 0.2);
      border-color: #ffc107;
      color: #ffc107;
    }

    .speed-control {
      padding: 0 4px;
    }

    .speed-control input[type="range"] {
      width: 100%;
      height: 6px;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      outline: none;
    }

    .speed-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: #4fc3f7;
      border-radius: 50%;
      cursor: pointer;
    }

    .speed-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-size: 0.75em;
      color: #666;
    }

    .quick-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .action-btn {
      padding: 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
      text-align: left;
    }

    .action-btn.primary {
      background: linear-gradient(135deg, #4fc3f7 0%, #29b6f6 100%);
      color: #000;
    }

    .action-btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(79, 195, 247, 0.3);
    }

    .action-btn.secondary {
      background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);
      color: #fff;
    }

    .action-btn.secondary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
    }

    .action-btn.tertiary {
      background: linear-gradient(135deg, #ffa726 0%, #ff9800 100%);
      color: #000;
    }

    .action-btn.tertiary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
    }

    .bonding-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bond-btn {
      padding: 12px;
      background: rgba(156, 39, 176, 0.2);
      border: 1px solid #9c27b0;
      border-radius: 8px;
      color: #ce93d8;
      cursor: pointer;
      transition: all 0.2s;
    }

    .bond-btn:hover:not(:disabled) {
      background: rgba(156, 39, 176, 0.3);
    }

    .bond-btn.active {
      background: rgba(156, 39, 176, 0.4);
      color: #fff;
    }

    .bond-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .bonding-hint {
      color: #888;
      font-size: 0.8em;
      margin: 0;
      text-align: center;
    }

    .view-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .checkbox-option {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #e0e0e0;
      font-size: 0.9em;
      cursor: pointer;
    }

    .checkbox-option input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #4fc3f7;
    }

    .stats {
      display: flex;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px !important;
      border-bottom: none !important;
    }

    .stat-item {
      text-align: center;
    }

    .stat-label {
      display: block;
      color: #888;
      font-size: 0.75em;
      margin-bottom: 4px;
    }

    .stat-value {
      color: #4fc3f7;
      font-weight: 600;
      font-size: 1.2em;
    }
  `]
})
export class ControlPanelComponent {
  @Input() currentMode = 'educational';
  @Input() isPaused = false;
  @Input() simulationSpeed = 1;
  @Input() allowManualBonding = true;
  @Input() bondingMode = false;
  @Input() canCreateBond = false;
  @Input() selectedAtomCount = 0;
  @Input() showLabels = true;
  @Input() showElectrons = true;
  @Input() showBonds = true;
  @Input() showGrid = false;
  @Input() atomCount = 0;
  @Input() moleculeCount = 0;
  @Input() bondCount = 0;

  @Output() modeChanged = new EventEmitter<string>();
  @Output() pauseToggled = new EventEmitter<void>();
  @Output() simulationReset = new EventEmitter<void>();
  @Output() allCleared = new EventEmitter<void>();
  @Output() speedChanged = new EventEmitter<number>();
  @Output() periodicTableOpened = new EventEmitter<void>();
  @Output() experimentsOpened = new EventEmitter<void>();
  @Output() tutorialOpened = new EventEmitter<void>();
  @Output() bondingModeToggled = new EventEmitter<void>();
  @Output() labelsToggled = new EventEmitter<void>();
  @Output() electronsToggled = new EventEmitter<void>();
  @Output() bondsToggled = new EventEmitter<void>();
  @Output() gridToggled = new EventEmitter<void>();

  modes = Object.entries(SIMULATION_MODES).map(([key, value]) => ({ key, value }));

  get speedLabel(): string {
    if (this.simulationSpeed < 0.5) return 'Muy Lento';
    if (this.simulationSpeed < 0.8) return 'Lento';
    if (this.simulationSpeed < 1.2) return 'Normal';
    if (this.simulationSpeed < 1.6) return 'Rápido';
    return 'Muy Rápido';
  }

  getCurrentModeDescription(): string {
    return SIMULATION_MODES[this.currentMode]?.description || '';
  }

  selectMode(mode: string): void {
    this.modeChanged.emit(mode);
  }

  togglePause(): void {
    this.pauseToggled.emit();
  }

  resetSimulation(): void {
    this.simulationReset.emit();
  }

  clearAll(): void {
    this.allCleared.emit();
  }

  onSpeedChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.speedChanged.emit(value);
  }

  openPeriodicTable(): void {
    this.periodicTableOpened.emit();
  }

  openExperiments(): void {
    this.experimentsOpened.emit();
  }

  openTutorial(): void {
    this.tutorialOpened.emit();
  }

  toggleBondingMode(): void {
    this.bondingModeToggled.emit();
  }

  toggleLabels(): void {
    this.labelsToggled.emit();
  }

  toggleElectrons(): void {
    this.electronsToggled.emit();
  }

  toggleBonds(): void {
    this.bondsToggled.emit();
  }

  toggleGrid(): void {
    this.gridToggled.emit();
  }
}
