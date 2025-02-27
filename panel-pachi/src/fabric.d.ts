declare module 'fabric' {
  export class Canvas {
    constructor(element: HTMLCanvasElement | string, options?: any);
    isDrawingMode: boolean;
    freeDrawingBrush: PencilBrush;
    backgroundColor: string;
    width: number;
    height: number;
    clear(): void;
    dispose(): void;
    getElement(): HTMLCanvasElement;
    setWidth(width: number): void;
    setHeight(height: number): void;
    add(object: any): void;
    centerObject(object: any): void;
    renderAll(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
    getObjects(): any[];
  }

  export class BaseBrush {
    color: string;
    width: number;
  }

  export class PencilBrush extends BaseBrush {
    constructor(canvas: Canvas);
  }

  export class Image {
    constructor(element: HTMLImageElement, options?: any);
    static fromURL(url: string, callback: (img: Image) => void): void;
    width: number;
    height: number;
    scale(scale: number): void;
    selectable: boolean;
    evented: boolean;
    left: number;
    top: number;
    set(properties: any): Image;
  }

  export class Object {
    selectable: boolean;
    evented: boolean;
    visible: boolean;
    left: number;
    top: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    opacity: number;
    angle: number;
    setCoords(): void;
    set(properties: any): Object;
  }
} 