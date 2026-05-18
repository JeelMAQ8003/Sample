import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {

    private target: HTMLElement;

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.target.style.height = "100%";
        this.target.style.width = "100%";
    }

    public update(options: VisualUpdateOptions) {

        const dataView = options.dataViews && options.dataViews[0];
        let value = 0;

        if (dataView && dataView.categorical && dataView.categorical.values) {
            value = Number(dataView.categorical.values[0].values[0]);
        }

        // Format number with commas
        const formattedValue = value.toLocaleString("en-US");

        // Dynamic arrow logic
        let trendIcon = "▲";
        let trendColor = "#00ff88";

        if (value < 0) {
            trendIcon = "▼";
            trendColor = "#ff4d4d";
        }

        this.target.innerHTML = `
            <div style="
                display:flex;
                flex-direction:column;
                justify-content:center;
                align-items:center;
                height:100%;
                width:100%;
                border-radius:18px;
                background: linear-gradient(135deg, #1e3c72, #2a5298);
                color:white;
                font-family:Segoe UI;
                box-shadow:0px 8px 20px rgba(0,0,0,0.3);
            ">

                <div style="
                    font-size:16px;
                    opacity:0.8;
                    margin-bottom:8px;
                    letter-spacing:1px;
                ">
                    KPI VALUE
                </div>

                <div style="
                    font-size:42px;
                    font-weight:700;
                ">
                    ${formattedValue}
                </div>

                <div style="
                    font-size:20px;
                    margin-top:6px;
                    color:${trendColor};
                ">
                    ${trendIcon}
                </div>

            </div>
        `;
    }
}