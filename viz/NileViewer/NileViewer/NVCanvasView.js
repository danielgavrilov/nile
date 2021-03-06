//
//  NVCanvasView.js
//  NileViewer
//
//  Created by Bret Victor on 5/23/12.
//


//====================================================================================
//
//  NVCanvasView
//

var NVCanvasView = new Class({
    
    initialize: function (processView) {
        this.processView = processView;
        this.pipelineView = processView.pipelineView;
        this.programView = this.pipelineView.programView;
        
        this.element = processView.element.getElement(".NVProcessCanvas");
        this.captionElement = this.element.getElement(".NVProcessCanvasCaption");

        this.canvas = this.element.getElement("canvas");
        this.width = parseFloat(this.canvas.getAttribute("width"));
        this.height = parseFloat(this.canvas.getAttribute("height"));
    },
    
    setStream: function (stream) {
        this.stream = stream;

        this.selectedItems = [];
        this.hotItem = null;
        
        this.extracted = this.getExtractionsFromItems(stream);
        
        this.visualization = (this.extracted.points.length > 0) ? "plot" : 
                             (this.extracted.colors.length > 0) ? "colors" : 
                             (this.extracted.reals.length > 0)  ? "bars" : "";

        this.captionElement[this.visualization == "bars" ? "addClass" : "removeClass"]("NVProcessCanvasCaptionNumber");

        if (!this.isEditing) {
            if (this.visualization == "plot") {
                var metrics = this.getMetrics();
                this.translation = this.getTranslationWithMetrics(metrics);
                this.scale = this.getScaleWithMetrics(metrics);
            }
            else if (this.visualization == "bars") {
                this.bounds = this.getRealBounds();
            }
        }
        
        this.render();
    },
    
    //--------------------------------------------------------------------------------
    //
    //  extract
    
    getExtractionsFromItems: function (items) {
        var extracted = { };
        extracted.points     = this.extract(items, "all", {x:1, y:1});
        extracted.beziers    = this.extract(items, "all", {A:{x:1,y:1}, B:{x:1,y:1}, C:{x:1,y:1}});
        extracted.colors     = this.extract(items, "all", {r:1, g:1, b:1, a:1});
        extracted.properties = this.extract(items, "any", {area:1, height:1, coverage:1, length:1});
        extracted.reals = (extracted.points.length == 0 && extracted.colors.length == 0) ? this.extract(items, "all", 1) : [];
        return extracted;
    },
    
    extract: function (items, allOrAny, template) {
        var things = [];
        Array.each(items, function (item) {
            var objectThings = NLObjectExtract(item.object, template, allOrAny);
            Array.each(objectThings, function (thing) {
                if (typeof(template) == "number") { thing = { value:thing }; }
                thing.item = item;
                things.push(thing);
            }, this);
        }, this);
        return things;
    },
    

    //--------------------------------------------------------------------------------
    //
    //  render

    render: function () {
        var ctx = this.canvas.getContext("2d");
        ctx.clearRect(0,0,this.width,this.height);
        
        if (this.stream.length == 0) { return; }
        
        ctx.save();

        if (this.visualization == "plot") {
            ctx.translate(this.width/2, this.height/2);
            ctx.scale(this.scale, -this.scale);
            ctx.translate(this.translation.x, this.translation.y);
        }
        
        this.renderExtractionsWithHighlight(this.extracted, false);
        
        if (this.selectedItems.length) {
            this.renderExtractionsWithHighlight(this.getExtractionsFromItems(this.selectedItems), true);
        }
        if (this.hotItem) {
            this.renderExtractionsWithHighlight(this.getExtractionsFromItems([ this.hotItem ]), "hot");
        }
        
        this.updateCaptionWithItem(this.hotItem);

        ctx.restore();
    },
    
    renderExtractionsWithHighlight: function (extracted, highlight) {
        if (this.visualization == "plot") {
            if (!highlight) {
                this.drawPlotGrid();
                this.fillBeziers(extracted.beziers, highlight);
            }
            else {
                this.strokeBeziers(extracted.beziers, highlight);
            }

            if (extracted.colors.length) {
                this.fillPixels(extracted.points, extracted.colors, highlight);
            }
            else {
                this.fillPoints(extracted.points, extracted.properties, highlight);
            }
            
            if (highlight === "hot") {
                this.labelBeziers(extracted.beziers, highlight);
            }
        }
        else if (this.visualization == "colors") {
            this.fillColors(extracted.colors, highlight);
        }
        else if (this.visualization == "bars") {
            if (!highlight) {
                this.drawRealGrid();
            }
            this.fillReals(extracted.reals, highlight);
        }
    },
    
    forEachWithHighlight: function (things, highlight, f, bind) {
        Array.each(things, function (thing, i) {
            var isHighlighted = this.selectedItems.contains(thing.item);
            var isHot = (this.hotItem === thing.item);
            if ((highlight === "hot" && isHot) || (highlight === true && isHighlighted) || (!highlight && !isHot && !isHighlighted)) {
                f.call(bind, thing, i);
            }
        }, this);
    },


    //--------------------------------------------------------------------------------
    //
    //  draw points
    
    fillPoints: function (points, properties, highlight) {
        var ctx = this.canvas.getContext("2d");
        ctx.fillStyle = (highlight == "hot") ? "#f00" : highlight ? "#000" : "#53b4ff";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.0 / this.scale;
        
        this.forEachWithHighlight(points, highlight, function (point, i) {
            var property = properties[i];
            var area = property && (property.area || property.coverage);
            var radius;
            
            if (area !== undefined) {
                var s = Math.pow(area.limit(0,1), 2);
                radius = Math.min(0.11, 3.0/this.scale) * (1 - s) + 0.4 * s;
                if (s == 0) { this.strokePoint(point, Math.max(0, radius - ctx.lineWidth/2)); }
                else { this.fillPoint(point,radius); }
            }
            else {
                radius = (highlight ? 3 : 2) / this.scale * (NVPreferences.isHighContrast ? 2 : 1);
                this.fillPoint(point, radius);
            }
        }, this);
    },
    
    fillPoint: function (point, radius) {
        var ctx = this.canvas.getContext("2d");
        ctx.save();
        ctx.translate(point.x,point.y);

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    },

    strokePoint: function (point, radius) {
        var ctx = this.canvas.getContext("2d");
        ctx.save();
        ctx.translate(point.x,point.y);

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI*2);
        ctx.stroke();

        ctx.restore();
    },
    

    //--------------------------------------------------------------------------------
    //
    //  draw beziers
    
    strokeBeziers: function (beziers, highlight) {
        var ctx = this.canvas.getContext("2d");
        ctx.strokeStyle = (highlight == "hot") ? "#f00" : highlight ? "#000" : "rgba(0,0,0,0.1)";
        
        this.forEachWithHighlight(beziers, highlight, function (bezier) {
            this.strokeBezier(bezier);
        }, this);
    },

    strokeBezier: function (bezier) {
        var ctx = this.canvas.getContext("2d");
        ctx.beginPath();
        ctx.lineWidth = 0.6 / this.scale;
        ctx.moveTo(bezier.A.x, bezier.A.y);
        ctx.quadraticCurveTo(bezier.B.x,bezier.B.y,bezier.C.x,bezier.C.y);
        ctx.stroke();
    },

    fillBeziers: function (beziers) {
        if (beziers.length == 0) { return; }
    
        var ctx = this.canvas.getContext("2d");
        ctx.fillStyle = NVPreferences.isHighContrast ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.05)";
        ctx.beginPath();

        var lastBezier = { C:{x:1e100,y:1e100} };
        Array.each(beziers, function (bezier) {
            if (bezier.A.x != lastBezier.C.x || bezier.A.y != lastBezier.C.y) {
                ctx.moveTo(bezier.A.x, bezier.A.y);
            }
            ctx.quadraticCurveTo(bezier.B.x,bezier.B.y,bezier.C.x,bezier.C.y);
            lastBezier = bezier;
        }, this);
        
        ctx.fill();
    },

    labelBeziers: function (beziers, highlight) {
        var ctx = this.canvas.getContext("2d");
        ctx.fillStyle = (highlight == "hot") ? "#f00" : highlight ? "#000" : "#rgba(0,0,0,0.25)";
        
        this.forEachWithHighlight(beziers, highlight, function (bezier) {
            this.labelPoint(bezier.A, "A");
            this.labelPoint(bezier.B, "B");
            this.labelPoint(bezier.C, "C");
        }, this);
    },
    
    labelPoint: function (point, label) {
        var ctx = this.canvas.getContext("2d");
        ctx.save();
        ctx.translate(point.x,point.y);
        ctx.scale(1/this.scale, -1/this.scale);

        ctx.font = NVPreferences.isHighContrast ? 'normal 11px "Helvetica Neue"' : 'normal 9px "Helvetica Neue"';
        ctx.fillText(label, NVPreferences.isHighContrast ? 10 : 6, 3);

        ctx.restore();
    },


    //--------------------------------------------------------------------------------
    //
    //  draw pixels
    
    fillPixels: function (points, colors, highlight) {
        if (points.length == 0 || points.length !== colors.length) { return; }

        var ctx = this.canvas.getContext("2d");

        if (!highlight) {
            Array.each(points, function (point, i) {
                var color = colors[i];
                var x = Math.floor(point.x), y = Math.floor(point.y), w = 1, h = 1;
    
                ctx.fillStyle = "rgba(" + Math.round(255 * color.r) + "," + Math.round(255 * color.g) + "," + Math.round(255 * color.b) + "," + color.a + ")";
                ctx.fillRect(x, y, w, h);
            }, this);
        }
        else {
            this.forEachWithHighlight(points, highlight, function (point) {
                var x = Math.floor(point.x), y = Math.floor(point.y), w = 1, h = 1;

                var r = NVPreferences.isHighContrast ? Math.min(0.6, 7/this.scale) : Math.min(0.6, 4/this.scale);
                ctx.fillStyle = NVPreferences.isHighContrast ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.1)";
                ctx.fillRect(x + w/2 - r, y + h/2 - r, r*2, r*2);

                r = NVPreferences.isHighContrast ? Math.min(0.5, 5/this.scale) : Math.min(0.5, 3/this.scale);
                ctx.fillStyle = (highlight === "hot") ? "#ff0000" : (NVPreferences.isHighContrast ? "rgba(0,0,0,1)" : "rgba(255,255,255,0.4)");
                ctx.fillRect(x + w/2 - r, y + h/2 - r, r*2, r*2);
            }, this)
        }
    },


    //--------------------------------------------------------------------------------
    //
    //  draw bars
    
    fillColors: function (colors, highlight) {
        var ctx = this.canvas.getContext("2d");

        var padding = (this.stream.length > this.width/4) ? 0 : 1;
        var barWidth = Math.floor(this.width / this.stream.length) - padding;
        var highlightHeight = barWidth;
        
        this.forEachWithHighlight(colors, highlight, function (color) {
            var i = Math.max(0, this.stream.indexOf(color.item));
            var barX = i * (barWidth + padding);
            
            ctx.fillStyle = "rgba(" + Math.round(255 * color.r) + "," + Math.round(255 * color.g) + "," + Math.round(255 * color.b) + "," + color.a + ")";
            ctx.fillRect(barX, 0, barWidth, this.height);
            
            if (highlight) {
                ctx.fillStyle = "#fff";
                ctx.fillRect(barX, (this.height - (highlightHeight + 2))/2, barWidth, highlightHeight + 2);
                ctx.fillStyle = (highlight === "hot") ? "#f00" : "#000";
                ctx.fillRect(barX, (this.height - highlightHeight)/2, barWidth, highlightHeight);
            }
            
        }, this);
    },
    
    fillReals: function (reals, highlight) {
        var ctx = this.canvas.getContext("2d");
        ctx.fillStyle = (highlight == "hot") ? "#f00" : highlight ? "#000" : "rgba(0,0,0,0.2)";

        var padding = (this.stream.length > this.width/2) ? 0 : 1;
        var barWidth = Math.floor(this.width / this.stream.length) - padding;

        var bounds = this.bounds;
        
        this.forEachWithHighlight(reals, highlight, function (real) {
            var value = real.value;
            var i = this.stream.indexOf(real.item);
            if (i < 0) { i = 0; }
            
            var y = bounds.getYForValue(value);
            ctx.fillRect(i * (barWidth + padding), Math.min(y, bounds.baselineY), barWidth, Math.abs(y - bounds.baselineY));
        }, this);
    },
            

    //--------------------------------------------------------------------------------
    //
    //  draw grid

    drawPlotGrid: function () {
        var scale = this.scale;
        var ctx = this.canvas.getContext("2d");
        ctx.save();
        
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1 / scale;

        var minX = -0.5 * this.width / scale - this.translation.x;
        var maxX =  0.5 * this.width / scale - this.translation.x;
        var minY = -0.5 * this.height / scale - this.translation.y;
        var maxY =  0.5 * this.height / scale - this.translation.y;
        
        var stepBase = 10;
        var k = Math.round(Math.log((maxX - minX) / 8) / Math.log(stepBase));
        var step = Math.pow(stepBase,k);
        
        for (var x = Math.floor(minX / step) * step; x < maxX; x += step) {
            var snappedX = (Math.floor(x * scale) + 0.5) / scale;
            ctx.beginPath();
            ctx.moveTo(snappedX, minY);
            ctx.lineTo(snappedX, maxY);
            ctx.stroke();
        }
        for (var y = Math.floor(minY / step) * step; y < maxY; y += step) {
            var snappedY = (Math.floor(y * scale) + 0.5) / scale;
            ctx.beginPath();
            ctx.moveTo(minX, snappedY);
            ctx.lineTo(maxX, snappedY);
            ctx.stroke();
        }
        
        ctx.restore();
    },

    drawRealGrid: function () {
        var ctx = this.canvas.getContext("2d");
        ctx.save();
        
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;

        var bounds = this.bounds;
        var minV = Math.min(bounds.min, 0);
        var maxV = Math.max(bounds.max, 0);
        
        var stepBase = 10;
        var k = Math.round(Math.log((maxV - minV) / 8) / Math.log(stepBase));
        var step = Math.pow(stepBase,k);

        for (var v = Math.floor(minV / step) * step; v <= maxV; v += step) {
            var snappedY = Math.floor(bounds.getYForValue(v)) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, snappedY);
            ctx.lineTo(this.width, snappedY);
            ctx.stroke();
        }
        
        ctx.restore();
    },


    //--------------------------------------------------------------------------------
    //
    //  plot metrics
    
    getMetrics: function () {
        var points = this.extracted.points;
        if (points.length == 0) { points = [ {x:0, y:0} ]; }
    
        var minPoint = { x:points[0].x, y:points[0].y };
        var maxPoint = { x:points[0].x, y:points[0].y };
        
        Array.each(points, function (point) {
            minPoint.x = Math.min(minPoint.x, point.x);
            minPoint.y = Math.min(minPoint.y, point.y);
            maxPoint.x = Math.max(maxPoint.x, point.x);
            maxPoint.y = Math.max(maxPoint.y, point.y);
        }, this);
        
        var midPoint = { x:0.5*(maxPoint.x + minPoint.x), y:0.5*(maxPoint.y + minPoint.y) };
        
        return {
            minPoint: minPoint,
            maxPoint: maxPoint,
            midPoint: midPoint,
        };
    },
    
    getScaleWithMetrics: function (metrics) {
        var pointsWidth = metrics.maxPoint.x - metrics.minPoint.x;
        var pointsHeight = metrics.maxPoint.y - metrics.minPoint.y;
        
        var widthScale = this.width / Math.max(0.01, pointsWidth);
        var heightScale = this.height / Math.max(0.01, pointsHeight);
    
        var scale = 0.75 * Math.min(widthScale, heightScale);
        return scale;
    },
    
    getTranslationWithMetrics: function (metrics) {
        return { x: -metrics.midPoint.x, y:-metrics.midPoint.y };
    },
    
    getPointNearCanvasPoint: function (canvasPoint, radius) {
       var p = { x:((canvasPoint.x - this.width/2)  /  this.scale) - this.translation.x,
                 y:((canvasPoint.y - this.height/2) / -this.scale) - this.translation.y };
       radius = radius / this.scale;
    
       var closestPoint = null;
       var closestDistance = 1e100;

       Array.each(this.extracted.points, function (point) {
           var distance = Math.sqrt((point.x - p.x) * (point.x - p.x) + (point.y - p.y) * (point.y - p.y));
           if (distance < closestDistance) { closestDistance = distance; closestPoint = point; }
       }, this);
       
       return (closestDistance <= radius) ? closestPoint : null;
    },


    //--------------------------------------------------------------------------------
    //
    //  bar bounds
    
    getRealBounds: function () {
        var max = -1e99, min = 1e99;

        Array.each(this.extracted.reals, function (real) {
            max = Math.max(real.value, max);
            min = Math.min(real.value, min);
        }, this);
        
        return this.getRealBoundsWithMaxAndMin(max,min);
    },
    
    getRealBoundsWithMaxAndMin: function (max,min) {
        var bounds = { max:max, min:min };
        if (bounds.max - bounds.min < 1e-3) { bounds.max = bounds.min + 1e-3; }
        bounds.range = bounds.max - bounds.min;

        var canvasHeight = this.height;
        var margin = 6;
        var baselineHeight = 2;
        
        bounds.getYForValue = function (v) {
            if (bounds.min >= 0) { return canvasHeight - baselineHeight - (v / bounds.max * (canvasHeight - margin - baselineHeight)); }
            if (bounds.max <= 0) { return baselineHeight + v / bounds.min * (canvasHeight - margin - baselineHeight); }
                
            var zeroY = bounds.max / bounds.range * (canvasHeight - 2 * margin) + margin;
            barHeight = -v / bounds.range * (canvasHeight - 2 * margin);
            return zeroY + barHeight;
        };

        bounds.baselineY = (bounds.min >= 0) ? canvasHeight : (bounds.max <= 0) ? 0 : bounds.getYForValue(0);
        bounds.deltaPerPixel = 1.0 / (bounds.getYForValue(0) - bounds.getYForValue(1));
        
        return bounds;
    },

    getItemNearCanvasPoint: function (canvasPoint) {
        if (this.stream.length == 0) { return null; }
        if (this.visualization == "plot") {
            var point = this.getPointNearCanvasPoint(canvasPoint, 20);
            return point ? point.item : null;
        }
        
        var barWidth = Math.floor(this.width / this.stream.length);
        var i = Math.floor(canvasPoint.x / barWidth).limit(0, this.stream.length - 1);
        return this.stream[i];
    },


    //--------------------------------------------------------------------------------
    //
    //  caption
    
    updateCaptionWithItem: function (item) {
        this.captionElement.setStyle("display", item ? "block" : "none");
        if (!item) { return; }
        
        this.captionElement.set("html", NLObjectGetDescription(item.object));
        
        if (this.visualization == "bars") {
            var index = Math.max(0, this.stream.indexOf(item));
            var barWidth = Math.floor(this.width / this.stream.length);
            this.captionElement.setStyle("left", (index + 0.5) * barWidth - 0.5 * this.captionElement.getWidth());
        }
        else {
            this.captionElement.setStyle("left", 0);
        }
    },
    
});



//====================================================================================
//
//  NVInteractiveCanvasView
//

var NVInteractiveCanvasView = new Class({

    Extends: NVCanvasView,
    
    initialize: function (processView) {
        this.parent(processView);
        
        Array.each(this.element.getChildren(), function (element) {
            element.setStyle("pointerEvents", "none");  // needed so hover events don't bubble up from children
        });
        
        this.mouseDragBound = this.mouseDrag.bind(this);
        this.mouseUpBound = this.mouseUp.bind(this);
        this.mouseMoveBound = this.mouseMove.bind(this);
        
        this.element.addEvent("mousedown", this.mouseDown.bind(this));
        this.element.addEvent("mouseenter", this.mouseEnter.bind(this));
        this.element.addEvent("mouseleave", this.mouseLeave.bind(this));
        this.element.addEvent("dblclick", this.doubleClick.bind(this));
        
        this.helpElement = this.element.getElement(".NVProcessCanvasHelp");
        this.helpOpacity = 0;

        this.hoverItem = null;
    },
    
    setStream: function (stream) {
        this.setHoverItem(null);
        this.parent(stream);
        
        this.element.setStyle("cursor", this.visualization == "plot" ? "all-scroll" : "default");
    },

    setEditable: function (editable) {
        this.isEditable = editable;
        this.helpElement.set("text", "Drag " + (this.visualization == "plot" ? "points" : "bars") + "  to change initial input.");
    },

    destroy: function () {
        this.element.removeEvents();
    },
    

    //--------------------------------------------------------------------------------
    //
    //  adjust object
    
    translatePointInStream: function (point, dx, dy) {
        var oldStream = this.programView.initialInputStream;
        var newStream = NLStream();
        
        for (var i = 0; i < oldStream.length; i++) {
            var object = oldStream[i].object;
            var translatedObject = NLObjectMovePoint(object, point.x, point.y, point.x + dx, point.y + dy);
            newStream.push(NLStreamItem(translatedObject));
        }
        
        this.programView.setInitialInputStream(newStream);
    },
    
    subdivideItem: function (item) {
        var oldStream = this.programView.initialInputStream;
        var newStream = NLStream();
        
        for (var i = 0; i < oldStream.length; i++) {
            var object = oldStream[i].object;
            if (item == oldStream[i]) {
                var objects = NLObjectSubdivide(object);
                Array.each(objects, function (o) { newStream.push(NLStreamItem(o)); });
            }
            else {
                newStream.push(NLStreamItem(object));
            }
        }
        
        this.programView.setInitialInputStream(newStream);
    },

    adjustRealInStream: function (item, delta) {
        var index = this.stream.indexOf(item);
        var oldStream = this.programView.initialInputStream;
        var newStream = NLStream();
        
        for (var i = 0; i < oldStream.length; i++) {
            var object = oldStream[i].object;
            var adjustedObject = (i != index) ? object : NLReal(NLRealUnbox(object) + delta);
            newStream.push(NLStreamItem(adjustedObject));
        }
        
        this.programView.setInitialInputStream(newStream);
    },


    //--------------------------------------------------------------------------------
    //
    //  drag
    
    mouseDown: function (event) {
        event.stop();
        this.element.getDocument().addEvent("mousemove", this.mouseDragBound);
        this.element.getDocument().addEvent("mouseup", this.mouseUpBound);

        this.lastMousePosition = this.getMousePositionWithEvent(event);
        if (this.resetTimer) { clearInterval(this.resetTimer); this.resetTimer = null; }
        
        if (!this.isEditable) { this.animateHelpOpacity(1,100); }
        
        if (this.isEditable && this.hoverItem) {
            this.isEditing = true;
        }
    },

    mouseDrag: function (event) {
        event.stop();

        var mousePosition = this.getMousePositionWithEvent(event);
        var dx = mousePosition.x - this.lastMousePosition.x;
        var dy = mousePosition.y - this.lastMousePosition.y;
        this.lastMousePosition = mousePosition;
        
        if (this.visualization == "plot") {
            if (this.isEditing) {
                if (this.hoverPoint) {
                    var pointIndex = this.extracted.points.indexOf(this.hoverPoint);
                    this.translatePointInStream(this.hoverPoint, dx / this.scale, -dy / this.scale);
                    this.setHoverPoint(this.extracted.points[pointIndex]);
                    return;
                }
            }
            else if (event.shift) {
                this.scale *= Math.pow(1.01, dx - dy);
            }
            else {
                this.translation.x +=  dx / this.scale;
                this.translation.y += -dy / this.scale;
            }
        }
        else if (this.visualization == "bars") {
            if (this.isEditing && this.hoverItem) {
                var itemIndex = this.stream.indexOf(this.hoverItem);
                this.adjustRealInStream(this.hoverItem, -dy * this.bounds.deltaPerPixel);
                this.setHoverItem(this.stream[itemIndex]);
                return;
            }
        }
        
        this.render();
    },

    mouseUp: function (event) {
        event.stop();
        this.element.getDocument().removeEvent("mousemove", this.mouseDragBound);
        this.element.getDocument().removeEvent("mouseup", this.mouseUpBound);
        
        if (!this.isEditable) { this.animateHelpOpacity(0,1000); }
        
        if (this.isEditing) {
            this.isEditing = false;
            this.animateResetView();
        }
    },
    
    getMousePositionWithEvent: function (event) {
        var elementPosition = this.element.getPosition();
        return { x:event.page.x - elementPosition.x, y:event.page.y - elementPosition.y };
    },

    doubleClick: function (event) {
        event.stop();

        if (this.isEditable && this.hoverItem && this.stream.length == this.extracted.beziers.length) {
            this.subdivideItem(this.hoverItem);
        }
        else {
            this.animateResetView();
        }
    },


    //--------------------------------------------------------------------------------
    //
    //  hover

    mouseEnter: function (event) {
        this.element.getDocument().addEvent("mousemove", this.mouseMoveBound);
        if (this.isEditable) { this.animateHelpOpacity(1,100); }
    },

    mouseMove: function (event) {
        if (this.isEditing) { return; }
        var elementPosition = this.element.getPosition();
        var canvasPoint = { x:event.page.x - elementPosition.x, y:event.page.y - elementPosition.y };
        if (this.visualization == "plot") {
            this.setHoverPoint(this.getPointNearCanvasPoint(canvasPoint, 20));
        }
        else {
            this.setHoverItem(this.getItemNearCanvasPoint(canvasPoint));
        }
    },

    mouseLeave: function (event) {
        if (this.isEditable) { this.animateHelpOpacity(0,400); }
        if (this.isEditing) { return; }
        this.setHoverItem(null);
        this.element.getDocument().removeEvent("mousemove", this.mouseMoveBound);
    },
    
    setHoverPoint: function (point) {
        this.hoverPoint = point;
        this.setHoverItem(point ? point.item : null);
    },
    
    setHoverItem: function (item) {
        if (this.hoverItem) {
            this.programView.setHighlightedWithStreamItem(false, this.hoverItem);
        }

        this.hoverItem = item;
        if (!item) { this.hoverPoint = null; }
        
        if (item) {
            this.programView.setHighlightedWithStreamItem(true, item);
        }
        
        if (this.isEditable) {
            if (this.visualization == "plot") {
                this.element.setStyle("cursor", item ? "crosshair" : "all-scroll");
            }
            else if (this.visualization == "bars") {
                this.element.setStyle("cursor", item ? "row-resize" : "default");
            }
        }
    },
        

    //--------------------------------------------------------------------------------
    //
    //  reset transform

    animateResetView: function () {
        if (this.visualization == "plot") { this.animateResetTransform(); }
        if (this.visualization == "bars") { this.animateResetBounds(); }
    },

    animateResetTransform: function () {
        var metrics = this.getMetrics();
        var targetTranslation = this.getTranslationWithMetrics(metrics);
        var targetScale = this.getScaleWithMetrics(metrics);
        
        this.animateSetTranslationAndScale(targetTranslation, targetScale);
    },

    animateSetTranslationAndScale: function (targetTranslation, targetScale) {
        var progress = 0;
        var speed = 0.3;
        
        if (this.resetTimer) { clearTimeout(this.resetTimer); }
        
        var timer = this.resetTimer = setInterval( (function () {
            progress += 1/30;
            if (progress > 0.8) { speed = 1; clearTimeout(timer); }

            this.translation.x += speed * (targetTranslation.x - this.translation.x);
            this.translation.y += speed * (targetTranslation.y - this.translation.y);
            this.scale += speed * (targetScale - this.scale);
            this.render();
        }).bind(this), 1000/30);
    },


    //--------------------------------------------------------------------------------
    //
    //  reset bounds

    animateResetBounds: function () {
        var bounds = this.getRealBounds();
        this.animateSetBounds(bounds);
    },

    animateSetBounds: function (targetBounds) {
        var progress = 0;
        var speed = 0.5;
        
        if (this.resetTimer) { clearTimeout(this.resetTimer); }
        
        var timer = this.resetTimer = setInterval( (function () {
            progress += 1/30;
            if (progress > 0.8) { speed = 1; clearTimeout(timer); }
            
            var max = this.bounds.max + speed * (targetBounds.max - this.bounds.max);
            var min = this.bounds.min + speed * (targetBounds.min - this.bounds.min);

            this.bounds = this.getRealBoundsWithMaxAndMin(max,min);
            this.render();
        }).bind(this), 1000/30);
    },


    //--------------------------------------------------------------------------------
    //
    //  fade help

    animateHelpOpacity: function (targetOpacity, duration) {
        if (this.helpTimer) { clearTimeout(this.helpTimer); }
        if (this.helpOpacity == targetOpacity) { return; }
        
        var initialOpacity = this.helpOpacity;
        var progress = 0;
        
        this.helpTimer = setInterval( (function () {
            progress = Math.min(1, progress + (1000/30) / duration);
            this.helpOpacity = initialOpacity + (targetOpacity - initialOpacity) * progress;

            var canShowHelp = (this.visualization == "plot") && (this.pipelineView.columnIndex == this.programView.getColumnCount() - 1);
            
            var colorComponent = "" + Math.round(255 * (0.75 + 0.25 * (1.0 - this.helpOpacity)));
            var color = "rgba(" + colorComponent + "," + colorComponent + "," + colorComponent + ",1)";
            this.helpElement.setStyle("color", color);
            this.helpElement.setStyle("display", (this.helpOpacity && canShowHelp) ? "block" : "none");
            
            if (progress == 1) {
                clearTimeout(this.helpTimer);
                this.helpTimer = null;
            }
        }).bind(this), 1000/30);
    }

});

