/*
 * WebGL BatchDraw
 * Source: https://github.com/lragnarsson/WebGL-BatchDraw
 * License: MIT
 */

class BatchDrawer {
    constructor(canvas, params) {
        // Define coordinate system "enums"
        this.PIXELS = 0;
        this.NDC = 1;
        this.WGS84 = 2;

        // Get optional parameters or defaults
        this.canvas = canvas;
        this.maxLines = params.maxLines == null ? 10000 : params.maxLines;
        this.maxDots = params.maxDots == null ? 10000 : params.maxDots;
        this.forceGL1 = params.forceGL1 == null ? false : params.forceGL1;
        this.clearColor = params.clearColor == null ? {r: 0, g: 0, b: 0, a: 1} : params.clearColor;
        switch(params.coordinateSystem) {
        case null:
        case "pixels":
            this.coordinateSystem = this.PIXELS;
            break;
        case "ndc":
            this.coordinateSystem = this.NDC;
            break;
        case "wgs84":
            this.coordinateSystem = this.WGS84;
            break;
        default:
            this.error = "Unrecognized coordinate system. Use pixels, ndc or wgs84!";
            return;
        }

        // Init variables
        this.error = null;
        this.numLines = 0;
        this.numDots = 0;
        this.zoomLevel = 1;
        this.zoomScale = 256 * Math.pow(2, this.zoomLevel);
        this.pixelOrigin = {x: 0, y: 0};

        if (!this._initGLContext()) {
            return;
        }

        // Define attribute locations:
        this.LINE_VX_BUF = 0;
        this.LINE_START_BUF = 1;
        this.LINE_END_BUF = 2;
        this.LINE_WIDTH_BUF = 3;
        this.LINE_COLOR_BUF = 4;

        this.DOT_VX_BUF = 0;
        this.DOT_POS_BUF = 1;
        this.DOT_SIZE_BUF = 2;
        this.DOT_COLOR_BUF = 3;

        if (!this._initShaders()) {
            return;
        }

        this.GL.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a);

        // Set blend function, color(RGBA) = (sourceColor * sfactor) + (destinationColor * dfactor)
        // For more info see https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/blendFunc
        this.GL.enable(this.GL.BLEND);
        this.GL.blendFunc(this.GL.ONE, this.GL.ONE_MINUS_SRC_ALPHA);

        this._initBuffers();

        this._initUniforms();
    }


    _initGLContext() {
        this.GL = null;
        this.GLVersion = null;
        if (!this.forceGL1) {
            // Attempt to get a WebGL 2 context:
            try {
                this.GL = this.canvas.getContext("webgl2");
                this.GLVersion = 2;
            } catch(e) {
                console.log("Could not create a WebGL2 context.");
            }
        }

        // Fallback to WebGL 1:
        if (!this.GL) {
            try {
                this.GL = this.canvas.getContext("webgl");
                this.ext = this.GL.getExtension("ANGLE_instanced_arrays");
                this.GLVersion = 1;
            } catch(e) {
                console.log("Could not create a WebGL1 context.");
            }
        }

        // Fallback to WebGL experimental (Internet explorer):
        if (!this.GL) {
            try {
                this.GL = this.canvas.getContext("experimental-webgl");
                this.ext = this.GL.getExtension("ANGLE_instanced_arrays");
                this.GLVersion = 1;
            } catch(e) {
                console.log("Could not create an experimental-WebGL1 context.");
            }
        }

        if (!this.GL) {
            // Could not get anything
            this.error = "Could not initialize a WebGL context.";
            return false;
        }
        return true;
    }


    _initBuffers() {
        // Initialize constant vertex positions for lines and dots:
        this.lineVertexBuffer = this._initArrayBuffer(new Float32Array([-0.5,  0.5,  1.0,
                                                                        -0.5, -0.5,  1.0,
                                                                         0.5,  0.5,  1.0,
                                                                         0.5, -0.5,  1.0]), 3);
        this.dotVertexBuffer = this._initArrayBuffer(new Float32Array([-0.5,  0.0,  1.0,
                                                                        0.0, -0.5,  1.0,
                                                                        0.0,  0.5,  1.0,
                                                                        0.5,  0.0,  1.0]), 3);

        // Initialize Float32Arrays for CPU storage:
        this.lineStartArray = new Float32Array(this.maxLines * 2);
        this.lineEndArray = new Float32Array(this.maxLines * 2);
        this.lineWidthArray = new Float32Array(this.maxLines);
        this.lineColorArray = new Float32Array(this.maxLines * 4);

        this.dotPosArray = new Float32Array(this.maxDots * 2);
        this.dotSizeArray = new Float32Array(this.maxDots);
        this.dotColorArray = new Float32Array(this.maxDots * 4);

        // Initialize Empty WebGL buffers:
        this.lineStartBuffer = this._initArrayBuffer(this.lineStartArray, 2);
        this.lineEndBuffer = this._initArrayBuffer(this.lineEndArray, 2);
        this.lineWidthBuffer = this._initArrayBuffer(this.lineWidthArray, 1);
        this.lineColorBuffer = this._initArrayBuffer(this.lineColorArray, 4);

        this.dotPosBuffer = this._initArrayBuffer(this.dotPosArray, 2);
        this.dotSizeBuffer = this._initArrayBuffer(this.dotSizeArray, 1);
        this.dotColorBuffer = this._initArrayBuffer(this.dotColorArray, 4);
    }


    _initArrayBuffer(data, item_size) {
        let buffer = this.GL.createBuffer();
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, buffer);
        this.GL.bufferData(this.GL.ARRAY_BUFFER, data, this.GL.DYNAMIC_DRAW);
        return buffer;
    }


    _createShaderProgram(vertexSource, fragmentSource, shape) {
        let vertexShader = this._compileShader(vertexSource, this.GL.VERTEX_SHADER);
        let fragmentShader = this._compileShader(fragmentSource, this.GL.FRAGMENT_SHADER);
        if (!vertexShader || ! fragmentShader) {
            return false;
        }

        let program = this.GL.createProgram();

        // Bind attribute locations for this shape:
        if (shape === 'line') {
            this.GL.bindAttribLocation(program, this.LINE_VX_BUF, 'vertexPos');
            this.GL.bindAttribLocation(program, this.LINE_START_BUF, 'inLineStart');
            this.GL.bindAttribLocation(program, this.LINE_END_BUF, 'inLineEnd');
            this.GL.bindAttribLocation(program, this.LINE_WIDTH_BUF, 'inLineWidth');
            this.GL.bindAttribLocation(program, this.LINE_COLOR_BUF, 'lineColor');
        } else if (shape === 'dot') {
            this.GL.bindAttribLocation(program, this.DOT_VX_BUF, 'vertexPos');
            this.GL.bindAttribLocation(program, this.DOT_POS_BUF, 'inDotPos');
            this.GL.bindAttribLocation(program, this.DOT_SIZE_BUF, 'inDotSize');
            this.GL.bindAttribLocation(program, this.DOT_COLOR_BUF, 'dotColor');
        }

        this.GL.attachShader(program, vertexShader);
        this.GL.attachShader(program, fragmentShader);
        this.GL.linkProgram(program);

        if (!this.GL.getProgramParameter(program, this.GL.LINK_STATUS)) {
            this.error = "Could not link shaders: " + this.GL.getProgramInfoLog(program);
            return false;
        }
        return program;
    }


    _compileShader(shaderSource, shaderType) {
        let shader = this.GL.createShader(shaderType);
        this.GL.shaderSource(shader, shaderSource);
        this.GL.compileShader(shader);

        if (!this.GL.getShaderParameter(shader, this.GL.COMPILE_STATUS)) {
            this.error = "Could not compile shader: " + this.GL.getShaderInfoLog(shader);
            return null;
        }
        return shader;
    }


    _initUniforms() {
        let projection = new Float32Array([2 / this.canvas.width, 0, 0,
                                           0, -2 / this.canvas.height, 0,
                                          -1, 1, 1]);
        let resScaleX = 1;
        let resScaleY = 1;
        if (this.coordinateSystem == this.NDC) {
            resScaleX = this.canvas.width;
            resScaleY = this.canvas.height;
        }

        this.GL.viewport(0, 0, this.canvas.width, this.canvas.height);

        this.GL.useProgram(this.lineProgram);
        let lineProjLoc = this.GL.getUniformLocation(this.lineProgram, 'projection');
        this.GL.uniformMatrix3fv(lineProjLoc, false, projection);
        if (this.coordinateSystem != this.WGS84) {
            let lineResLoc = this.GL.getUniformLocation(this.lineProgram, 'resolutionScale');
            this.GL.uniform2f(lineResLoc, resScaleX, resScaleY);
        } else {
            let oneResLoc = this.GL.getUniformLocation(this.lineProgram, 'ONE');
            this.GL.uniform1f(oneResLoc, 1);
        }

        this.GL.useProgram(this.dotProgram);
        let dotProjLoc = this.GL.getUniformLocation(this.dotProgram, 'projection');
        this.GL.uniformMatrix3fv(dotProjLoc, false, projection);
        if (this.coordinateSystem != this.WGS84) {
            let dotResLoc = this.GL.getUniformLocation(this.dotProgram, 'resolutionScale');
            this.GL.uniform2f(dotResLoc, resScaleX, resScaleY);
        }

        this.setZoomLevel(this.zoomLevel);
        this.setPixelOrigin(this.pixelOrigin);
    }


    updateCanvasSize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this._initUniforms();
    }


    setZoomLevel(zoomLevel) {
        this.zoomLevel = zoomLevel;
        this.zoomScale = 256 * Math.pow(2, this.zoomLevel);
        if (this.coordinateSystem == this.WGS84) {
            this.GL.useProgram(this.lineProgram);
            let zoomLocLine = this.GL.getUniformLocation(this.lineProgram, 'zoomScale');
            this.GL.uniform1f(zoomLocLine, 0.5 * this.zoomScale);

            this.GL.useProgram(this.dotProgram);
            let zoomLocDot = this.GL.getUniformLocation(this.dotProgram, 'zoomScale');
            this.GL.uniform1f(zoomLocDot, 0.5 * this.zoomScale);
        }
    }


    setPixelOrigin(pixelOrigin) {
        this.pixelOrigin = pixelOrigin;
        if (this.coordinateSystem == this.WGS84) {
            this.GL.useProgram(this.lineProgram);
            let originLocLine = this.GL.getUniformLocation(this.lineProgram, 'pixelOrigin');
            this.GL.uniform2f(originLocLine, this.pixelOrigin.x, this.pixelOrigin.y);

            this.GL.useProgram(this.dotProgram);
            let originLocDot = this.GL.getUniformLocation(this.dotProgram, 'pixelOrigin');
            this.GL.uniform2f(originLocDot, this.pixelOrigin.x, this.pixelOrigin.y);
        }
    }


    addLine(startX, startY, endX, endY, width, colorR, colorG, colorB, colorA) {
        this.lineStartArray[2*this.numLines] = startX;
        this.lineStartArray[2*this.numLines+1] = startY;
        this.lineEndArray[2*this.numLines] = endX;
        this.lineEndArray[2*this.numLines+1] = endY;
        this.lineWidthArray[this.numLines] = width;
        this.lineColorArray[4*this.numLines] = colorR;
        this.lineColorArray[4*this.numLines+1] = colorG;
        this.lineColorArray[4*this.numLines+2] = colorB;
        this.lineColorArray[4*this.numLines+3] = colorA;
        this.numLines++;
    }


    addDot(posX, posY, size, colorR, colorG, colorB, colorA) {
        this.dotPosArray[2*this.numDots] = posX;
        this.dotPosArray[2*this.numDots+1] = posY;
        this.dotSizeArray[this.numDots] = size;
        this.dotColorArray[4*this.numDots] = colorR;
        this.dotColorArray[4*this.numDots+1] = colorG;
        this.dotColorArray[4*this.numDots+2] = colorB;
        this.dotColorArray[4*this.numDots+3] = colorA;
        this.numDots++;
    }


    draw(keepOld) {
        keepOld = keepOld == null ? false : keepOld;

        // Clear screen:
        this.GL.clear(this.GL.COLOR_BUFFER_BIT);

        if (this.GLVersion == 2) {
            if (this.numLines > 0) {
                // Update all line vertex buffers with added lines and dots:
                this._updateLineBuffers();
                this._drawLinesGL2();
            }
            if (this.numDots > 0) {
                // Update all line vertex buffers with added lines and dots:
                this._updateDotBuffers();
                this._drawDotsGL2();
            }
        } else if (this.GLVersion == 1) {
            if (this.numLines > 0) {
                // Update all line vertex buffers with added lines and dots:
                this._updateLineBuffers();
                this._drawLinesGL1();
            }
            if (this.numDots > 0) {
                // Update all line vertex buffers with added lines and dots:
                this._updateDotBuffers();
                this._drawDotsGL1();
            }
        }
        if (!keepOld) {
            // Don't keep old elements for next draw call
            this.numLines = 0;
            this.numDots = 0;
        }
    }


    _updateLineBuffers() {
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineStartBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.lineStartArray, 0, this.numLines * 2);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineEndBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.lineEndArray , 0, this.numLines * 2);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineWidthBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.lineWidthArray , 0, this.numLines * 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineColorBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.lineColorArray , 0, this.numLines * 4);
    }


    _updateDotBuffers() {
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotPosBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.dotPosArray, 0, this.numDots * 2);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotSizeBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.dotSizeArray, 0, this.numDots * 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotColorBuffer);
        this.GL.bufferSubData(this.GL.ARRAY_BUFFER, 0, this.dotColorArray, 0, this.numDots * 4);
    }


    _drawLinesGL2() {
        // Use line drawing shaders:
        this.GL.useProgram(this.lineProgram);

        this.GL.enableVertexAttribArray(this.LINE_VX_BUF);
        this.GL.enableVertexAttribArray(this.LINE_START_BUF);
        this.GL.enableVertexAttribArray(this.LINE_END_BUF);
        this.GL.enableVertexAttribArray(this.LINE_WIDTH_BUF);
        this.GL.enableVertexAttribArray(this.LINE_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineVertexBuffer);
        this.GL.vertexAttribPointer(this.LINE_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineStartBuffer);
        this.GL.vertexAttribPointer(this.LINE_START_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(this.LINE_START_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineEndBuffer);
        this.GL.vertexAttribPointer(this.LINE_END_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(this.LINE_END_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineWidthBuffer);
        this.GL.vertexAttribPointer(this.LINE_WIDTH_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.GL.vertexAttribDivisor(this.LINE_WIDTH_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineColorBuffer);
        this.GL.vertexAttribPointer(this.LINE_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.GL.vertexAttribDivisor(this.LINE_COLOR_BUF, 1);

        // Draw all line instances:
        this.GL.drawArraysInstanced(this.GL.TRIANGLE_STRIP, 0, 4, this.numLines);
    }


    _drawDotsGL2() {
        // Use dot drawing shaders:
        this.GL.useProgram(this.dotProgram);

        this.GL.enableVertexAttribArray(this.DOT_VX_BUF);
        this.GL.enableVertexAttribArray(this.DOT_POS_BUF);
        this.GL.enableVertexAttribArray(this.DOT_SIZE_BUF);
        this.GL.enableVertexAttribArray(this.DOT_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotVertexBuffer);
        this.GL.vertexAttribPointer(this.DOT_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotPosBuffer);
        this.GL.vertexAttribPointer(this.DOT_POS_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(this.DOT_POS_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotSizeBuffer);
        this.GL.vertexAttribPointer(this.DOT_SIZE_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.GL.vertexAttribDivisor(this.DOT_SIZE_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotColorBuffer);
        this.GL.vertexAttribPointer(this.DOT_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.GL.vertexAttribDivisor(this.DOT_COLOR_BUF, 1);

        // Draw all dot instances:
        this.GL.drawArraysInstanced(this.GL.TRIANGLE_STRIP, 0, 4, this.numDots);
    }


    _drawLinesGL1() {
        // Use line drawing shaders:
        this.GL.useProgram(this.lineProgram);

        this.GL.enableVertexAttribArray(this.LINE_VX_BUF);
        this.GL.enableVertexAttribArray(this.LINE_START_BUF);
        this.GL.enableVertexAttribArray(this.LINE_END_BUF);
        this.GL.enableVertexAttribArray(this.LINE_WIDTH_BUF);
        this.GL.enableVertexAttribArray(this.LINE_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineVertexBuffer);
        this.GL.vertexAttribPointer(this.LINE_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineStartBuffer);
        this.GL.vertexAttribPointer(this.LINE_START_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.ext.vertexAttribDivisorANGLE(this.LINE_START_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineEndBuffer);
        this.GL.vertexAttribPointer(this.LINE_END_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.ext.vertexAttribDivisorANGLE(this.LINE_END_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineWidthBuffer);
        this.GL.vertexAttribPointer(this.LINE_WIDTH_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.ext.vertexAttribDivisorANGLE(this.LINE_WIDTH_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineColorBuffer);
        this.GL.vertexAttribPointer(this.LINE_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.ext.vertexAttribDivisorANGLE(this.LINE_COLOR_BUF, 1);

        // Draw all line instances:
        this.ext.drawArraysInstancedANGLE(this.GL.TRIANGLE_STRIP, 0, 4, this.numLines);
    }


    _drawDotsGL1() {
        // Use dot drawing shaders:
        this.GL.useProgram(this.dotProgram);

        this.GL.enableVertexAttribArray(this.DOT_VX_BUF);
        this.GL.enableVertexAttribArray(this.DOT_POS_BUF);
        this.GL.enableVertexAttribArray(this.DOT_SIZE_BUF);
        this.GL.enableVertexAttribArray(this.DOT_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotVertexBuffer);
        this.GL.vertexAttribPointer(this.DOT_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotPosBuffer);
        this.GL.vertexAttribPointer(this.DOT_POS_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.ext.vertexAttribDivisorANGLE(this.DOT_POS_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotSizeBuffer);
        this.GL.vertexAttribPointer(this.DOT_SIZE_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.ext.vertexAttribDivisorANGLE(this.DOT_SIZE_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotColorBuffer);
        this.GL.vertexAttribPointer(this.DOT_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.ext.vertexAttribDivisorANGLE(this.DOT_COLOR_BUF, 1);

        // Draw all dot instances:
        this.ext.drawArraysInstancedANGLE(this.GL.TRIANGLE_STRIP, 0, 4, this.numDots);
    }


    _initShaders() {
        // Shader source code based on WebGL version:
        let lineVertexSource = null;
        let fragSource = null;
        let dotVertexSource = null;

        if (this.GLVersion == 2) {
            fragSource =   `#version 300 es
                            precision highp float;
                            in vec4 color;
                            out vec4 fragmentColor;

                            void main(void) {
                                fragmentColor = color;
                            }`;
            if (this.coordinateSystem != this.WGS84) {
                lineVertexSource = `#version 300 es
                                precision highp float;
                                layout(location = 0) in vec3 vertexPos;
                                layout(location = 1) in vec2 inLineStart;
                                layout(location = 2) in vec2 inLineEnd;
                                layout(location = 3) in float inLineWidth;
                                layout(location = 4) in vec4 lineColor;

                                out vec4 color;

                                uniform mat3 projection;
                                uniform vec2 resolutionScale;

                                void main(void) {
                                    color = lineColor;

                                    vec2 lineStart = inLineStart * resolutionScale;
                                    vec2 lineEnd = inLineEnd * resolutionScale;
                                    float lineWidth = inLineWidth * resolutionScale.x;

                                    vec2 delta = lineStart - lineEnd;
                                    vec2 centerPos = 0.5 * (lineStart + lineEnd);
                                    float lineLength = length(delta);
                                    float phi = atan(delta.y/delta.x);

                                    mat3 scale = mat3(
                                          lineLength, 0, 0,
                                          0, lineWidth, 0,
                                          0, 0, 1);
                                    mat3 rotate = mat3(
                                          cos(phi), sin(phi), 0,
                                          -sin(phi), cos(phi), 0,
                                          0, 0, 1);
                                    mat3 translate = mat3(
                                          1, 0, 0,
                                          0, 1, 0,
                                          centerPos.x, centerPos.y, 1);


                                    gl_Position = vec4(projection * translate *  rotate *  scale * vertexPos, 1.0);
                                }`;

            dotVertexSource =    `#version 300 es
                                  precision highp float;
                                  layout(location = 0) in vec3 vertexPos;
                                  layout(location = 1) in vec2 inDotPos;
                                  layout(location = 2) in float inDotSize;
                                  layout(location = 3) in vec4 dotColor;

                                  out vec4 color;

                                  uniform mat3 projection;
                                  uniform vec2 resolutionScale;

                                  void main(void) {
                                    color = dotColor;
                                    vec2 dotPos = resolutionScale * inDotPos;
                                    float dotSize = resolutionScale.x * inDotSize;
                                    mat3 translate = mat3(
                                      dotSize, 0, 0,
                                      0, dotSize, 0,
                                      dotPos.x, dotPos.y, 1);

                                    gl_Position = vec4(projection * translate * vertexPos, 1.0);
                                  }`;
            } else {
                lineVertexSource = `#version 300 es
                                #define M_PI 3.1415926535897932384626433832795
                                #define M_PI_180 0.01745329251f
                                #define M_2PI 6.28318530718f

                                precision highp float;
                                layout(location = 0) in vec3 vertexPos;
                                layout(location = 1) in vec2 inLineStart;
                                layout(location = 2) in vec2 inLineEnd;
                                layout(location = 3) in float inLineWidth;
                                layout(location = 4) in vec4 lineColor;

                                out vec4 color;

                                uniform mat3 projection;
                                uniform float zoomScale;
                                uniform vec2 pixelOrigin;

                                /* sin with 64 bit precision borrowed from luma.gl: https://github.com/uber/luma.gl */
                                uniform float ONE;

                                #define INTEL_GPU
                                // Intel optimizes away the calculation necessary for emulated fp64
                                #define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1
                                // Intel's built-in 'tan' function doesn't have acceptable precision
                                #define LUMA_FP32_TAN_PRECISION_WORKAROUND 1
                                // Intel GPU doesn't have full 32 bits precision in same cases, causes overflow
                                #define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1


                                float unSplit(vec2 a) {
                                  return a.x + a.y;
                                }

                                vec2 split(float a) {
                                  const float SPLIT = 4097.0;
                                  float t = a * SPLIT;
                                #if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)
                                  float a_hi = t * ONE - (t - a);
                                  float a_lo = a * ONE - a_hi;
                                #else
                                  float a_hi = t - (t - a);
                                  float a_lo = a - a_hi;
                                #endif
                                  return vec2(a_hi, a_lo);
                                }
                                vec2 quickTwoSum(float a, float b) {
                                #if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)
                                  float sum = (a + b) * ONE;
                                  float err = b - (sum - a) * ONE;
                                #else
                                  float sum = a + b;
                                  float err = b - (sum - a);
                                #endif
                                  return vec2(sum, err);
                                }
                                vec2 twoSum(float a, float b) {
                                  float s = (a + b);
                                #if defined(LUMA_FP64_CODE_ELIMINATION_WORKAROUND)
                                  float v = (s * ONE - a) * ONE;
                                  float err = (a - (s - v) * ONE) * ONE * ONE * ONE + (b - v);
                                #else
                                  float v = s - a;
                                  float err = (a - (s - v)) + (b - v);
                                #endif
                                  return vec2(s, err);
                                }

                                vec2 twoProd(float a, float b) {
                                  float prod = a * b;
                                  vec2 a_fp64 = split(a);
                                  vec2 b_fp64 = split(b);
                                  float err = ((a_fp64.x * b_fp64.x - prod) + a_fp64.x * b_fp64.y +
                                    a_fp64.y * b_fp64.x) + a_fp64.y * b_fp64.y;
                                  return vec2(prod, err);
                                }
                                vec2 sum_fp64(vec2 a, vec2 b) {
                                  vec2 s, t;
                                  s = twoSum(a.x, b.x);
                                  t = twoSum(a.y, b.y);
                                  s.y += t.x;
                                  s = quickTwoSum(s.x, s.y);
                                  s.y += t.y;
                                  s = quickTwoSum(s.x, s.y);
                                  return s;
                                }

                                vec2 mul_fp64(vec2 a, vec2 b) {
                                  vec2 prod = twoProd(a.x, b.x);
                                  // y component is for the error
                                  prod.y += a.x * b.y;
                                  prod.y += a.y * b.x;
                                  prod = quickTwoSum(prod.x, prod.y);
                                  return prod;
                                }

                                const vec2 INVERSE_FACTORIAL_3_FP64 = vec2(1.666666716337204e-01, -4.967053879312289e-09); // 1/3!
                                const vec2 INVERSE_FACTORIAL_5_FP64 = vec2(8.333333767950535e-03, -4.34617203337595e-10); // 1/5!
                                const vec2 INVERSE_FACTORIAL_7_FP64 = vec2(1.9841270113829523e-04,  -2.725596874933456e-12); // 1/7!
                                const vec2 INVERSE_FACTORIAL_9_FP64 = vec2(2.75573188446287533e-06, 3.7935713937038186e-14); // 1/9!

                                vec2 sin_taylor_fp64(vec2 a) {
                                  vec2 r, s, t, x;
                                  if (a.x == 0.0 && a.y == 0.0) {
                                    return vec2(0.0, 0.0);
                                  }
                                  x = -mul_fp64(a, a);
                                  s = a;
                                  r = a;
                                  r = mul_fp64(r, x);
                                  t = mul_fp64(r, INVERSE_FACTORIAL_3_FP64);
                                  s = sum_fp64(s, t);
                                  r = mul_fp64(r, x);
                                  t = mul_fp64(r, INVERSE_FACTORIAL_5_FP64);
                                  s = sum_fp64(s, t);
                                  r = mul_fp64(r, x);
                                  t = mul_fp64(r, INVERSE_FACTORIAL_7_FP64);
                                  s = sum_fp64(s, t);
                                  r = mul_fp64(r, x);
                                  t = mul_fp64(r, INVERSE_FACTORIAL_9_FP64);
                                  s = sum_fp64(s, t);
                                  return s;
                                }

                                float sin_64(float a) {
                                  return unSplit(sin_taylor_fp64(split(a)));
                                }

                                /* Mercator projection using 64 bit sin function above */
                                vec2 wgs84_to_webmerc(vec2 latlong) {
                                  vec2 p;
                                  float sin_lat = sin_64(latlong.y * M_PI_180);
                                  p.x = zoomScale * (latlong.x / 180.f + 1.f);
                                  // atanh:
                                  p.y = zoomScale * (-log((1.f + sin_lat) / (1.f - sin_lat)) / (M_2PI) + 1.f);
                                  return p;
                                }

                                void main(void) {
                                    color = lineColor;

                                    vec2 lineStart = wgs84_to_webmerc(inLineStart) - pixelOrigin;
                                    vec2 lineEnd = wgs84_to_webmerc(inLineEnd) - pixelOrigin;
                                    float lineWidth = inLineWidth;

                                    vec2 delta = lineStart - lineEnd;
                                    vec2 centerPos = 0.5 * (lineStart + lineEnd);
                                    float lineLength = length(delta);
                                    float phi = atan(delta.y/delta.x);

                                    mat3 scale = mat3(
                                          lineLength, 0, 0,
                                          0, lineWidth, 0,
                                          0, 0, 1);
                                    mat3 rotate = mat3(
                                          cos(phi), sin(phi), 0,
                                          -sin(phi), cos(phi), 0,
                                          0, 0, 1);
                                    mat3 translate = mat3(
                                          1, 0, 0,
                                          0, 1, 0,
                                          centerPos.x, centerPos.y, 1);


                                    gl_Position = vec4(projection * translate *  rotate *  scale * vertexPos, 1.0);
                                }`;

            dotVertexSource =    `#version 300 es
                                  #define M_PI 3.1415926535897932384626433832795
                                  precision highp float;
                                  layout(location = 0) in vec3 vertexPos;
                                  layout(location = 1) in vec2 inDotPos;
                                  layout(location = 2) in float inDotSize;
                                  layout(location = 3) in vec4 dotColor;

                                  out vec4 color;

                                  uniform mat3 projection;
                                  uniform float zoomScale;
                                  uniform vec2 pixelOrigin;

                                  vec2 wgs84_to_webmerc(vec2 latlong) {
                                      vec2 p;
                                      float sin_lat = sin(M_PI * latlong.y / 180.f);
                                      p.x = zoomScale * (latlong.x / 180.f + 1.f);
                                      // atanh:
                                      p.y = zoomScale * (-log((1.f + sin_lat) / (1.f - sin_lat)) / (2.f * M_PI) + 1.f);
                                      return p;
                                  }

                                  void main(void) {
                                    color = dotColor;
                                    vec2 dotPos = wgs84_to_webmerc(inDotPos) - pixelOrigin;
                                    float dotSize = inDotSize;
                                    mat3 translate = mat3(
                                      dotSize, 0, 0,
                                      0, dotSize, 0,
                                      dotPos.x, dotPos.y, 1);

                                    gl_Position = vec4(projection * translate * vertexPos, 1.0);
                                  }`;
            }
        } else if (this.GLVersion == 1) {
            fragSource = `#version 100
                          precision highp float;
                          varying vec4 color;

                          void main(void) {
                            gl_FragColor = color;
                          }`;

            if (this.coordinateSystem != this.WGS84) {
                lineVertexSource = `#version 100
                                precision highp float;

                                attribute vec3 vertexPos;
                                attribute vec2 inLineStart;
                                attribute vec2 inLineEnd;
                                attribute float inLineWidth;
                                attribute vec4 lineColor;

                                varying vec4 color;

                                uniform mat3 projection;
                                uniform vec2 resolutionScale;

                                void main(void) {
                                    color = lineColor;

                                    vec2 lineStart = inLineStart * resolutionScale;
                                    vec2 lineEnd = inLineEnd * resolutionScale;
                                    float lineWidth = inLineWidth * resolutionScale.x;

                                    vec2 delta = lineStart - lineEnd;
                                    vec2 centerPos = 0.5 * (lineStart + lineEnd);
                                    float lineLength = length(delta);
                                    float phi = atan(delta.y/delta.x);

                                    mat3 scale = mat3(
                                          lineLength, 0, 0,
                                          0, lineWidth, 0,
                                          0, 0, 1);
                                    mat3 rotate = mat3(
                                          cos(phi), sin(phi), 0,
                                          -sin(phi), cos(phi), 0,
                                          0, 0, 1);
                                    mat3 translate = mat3(
                                          1, 0, 0,
                                          0, 1, 0,
                                          centerPos.x, centerPos.y, 1);


                                    gl_Position = vec4(projection * translate *  rotate *  scale * vertexPos, 1.0);
                                }`;

                dotVertexSource = `#version 100
                              precision highp float;

                              attribute vec3 vertexPos;
                              attribute vec2 inDotPos;
                              attribute float inDotSize;
                              attribute vec4 dotColor;

                              varying vec4 color;

                              uniform mat3 projection;
                              uniform vec2 resolutionScale;

                              void main(void) {
                                color = dotColor;
                                vec2 dotPos = resolutionScale * inDotPos;
                                float dotSize = resolutionScale.x * inDotSize;
                                mat3 translate = mat3(
                                  dotSize, 0, 0,
                                  0, dotSize, 0,
                                  dotPos.x, dotPos.y, 1);

                                gl_Position = vec4(projection * translate * vertexPos, 1.0);
                              }`;
            } else { // long lat
                lineVertexSource = `#version 100
                                #define M_PI 3.1415926535897932384626433832795
                                precision highp float;

                                attribute vec3 vertexPos;
                                attribute vec2 inLineStart;
                                attribute vec2 inLineEnd;
                                attribute float inLineWidth;
                                attribute vec4 lineColor;

                                varying vec4 color;

                                uniform mat3 projection;
                                uniform float zoomScale;
                                uniform vec2 pixelOrigin;

                                vec2 wgs84_to_webmerc(vec2 latlong) {
                                    vec2 p;
                                    float sin_lat = sin(M_PI * latlong.y / 180.0);
                                    p.x = zoomScale * (latlong.x / 180.0 + 1.0);
                                    // atanh:
                                    p.y = zoomScale * (-log((1.0 + sin_lat) / (1.0 - sin_lat)) / (2.0 * M_PI) + 1.0);
                                    return p;
                                }

                                void main(void) {
                                    color = lineColor;
                                    vec2 lineStart = wgs84_to_webmerc(inLineStart) - pixelOrigin;
                                    vec2 lineEnd = wgs84_to_webmerc(inLineEnd) - pixelOrigin;

                                    float lineWidth = inLineWidth;

                                    vec2 delta = lineStart - lineEnd;
                                    vec2 centerPos = 0.5 * (lineStart + lineEnd);
                                    float lineLength = length(delta);
                                    float phi = atan(delta.y/delta.x);

                                    mat3 scale = mat3(
                                          lineLength, 0, 0,
                                          0, lineWidth, 0,
                                          0, 0, 1);
                                    mat3 rotate = mat3(
                                          cos(phi), sin(phi), 0,
                                          -sin(phi), cos(phi), 0,
                                          0, 0, 1);
                                    mat3 translate = mat3(
                                          1, 0, 0,
                                          0, 1, 0,
                                          centerPos.x, centerPos.y, 1);


                                    gl_Position = vec4(projection * translate *  rotate *  scale * vertexPos, 1.0);
                                }`;

                dotVertexSource = `#version 100
                                   #define M_PI 3.1415926535897932384626433832795
                              precision highp float;

                              attribute vec3 vertexPos;
                              attribute vec2 inDotPos;
                              attribute float inDotSize;
                              attribute vec4 dotColor;

                              varying vec4 color;

                              uniform mat3 projection;
                                  uniform float zoomScale;
                                  uniform vec2 pixelOrigin;

                              vec2 wgs84_to_webmerc(vec2 latlong) {
                                  vec2 p;
                                  float sin_lat = sin(M_PI * latlong.y / 180.0);
                                  p.x = zoomScale * (latlong.x / 180.0 + 1.0);
                                  // atanh:
                                  p.y = zoomScale * (-log((1.0 + sin_lat) / (1.0 - sin_lat)) / (2.0 * M_PI) + 1.0);
                                  return p;
                              }

                              void main(void) {
                                  color = dotColor;
                                  vec2 dotPos = wgs84_to_webmerc(inDotPos) - pixelOrigin;
                                  float dotSize = inDotSize;
                                  mat3 translate = mat3(
                                      dotSize, 0, 0,
                                      0, dotSize, 0,
                                      dotPos.x, dotPos.y, 1);

                                  gl_Position = vec4(projection * translate * vertexPos, 1.0);
                              }`;
            }
        }


        this.lineProgram = this._createShaderProgram(lineVertexSource, fragSource, 'line');
        this.dotProgram = this._createShaderProgram(dotVertexSource, fragSource, 'dot');
        return (this.lineProgram != false && this.dotProgram != false);
    }
}
