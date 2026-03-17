import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { OrgChart, IOrgChartProps } from "./OrgChart";
import * as React from "react";

export class orgchart implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged: () => void;

    constructor() { /* empty */ }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        // Let the framework call updateView whenever the container is resized
        // so we can pass the correct width/height to the SVG viewport.
        context.mode.trackContainerResize(true);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const props: IOrgChartProps = {
            entitiesJson: context.parameters.entities.raw ?? '[]',
            shareholdingsJson: context.parameters.shareholdings.raw ?? '[]',
            width: context.mode.allocatedWidth,
            height: context.mode.allocatedHeight,
        };
        return React.createElement(OrgChart, props);
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void { /* nothing to clean up */ }
}
