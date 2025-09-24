import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MolecularRecipe, MOLECULAR_RECIPES } from './molecular-recipes.interface';
import { MolecularStructure } from './autonomous-chemistry.engine';

@Component({
  selector: 'app-molecular-catalog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="catalog-overlay" (click)="close.emit()">
      <div class="catalog-container" (click)="$event.stopPropagation()">
        <div class="catalog-header">
          <h2>Molecular Catalog</h2>
          <div class="tab-buttons">
            <button 
              class="tab-btn" 
              [class.active]="activeTab === 'recipes'"
              (click)="activeTab = 'recipes'">
              Recipes ({{recipes.length}})
            </button>
            <button 
              class="tab-btn" 
              [class.active]="activeTab === 'discovered'"
              (click)="activeTab = 'discovered'">
              Discovered ({{discoveredMolecules.length}})
            </button>
            <button 
              class="tab-btn" 
              [class.active]="activeTab === 'current'"
              (click)="activeTab = 'current'">
              Current ({{currentMolecules.length}})
            </button>
          </div>
          <button class="close-btn" (click)="close.emit()">×</button>
        </div>

        <!-- Recipes Tab -->
        <div class="recipes-grid" *ngIf="activeTab === 'recipes'">
          <div
            *ngFor="let recipe of recipes"
            class="recipe-card"
            (click)="selectRecipe(recipe)"
            [class.selected]="selectedRecipe?.id === recipe.id">

            <div class="recipe-header">
              <h3>{{ recipe.name }}</h3>
              <span class="formula">{{ recipe.formula }}</span>
            </div>

            <p class="description">{{ recipe.description }}</p>

            <div class="conditions">
              <div class="condition-item">
                <span class="label">Heat Intensity:</span>
                <span class="value">{{ recipe.conditions.heatIntensity }}</span>
              </div>
              <div class="condition-item">
                <span class="label">Activation Energy:</span>
                <span class="value">{{ recipe.conditions.activationEnergy }}</span>
              </div>
              <div class="condition-item">
                <span class="label">Energy Type:</span>
                <span class="value">{{ recipe.conditions.energyType }}</span>
              </div>
              <div class="condition-item">
                <span class="label">Natural Formation:</span>
                <span class="value">{{ recipe.naturalFormation ? 'Yes' : 'No' }}</span>
              </div>
            </div>

            <div class="reactants">
              <h4>Reactants:</h4>
              <ul>
                <li *ngFor="let reactant of recipe.reactants">
                  {{ reactant.count }}× {{ reactant.element }}
                </li>
              </ul>
            </div>

            <div class="products">
              <h4>Products:</h4>
              <ul>
                <li *ngFor="let product of recipe.products">
                  {{ product.count }}× {{ product.moleculeName }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Discovered Molecules Tab -->
        <div class="molecules-grid" *ngIf="activeTab === 'discovered'">
          <div *ngFor="let molecule of discoveredMolecules" class="molecule-card">
            <div class="molecule-header">
              <h3>{{ molecule }}</h3>
            </div>
          </div>
        </div>

        <!-- Current Molecules Tab -->
        <div class="current-grid" *ngIf="activeTab === 'current'">
          <div *ngFor="let moleculeName of currentMolecules" class="current-card">
            <h3>{{ moleculeName }}</h3>
            <div class="status-indicator active">Active in Simulation</div>
          </div>
        </div>

        <div class="catalog-actions" *ngIf="selectedRecipe">
          <button class="apply-btn" (click)="applyRecipe()">
            Apply Recipe Settings
          </button>
          <button class="create-btn" (click)="createReactants()">
            Create Required Reactants
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .catalog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .catalog-container {
      background: #2a2a2a;
      border-radius: 10px;
      padding: 20px;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
      color: white;
    }

    .catalog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid #444;
      padding-bottom: 10px;
    }

    .tab-buttons {
      display: flex;
      gap: 10px;
    }

    .tab-btn {
      padding: 8px 16px;
      background: #555;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s ease;
    }

    .tab-btn:hover {
      background: #666;
    }

    .tab-btn.active {
      background: #00aa00;
      color: white;
    }

    .close-btn {
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 18px;
    }

    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .recipe-card {
      background: #3a3a3a;
      border: 2px solid #555;
      border-radius: 8px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .recipe-card:hover {
      border-color: #00ff00;
      background: #404040;
    }

    .recipe-card.selected {
      border-color: #00ff00;
      background: #404040;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    }

    .recipe-header {
      margin-bottom: 10px;
    }

    .recipe-header h3 {
      margin: 0 0 5px 0;
      color: #00ff00;
    }

    .formula {
      font-family: monospace;
      background: #1a1a1a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 14px;
    }

    .description {
      font-size: 14px;
      color: #ccc;
      margin-bottom: 15px;
    }

    .conditions {
      margin-bottom: 15px;
    }

    .condition-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 12px;
    }

    .label {
      color: #aaa;
    }

    .value {
      color: #fff;
      font-weight: bold;
    }

    .reactants, .products {
      margin-bottom: 10px;
    }

    .reactants h4, .products h4 {
      margin: 0 0 5px 0;
      font-size: 14px;
      color: #00aaff;
    }

    .reactants ul, .products ul {
      margin: 0;
      padding-left: 15px;
      font-size: 12px;
    }

    .catalog-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      padding-top: 15px;
      border-top: 1px solid #444;
    }

    .apply-btn, .create-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
    }

    .apply-btn {
      background: #00aa00;
      color: white;
    }

    .create-btn {
      background: #0066aa;
      color: white;
    }

    .apply-btn:hover {
      background: #00cc00;
    }

    .create-btn:hover {
      background: #0088cc;
    }

    .molecules-grid, .current-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .molecule-card, .current-card {
      background: #3a3a3a;
      border: 2px solid #555;
      border-radius: 8px;
      padding: 15px;
      transition: all 0.3s ease;
    }

    .molecule-card:hover, .current-card:hover {
      border-color: #00aaff;
      background: #404040;
    }

    .molecule-header {
      margin-bottom: 10px;
    }

    .molecule-header h3 {
      margin: 0 0 5px 0;
      color: #00aaff;
    }

    .molecule-info {
      margin-bottom: 15px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 12px;
    }

    .bond-types {
      margin-bottom: 10px;
    }

    .bond-types h4 {
      margin: 0 0 5px 0;
      font-size: 14px;
      color: #ffaa00;
    }

    .bond-list {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .bond-type {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .bond-type.covalent {
      background: #00aa00;
      color: white;
    }

    .bond-type.ionic {
      background: #ff6600;
      color: white;
    }

    .bond-type.hydrogen {
      background: #00aaff;
      color: white;
    }

    .current-card h3 {
      margin: 0 0 10px 0;
      color: #00ff00;
    }

    .status-indicator {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }

    .status-indicator.active {
      background: #00aa00;
      color: white;
    }
  `]
})
export class MolecularCatalogComponent {
  @Output() close = new EventEmitter<void>();
  @Output() recipeSelected = new EventEmitter<MolecularRecipe>();
  @Output() createReactantsRequested = new EventEmitter<MolecularRecipe>();
  @Input() discoveredMolecules: string[] = [];
  @Input() currentMolecules: string[] = [];

  recipes = MOLECULAR_RECIPES;
  selectedRecipe: MolecularRecipe | null = null;
  activeTab: 'recipes' | 'discovered' | 'current' = 'recipes';

  selectRecipe(recipe: MolecularRecipe): void {
    this.selectedRecipe = recipe;
  }

  applyRecipe(): void {
    if (this.selectedRecipe) {
      this.recipeSelected.emit(this.selectedRecipe);
    }
  }

  createReactants(): void {
    if (this.selectedRecipe) {
      this.applyRecipe();
      this.createReactantsRequested.emit(this.selectedRecipe);
    }
  }

  setActiveTab(tab: 'recipes' | 'discovered' | 'current'): void {
    this.activeTab = tab;
    this.selectedRecipe = null; // Clear selection when switching tabs
  }
}
