
function hex(d, padding) {
	var hex = Number(d).toString(16);
	padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

	while (hex.length < padding) {
		hex = "0" + hex;
	}

	return hex;
}
function bin(d, padding) {
	var hex = Number(d).toString(2);
	padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

	while (hex.length < padding) {
		hex = "0" + hex;
	}

	return hex;
}

window.onload = function() {
	var xhr = new XMLHttpRequest();

	xhr.onreadystatechange = function () {
		if (xhr.readyState == xhr.DONE) {
			if (xhr.status == 200 && xhr.response) {
				window.CHIP8 = new chip8(new Uint8Array(xhr.response));
			} else {
				alert("Failed to download:" + xhr.status + " " + xhr.statusText);
			}
		}
	}

	xhr.open("GET", "GAMES/PONG", true);
	xhr.responseType = "arraybuffer";
	xhr.send();
}


function chip8(program) {
	this.program = program;

	// Load fontset
	for (var i=0; i < this.fontset.length; i++) {
		this.M[i] = this.fontset[i]
	}

	// Load program
	for (var i=0; i < this.program.length; i++) {
		this.M[i + 0x200] = this.program[i]
	}

	// Setup canvas
	this.context = document.getElementById('c').getContext('2d');
	this.context.fillStyle = 'black';
	this.context.fillRect(0, 0, this.zoom * 64, this.zoom * 32);
	this.context.fillStyle = 'white';
	setInterval(this.dump_memory.bind(this), 1000);

}

chip8.prototype.start = function(speed) {
	clearInterval(this.tick_interval);
	clearInterval(this.dump_interval);
	// Start timers
	this.speed = speed
	this.tick_interval = setInterval(this.run.bind(this), speed);
}

chip8.prototype.stop = function() {
	clearInterval(this.tick_interval);
	this.speed = 0;
}

// Chip8 memory, registers and stack
chip8.prototype.program = null;
chip8.prototype.pc = 0x200;
chip8.prototype.opcode = 0;
chip8.prototype.I = 0;
chip8.prototype.sp = 0;
chip8.prototype.V = [0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,
					 0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]
chip8.prototype.S = [0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,
					 0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]
chip8.prototype.G = new Uint8Array(64 * 32);
chip8.prototype.M = new Uint8Array(4096);
chip8.prototype.timer = 0;



chip8.prototype.d = function(mem) {
	var buf = "<span class='head'>   ";
	for (var i=0; i < 16; i++) {
		buf += hex(i) + " ";
	}
	buf += "</span> ";
	for (var i=0; i < mem.length; i++) {
		var type = "";
		if (i%16 == 0) {
			buf+="\n <span class='head'>" + hex(i, 4) + "</span> ";
		}
		if (i == this.pc || i == this.pc+1)
			type = "pc";
		else if (i >= 0x050 && i < 0x0a0)
			type = "pixel_font_set";
		else if (i <= 0x1ff)
			type = "font_set";
		else if (i >= 0x200 && i < 0x200 + this.program.length)
			type = "program";
		else
			type = "memory"
		buf+= "<span class='" + type + "'>" + hex(mem[i]) + " </span>";
	}
	return buf + "\n";
}

chip8.prototype.dump_memory = function() {
	var buf = "";
	buf += "<span class='head'>pc: </span><span class='pc'>" + hex(this.pc) + "</span>\n";
	buf += "<span class='head'>opcode: </span><span class='pc'>" + hex(this.opcode) + "</span>\n";
	buf += "<span class='head'>I: </span><span class='pc'>" + hex(this.I) + "</span>\n";
	buf += "<span class='head'>timer: </span><span class='pc'>" + this.timer + "</span>\n";
	buf += "<span class='head'>sp: </span><span class='pc'>" + hex(this.sp) + "</span>\n";
	buf += "<span class='head'>V: </span>" + this.d(this.V);
	buf += "<span class='head'>S: </span>" + this.d(this.S);
	//buf += "<span class='head'>G: </span>" + this.d(this.G);
	buf += "<span class='head'>M: </span>" + this.d(this.M);
	document.getElementById("memory").innerHTML = buf;

}

chip8.prototype.run = function() {
	if (this.pc > 0xfff) {
		return;
	}
	if (!this.speed || this.speed > 200)
		setTimeout(this.dump_memory.bind(this), 10);
	var op = this.opcode = this.M[this.pc] << 8 | this.M[this.pc + 1];

	/*
	 *	NNN: address
	 * 	NN: 8-bit constant
	 *	N: 4-bit constant
	 *	X and Y: 4-bit register identifier
	 */
	switch (op & 0xF000) {
		case 0x0000:
			switch(op) {
				case 0x0ee: // Returns from subroutine.
					console.log(
						hex(this.pc),
						hex(op),
						"return",
						hex(this.S[this.sp-1])
					);
					this.pc = this.S[--this.sp];
					this.S[this.sp] = 0x0;
					break;

				default:
					console.log("Bad op: " + hex(op, 4));
					this.pc = 0xf000;
					return
			}
			break;

		case 0x2000: // Calls subroutine at NNN.
			console.log(
				hex(this.pc),
				hex(op),
				"Call subroutine at",
				hex(op & 0xfff)
			);
			this.S[this.sp++] = this.pc;
			this.pc = op & 0xfff;
			return

		case 0x6000: // Sets VX to NN.
			var X = (op & 0xf00) >> 8;
			var NN = op & 0xff;
			console.log(
				hex(this.pc),
				hex(op),
				"Set V",
				X,
				"TO",
				hex(NN)
			);
			this.V[X] = NN;
			break

		case 0x7000: // Adds NN to VX.
			var NN = op & 0xff;
			var X = (op & 0xf00) >> 8;
			console.log(
				hex(this.pc),
				hex(op),
				"ADD",
				hex(NN),
				"TO X",
				X,
				"VX",
				hex(this.V[X])
			);
			this.V[X] += NN;
			break

		case 0xa000: // Sets I to the address NNN.
			console.log(
				hex(this.pc),
				hex(op),
				"Set I TO",
				hex(op & 0xfff)
			);
			this.I = op & 0xfff;
			break

		/*
		 * Draws a sprite at coordinate (VX, VY) that has a width of 8 pixels and a height of N pixels.
		 * Each row of 8 pixels is read as bit-coded (with the most significant bit of each byte displayed on the left)
		 * starting from memory location I; I value doesn't change after the execution of this instruction.
		 * As described above, VF is set to 1 if any screen pixels are flipped from set to unset when the sprite is drawn,
		 * and to 0 if that doesn't happen.
		 */
		case 0xd000:
			var X = this.V[(op & 0x0f00) >> 8];
			var Y = this.V[(op & 0x00f0) >> 4];
			var H = (op & 0x000f);
			console.log(
				hex(this.pc),
				hex(op),
				"Draw sprite cordinate",
				X,
				Y,
				"width 8 height",
				H);
			for (var yline = 0; yline < H; yline++) {
				var pixel = this.M[this.I + yline];
				for (var xline = 0; xline < 8; xline++) {
					if ((pixel & (0x80 >> xline)) != 0) {
						if(this.G[(X + xline + ((Y + yline) * 64))] == 1)
							this.V[0xF] = 1;
						this.G[X + xline + ((Y + yline) * 64)] ^= 1;
						this.context.fillRect(this.zoom * (X + xline), this.zoom * (Y + yline), this.zoom, this.zoom);

						//console.log(bin(pixel), X, xline, Y, yline);
					}

				}
			}


			break;
		case 0xf000: /* F block is a collection of random instructions */
			var X = (op & 0x0f00) >> 8;
			var SI = op & 0xff;
			var found = 1;
			switch (SI)	{

				case 0x07: //Sets VX to the value of the delay timer.
					var time_left = this.timer - new Date().getTime();
					console.log(
						hex(this.pc),
						hex(op),
						"Getting timer",
						"V" + X,
						"time_left",
						time_left
					);

					if (time_left > 0) {
						this.V[X] = time_left;
					} else {
						this.V[X] = 0;
					}
					break;

				case 0x15: //Sets the delay timer to VX. (Timer is 60hz)
					var VX = this.V[X];
					this.timer = new Date().getTime() + (VX * 16.666)
					console.log(
						hex(this.pc),
						hex(op),
						"Setting timer to",
						(VX * 16.666) + "ms"
					);
					break;

				/*
				 * Sets I to the location of the sprite for the character in VX.
				 * Characters 0-F (in hexadecimal) are represented by a 4x5 font.
				 */
				case 0x29:
					var vx = this.V[X];
					// Fonts are stored at offset 0, with 5 alignment
					this.I = vx * 5;
					console.log(
						hex(this.pc),
						hex(op),
						"Register",
						X,
						"Value",
						hex(vx),
						"To font addr addr",
						hex(this.I)
					)
					break;
				/*
				 * Stores the Binary-coded decimal representation of VX, with the most significant of three digits
				 * at the address in I, the middle digit at I plus 1, and the least significant digit at I plus 2.
				 * (In other words, take the decimal representation of VX, place the hundreds digit in memory at location in I,
				 * the tens digit at location I+1, and the ones digit at location I+2.)
				 */
				case 0x33:
					var num = this.V[X]
					var i = this.I + 2;
					while (num > 0) { num = this.M[i--] = parseInt(x/10); }
					console.log(
						hex(this.pc),
						hex(op),
						"X",
						"Binary decimal split",
						hex(X),
						"NUM",
						num,
						"IND",
						hex(this.I),
						"VALS",
						this.M[i],
						this.M[i+1],
						this.M[i+2]);

					break;
				case 0x65: // Fills V0 to VX with values from memory starting at address I.
					for (var i = 0; i < X; i++)
						this.V[i] = this.M[this.I++]
					console.log(
						hex(this.pc),
						hex(op),
						"Fill Register from index",
						"I",
						hex(this.I),
						"X",
						hex(X),
						this.M.subarray(this.I, this.I + X),
						this.V
					);
					break;
				default:
					found=0;
					break;
			}
			if (found)
				break;

			// Fall thru


		// Unknown operation
		default:
			console.log("Bad op: " + hex(op, 4));
			this.pc = 0xf000;
			return

	}

	this.pc += 2;
}




chip8.prototype.zoom = 8;

chip8.prototype.fontset = new Uint8Array(
[
	0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
	0x20, 0x60, 0x20, 0x20, 0x70, // 1
	0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
	0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
	0x90, 0x90, 0xF0, 0x10, 0x10, // 4
	0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
	0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
	0xF0, 0x10, 0x20, 0x40, 0x40, // 7
	0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
	0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
	0xF0, 0x90, 0xF0, 0x90, 0x90, // A
	0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
	0xF0, 0x80, 0x80, 0x80, 0xF0, // C
	0xE0, 0x90, 0x90, 0x90, 0xE0, // D
	0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
	0xF0, 0x80, 0xF0, 0x80, 0x80	// F
]);
