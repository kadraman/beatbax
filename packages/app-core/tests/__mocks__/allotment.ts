// Mock for allotment in tests
export class Allotment {
  element: HTMLElement;
  
  constructor(options?: any) {
    this.element = document.createElement('div');
  }

  addPane(config: any) {
    if (config.element) {
      this.element.appendChild(config.element);
    }
  }

  onChange(callback: () => void) {}

  getSizes() {
    return [70, 30];
  }

  resize(sizes: number[]) {}

  dispose() {}
}

export default Allotment;
