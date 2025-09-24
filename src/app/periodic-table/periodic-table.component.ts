import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PeriodicElement {
  name: string;
  symbol: string;
  atomicNumber: number;
  neutrons: number; // Most common stable isotope
  row: number;
  col: number;
}

@Component({
  selector: 'app-periodic-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './periodic-table.component.html',
  styleUrl: './periodic-table.component.scss'
})
export class PeriodicTableComponent {
  @Output() elementSelect = new EventEmitter<PeriodicElement>();
  @Output() close = new EventEmitter<void>();

  elements: PeriodicElement[] = [
    { name: 'Hydrogen', symbol: 'H', atomicNumber: 1, neutrons: 0, row: 1, col: 1 },
    { name: 'Helium', symbol: 'He', atomicNumber: 2, neutrons: 2, row: 1, col: 18 },
    { name: 'Lithium', symbol: 'Li', atomicNumber: 3, neutrons: 4, row: 2, col: 1 },
    { name: 'Beryllium', symbol: 'Be', atomicNumber: 4, neutrons: 5, row: 2, col: 2 },
    { name: 'Boron', symbol: 'B', atomicNumber: 5, neutrons: 6, row: 2, col: 13 },
    { name: 'Carbon', symbol: 'C', atomicNumber: 6, neutrons: 6, row: 2, col: 14 },
    { name: 'Nitrogen', symbol: 'N', atomicNumber: 7, neutrons: 7, row: 2, col: 15 },
    { name: 'Oxygen', symbol: 'O', atomicNumber: 8, neutrons: 8, row: 2, col: 16 },
    { name: 'Fluorine', symbol: 'F', atomicNumber: 9, neutrons: 10, row: 2, col: 17 },
    { name: 'Neon', symbol: 'Ne', atomicNumber: 10, neutrons: 10, row: 2, col: 18 },
  ];

  selectElement(element: PeriodicElement): void {
    this.elementSelect.emit(element);
    this.close.emit();
  }

  closeModal(): void {
    this.close.emit();
  }
}