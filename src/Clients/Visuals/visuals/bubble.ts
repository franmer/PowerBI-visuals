/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    import SelectionManager = utility.SelectionManager;
    export interface BubbleDatapoint {
        name: string;
        value: number;
        packageName: string;
        label: string;
        selector: SelectionId;
        tooltipInfo: TooltipDataItem[];
    };

    export class Bubble implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Category',
                    kind: powerbi.VisualDataRoleKind.Grouping,
                },
                {
                    name: 'Y',
                    kind: powerbi.VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Values'),
                },
            ],
            dataViewMappings: [{
                categories: {
                    for: { in: 'Category' },
                    dataReductionAlgorithm: { top: {} }
                },
                values: {
                    select: [{ bind: { to: 'Y' } }]
                },
            }],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                    },
                },
                label: {
                    displayName: 'Label',
                    properties: {
                        fill: {
                            displayName: 'Fill',
                            type: { fill: { solid: { color: true } } }
                        }
                    }
                },
                outerLine: {
                    displayName: 'Outer line',
                    properties: {
                        show: {
                            displayName: 'Show',
                            type: { bool: true }
                        },
                        thickness: {
                            displayName: 'Thickness',
                            type: { numeric: true }
                        }
                    }
                }
            }
        };

        private static VisualClassName = 'Bubble';
        private static Circle: ClassAndSelector = {
            class: 'bubble',
            selector: '.bubble'
        };

        private svg: D3.Selection;
        private mainGroupElement: D3.Selection;
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
        private dataView: DataView;
        private bubble: D3.Layout.PackLayout;

        public static converter(dataView: DataView, colors: IDataColorPalette): BubbleDatapoint[] {
            var catDv: DataViewCategorical = dataView.categorical;
            var cat = catDv.categories[0];
            var catValues = cat.values;
            var values = catDv.values;
            var dataPoints: BubbleDatapoint[] = [];

            var formatStringProp = <DataViewObjectPropertyIdentifier>{ objectName: 'general', propertyName: 'formatString' };
            var categorySourceFormatString = valueFormatter.getFormatString(cat.source, formatStringProp);

            for (var i = 0, len = catValues.length; i < len; i++) {
                var formattedCategoryValue = valueFormatter.format(catValues[i], categorySourceFormatString);

                dataPoints.push({
                    name: catValues[i],
                    value: values[0].values[i],
                    packageName: "main",
                    label: catValues[i],
                    color: #660000,
                    selector: SelectionId.createWithId(cat.identity[i]),
                    tooltipInfo: [{
                        displayName: formattedCategoryValue,
                        value: values[0].values[i],
                    }]
                });
            }

            return dataPoints;
        };

        public init(options: VisualInitOptions): void {
            var element = options.element;
            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.svg = d3.select(element.get(0))
                .append('svg')
                .classed(Bubble.VisualClassName, true);

            this.colors = options.style.colorPalette.dataColors;
        };

        public update(options: VisualUpdateOptions) {
            if (!options.dataViews || !options.dataViews[0]) return; // or clear the view, display an error, etc.
            
            if (this.mainGroupElement !== undefined) this.mainGroupElement.remove();
            this.mainGroupElement = this.svg.append('g');

            var dataView = this.dataView = options.dataViews[0];
            var dataPoints = Bubble.converter(dataView, this.colors);
            var viewport = options.viewport;

            this.svg
                .attr({
                    'height': viewport.height,
                    'width': viewport.width
                })
                .on('click', () => this.selectionManager.clear().then(() => selection.style('opacity', 1)));

            var width = viewport.width;
            var height = viewport.height;
            var mydata = { name: "Parent", children: dataPoints };

            var mainGroup = this.mainGroupElement;

            this.bubble = d3.layout.pack()
                .sort(null)
                .size([width, height])
                .padding(1.5);

            var data = this.bubble.nodes(mydata);
          
            var selectionManager = this.selectionManager;

            var selection = mainGroup.selectAll(Bubble.Circle.selector)
                .data(data.filter(function (d) { return !d.children; }));

            selection.enter()
                .append("g")
                .classed(Bubble.Circle.class, true)
                .attr("cursor", "pointer")
                .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });

            var nodeCircle = selection.append("circle").attr('fill', d => d.color);

            nodeCircle.on('click', function (d) {
                selectionManager.select(d.selector).then((ids) => {
                    if (ids.length > 0) {
                        nodeCircle.style('opacity', 0.5);
                        d3.select(this).style('opacity', 1);
                    } else {
                        nodeCircle.style('opacity', 1);
                    }
                });
                d3.event.stopPropagation();
            });

            nodeCircle.attr("r", 0)
                .transition()
                .duration(1200)
                .attr("r", function (d) {
                    if (d.name === "Parent") {
                        return 0;
                    }
                    else {
                        return d.r;
                    };
                });

            var nodeText = selection.append("text")
                .attr("dy", ".3em")
                .style("text-anchor", "middle")

                .attr("font-size", "10px")
                .text(function (d) {
                    if (d.name === "Parent") {
                        return "";
                    }
                    else {
                        return d.name.substring(0, d.r / 3);
                    };
                }).style("fill", this.getLabelFill(this.dataView).solid.color);

            nodeText.attr("fill", "#fff")
                .transition()
                .duration(1000)
                .attr("fill", "#000");

            TooltipManager.addTooltip(nodeCircle, (tooltipEvent: TooltipEvent) => tooltipEvent.data.tooltipInfo);

            //selection.exit().remove();

        };

        // This extracts fill color of the label from the DataView
        private getLabelFill(dataView: DataView): Fill {
            if (dataView && dataView.metadata.objects) {
                var label = dataView.metadata.objects['label'];
                if (label) {
                    return <Fill>label['fill'];
                }
            }

            return { solid: { color: '#333' } };
        };
        
        // This function retruns the values to be displayed in the property pane for each object.
        // Usually it is a bind pass of what the property pane gave you, but sometimes you may want to do
        // validation and return other values/defaults
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            switch (options.objectName) {
                case 'label':
                    var label: VisualObjectInstance = {
                        objectName: 'label',
                        displayName: 'Label',
                        selector: null,
                        properties: {
                            fill: this.getLabelFill(this.dataView)
                        }
                    };
                    instances.push(label);
                    break;

            }
            return instances;
        };
    };
};

module powerbi.visuals.plugins {
    export var _Bubble: IVisualPlugin = {
        name: '_Bubble',
        class: '_Bubble',
        capabilities: Bubble.capabilities,
        create: () => new Bubble()
    };
}
