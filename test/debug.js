function main() {
    let canvas = document.getElementById("canvas");
    let params = {
        maxLines: 10,
        maxDots: 10,
        clearColor: {r: 1, g: 1, b: 1, a: 1},
        useNDC: false
    };
    var batchDrawer = new BatchDrawer(canvas, params);

    if (batchDrawer.error != null) {
        console.log(batchDrawer.error);
    } else {
        // In pixel coordinates:
        batchDrawer.addLine(500, 100, 100, 50, 10, 0.8, 0.1, 0.7, 1.0);
        batchDrawer.addLine(10, 100, 30, 300, 10, 0.8, 0.1, 0.7, 1.0);
        batchDrawer.addDot(400, 300, 20, 0.5, 0.7, 1, 1);

        // In normalized screen coordinates [0, 1]
        //batchDrawer.addLine(0.5, 0.5, 0.2, 0.5, 0.01, 0.8, 0.1, 0.7, 1.0);
        //batchDrawer.addDot(0.3, 0.5, 0.05, 0.1, 0.7, 1, 1);

        batchDrawer.draw();
    }
}
