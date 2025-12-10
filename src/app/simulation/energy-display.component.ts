import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-energy-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="energy-container">
      <div class="energy-header">
        <span class="energy-icon">⚡</span>
        <span class="energy-label">Energía del Sistema</span>
      </div>
      
      <div class="energy-bar-container">
        <div class="energy-bar">
          <div 
            class="energy-fill"
            [style.width.%]="energyPercentage"
            [class.low]="energyPercentage < 30"
            [class.medium]="energyPercentage >= 30 && energyPercentage < 70"
            [class.high]="energyPercentage >= 70">
          </div>
          <div 
            class="energy-threshold"
            *ngIf="requiredEnergy > 0"
            [style.left.%]="requiredEnergyPercentage"
            [class.met]="currentEnergy >= requiredEnergy">
            <span class="threshold-label">{{ requiredEnergy }}</span>
          </div>
        </div>
        <div class="energy-values">
          <span class="current-value">{{ currentEnergy | number:'1.1-1' }}</span>
          <span class="max-value">/ {{ maxEnergy }}</span>
        </div>
      </div>

      <div class="energy-controls">
        <button 
          class="energy-btn add"
          (click)="addEnergy(5)"
          [disabled]="currentEnergy >= maxEnergy">
          +5 ⚡
        </button>
        <button 
          class="energy-btn add-large"
          (click)="addEnergy(20)"
          [disabled]="currentEnergy >= maxEnergy">
          +20 ⚡
        </button>
        <button 
          class="energy-btn reset"
          (click)="resetEnergy()">
          Reset
        </button>
      </div>

      <div class="energy-info" *ngIf="requiredEnergy > 0">
        <div class="requirement" [class.met]="currentEnergy >= requiredEnergy">
          <span class="req-icon">{{ currentEnergy >= requiredEnergy ? '✓' : '○' }}</span>
          <span>Energía requerida: {{ requiredEnergy }}</span>
        </div>
      </div>

      <div class="temperature-display">
        <span class="temp-label">🌡️ Temperatura:</span>
        <span class="temp-value" [class.hot]="temperature > 500">
          {{ temperature | number:'1.0-0' }} K
        </span>
      </div>
    </div>
  `,
  styles: [`
    .energy-container {
      background: rgba(26, 26, 46, 0.9);
      border-radius: 12px;
      padding: 16px;
      border: 1px solid rgba(255, 193, 7, 0.3);
    }

    .energy-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .energy-icon {
      font-size: 1.2em;
    }

    .energy-label {
      color: #ffc107;
      font-weight: 600;
      font-size: 0.95em;
    }

    .energy-bar-container {
      margin-bottom: 12px;
    }

    .energy-bar {
      height: 20px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      overflow: visible;
      position: relative;
    }

    .energy-fill {
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s ease, background 0.3s ease;
      position: relative;
    }

    .energy-fill.low {
      background: linear-gradient(90deg, #f44336, #ff5722);
    }

    .energy-fill.medium {
      background: linear-gradient(90deg, #ff9800, #ffc107);
    }

    .energy-fill.high {
      background: linear-gradient(90deg, #4caf50, #8bc34a);
      box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
    }

    .energy-threshold {
      position: absolute;
      top: -8px;
      bottom: -8px;
      width: 3px;
      background: #fff;
      transform: translateX(-50%);
      border-radius: 2px;
    }

    .energy-threshold.met {
      background: #4caf50;
      box-shadow: 0 0 8px rgba(76, 175, 80, 0.8);
    }

    .threshold-label {
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.7em;
      color: #fff;
      white-space: nowrap;
    }

    .energy-values {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
      font-size: 0.85em;
    }

    .current-value {
      color: #ffc107;
      font-weight: 600;
    }

    .max-value {
      color: #888;
      margin-left: 4px;
    }

    .energy-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .energy-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.85em;
      transition: all 0.2s;
    }

    .energy-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .energy-btn.add {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
      border: 1px solid #ff9800;
    }

    .energy-btn.add:hover:not(:disabled) {
      background: rgba(255, 152, 0, 0.3);
    }

    .energy-btn.add-large {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
      border: 1px solid #f44336;
    }

    .energy-btn.add-large:hover:not(:disabled) {
      background: rgba(244, 67, 54, 0.3);
    }

    .energy-btn.reset {
      background: rgba(158, 158, 158, 0.2);
      color: #9e9e9e;
      border: 1px solid #9e9e9e;
    }

    .energy-btn.reset:hover {
      background: rgba(158, 158, 158, 0.3);
    }

    .energy-info {
      margin-bottom: 12px;
    }

    .requirement {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      color: #888;
      font-size: 0.85em;
    }

    .requirement.met {
      color: #4caf50;
      background: rgba(76, 175, 80, 0.1);
    }

    .req-icon {
      font-size: 1.1em;
    }

    .temperature-display {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
    }

    .temp-label {
      color: #888;
      font-size: 0.85em;
    }

    .temp-value {
      color: #4fc3f7;
      font-weight: 600;
    }

    .temp-value.hot {
      color: #f44336;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `]
})
export class EnergyDisplayComponent {
  @Input() currentEnergy = 0;
  @Input() maxEnergy = 100;
  @Input() requiredEnergy = 0;
  @Input() temperature = 300;

  @Output() energyAdded = new EventEmitter<number>();
  @Output() energyReset = new EventEmitter<void>();

  get energyPercentage(): number {
    return Math.min(100, (this.currentEnergy / this.maxEnergy) * 100);
  }

  get requiredEnergyPercentage(): number {
    return Math.min(100, (this.requiredEnergy / this.maxEnergy) * 100);
  }

  addEnergy(amount: number): void {
    this.energyAdded.emit(amount);
  }

  resetEnergy(): void {
    this.energyReset.emit();
  }
}
