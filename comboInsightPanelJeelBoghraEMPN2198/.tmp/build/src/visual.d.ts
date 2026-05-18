import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import "./../style/visual.less";
export declare class Visual implements IVisual {
    private host;
    private root;
    private tooltip;
    private rafId;
    constructor(options: VisualConstructorOptions);
    update(options: VisualUpdateOptions): void;
    private renderCombo;
    private arcPath;
    private stops;
    private text;
    private line;
    private fmt;
    private showTooltip;
    private hideTooltip;
    private renderEmpty;
    destroy(): void;
}
