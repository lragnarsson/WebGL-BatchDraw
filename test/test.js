
function main() {
    let debug = false;

    if (debug) {
        debugTest();
    } else {
        var N = 30000;
        var lines = generateLines(N);

        //timeCanvas2D(lines, N);
        timeBatchDraw(lines, N);
    }
}


function debugTest() {
    canvas = document.getElementById("canvas");
    let params = {
        maxElements: 10,
        clearColor: {r: 1, g: 1, b: 1, alpha: 1},
        usePixelCoords: true,
        forceGL1: false
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
        //batchDrawer.addLine(0.5, 0.5, 1, 0, 0.01, 0.8, 0.1, 0.7, 1.0);
        //batchDrawer.addDot(0.3, 0.5, 0.05, 0.1, 0.7, 1, 1);
        
        batchDrawer.draw(false);
    }
}


function generateLines(N) {
    var lines = new Array(N);
    let canvas = document.getElementById("canvas");
    let w = canvas.width;
    let h = canvas.height;

    // Create funky lines:
    for (i=0; i<N; i++) {
        lines[i] = {
                    fromX: (1.3*i/N) * w,
                    fromY: 0.5/(2*(i/N) + 1) * h,
                    toX: (0.1*i-1)/(N - i) * w,
                    toY: (0.3*N)/(5*(i*i)/N) * 0.5 * h,
                    };
    }
    //console.log(lines);
    return lines;
}


function timeBatchDraw(lines, N) {
    let canvas = document.getElementById("canvas");
    let params = {
        maxElements: N,
        clearColor: {r: 1, g: 1, b: 1, alpha: 1},
        usePixelValues: true,
        forceGL1: false
    };
    let batchDrawer = new BatchDrawer(canvas, params);

    if (batchDrawer.error != null) {
        console.log(batchDrawer.error);
        return;
    }
    console.time("BatchDraw");
    for (i=0; i<N; i++) {
        batchDrawer.addLine(lines[i].fromX, lines[i].fromY, lines[i].toX, lines[i].toY, 0.01, 1, 0.5, 0.1, 1);
    }

    batchDrawer.draw(false);
    console.timeEnd("BatchDraw");
}


function timeCanvas2D(lines, N) {
    let canvas = document.getElementById("canvas");
    let ctx = canvas.getContext("2d");

    ctx.lineWidth = 0.01;
    ctx.strokeStyle = '#ffa500';
    ctx.fillStyle="#FFFFFF";

    console.time("Canvas2D");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (i=0; i<N; i++) {
        ctx.beginPath();
        ctx.moveTo(lines[i].fromX, lines[i].fromY);
        ctx.lineTo(lines[i].toX, lines[i].toY);
        ctx.stroke();
    }
    console.timeEnd("Canvas2D");
}