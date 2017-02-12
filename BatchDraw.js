
class BatchDrawer {
    constructor(canvas, params) {
        // TODO: add default params
        this.canvas = canvas;
        this.maxElements = params.maxElements;
        this.forceGL1 = params.forceGL1;
        this.clearColor = params.clearColor;
        this.usePixelCoords = params.usePixelCoords;
        
        this.error = null;
        this.numLines = 0;
        this.numDots = 0;

        if (!this._initGLContext()) {
            return;
        }

        if (!this._initShaders()) {
            return;
        }

        this.GL.clearColor(this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.alpha);

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
                this.GLVersion = 1;
            } catch(e) {
                console.log("Could not create a WebGL1 context.");
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
        this.lineStartArray = new Float32Array(this.maxElements * 2);
        this.lineEndArray = new Float32Array(this.maxElements * 2);
        this.lineWidthArray = new Float32Array(this.maxElements);
        this.lineColorArray = new Float32Array(this.maxElements * 4);

        this.dotPosArray = new Float32Array(this.maxElements * 2);
        this.dotSizeArray = new Float32Array(this.maxElements);
        this.dotColorArray = new Float32Array(this.maxElements * 4);

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


    _initShaders() {
        // Shader source code:
        let lineVertexSource = `#version 300 es  
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


        let fragSource =   `#version 300 es
                            precision highp float; 
                            in vec4 color;
                            out vec4 fragmentColor;
                          
                            void main(void) {
                                fragmentColor = color;
                            }`;


        let dotVertexSource =    `#version 300 es  
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


        this.lineProgram = this._createShaderProgram(lineVertexSource, fragSource);
        this.dotProgram = this._createShaderProgram(dotVertexSource, fragSource);
        return (this.lineProgram != false && this.dotProgram != false);
    }


    _createShaderProgram(vertexSource, fragmentSource) {
        let vertexShader = this._compileShader(vertexSource, this.GL.VERTEX_SHADER);
        let fragmentShader = this._compileShader(fragmentSource, this.GL.FRAGMENT_SHADER);
        if (!vertexShader || ! fragmentShader) {
            return false;
        }

        let program = this.GL.createProgram();
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
            this.error = "Could not compile shader: " + this.GL.getShaderInfoLog(shader)
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
        if (!this.usePixelCoords) {
            resScaleX = this.canvas.width;
            resScaleY = this.canvas.height;
        }
 
        this.GL.useProgram(this.lineProgram);
        let lineProjLoc = this.GL.getUniformLocation(this.lineProgram, 'projection');
        this.GL.uniformMatrix3fv(lineProjLoc, false, projection);
        let lineResLoc = this.GL.getUniformLocation(this.lineProgram, 'resolutionScale');
        this.GL.uniform2f(lineResLoc, resScaleX, resScaleY);

        this.GL.useProgram(this.dotProgram);
        let dotProjLoc = this.GL.getUniformLocation(this.dotProgram, 'projection');
        this.GL.uniformMatrix3fv(dotProjLoc, false, projection);
        let dotResLoc = this.GL.getUniformLocation(this.dotProgram, 'resolutionScale');
        this.GL.uniform2f(dotResLoc, resScaleX, resScaleY);
    }


    addLine(startX, startY, endX, endY, width, colorR, colorG, colorB, colorAlpha) {
        this.lineStartArray[2*this.numLines] = startX;
        this.lineStartArray[2*this.numLines+1] = startY;
        this.lineEndArray[2*this.numLines] = endX;
        this.lineEndArray[2*this.numLines+1] = endY;
        this.lineWidthArray[this.numLines] = width;
        this.lineColorArray[4*this.numLines] = colorR;
        this.lineColorArray[4*this.numLines+1] = colorG;
        this.lineColorArray[4*this.numLines+2] = colorB;
        this.lineColorArray[4*this.numLines+3] = colorAlpha;
        this.numLines++;
    }


    addDot(posX, posY, size, colorR, colorG, colorB, colorAlpha) {
        this.dotPosArray[2*this.numDots] = posX;
        this.dotPosArray[2*this.numDots+1] = posY;
        this.dotSizeArray[this.numDots] = size;
        this.dotColorArray[4*this.numDots] = colorR;
        this.dotColorArray[4*this.numDots+1] = colorG;
        this.dotColorArray[4*this.numDots+2] = colorB;
        this.dotColorArray[4*this.numDots+3] = colorAlpha;
        this.numDots++;
    }


    draw(keepOld) {
        // Clear screen:
        this.GL.clear(this.GL.COLOR_BUFFER_BIT);

        if (this.numLines > 0) {
            // Update all line vertex buffers with added lines and dots:
            this._updateLineBuffers();
            this._drawLines();
        }
        if (this.numDots > 0) {
            // Update all line vertex buffers with added lines and dots:
            this._updateDotBuffers();
            this._drawDots();
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


    _drawLines() {  
        const LINE_VX_BUF = 0;
        const LINE_START_BUF = 1;
        const LINE_END_BUF = 2;
        const LINE_WIDTH_BUF = 3;
        const LINE_COLOR_BUF = 4;

        // Use line drawing shaders:
        this.GL.useProgram(this.lineProgram);

        this.GL.enableVertexAttribArray(LINE_VX_BUF);
        this.GL.enableVertexAttribArray(LINE_START_BUF);
        this.GL.enableVertexAttribArray(LINE_END_BUF);
        this.GL.enableVertexAttribArray(LINE_WIDTH_BUF);
        this.GL.enableVertexAttribArray(LINE_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineVertexBuffer);
        this.GL.vertexAttribPointer(LINE_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineStartBuffer);
        this.GL.vertexAttribPointer(LINE_START_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(LINE_START_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineEndBuffer);
        this.GL.vertexAttribPointer(LINE_END_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(LINE_END_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineWidthBuffer);
        this.GL.vertexAttribPointer(LINE_WIDTH_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.GL.vertexAttribDivisor(LINE_WIDTH_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.lineColorBuffer);
        this.GL.vertexAttribPointer(LINE_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.GL.vertexAttribDivisor(LINE_COLOR_BUF, 1);

        // Draw all line instances:
        this.GL.drawArraysInstanced(this.GL.TRIANGLE_STRIP, 0, 4, this.numLines);
    }

    _drawDots() { 
        const DOT_VX_BUF = 0;
        const DOT_POS_BUF = 1;
        const DOT_SIZE_BUF = 2;
        const DOT_COLOR_BUF = 3;

        // Use dot drawing shaders:
        this.GL.useProgram(this.dotProgram);

        this.GL.enableVertexAttribArray(DOT_VX_BUF);
        this.GL.enableVertexAttribArray(DOT_POS_BUF);
        this.GL.enableVertexAttribArray(DOT_SIZE_BUF);
        this.GL.enableVertexAttribArray(DOT_COLOR_BUF);

        // Bind all line vertex buffers:
        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotVertexBuffer);
        this.GL.vertexAttribPointer(DOT_VX_BUF, 3, this.GL.FLOAT, false, 0, 0);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotPosBuffer);
        this.GL.vertexAttribPointer(DOT_POS_BUF, 2, this.GL.FLOAT, false, 8, 0);
        this.GL.vertexAttribDivisor(DOT_POS_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotSizeBuffer);
        this.GL.vertexAttribPointer(DOT_SIZE_BUF, 1, this.GL.FLOAT, false, 4, 0);
        this.GL.vertexAttribDivisor(DOT_SIZE_BUF, 1);

        this.GL.bindBuffer(this.GL.ARRAY_BUFFER, this.dotColorBuffer);
        this.GL.vertexAttribPointer(DOT_COLOR_BUF, 4, this.GL.FLOAT, false, 16, 0);
        this.GL.vertexAttribDivisor(DOT_COLOR_BUF, 1);

        // Draw all dot instances:
        this.GL.drawArraysInstanced(this.GL.TRIANGLE_STRIP, 0, 4, this.numDots);
    }
}