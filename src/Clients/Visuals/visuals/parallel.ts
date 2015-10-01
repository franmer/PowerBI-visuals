
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
// Submitted by Dharminder Dhanda
/// <reference path="../_references.ts"/>


module powerbi.visuals {
    import SelectionManager = utility.SelectionManager;
    export interface ParallelDatapoint {
    };

    export class Parallel implements IVisual {
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

        private static VisualClassName = 'Parallel';
        private svg: D3.Selection;
        private mainGroupElement: D3.Selection;
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
        private dataView: DataView;

        public static converter(dataView: DataView, colors: IDataColorPalette): ParallelDatapoint[] {

            var catDv: DataViewCategorical = dataView.categorical;
            var cat = catDv.categories[0];
            var rowcount = dataView.table.rows.length;
            var values = catDv.values;
            var retVal = [];

            for (var i = 0; i < rowcount; i++) {
                var obj = {};
                var mytooltip = [];
                for (var j = 0, len = values.length; j < len; j++) {
                    obj[values[j].source.displayName] = { val: values[j].values[i] };

                    mytooltip.push(
                        {
                            displayName: values[j].source.displayName,
                            value: values[j].values[i],
                        }
                        );
                }
                obj["color"] = colors.getColorByIndex(i).value;
                obj["selector"] = SelectionId.createWithId(cat.identity[i]);
                obj["tooltipInfo"] = mytooltip;

                retVal.push(obj);
            }
            return retVal;
        };

        public init(options: VisualInitOptions): void {
            var element = options.element;
            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.svg = d3.select(element.get(0))
                        .append('svg')
                        .classed(Parallel.VisualClassName, true);
            this.colors = options.style.colorPalette.dataColors;
        };

        public update(options: VisualUpdateOptions) {
            if (!options.dataViews || !options.dataViews[0]) return; // or clear the view, display an error, etc.
            
            if (this.mainGroupElement !== undefined) this.mainGroupElement.remove();
            this.mainGroupElement = this.svg.append('g');
            var dataView = this.dataView = options.dataViews[0];
            var dataPoints = Parallel.converter(dataView, this.colors);
            var viewport = options.viewport;
            var selectionManager = this.selectionManager;
            this.svg
                .attr({
                    'height': viewport.height,
                    'width': viewport.width
                }).on('click', () => this.selectionManager.clear().then(() => foreground.style('opacity', 1)));

            var width = viewport.width;
            var height = viewport.height;

            var mainGroup = this.mainGroupElement;

            var width = viewport.width,
                height = viewport.height - 40;

            var x = d3.scale.ordinal().rangePoints([0, width], 1),
                y = {},
                dragging = {};

            var line = d3.svg.line(),
                axis = d3.svg.axis().orient("left"),
                background,
                foreground;

            var svg = mainGroup.append("g").attr("transform", "translate(0,30)");

            var dimensions = [];

            for (var i = 0; i < dataView.table.rows.length; i++) {
                for (var j = 0, len = dataView.categorical.values.length; j < len; j++) {
                    if (i === 0) dimensions.push(dataView.categorical.values[j].source.displayName);
                }
            };

            dimensions.map(function (d) {
                y[d] = d3.scale.linear()
                    .domain(d3.extent(dataPoints, function (p) { return +p[d].val; }))
                    .range([height, 0]);
            });

            x.domain(dimensions);

            // Add grey background lines for context.
            background = svg.append("g")
                .attr("class", "background")
                .selectAll("path")
                .data(dataPoints)
                .enter().append("path")
                .attr("d", path)
                .attr("style", "fill:none;stroke:#ddd;shape-rendering: crispEdges;");

            // Add blue foreground lines for focus.
            foreground = svg.append("g")
                .attr("class", "foreground")
                .selectAll("path")
                .data(dataPoints)
                .enter().append("path")
                .attr("d", path)
                .attr("style", function (d, i) {
                    return "fill:none;cursor:pointer;stroke-width:2;stroke:" + d["color"] + ";";
                });

            foreground.on('click', function (d) {
                selectionManager.select(d["selector"]).then((ids) => {
                    if (ids.length > 0) {
                        foreground.style('opacity', 0.1);
                        d3.select(this).style('opacity', 1);
                    } else {
                        foreground.style('opacity', 1);
                    }
                });
                d3.event.stopPropagation();
            });

            var g = svg.selectAll(".dimension")
                .data(dimensions)
                .enter().append("g")
                .attr("class", "dimension")
                .attr("transform", function (d) { return "translate(" + x(d) + ")"; })
                .call(d3.behavior.drag()
                    .origin(function (d) { return { x: x(d) }; })
                    .on("dragstart", function (d) {
                        dragging[d] = x(d);
                        background.attr("visibility", "hidden");
                    })
                    .on("drag", function (d) {
                        dragging[d] = Math.min(width, Math.max(0, d3.event.x));
                        foreground.attr("d", path);
                        dimensions.sort(function (a, b) { return position(a) - position(b); });
                        x.domain(dimensions);
                        g.attr("transform", function (d) { return "translate(" + position(d) + ")"; });
                    })
                    .on("dragend", function (d) {
                        delete dragging[d];
                        transition(d3.select(this)).attr("transform", "translate(" + x(d) + ")");
                        transition(foreground).attr("d", path);
                        background
                            .attr("d", path)
                            .transition()
                            .delay(500)
                            .duration(0)
                            .attr("visibility", null);
                    }));

            g.append("g")
                .attr("class", "axis")
                .each(function (d) { d3.select(this).call(axis.scale(y[d])); })
                .append("text")
                .attr("text-anchor", "middle")
                .attr("y", -9)
                .text(function (d) { return d; });

            g.append("g")
                .attr("class", "brush")
                .each(function (d) {
                    d3.select(this).call(y[d].brush = d3.svg.brush().y(y[d]).on("brushstart", brushstart).on("brush", brush));
                })
                .selectAll("rect")
                .attr("x", -8)
                .attr("width", 16);

            TooltipManager.addTooltip(foreground, (tooltipEvent: TooltipEvent) => tooltipEvent.data["tooltipInfo"]);

            function position(d) {
                var v = dragging[d];
                return v == null ? x(d) : v;
            };

            function transition(g) {
                return g.transition().duration(500);
            };

            function path(d) {
                return line(dimensions.map(function (p) { return [position(p), y[p](d[p].val)]; }));
            };

            function brushstart() {
                d3.event.sourceEvent.stopPropagation();
            };

            function brush() {
                var actives = dimensions.filter(function (p) { return !y[p].brush.empty(); }),
                    extents = actives.map(function (p) { return y[p].brush.extent(); });
                foreground.style("display", function (d) {
                    return actives.every(function (p, i) {
                        return extents[i][0] <= d[p].val && d[p].val <= extents[i][1];
                    }) ? null : "none";
                });
            };
        };

        private getLabelFill(dataView: DataView): Fill {
            if (dataView && dataView.metadata.objects) {
                var label = dataView.metadata.objects['label'];
                if (label) {
                    return <Fill>label['fill'];
                }
            }
            return { solid: { color: '#333' } };
        };

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
    }
};

module powerbi.visuals.plugins {
    export var _Parallel: IVisualPlugin = {
        name: '_Parallel',
        class: '_Parallel',
        capabilities: Parallel.capabilities,
        create: () => new Parallel()
    };
};
