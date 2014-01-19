
function LoadGame() {
	if (window.CHIP8) {
		window.CHIP8.stop();
	}

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

	if(window.location.search != "") {
		xhr.open("GET", "GAMES/" + window.location.search.split("=")[1], true);
	} else {
		xhr.open("GET", "GAMES/PONG", true);
	}

	xhr.responseType = "arraybuffer";
	xhr.send();
}
window.onload = LoadGame;

var keymap={
	49: 0x1, // 1
	50: 0x2, // 2
	51: 0x3, // 3
	52: 0xc, // 4
	81: 0x4, // Q
	87: 0x5, // W
	69: 0x6, // E
	82: 0xd, // R
	65: 0x7, // A
	83: 0x8, // S
	68: 0x9, // D
	70: 0xe, // F
	90: 0xa, // Z
	88: 0x0, // X
	67: 0xb, // C
	86: 0xf, // V
};

document.onkeydown = function(key) {
	if (key.keyCode in keymap) {
		window.CHIP8.keyboard[keymap[key.keyCode]] = 1;
	}
}
document.onkeyup = function(key) {
	if (key.keyCode in keymap) {
		window.CHIP8.keyboard[keymap[key.keyCode]] = 0;
	}
}

// This is our main initialize
function chip8(program) {
	this.program = program;

	// Load fontset
	for (var i=0; i < this.fontset.length; i++) {
		this.M[i] = this.fontset[i]
	}

	// Load program into memory on adress 0x200
	for (var i=0; i < this.program.length; i++) {
		this.M[i + 0x200] = this.program[i]
	}

	// Setup canvas
	this.context = document.getElementById('c').getContext('2d');
	this.context.fillStyle = 'black';
	this.context.fillRect(0, 0, this.zoom * 64, this.zoom * 32);
	this.context.fillStyle = 'white';

	this.dump_memory();
	this.disasm();
}

// Chip8 memory, registers and stack
chip8.prototype.program = null;
chip8.prototype.pc = 0x200;                  // 0x200 is where our program is loaded.
chip8.prototype.speed = 0;                   // ms. Timing < 100 makes 10 instruction or until 1 draw call each, timing >= 100 is just one instruction
chip8.prototype.opcode = 0;                  // This is the current executing instruction.
chip8.prototype.I = 0;                       // Indexregister, 16 bits wide
chip8.prototype.c = 0;                       // Instruction counter, just for debug.
chip8.prototype.sp = 0;                      // Stackpointer
chip8.prototype.V = new Uint8Array(16);      // 16 - 8bit registers
chip8.prototype.S = new Uint16Array(16);     // 16 - 16bit stack for return adresses
chip8.prototype.G = new Uint8Array(64 * 32); // Graphic buffer, 64x32 pixels 8-bit
chip8.prototype.M = new Uint8Array(4096);    // 4k 8-bit memory
chip8.prototype.timer = 0;                   // This is set by a instrucion, and is unixtime.
chip8.prototype.sound_timer = 0;             // This is just set, but sound are not played yet.
chip8.prototype.keyboard = new Uint8Array(16); // This is a map of our keyboard. 1 means key is pressed. Multible keys can be pressed at once.
chip8.prototype.zoom = 8;                    // This is the number of screen pixels, one super8 pixel is scaled up to.

chip8.prototype.start = function(speed) {
	clearInterval(this.tick_interval);
	clearInterval(this.dump_interval);
	clearInterval(this.disasm);
	// Start timers
	this.speed = speed
	this.tick_interval = setInterval(this.run.bind(this), speed);
	if (speed <= 100) {
		this.dump_interval = setInterval(this.dump_memory.bind(this), 1000);
		this.disasm = setInterval(this.disasm.bind(this), 1000);
	}
}

chip8.prototype.stop = function() {
	clearInterval(this.tick_interval);
	clearInterval(this.dump_interval);
	clearInterval(this.disasm);
	this.speed = 0;
}

chip8.prototype.run = function() {
	if (this.pc > 0xfff) {
		return;
	}
	if (!this.speed || this.speed > 100) {
		setTimeout(this.dump_memory.bind(this), 10);
		setTimeout(this.disasm.bind(this), 10);
		this.step();
	} else {
		// Break on 0xd0 instruction that is a screen paint or every 20th instruction.
		do {
			this.step();
		}
		while ((this.c % 20 != 0) && ((this.M[this.pc] & 0xf0) != 0xd0) && this.pc <= 0xfff);
	}
}

chip8.prototype.step = function() {
	var op = this.opcode = this.M[this.pc] << 8 | this.M[this.pc + 1];
	this.c++;

	/*
	 * NNN: address
	 * NN: 8-bit constant
	 * N: 4-bit constant
	 * X and Y: 4-bit register identifier
	 */
	switch (op & 0xF000) {
		case 0x0000:
			switch(op) {
				case 0x0e0: // Clears the screen.
					this.G = new Uint8Array(64 * 32);
					this.context.fillStyle = 'black';
					this.context.fillRect(0, 0, this.zoom * 64, this.zoom * 32);
					break;
				case 0x0ee: // Returns from subroutine.
					this.pc = this.S[--this.sp];
					this.S[this.sp] = 0x0;
					break;
				default:
					console.log("Bad op: " + hex(op, 4));
					this.pc = 0xf000;
					return
			}
			break;

		case 0x1000: //Jumps to address NNN.
			this.pc = op & 0xfff;
			return

		case 0x2000: // Calls subroutine at NNN.
			this.S[this.sp++] = this.pc;
			this.pc = op & 0xfff;
			return

		case 0x3000: // Skips the next instruction if VX equals NN.
			var X = (op & 0xf00) >> 8;
			var NN = op & 0xff;
			if (this.V[X] == NN)
				this.pc+=2;
			break;

		case 0x4000: // Skips the next instruction if VX doesn't equal NN.
			var X = (op & 0xf00) >> 8;
			var NN = op & 0xff;
			if (this.V[X] != NN)
				this.pc+=2;
			break;

		case 0x5000: // Skips the next instruction if VX equals VY.
			var X = (op & 0xf00) >> 8;
			var Y = (op & 0xf0) >> 4;
			if (this.V[X] == this.V[Y])
				this.pc+=2;
			break;

		case 0x6000: // Sets VX to NN.
			var X = (op & 0xf00) >> 8;
			var NN = op & 0xff;
			this.V[X] = NN;
			break

		case 0x7000: // Adds NN to VX.
			var NN = op & 0xff;
			var X = (op & 0xf00) >> 8;
			this.V[X] += NN;
			break;

		case 0x8000:
			var X = (op & 0xf00) >> 8;
			var Y = (op & 0xf0) >> 4;
			var Z = (op & 0xf);
			switch(Z) {
				case 0x0: // Sets VX to the value of VY.
					this.V[X] = this.V[Y];
					break;
				case 0x1: // Sets VX to VX or VY.
					this.V[X] |= this.V[Y];
					break;
				case 0x2: // Sets VX to VX and VY.
					this.V[X] &= this.V[Y];
					break;
				case 0x3: // Sets VX to VX xor VY.
					this.V[X] ^= this.V[Y];
					break;
				case 0x4: // Adds VY to VX. VF is set to 1 when there's a carry, and to 0 when there isn't.
					this.V[0xf] = (this.V[X] + this.V[Y]) > 0xFF ? 1 : 0;
					this.V[X] += this.V[Y];
					break;
				case 0x5: // VY is subtracted from VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
					this.V[0xf] = this.V[Y] < this.V[X] ? 1 : 0;
					this.V[X] -= this.V[Y];
					break;
				case 0x6: // Shifts VX right by one. VF is set to the value of the least significant bit of VX before the shift.
					this.V[0xf] = this.V[X] & 0x1 ? 1 : 0;
					this.V[X] >>= 1;
					break;
				case 0x7: // Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
					this.V[0xf] = this.V[Y] > this.V[X] ? 1 : 0;
					this.V[X] = V[Y] - V[X];
					break;
				case 0xe: // Shifts VX left by one. VF is set to the value of the most significant bit of VX before the shift.
					this.V[0xF] = (this.V[X] & 0x80) ? 1 : 0;
					this.V[X] <<= 1;
					break;
				default:
					console.log("Bad op: " + hex(op, 4));
					this.pc = 0xf000;
					return
			}
			break;

		case 0x9000: // Skips the next instruction if VX doesn't equal VY.
			var X = (op & 0xf00) >> 8;
			var Y = (op & 0xf0) >> 4;
			if (this.V[X] != this.V[Y])
				this.pc += 2;
			break;

		case 0xa000: // Sets I to the address NNN.
			this.I = op & 0xfff;
			break

		case 0xb000: // Jumps to the address NNN plus V0.
			var NNN = op & 0xfff;
			this.pc = NNN + this.V[0];
			return

		case 0xc000: //Sets VX to a random number and NN.
			var X = (op & 0x0f00) >> 8;
			var NN = op & 0xff;
			this.V[X] = Math.floor(Math.random() * 0xFF) & NN;
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
			for (var yline = 0; yline < H; yline++) {
				var pixel = this.M[this.I + yline];
				for (var xline = 0; xline < 8; xline++) {
					if ((pixel & (0x80 >> xline)) != 0) {
						var p = X + xline + ((Y + yline) * 64);
						if(this.G[p] == 1)
							this.V[0xF] = 1;
						this.G[p] ^= 1;
						if (this.G[p]) {
							this.context.fillStyle = 'white';
						} else {
							this.context.fillStyle = 'black';
						}
						this.context.fillRect(this.zoom * (X + xline), this.zoom * (Y + yline), this.zoom, this.zoom);
					}
				}
			}
			break;

		case 0xe000: // 0xEX9E Skips the next instruction if the key stored in VX is pressed. 0xEXA1 if it isnt.
			var X = (op & 0xf00) >> 8;
			var NN = op & 0xff;
			if (!(NN == 0x9e ^ this.keyboard[this.V[X]]))
				this.pc+=2;
			break;

		case 0xf000: /* F block is a collection of random instructions */
			var X = (op & 0x0f00) >> 8;
			var SI = op & 0xff;
			var found = 1;
			switch (SI)	{

				case 0x07: //Sets VX to the value of the delay timer.
					var time_left = this.timer - parseInt(new Date().getTime());
					if (time_left > 0) {
						this.V[X] = time_left;
					} else {
						this.V[X] = 0;
					}
					break;

				case 0x0a: //A key press is awaited, and then stored in VX.
					var key = 0;
					// Loop all keys, find first one pressed.
					for (var i=0; i < this.keyboard.length; i++) {
						if (this.keyboard[i]) {
							key = i;
							break;
						}
					}

					// If a key was pressed.
					if (key) {
						// Store to vx.
						this.V[X] = key;
						// console.log("Got key press: ", key);
					} else {
						// Return, with out increasing the pc will make emulator retry same instr and wait.
						// console.log("Waiting for keypress");
						return;
					}
					break;

				case 0x15: //Sets the delay timer to VX. (Timer is 60hz)
					var VX = this.V[X];
					this.timer = parseInt(new Date().getTime() + (VX * 16.666))
					break;

				case 0x18: //Sets the sond timer to VX. (Timer is 60hz)
					var VX = this.V[X];
					this.sound_timer = parseInt(new Date().getTime() + (VX * 16.666))
					break;

				case 0x1e: // Adds VX to I.
					this.V[0xf] = (this.I + this.V[X]) > 0xfff ? 1 : 0;
					this.I += this.V[X];
					break;

				/*
				 * Sets I to the location of the sprite for the character in VX.
				 * Characters 0-F (in hexadecimal) are represented by a 4x5 font.
				 */
				case 0x29:
					var vx = this.V[X];
					// Fonts are stored at offset 0, with 5 alignment
					this.I = vx * 5;
					break;
				/*
				 * Stores the Binary-coded decimal representation of VX, with the most significant of three digits
				 * at the address in I, the middle digit at I plus 1, and the least significant digit at I plus 2.
				 * (In other words, take the decimal representation of VX, place the hundreds digit in memory at location in I,
				 * the tens digit at location I+1, and the ones digit at location I+2.)
				 */
				case 0x33:
					this.M[this.I]     = parseInt(this.V[X] / 100);
					this.M[this.I + 1] = parseInt(this.V[X] / 10) % 10;
					this.M[this.I + 2] = parseInt(this.V[X] % 100) % 10;
					break;

				case 0x55: // Stores V0 to VX in memory starting at address I.
					for (var i=0; i <= X; i++) {
						this.M[this.I + i] = this.V[i]
					}
					//ONLY DONE BY SOME EMUS this.I += X + 1;

					break;

				case 0x65: // Fills V0 to VX with values from memory starting at address I.
					for (var i = 0; i <= X; i++)
						this.V[i] = this.M[this.I+i]
					// ALSO ONLY DONE SOMETIMES. this.I += X + 1;
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

// These 2 function is only for prinitng memory debug table.
chip8.prototype.d = function(mem) {
	var buf = "<span class='head'>   ";
	for (var i=0; i < 16; i++) {
		buf += hex(i) + " ";
	}
	buf += "</span> ";
	for (var i=0; i < mem.length; i++) {
		var type = "memory";
		if (i%16 == 0) {
			buf+="\n <span class='head'>" + hex(i, 4) + "</span> ";
		}
		if (mem == this.M) {
			if (i == this.pc || i == this.pc+1)
				type = "pc";
			else if (i == this.I)
				type = "index";
			else if (i >= 0x050 && i < 0x0a0)
				type = "pixel_font_set";
			else if (i <= 0x1ff)
				type = "font_set";
			else if (i >= 0x200 && i < 0x200 + this.program.length)
				type = "program";
		}
		buf+= "<span class='" + type + "'>" + hex(mem[i]) + " </span>";
	}
	return buf + "\n";
}

chip8.prototype.dump_memory = function() {
	var buf = "";
	buf += "<span class='head'>pc: </span><span class='pc'>" + hex(this.pc) + "</span>\n";
	buf += "<span class='head'>c: </span><span class='pc'>" + this.c + "</span>\n";
	buf += "<span class='head'>speed: </span><span class='pc'>" + this.speed + "</span>\n";
	buf += "<span class='head'>opcode: </span><span class='pc'>" + hex(this.opcode) + "</span>\n";
	buf += "<span class='head'>I: </span><span class='pc'>" + hex(this.I) + "</span>\n";
	buf += "<span class='head'>timer: </span><span class='pc'>" + this.timer + "</span>\n";
	buf += "<span class='head'>sound_timer: </span><span class='pc'>" + this.sound_timer + "</span>\n";
	buf += "<span class='head'>sp: </span><span class='pc'>" + hex(this.sp) + "</span>\n";
	buf += "<span class='head'>V: </span>" + this.d(this.V);
	buf += "<span class='head'>S: </span>" + this.d(this.S);
	//buf += "<span class='head'>G: </span>" + this.d(this.G);
	buf += "<span class='head'>M: </span>" + this.d(this.M);
	document.getElementById("memory").innerHTML = buf;

}

chip8.prototype.disasm = function() {
	var buf = "";
	for (var i=0x200 + (this.pc % 2); i < (0x200 + this.program.length); i+=2) {
		if (i == this.pc || i == this.pc + 1) {
			buf+="\n <span class='index'>" + hex(i, 4) + "</span> ";
		} else {
			buf+="\n <span class='head'>" + hex(i, 4) + "</span> ";
		}
		var op = this.M[i] << 8 | this.M[i + 1];
		I = {D: "", C: "", F: ""};
		switch (op & 0xF000) {
			case 0x0000:
				switch(op) {
					case 0x0e0:
						I.D = "Clears the screen.";
						I.C = "CLS";
						I.F = "00E0";
						break;
					case 0x0ee:
						I.D = "Returns from subroutine.";
						I.C = "RET";
						I.F = "00EE";
						break;
				}
				break;

			case 0x1000:
				I.C = "JP   " + hex(op & 0xfff, 4);
				I.D = "Jumps to address NNN.";
				I.F = "1NNN";
				break;

			case 0x2000:
				I.C = "CALL " + hex(op & 0xfff, 4);
				I.D = "Calls subroutine at NNN."
				I.F = "2NNN";
				break;

			case 0x3000:
				I.C = "SE   V" + hex((op & 0xf00) >> 8, 1) + ", " + hex(op & 0xff);
				I.D = "Skips the next instruction if VX equals NN.";
				I.F = "3XNN";
				break;

			case 0x4000:
				I.C = "SNE  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex(op & 0xff, 1);
				I.D = "Skips the next instruction if VX doesn't equal NN.";
				I.F = "4XNN";
				break;

			case 0x5000:
				I.C = "SE   V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex(op & 0xff, 1);
				I.D = "Skips the next instruction if VX equals VY.";
				I.F = "5XY0";
				break;

			case 0x6000:
				I.C = "LD   V" + hex((op & 0xf00) >> 8, 1) + ", " + hex(op & 0xff);
				I.D = "Sets VX to NN.";
				I.F = "6XNN";
				break

			case 0x7000:
				I.D = "Adds NN to VX.";
				I.C = "ADD  V" + hex((op & 0xf00) >> 8, 1) + ", " + hex(op & 0xff);
				I.F = "7XNN";
				break;

			case 0x8000:
				var Z = (op & 0xf);
				switch(Z) {
					case 0x0:
						I.D = "Sets VX to the value of VY.";
						I.C = "LD   V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY0";
						break;
					case 0x1:
						I.D = "Sets VX to VX or VY."
						I.C = "OR   V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY1";
						break;
					case 0x2:
						I.D = "Sets VX to VX and VY.";
						I.C = "AND  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY2";
						break;
					case 0x3:
						I.D = "Sets VX to VX xor VY.";
						I.C = "XOR  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY3";
						break;
					case 0x4:
						I.D = "Adds VY to VX. VF is set to 1 when there's a carry, and to 0 when there isn't.";
						I.C = "ADD  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY4";
						break;
					case 0x5:
						I.D = "VY is subtracted from VX. VF is set to 0 when there's a borrow, and 1 when there isn't.";
						I.C = "SUB  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY5";
						break;
					case 0x6:
						I.D = "Shifts VX right by one. VF is set to the value of the least significant bit of VX before the shift.";
						I.C = "SHR  V" + hex((op & 0xf00) >> 8, 1);
						I.F = "8XY6";
						break;
					case 0x7:
						I.D = "Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and 1 when there isn't.";
						I.C = "SUBN V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1);
						I.F = "8XY7";
						break;
					case 0xe:
						I.D = "Shifts VX left by one. VF is set to the value of the most significant bit of VX before the shift.";
						I.C = "SHL  V" + hex((op & 0xf00) >> 8, 1);
						I.F = "8XYE";
						break;
					default:
						break;
				}
				break;

			case 0x9000:
				I.D = "Skips the next instruction if VX doesn't equal VY.";
				I.C = "SNE  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1) ;
				I.F = "9XY0";
				break;

			case 0xa000:
				I.D = "Sets I to the address NNN.";
				I.C = "LD   I,  " + hex(op & 0xfff);
				I.F = "ANNN";
				break;

			case 0xb000:
				I.C = "JP   " + hex(op & 0xfff);
				I.D = "Jumps to the address NNN plus V0.";
				I.F = "BNNN";
				break;

			case 0xc000:
				I.D = "Sets VX to a random number and NN.";
				I.C = "RND  V" + hex((op & 0xf00) >> 8, 1) + ", " + hex(op & 0xff);
				I.F = "CXNN";
				break;

			case 0xd000:
				I.D = "Draw";
				I.C = "DRW  V" + hex((op & 0xf00) >> 8, 1) + ", V" + hex((op & 0xf0) >> 4, 1) + ", " + hex(op & 0xf, 1);
				I.F = "DXYN";
				break;

			case 0xe000: // 0xEX9E Skips the next instruction if the key stored in VX is pressed. 0xEXA1 if it isnt.
				if ((op & 0xff) == 0x9e) {
					I.C="SKP  V" + hex((op & 0xf00) >> 8, 1);
					I.F="EX9E";
					I.D="Skips the next instruction if the key stored in VX is pressed.";
				} else {
					I.C="SKNP V" + hex((op & 0xf00) >> 8, 1);
					I.F="EXA1";
					I.D="Skips the next instruction if the key stored in VX isn't pressed.";
				}
				break;

			case 0xf000: /* F block is a collection of random instructions */
				var SI = op & 0xff;
				switch (SI)	{

					case 0x07:
						I.C = "LD   V" + hex((op & 0xf00) >> 8, 1) + ", DT";
						I.D = "Sets VX to the value of the delay timer.";
						I.F = "FX07";
						break;

					case 0x0a:
						I.C = "LD   V" + hex((op & 0xf00) >> 8, 1) + ", K";
						I.D = "A key press is awaited, and then stored in VX.";
						I.F = "FX0A";
						break;

					case 0x15:
						I.C = "LD   DT, V" + hex((op & 0xf00) >> 8, 1);
						I.D = "Sets the delay timer to VX. (Timer is 60hz)";
						I.F = "FX15";
						break;

					case 0x18:
						I.C = "LD   ST, V" + hex((op & 0xf00) >> 8, 1);
						I.D = "Sets the sond timer to VX. (Timer is 60hz)";
						I.F = "FX18";
						break;

					case 0x1e:
						I.C = "ADD  V" + hex((op & 0xf00) >> 8, 1) + ", I";
						I.D = "Adds VX to I.";
						I.F = "FX1E";
						break;

					case 0x29:
						I.C = "LD   F, V" + hex((op & 0xf00) >> 8, 1);
						I.D = "Sets I to the location of the sprite for the character in VX.";
						I.D += "Characters 0-F (in hexadecimal) are represented by a 4x5 font.";
						I.F = "FX29";
						break;

					case 0x33:
						I.C = "LD   B, V" + hex((op & 0xf00) >> 8, 1);
						I.D += "Stores the Binary-coded decimal representation of VX, with the most significant of three digits";
						I.D += "at the address in I, the middle digit at I plus 1, and the least significant digit at I plus 2.";
						I.D += "(In other words, take the decimal representation of VX, place the hundreds digit in memory at location in I,";
						I.D += "the tens digit at location I+1, and the ones digit at location I+2.)";
						I.F = "FX33";
						break;

					case 0x55:
						I.C = "LD   [I], V" + hex((op & 0xf00) >> 8, 1);
						I.D = "Stores V0 to VX in memory starting at address I.";
						I.F = "FX55";
						break;

					case 0x65:
						I.C = "LD   V" + hex((op & 0xf00) >> 8, 1) + ", [I]";
						I.D = "Fills V0 to VX with values from memory starting at address I.";
						I.F = "FX65";
						break;
				}
				break;

		}
		//buf += "<span class='pc'>0x" + hex(op, 4)  + "</span>"
		buf += "<span title='" + I.D + "' class='pc'> "  + I.C + "</span> ";
	}
	document.getElementById("disasm").innerHTML = buf;

}

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
	0xF0, 0x80, 0xF0, 0x80, 0x80  // F
]);

// Just for nice debug prints
function hex(d, padding) {
	var hex = Number(d).toString(16);
	padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

	while (hex.length < padding) {
		hex = "0" + hex;
	}

	return hex.toUpperCase();
}
