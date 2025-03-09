declare module 'fabric' {
  export class Canvas {
    constructor(element: HTMLCanvasElement | string, options?: any);
    isDrawingMode: boolean;
    freeDrawingBrush: PencilBrush;
    backgroundColor: string;
    width: number;
    height: number;
    viewportTransform: number[];
    clipPath: any;
    selection: boolean;
    preserveObjectStacking: boolean;
    fireRightClick: boolean;
    stopContextMenu: boolean;
    clear(): void;
    dispose(): void;
    getElement(): HTMLCanvasElement;
    setWidth(width: number): void;
    setHeight(height: number): void;
    getWidth(): number;
    getHeight(): number;
    add(object: any): void;
    remove(object: any): void;
    centerObject(object: any): void;
    renderAll(): void;
    on(event: string, callback: Function): void;
    off(event: string, callback: Function): void;
    getObjects(): any[];
    setZoom(value: number): void;
    absolutePan(point: { x: number, y: number }): void;
    zoomToPoint(point: { x: number, y: number }, value: number): void;
    getCenter(): { left: number, top: number };
    getZoom(): number;
    setViewportTransform(transform: number[]): void;
    getPointer(e: { clientX: number, clientY: number }): { x: number, y: number };
    setActiveObject(object: any): Canvas;
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
    path?: any[];
    strokeWidth?: number;
    setCoords(): void;
    set(properties: any): Object;
    on(event: string, callback: Function): void;
  }

  export class Rect extends Object {
    constructor(options?: any);
    absolutePositioned: boolean;
  }
  
  export class Text extends Object {
    constructor(text: string, options?: any);
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    textAlign: string;
    fill: string;
    set(properties: any): Text;
  }
  
  export class Group extends Object {
    constructor(objects: Object[], options?: any);
    _objects: Object[];
    set(properties: any): Group;
  }

  export namespace fabric {
    const Rect: typeof import('fabric').Rect;
    const Text: typeof import('fabric').Text;  
    const Group: typeof import('fabric').Group;
  }
} 