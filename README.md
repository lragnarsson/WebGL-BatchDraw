# WebGL-BatchDraw

Small utility library for drawing many 2D lines and dots using WebGL2 and instancing.
Using a HTML5 Canvas 2D context to render shapes is simple but can be slow when the number of shapes gets large.

## Example

```javascript
    // Get canvas element:
    canvas = document.getElementById("canvas");

    // Set parameters (these are the default values used when that option is omitted):
    let params = {
        maxLines: 10000, // used for preallocation
        maxDots: 10000,
        forceGL1: false, // use WebGL 1 even if WebGL 2 is available
        clearColor: {r: 0, g: 0, b: 0, a: 0}, // Color to clear screen with
        coordinateSystem: "ndc" // Use normalized device coordinates [0, 1] instead of pixel coordinates
    };

    // Initialize BatchDrawer:
    var batchDrawer = new BatchDrawer(canvas, params);

    // Check for errors:
    if (batchDrawer.error != null) {
        console.log(batchDrawer.error);
    } else {
        // Add a line. args = (fromX, fromY, toX, toY, lineWidth, colorR, colorG, colorB, colorA)
        batchDrawer.addLine(10, 100, 30, 300, 10, 0.8, 0.1, 0.7, 1.0);

        // Adda a dot. Args = (posX, posY, dotSize, colorR, colorG, colorB, colorA)
        batchDrawer.addDot(400, 300, 20, 0.5, 0.7, 1, 1);

        // Draw all added lines and dots, pass true to remember old elements next draw call.
        batchDrawer.draw();
    }
```

All coordinates/sizes can be in pixels with coordinates starting from the top left corner or normalized to [0, 1].

## Performance Comparison
Here is a speed comparison taking the average over 5 runs of the test script:

|                    | 10,000 lines | 100,000 lines | 1,000,000 lines | 10,000,000 lines |
|--------------------|--------------|---------------|-----------------|------------------|
| BatchDraw, Firefox | 3.9 ms       | 5.3 ms        | 20.8 ms         |  185 ms          |
| Canvas 2D, Firefox | 46 ms        | 416 ms        | 4113 ms         |  42,000 ms       |
| BatchDraw, Chrome  | 2.4 ms       | 21 ms         | 145 ms          |  crashed         |
| Canvas 2D, Chrome  | 53 ms        | 417 ms        | 4051 ms         |  crashed         |
