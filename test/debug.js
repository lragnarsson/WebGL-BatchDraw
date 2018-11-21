function main() {
    let canvas = document.getElementById("canvas");
    let params = {
        maxLines: 10,
        maxDots: 10,
        clearColor: {r: 1, g: 1, b: 1, a: 1},
        forceGL1: false,
        coordinateSystem: "ndc"
    };
    let batchDrawer = new BatchDrawer(canvas, params);
    console.log(batchDrawer);

    if (batchDrawer.error != null) {
        console.log(batchDrawer.error);
    } else {
        // In pixel coordinates:

        //batchDrawer.addLine(500, 100, 100, 50, 10, 0.8, 0.1, 0.7, 1.0);
        //batchDrawer.addLine(10, 100, 30, 300, 10, 0.8, 0.1, 0.7, 1.0);
        //batchDrawer.addDot(400, 300, 20, 0.5, 0.7, 1, 1);


        // In normalized screen coordinates [0, 1]
        batchDrawer.addLine(0.5, 0.5, 0.2, 0.5, 0.01, 0.8, 0.1, 0.7, 0.5);
        batchDrawer.addLine(0.5, 0.45, 0.2, 0.45, 0.01, 0.8, 0.1, 0.7, 0.5);
        batchDrawer.addLine(0.5, 0.444, 0.2, 0.444, 0.01, 0.8, 0.1, 0.7, 0.5);
        batchDrawer.addLine(0.3, 0.2, 0.3, 0.8, 0.01, 0.8, 0.1, 0.7, 0.5);
        batchDrawer.addLine(0.4, 0.2, 0.2, 0.7, 0.01, 0.8, 0.1, 0.7, 0.5);
        //batchDrawer.addDot(0.3, 0.5, 0.05, 0.1, 0.7, 1, 1);

        // In Long-Lat (WGS 84)

        //batchDrawer.addLine(55, 30, 55, 60, 10, 0.8, 0.1, 0.7, 1.0);
        //batchDrawer.addDot(18, 59, 100, 0.5, 0.7, 1, 1);
        //batchDrawer.setZoomLevel(2);
        //batchDrawer.setPixelOrigin({x: 500, y: 100});


        batchDrawer.draw();
    }
}
