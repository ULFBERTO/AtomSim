import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TUTORIAL_STEPS, EXPERIMENT_PRESETS } from './simulation-config';

export interface TutorialStep {
  id: string;
  title: string;
  content: string;
  action: string | null;
  highlight?: string;
}

export interface ExperimentPreset {
  id: string;
  name: string;
  description: string;
  atoms: { element: number; count: number; label: string }[];
  targetMolecule: string;
  hints: string[];
  energyRequired: number;
}

@Component({
  selector: 'app-tutorial-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tutorial-overlay" *ngIf="showTutorial">
      <div class="tutorial-panel">
        <div class="tutorial-header">
          <h3>{{ currentStep.title }}</h3>
          <button class="close-btn" (click)="closeTutorial()">×</button>
        </div>
        <div class="tutorial-content">
          <p>{{ currentStep.content }}</p>
        </div>
        <div class="tutorial-progress">
          <div class="progress-dots">
            <span 
              *ngFor="let step of tutorialSteps; let i = index"
              class="dot"
              [class.active]="i === currentStepIndex"
              [class.completed]="i < currentStepIndex"
              (click)="goToStep(i)">
            </span>
          </div>
          <span class="step-counter">{{ currentStepIndex + 1 }} / {{ tutorialSteps.length }}</span>
        </div>
        <div class="tutorial-actions">
          <button 
            class="btn-secondary" 
            (click)="previousStep()" 
            [disabled]="currentStepIndex === 0">
            ← Anterior
          </button>
          <button 
            class="btn-primary" 
            (click)="nextStep()"
            *ngIf="currentStepIndex < tutorialSteps.length - 1">
            Siguiente →
          </button>
          <button 
            class="btn-success" 
            (click)="completeTutorial()"
            *ngIf="currentStepIndex === tutorialSteps.length - 1">
            ¡Comenzar!
          </button>
        </div>
      </div>
    </div>

    <div class="experiment-panel" *ngIf="showExperiments">
      <div class="panel-header">
        <h3>🧪 Experimentos</h3>
        <button class="close-btn" (click)="closeExperiments()">×</button>
      </div>
      <div class="experiment-list">
        <div 
          *ngFor="let exp of experiments"
          class="experiment-card"
          [class.active]="activeExperiment?.id === exp.id"
          (click)="selectExperiment(exp)">
          <div class="exp-header">
            <span class="exp-name">{{ exp.name }}</span>
            <span class="exp-energy">⚡ {{ exp.energyRequired }}</span>
          </div>
          <p class="exp-description">{{ exp.description }}</p>
          <div class="exp-atoms">
            <span *ngFor="let atom of exp.atoms" class="atom-badge">
              {{ atom.count }}× {{ atom.label }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="hint-panel" *ngIf="activeExperiment && showHints">
      <div class="hint-header">
        <span>💡 Pistas para: {{ activeExperiment.name }}</span>
        <button class="close-btn small" (click)="toggleHints()">×</button>
      </div>
      <div class="hint-list">
        <div 
          *ngFor="let hint of activeExperiment.hints; let i = index"
          class="hint-item"
          [class.revealed]="revealedHints.includes(i)">
          <span class="hint-number">{{ i + 1 }}</span>
          <span class="hint-text" *ngIf="revealedHints.includes(i)">{{ hint }}</span>
          <button 
            class="reveal-btn" 
            *ngIf="!revealedHints.includes(i)"
            (click)="revealHint(i)">
            Revelar pista
          </button>
        </div>
      </div>
      <div class="hint-actions">
        <button class="btn-secondary" (click)="loadExperimentAtoms()">
          Cargar Átomos
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tutorial-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .tutorial-panel {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .tutorial-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .tutorial-header h3 {
      color: #4fc3f7;
      margin: 0;
      font-size: 1.4em;
    }

    .close-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }

    .close-btn:hover {
      color: #fff;
    }

    .close-btn.small {
      font-size: 18px;
    }

    .tutorial-content {
      color: #e0e0e0;
      line-height: 1.6;
      margin-bottom: 20px;
    }

    .tutorial-progress {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .progress-dots {
      display: flex;
      gap: 8px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #444;
      cursor: pointer;
      transition: all 0.3s;
    }

    .dot.active {
      background: #4fc3f7;
      transform: scale(1.2);
    }

    .dot.completed {
      background: #4caf50;
    }

    .step-counter {
      color: #888;
      font-size: 0.9em;
    }

    .tutorial-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .btn-primary, .btn-secondary, .btn-success {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.3s;
    }

    .btn-primary {
      background: #4fc3f7;
      color: #000;
    }

    .btn-primary:hover {
      background: #81d4fa;
    }

    .btn-secondary {
      background: #444;
      color: #fff;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #555;
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-success {
      background: #4caf50;
      color: #fff;
    }

    .btn-success:hover {
      background: #66bb6a;
    }

    .experiment-panel {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(26, 26, 46, 0.95);
      border-radius: 12px;
      padding: 16px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 100;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .panel-header h3 {
      color: #4fc3f7;
      margin: 0;
      font-size: 1.2em;
    }

    .experiment-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .experiment-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.3s;
      border: 1px solid transparent;
    }

    .experiment-card:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .experiment-card.active {
      border-color: #4fc3f7;
      background: rgba(79, 195, 247, 0.1);
    }

    .exp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .exp-name {
      color: #fff;
      font-weight: 600;
    }

    .exp-energy {
      color: #ffc107;
      font-size: 0.85em;
    }

    .exp-description {
      color: #aaa;
      font-size: 0.85em;
      margin: 0 0 8px 0;
    }

    .exp-atoms {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .atom-badge {
      background: rgba(76, 175, 80, 0.2);
      color: #81c784;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
    }

    .hint-panel {
      position: absolute;
      bottom: 20px;
      right: 10px;
      background: rgba(26, 26, 46, 0.95);
      border-radius: 12px;
      padding: 16px;
      width: 300px;
      z-index: 100;
      border: 1px solid rgba(255, 193, 7, 0.3);
    }

    .hint-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      color: #ffc107;
      font-weight: 500;
    }

    .hint-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }

    .hint-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
    }

    .hint-number {
      width: 24px;
      height: 24px;
      background: #ffc107;
      color: #000;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 0.85em;
      flex-shrink: 0;
    }

    .hint-text {
      color: #e0e0e0;
      font-size: 0.9em;
    }

    .reveal-btn {
      background: rgba(255, 193, 7, 0.2);
      border: 1px solid #ffc107;
      color: #ffc107;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8em;
    }

    .reveal-btn:hover {
      background: rgba(255, 193, 7, 0.3);
    }

    .hint-actions {
      display: flex;
      justify-content: center;
    }
  `]
})
export class TutorialPanelComponent {
  @Input() showTutorial = false;
  @Input() showExperiments = false;
  @Input() showHints = false;
  @Input() activeExperiment: ExperimentPreset | null = null;

  @Output() tutorialClosed = new EventEmitter<void>();
  @Output() tutorialCompleted = new EventEmitter<void>();
  @Output() experimentSelected = new EventEmitter<ExperimentPreset>();
  @Output() experimentsClosed = new EventEmitter<void>();
  @Output() hintsToggled = new EventEmitter<void>();
  @Output() loadAtoms = new EventEmitter<ExperimentPreset>();

  tutorialSteps: TutorialStep[] = TUTORIAL_STEPS;
  experiments: ExperimentPreset[] = EXPERIMENT_PRESETS;
  currentStepIndex = 0;
  revealedHints: number[] = [];

  get currentStep(): TutorialStep {
    return this.tutorialSteps[this.currentStepIndex];
  }

  nextStep(): void {
    if (this.currentStepIndex < this.tutorialSteps.length - 1) {
      this.currentStepIndex++;
    }
  }

  previousStep(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
    }
  }

  goToStep(index: number): void {
    this.currentStepIndex = index;
  }

  closeTutorial(): void {
    this.tutorialClosed.emit();
  }

  completeTutorial(): void {
    this.tutorialCompleted.emit();
  }

  selectExperiment(exp: ExperimentPreset): void {
    this.revealedHints = [];
    this.experimentSelected.emit(exp);
  }

  closeExperiments(): void {
    this.experimentsClosed.emit();
  }

  toggleHints(): void {
    this.hintsToggled.emit();
  }

  revealHint(index: number): void {
    if (!this.revealedHints.includes(index)) {
      this.revealedHints.push(index);
    }
  }

  loadExperimentAtoms(): void {
    if (this.activeExperiment) {
      this.loadAtoms.emit(this.activeExperiment);
    }
  }
}
